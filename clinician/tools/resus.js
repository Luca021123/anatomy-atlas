/* ==========================================================================
   Resuscitation timer and event log (adult ALS + paediatric ALS). Package C3.

   Two halves: pure session logic (exported to Node as module.exports and in the
   browser as MTLib.resus, unit-tested) and the UI (registered only when MT exists).

   Sources
   - European Resuscitation Council (ERC) Guidelines 2025: Adult Advanced Life
     Support and Paediatric Life Support (Resuscitation 2025).
   - Resuscitation Council UK 2025 adult and paediatric ALS algorithms.
   - AHA 2025 Guidelines for CPR and ECC (Circulation, Oct 2025): adult ACLS and
     PALS algorithms agree on the points used here.
   Rules implemented
   - CPR in 2-minute cycles with a rhythm check at the end of each cycle; chest
     compressions 100–120/min (metronome default 110/min).
   - Adult: adrenaline 1 mg IV/IO as soon as possible for non-shockable rhythms;
     in shockable rhythms after the 3rd shock; then every 3–5 min. Amiodarone
     300 mg after the 3rd shock and a further 150 mg after the 5th. (Lidocaine
     1 mg/kg is the ERC alternative if amiodarone is unavailable.)
   - Paediatric: shock 4 J/kg; adrenaline 10 microgram/kg (max 1 mg) IV/IO — as
     soon as possible if non-shockable, after the 3rd shock if shockable, then
     every 3–5 min; amiodarone 5 mg/kg (max 300 mg) after the 3rd shock with one
     repeat of 5 mg/kg after the 5th. (RCUK/ERC 2025 paediatric algorithm.)
   - Reversible causes: 4 Hs and 4 Ts (ERC).
   - Weight estimate when unmeasured (APLS 2011): 1–5 y (2 × age) + 8; 6–12 y
     (3 × age) + 7. A measured weight or length-based tape is always preferred.
   Every dose prompt is advice to the team leader; verify against your local
   protocol and drug chart before giving any drug.
   ========================================================================== */
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else {
    (root.MTLib = root.MTLib || {}).resus = lib;
    if (typeof root.MT !== 'undefined' && root.MT.registerTool && root.document) lib.registerUI(root.MT);
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CYCLE_MS = 120000;
  var ADR_MIN_MS = 180000, ADR_MAX_MS = 300000;

  /* ------------------------------- formatting ----------------------------- */
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function mmss(ms) {
    var neg = ms < 0; var s = Math.floor(Math.abs(ms) / 1000);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (neg ? '-' : '') + (h ? h + ':' + p2(m) : m) + ':' + p2(sec);
  }
  function clock(ts) { var d = new Date(ts); return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()); }
  function parseMmss(str) {
    var m = /^\s*(\d+):([0-5]?\d)\s*$/.exec(String(str));
    if (m) return (+m[1] * 60 + +m[2]) * 1000;
    if (/^\s*\d+\s*$/.test(String(str))) return +str * 60000;
    return null;
  }

  /* ------------------------------ dose helpers ---------------------------- */
  /** Doses for a mode. weightKg required for paediatrics. */
  function doses(mode, weightKg) {
    if (mode !== 'paeds') {
      return { shock: 'Biphasic 150–200 J (manufacturer’s recommended energy; escalate if available)', shockJ: null,
        adrenaline: '1 mg IV/IO', amio1: '300 mg IV/IO', amio2: '150 mg IV/IO', ratio: '30 compressions : 2 breaths (continuous compressions once airway secured)', ok: true };
    }
    var w = +weightKg;
    if (!isFinite(w) || w <= 0 || w > 150) {
      return { shock: '4 J/kg (enter weight)', shockJ: null, adrenaline: '10 microgram/kg (enter weight)', amio1: '5 mg/kg (enter weight)', amio2: '5 mg/kg (enter weight)', ratio: '15 compressions : 2 breaths (after 5 initial rescue breaths)', ok: false };
    }
    var adrMcg = Math.min(10 * w, 1000);
    var amio = Math.min(5 * w, 300);
    var j = Math.round(4 * w);
    return {
      shock: j + ' J (4 J/kg; do not exceed the adult dose)', shockJ: j,
      adrenaline: fmtN(adrMcg) + ' microgram IV/IO (10 microgram/kg' + (10 * w > 1000 ? ', capped at 1 mg' : '') + ') = ' + fmtN(adrMcg / 100) + ' mL of 1:10 000 (0.1 mg/mL)',
      amio1: fmtN(amio) + ' mg IV/IO (5 mg/kg' + (5 * w > 300 ? ', capped at 300 mg' : '') + ')', amio2: fmtN(amio) + ' mg IV/IO (5 mg/kg, single repeat)',
      lidocaine: fmtN(Math.min(w, 100)) + ' mg (1 mg/kg) if amiodarone unavailable',
      ratio: '15 compressions : 2 breaths (after 5 initial rescue breaths)', ok: true
    };
  }
  function fmtN(x) { return String(Math.round(x * 100) / 100); }
  /** APLS 2011 weight estimate from age in years (1–12). */
  function estimateWeight(ageYears) {
    var a = +ageYears;
    if (!isFinite(a) || a < 1 || a > 12) return null;
    return a <= 5 ? 2 * a + 8 : 3 * a + 7;
  }

  /* ------------------------------- session -------------------------------- */
  var uidN = 0;
  function uid() { uidN++; return 'e' + Date.now().toString(36) + uidN; }
  function newSession(mode, weight, now) {
    now = now || Date.now();
    var s = { v: 1, mode: mode === 'paeds' ? 'paeds' : 'adult', weight: mode === 'paeds' && weight ? +weight : null, startedAt: now, endedAt: null,
      cycleStartedAt: now, cycleNo: 1, rhythm: null, shocks: 0, adrenaline: [], amiodarone: [], rosc: null, hs: {}, ts: {}, post: {}, log: [] };
    addEvent(s, 'start', 'CPR started (' + (s.mode === 'paeds' ? 'paediatric' : 'adult') + ' ALS' + (s.weight ? ', ' + s.weight + ' kg' : '') + ')', now);
    return s;
  }
  function addEvent(s, kind, text, now) {
    var e = { id: uid(), t: now == null ? Date.now() : now, kind: kind, text: text };
    s.log.push(e); s.log.sort(function (a, b) { return a.t - b.t; });
    return e;
  }
  function setRhythm(s, rhythm, now) {
    if (s.rhythm === rhythm) return false;
    s.rhythm = rhythm;
    addEvent(s, 'rhythm', 'Rhythm: ' + (rhythm === 'shockable' ? 'shockable (VF / pulseless VT)' : rhythm === 'nonshockable' ? 'non-shockable (PEA / asystole)' : rhythm), now);
    return true;
  }
  function startCycle(s, now) { s.cycleNo++; s.cycleStartedAt = now == null ? Date.now() : now; }
  function giveShock(s, now) {
    now = now == null ? Date.now() : now;
    s.shocks++;
    var d = doses(s.mode, s.weight);
    addEvent(s, 'shock', 'Shock ' + s.shocks + ' delivered' + (s.mode === 'paeds' && d.shockJ ? ' (' + d.shockJ + ' J, 4 J/kg)' : ''), now);
    startCycle(s, now);
  }
  function giveAdrenaline(s, now) {
    now = now == null ? Date.now() : now;
    s.adrenaline.push(now);
    var d = doses(s.mode, s.weight);
    addEvent(s, 'adrenaline', 'Adrenaline dose ' + s.adrenaline.length + ' given — ' + d.adrenaline, now);
  }
  function giveAmiodarone(s, now) {
    now = now == null ? Date.now() : now;
    s.amiodarone.push(now);
    var d = doses(s.mode, s.weight);
    addEvent(s, 'amiodarone', 'Amiodarone dose ' + s.amiodarone.length + ' given — ' + (s.amiodarone.length === 1 ? d.amio1 : d.amio2), now);
  }
  function setRosc(s, now) {
    now = now == null ? Date.now() : now;
    s.rosc = now; addEvent(s, 'rosc', 'ROSC — return of spontaneous circulation', now);
  }
  function reArrest(s, now) {
    now = now == null ? Date.now() : now;
    s.rosc = null; addEvent(s, 'arrest', 'Re-arrest — CPR resumed', now); s.cycleStartedAt = now; s.cycleNo++;
  }
  function endSession(s, now) {
    now = now == null ? Date.now() : now;
    s.endedAt = now; addEvent(s, 'end', 'Resuscitation ended', now);
  }

  /** Cycle status: remaining ms (negative when overdue) */
  function cycle(s, now) { return { remainingMs: CYCLE_MS - (now - s.cycleStartedAt), overdue: now - s.cycleStartedAt >= CYCLE_MS, no: s.cycleNo }; }

  /**
   * Adrenaline prompt. state: 'none' | 'wait' | 'soon' | 'due' | 'overdue'
   *  - none: session over or ROSC
   *  - first dose: non-shockable → due now; shockable → due once 3 shocks delivered, else wait
   *  - subsequent: wait until 3 min after the last dose, then due (3–5 min window), overdue beyond 5 min
   */
  function adrenalineStatus(s, now) {
    var d = doses(s.mode, s.weight);
    if (s.endedAt || s.rosc) return { state: 'none', text: '' };
    var n = s.adrenaline.length;
    if (n === 0) {
      if (s.rhythm === 'nonshockable') return { state: 'due', text: 'Give adrenaline NOW — non-shockable rhythm: as soon as possible', dose: d.adrenaline };
      if (s.rhythm === 'shockable') {
        if (s.shocks >= 3) return { state: 'due', text: 'Give adrenaline NOW — shockable rhythm, after the 3rd shock', dose: d.adrenaline };
        return { state: 'wait', text: 'Adrenaline after the 3rd shock (' + s.shocks + ' of 3 delivered)', dose: d.adrenaline };
      }
      return { state: 'wait', text: 'Select the rhythm to time adrenaline', dose: d.adrenaline };
    }
    var since = now - s.adrenaline[n - 1];
    if (since < ADR_MIN_MS) return { state: 'wait', text: 'Next adrenaline in ' + mmss(ADR_MIN_MS - since) + ' (every 3–5 min)', untilMs: ADR_MIN_MS - since, sinceMs: since, dose: d.adrenaline };
    if (since <= ADR_MAX_MS) return { state: 'due', text: 'Adrenaline due now (3–5 min since last dose, ' + mmss(since) + ' ago)', sinceMs: since, dose: d.adrenaline };
    return { state: 'overdue', text: 'Adrenaline OVERDUE — last dose ' + mmss(since) + ' ago', sinceMs: since, dose: d.adrenaline };
  }
  /** Amiodarone prompt: 1st dose after 3rd shock, 2nd after 5th (shockable only). */
  function amiodaroneStatus(s) {
    var d = doses(s.mode, s.weight);
    if (s.endedAt || s.rosc) return { state: 'none', text: '' };
    var n = s.amiodarone.length;
    if (n >= 2) return { state: 'done', text: 'Amiodarone: both doses given' };
    if (s.rhythm !== 'shockable') return { state: 'wait', text: n === 0 ? 'Amiodarone: only for shockable rhythm after 3 shocks' : 'Amiodarone: second dose only if shockable after 5 shocks' };
    if (n === 0) return s.shocks >= 3 ? { state: 'due', text: 'Give amiodarone NOW (after the 3rd shock)', dose: d.amio1 } : { state: 'wait', text: 'Amiodarone after the 3rd shock (' + s.shocks + ' of 3)', dose: d.amio1 };
    return s.shocks >= 5 ? { state: 'due', text: 'Give second amiodarone dose NOW (after the 5th shock)', dose: d.amio2 } : { state: 'wait', text: 'Second amiodarone dose after the 5th shock (' + s.shocks + ' of 5)', dose: d.amio2 };
  }

  var HS = [
    { id: 'hypoxia', label: 'Hypoxia', hint: 'Ventilate with 100 % oxygen; check chest rise, airway position, equipment.' },
    { id: 'hypovolaemia', label: 'Hypovolaemia', hint: 'Bleeding, anaphylaxis, sepsis: fluid / blood, control haemorrhage.' },
    { id: 'metabolic', label: 'Hyper-/hypokalaemia and other metabolic', hint: 'Check K⁺, glucose, Ca²⁺; calcium for hyperkalaemia; treat hypoglycaemia.' },
    { id: 'temperature', label: 'Hypo-/hyperthermia', hint: 'Check core temperature; rewarm or cool.' }
  ];
  var TS = [
    { id: 'thrombosis', label: 'Thrombosis (coronary or pulmonary)', hint: 'ACS or massive PE: consider thrombolysis / PCI / ECPR per local protocol.' },
    { id: 'tension', label: 'Tension pneumothorax', hint: 'Needle or finger thoracostomy / chest drain.' },
    { id: 'tamponade', label: 'Tamponade (cardiac)', hint: 'Echo if available; pericardiocentesis or resuscitative thoracotomy per protocol.' },
    { id: 'toxins', label: 'Toxins', hint: 'Overdose / poisoning: antidotes, call the poison centre.' }
  ];
  var POST_ROSC = [
    { id: 'abcde', label: 'ABCDE reassessment; secure the airway if GCS ≤ 8 and ventilate' },
    { id: 'oxygen', label: 'Titrate oxygen to SpO₂ 94–98 % (avoid hyperoxia); normal PaCO₂' },
    { id: 'bp', label: 'Avoid hypotension: treat to a MAP ≥ 65 mmHg (or an age-appropriate target in children) with fluid / vasopressor' },
    { id: 'ecg', label: '12-lead ECG; urgent cardiology / angiography if ST-elevation or suspected coronary cause' },
    { id: 'glucose', label: 'Blood glucose: avoid both hypoglycaemia and hyperglycaemia' },
    { id: 'temp', label: 'Prevent fever; temperature control per local protocol' },
    { id: 'seizure', label: 'Treat seizures; avoid sedation-related hypotension' },
    { id: 'cause', label: 'Find and treat the cause: reversible causes (4 Hs & 4 Ts), bloods incl. gas, K⁺, lactate; imaging' },
    { id: 'icu', label: 'Arrange ICU / HDU, handover (ISBAR), inform and support the family' },
    { id: 'prog', label: 'Do not decide prognosis early: multimodal assessment no sooner than 72 h after ROSC' }
  ];

  /** Plain-text export of the log. */
  function exportText(s, now) {
    now = now || Date.now();
    var end = s.endedAt || now;
    var d = doses(s.mode, s.weight);
    var lines = [];
    lines.push('RESUSCITATION RECORD — ' + (s.mode === 'paeds' ? 'Paediatric' : 'Adult') + ' advanced life support');
    lines.push('Started: ' + new Date(s.startedAt).toLocaleString() + (s.endedAt ? '   Ended: ' + new Date(s.endedAt).toLocaleString() : '   (still running)'));
    lines.push('Duration: ' + mmss(end - s.startedAt) + (s.weight ? '   Weight: ' + s.weight + ' kg' : ''));
    lines.push('Summary: ' + s.shocks + ' shock' + (s.shocks === 1 ? '' : 's') + '; adrenaline ' + s.adrenaline.length + ' dose' + (s.adrenaline.length === 1 ? '' : 's') + '; amiodarone ' + s.amiodarone.length + ' dose' + (s.amiodarone.length === 1 ? '' : 's') + '; ROSC: ' + (s.rosc ? 'yes at ' + mmss(s.rosc - s.startedAt) : 'no'));
    lines.push('');
    lines.push('Elapsed  Clock     Event');
    s.log.forEach(function (e) { lines.push(pad(mmss(e.t - s.startedAt), 8) + ' ' + clock(e.t) + '  ' + e.text); });
    var causes = HS.concat(TS).filter(function (c) { return s.hs[c.id] || s.ts[c.id]; }).map(function (c) { return c.label; });
    lines.push('');
    lines.push('Reversible causes considered (4 Hs & 4 Ts): ' + (causes.length ? causes.join('; ') : 'none ticked'));
    if (s.rosc) { var done = POST_ROSC.filter(function (c) { return s.post[c.id]; }).length; lines.push('Post-ROSC checklist: ' + done + ' of ' + POST_ROSC.length + ' items ticked'); }
    lines.push('');
    lines.push('Timer-generated from ERC / AHA 2025 ALS algorithms. Times are device clock times; check against the clinical record.');
    return lines.join('\n');
  }
  function pad(str, n) { str = String(str); while (str.length < n) str += ' '; return str; }

  var logic = {
    CYCLE_MS: CYCLE_MS, ADR_MIN_MS: ADR_MIN_MS, ADR_MAX_MS: ADR_MAX_MS, HS: HS, TS: TS, POST_ROSC: POST_ROSC,
    mmss: mmss, clock: clock, parseMmss: parseMmss, doses: doses, estimateWeight: estimateWeight,
    newSession: newSession, addEvent: addEvent, setRhythm: setRhythm, startCycle: startCycle, giveShock: giveShock, giveAdrenaline: giveAdrenaline,
    giveAmiodarone: giveAmiodarone, setRosc: setRosc, reArrest: reArrest, endSession: endSession, cycle: cycle,
    adrenalineStatus: adrenalineStatus, amiodaroneStatus: amiodaroneStatus, exportText: exportText
  };

  /* ================================== UI ================================== */
  logic.registerUI = function (MT) {
    var h = MT.h;
    var SKEY = 'clinician.resus.session', PKEY = 'clinician.resus.settings';

    MT.css('rs', [
      '.rs-wrap{display:grid;gap:14px;grid-template-columns:1fr}',
      '@media (min-width:900px){.rs-cols{display:grid;gap:14px;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);align-items:start}}',
      '.rs-status{position:sticky;top:var(--header-h);z-index:30;background:var(--surface);border:2px solid var(--border-strong);border-radius:14px;padding:10px 14px;box-shadow:var(--shadow)}',
      '.rs-status.check{border-color:var(--danger);background:var(--danger-soft)}',
      '.rs-top{display:flex;gap:14px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap}',
      '.rs-clock{font-size:3rem;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.rs-lab{font-size:.74rem;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700}',
      '.rs-cyc{font-size:1.7rem;font-weight:800;font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
      '.rs-bar{height:12px;border-radius:999px;background:var(--surface-3);overflow:hidden;margin-top:8px}',
      '.rs-bar>span{display:block;height:100%;width:0;background:var(--accent)}',
      '.rs-status.check .rs-bar>span{background:var(--danger)}',
      '.rs-banner{margin-top:8px;font-weight:800;font-size:1.15rem;color:var(--danger);display:none}',
      '.rs-status.check .rs-banner{display:block;animation:rs-flash 1s steps(2,start) infinite}',
      '@keyframes rs-flash{50%{opacity:.35}}',
      '.rs-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}',
      '.rs-btn{min-height:64px;border-radius:14px;border:2px solid var(--border-strong);background:var(--surface);color:var(--text);font:inherit;font-weight:750;font-size:1.02rem;cursor:pointer;padding:8px 10px;line-height:1.15;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;text-align:center}',
      '.rs-btn small{font-weight:500;color:var(--muted);font-size:.78rem}',
      '.rs-btn:hover{background:var(--surface-2)}',
      '.rs-btn.p{background:var(--accent);border-color:var(--accent);color:var(--accent-contrast)}.rs-btn.p small{color:inherit;opacity:.85}.rs-btn.p:hover{background:var(--accent-hover)}',
      '.rs-btn.d{background:var(--danger);border-color:var(--danger);color:var(--accent-contrast)}.rs-btn.d small{color:inherit;opacity:.9}.rs-btn.d:hover{background:var(--danger)}',
      '.rs-btn.ok{background:var(--ok);border-color:var(--ok);color:var(--accent-contrast)}.rs-btn.ok small{color:inherit;opacity:.9}',
      '.rs-btn[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-soft);color:var(--accent-text);box-shadow:inset 0 0 0 2px var(--accent)}',
      '.rs-grid2{display:grid;gap:10px;grid-template-columns:1fr 1fr}.rs-grid3{display:grid;gap:10px;grid-template-columns:repeat(3,1fr)}',
      '@media (max-width:420px){.rs-grid3{grid-template-columns:1fr 1fr}}',
      '.rs-start{min-height:120px;font-size:1.7rem;border-radius:20px}',
      '.rs-prompt{border:2px solid var(--border);border-radius:12px;padding:10px 12px;background:var(--surface)}',
      '.rs-prompt.due{border-color:var(--danger);background:var(--danger-soft)}.rs-prompt.overdue{border-color:var(--danger);background:var(--danger);color:var(--accent-contrast)}',
      '.rs-prompt.overdue .muted{color:inherit}',
      '.rs-prompt strong{display:block}',
      '.rs-log{list-style:none;margin:0;padding:0;font-size:.95rem}',
      '.rs-log li{display:grid;grid-template-columns:64px 74px 1fr auto;gap:8px;align-items:start;padding:7px 0;border-bottom:1px solid var(--border)}',
      '.rs-log .t{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:700;font-variant-numeric:tabular-nums}',
      '.rs-log .c{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted);font-size:.85rem}',
      '@media (max-width:520px){.rs-log li{grid-template-columns:54px 1fr auto}.rs-log .c{display:none}}',
      '.rs-pulse{width:44px;height:44px;border-radius:50%;background:var(--accent);opacity:.25;flex:none}',
      '.rs-pulse.on{opacity:1;transform:scale(1.18)}',
      '.rs-pulse,.rs-pulse.on{transition:transform .06s,opacity .06s}',
      '.rs-print{display:none}',
      '@media print{.rs-screen{display:none!important}.rs-print{display:block!important}.rs-print pre{white-space:pre-wrap;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace}}'
    ].join(''));

    function loadSettings() { var s = MT.store.get(PKEY, null); return s && s.v === 1 ? s : { v: 1, rate: 110, sound: true }; }

    MT.registerTool({
      id: 'resus', title: 'Resuscitation timer', category: 'acute', icon: '❤️‍🔥', order: 1,
      description: 'Cardiac arrest timer and event log for adult and paediatric ALS: 2-minute cycles, shocks, adrenaline and amiodarone prompts, 4 Hs & 4 Ts, metronome, exportable log.',
      keywords: ['cardiac arrest', 'cpr', 'als', 'acls', 'pals', 'code', 'defibrillation', 'adrenaline', 'epinephrine', 'amiodarone', 'rosc', 'metronome', 'resuscitation', 'timer', '4hs 4ts'],
      render: function (container) {
        var settings = loadSettings();
        var s = MT.store.get(SKEY, null);
        if (!s || s.v !== 1 || !Array.isArray(s.log) || !s.startedAt) s = null;
        var setup = { mode: 'adult', weight: '', age: '' };
        var host = h('div.rs-wrap.rs-screen');
        var printHost = h('div.rs-print');
        var tickTimer = null, audio = null, metro = null, metroOn = false, pulseEl = null, wake = null, wakeStatus = '', alive = true;
        var refs = {};     // live-updating elements
        var lastPromptKey = '', alerted = {};

        function save() { if (s) MT.store.set(SKEY, s); }
        function saveSettings() { MT.store.set(PKEY, settings); }
        function ensureAudio() {
          if (audio) { if (audio.state === 'suspended') audio.resume(); return audio; }
          try { var C = window.AudioContext || window.webkitAudioContext; if (C) audio = new C(); } catch (e) { audio = null; }
          return audio;
        }
        function beep(freq, ms, vol) {
          if (!settings.sound || !audio) return;
          try {
            var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
            o.type = 'square'; o.frequency.value = freq; g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
            o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
          } catch (e) { /* audio is optional */ }
        }
        function alertTone(n) { for (var i = 0; i < n; i++) (function (i) { setTimeout(function () { beep(1100, 160, 0.25); }, i * 260); })(i); try { if (navigator.vibrate) navigator.vibrate(n === 1 ? 200 : [200, 100, 200, 100, 200]); } catch (e) { /* ignore */ } }

        /* ------------------------------ metronome ----------------------------- */
        function startMetro() {
          stopMetro(); ensureAudio(); metroOn = true;
          var ms = 60000 / settings.rate;
          function beat() {
            if (settings.sound) beep(880, 45, 0.22);
            if (pulseEl) { pulseEl.classList.add('on'); setTimeout(function () { if (pulseEl) pulseEl.classList.remove('on'); }, Math.min(120, ms / 2)); }
          }
          beat(); metro = setInterval(beat, ms); renderMetro();
        }
        function stopMetro() { if (metro) clearInterval(metro); metro = null; metroOn = false; if (pulseEl) pulseEl.classList.remove('on'); renderMetro(); }

        /* ------------------------------ wake lock ----------------------------- */
        function requestWake() {
          if (!('wakeLock' in navigator)) { wakeStatus = 'Wake lock not supported: keep the screen on manually.'; return; }
          navigator.wakeLock.request('screen').then(function (l) { wake = l; wakeStatus = 'Screen kept awake'; l.addEventListener('release', function () { wake = null; wakeStatus = 'Screen may sleep'; updateWakeChip(); }); updateWakeChip(); }, function () { wakeStatus = 'Could not keep the screen awake'; updateWakeChip(); });
        }
        function releaseWake() { if (wake) { try { wake.release(); } catch (e) { /* ignore */ } wake = null; } }
        function onVis() { if (document.visibilityState === 'visible' && s && !s.endedAt && !wake) requestWake(); }
        function updateWakeChip() { if (refs.wake) refs.wake.textContent = '🔆 ' + (wakeStatus || '…'); }

        /* ------------------------------- actions ------------------------------ */
        function logQuick(kind, text) { MT.toast('Logged: ' + text, 'ok', 1400); addEventAndSave(kind, text); }
        function addEventAndSave(kind, text) { addEvent(s, kind, text); save(); renderRunning(); }
        function act(fn) { return function () { ensureAudio(); fn(); save(); renderRunning(); }; }

        function start() {
          var w = MT.num(setup.weight);
          if (setup.mode === 'paeds' && !(w > 0 && w <= 150)) { MT.toast('Enter the child’s weight (kg) — or use the age estimate', 'warn'); return; }
          ensureAudio();
          s = newSession(setup.mode, w); alerted = {}; save();
          requestWake(); renderRunning();
        }

        function editEntry(e) {
          var txt = h('input', { type: 'text', value: e.text, 'aria-label': 'Event text', style: 'min-height:48px;width:100%' });
          var tm = h('input', { type: 'text', value: mmss(e.t - s.startedAt), inputmode: 'numeric', 'aria-label': 'Elapsed time mm:ss', style: 'min-height:48px;width:100%' });
          MT.modal({ title: 'Edit log entry', body: h('div.stack-sm', h('div.field', h('label', 'Event'), txt), h('div.field', h('label', 'Elapsed time (mm:ss from start)'), tm, h('div.hint', 'Clock time: ' + clock(e.t)))),
            actions: [
              { label: 'Delete', variant: 'danger', onClick: function () { s.log = s.log.filter(function (x) { return x.id !== e.id; }); save(); renderRunning(); } },
              { label: 'Cancel', variant: 'ghost' },
              { label: 'Save', variant: 'primary', onClick: function () {
                var off = parseMmss(tm.value); if (off == null) { MT.toast('Time must look like 12:30', 'warn'); return false; }
                e.text = txt.value.trim() || e.text; e.t = s.startedAt + off; s.log.sort(function (a, b) { return a.t - b.t; }); save(); renderRunning();
              } }] });
        }
        function noteModal(title, presets, kind) {
          var txt = h('input', { type: 'text', placeholder: 'Details (drug, dose, finding…)', 'aria-label': 'Details', style: 'min-height:48px;width:100%' });
          var chips = presets ? h('div.row', { style: 'gap:6px;margin-bottom:8px' }, presets.map(function (p) { return h('button.chip', { type: 'button', onclick: function () { txt.value = p; txt.focus(); } }, p); })) : null;
          MT.modal({ title: title, body: h('div', chips, h('div.field', h('label', 'Entry'), txt)), actions: [{ label: 'Cancel', variant: 'ghost' }, { label: 'Log it', variant: 'primary', onClick: function () { if (!txt.value.trim()) { MT.toast('Enter some text', 'warn'); return false; } addEventAndSave(kind, (kind === 'drug' ? 'Drug: ' : '') + txt.value.trim()); } }] });
        }
        function rhythmModal() {
          var opts = [['shockable', 'VF / pulseless VT (shockable)'], ['nonshockable', 'PEA / asystole (non-shockable)']];
          var close;
          var body = h('div.stack-sm', opts.map(function (o) { return h('button.rs-btn' + (o[0] === 'shockable' ? '.d' : ''), { type: 'button', style: 'width:100%', onclick: function () { setRhythm(s, o[0]); save(); renderRunning(); close(); } }, o[1]); }),
            h('button.rs-btn', { type: 'button', style: 'width:100%', onclick: function () { addEvent(s, 'rhythm', 'Rhythm: organised rhythm with pulse check — see ROSC if pulse present'); save(); renderRunning(); close(); } }, 'Organised rhythm — pulse check'));
          close = MT.modal({ title: 'Rhythm change', body: body, actions: [{ label: 'Cancel', variant: 'ghost' }] });
        }
        function endAndReview() {
          MT.confirm('End this resuscitation? The log stays available to copy, print or download.', { okLabel: 'End resuscitation' }).then(function (ok) { if (ok) { endSession(s); save(); stopMetro(); releaseWake(); renderRunning(); } });
        }
        function newOne() {
          MT.confirm('Discard this record and start a new session? Copy or download the log first if you need it.', { danger: true, okLabel: 'Discard' }).then(function (ok) { if (ok) { s = null; MT.store.remove(SKEY); stopMetro(); releaseWake(); alerted = {}; renderSetup(); } });
        }

        /* ------------------------------- renderers ---------------------------- */
        function renderSetup() {
          MT.clear(host); refs = {}; MT.clear(printHost);
          var wId = MT.uid('rs'), aId = MT.uid('rs');
          var wInp = h('input', { id: wId, type: 'number', inputmode: 'decimal', min: 0.5, max: 150, step: '0.1', value: setup.weight, style: 'min-height:52px;font-size:1.3rem', oninput: function () { setup.weight = wInp.value; showDoses(); } });
          var aInp = h('input', { id: aId, type: 'number', inputmode: 'numeric', min: 1, max: 12, placeholder: 'years', value: setup.age, style: 'min-height:52px', oninput: function () { setup.age = aInp.value; var e = estimateWeight(MT.num(aInp.value)); estEl.textContent = e ? 'Estimate ≈ ' + e + ' kg (APLS). Tap to use.' : ''; estBtn.hidden = !e; } });
          var estEl = h('span.small.muted'), estBtn = h('button.btn.btn-sm', { type: 'button', hidden: true, onclick: function () { var e = estimateWeight(MT.num(aInp.value)); if (e) { setup.weight = String(e); wInp.value = String(e); showDoses(); } } }, 'Use estimate');
          var doseBox = h('div.small');
          function showDoses() {
            MT.clear(doseBox);
            if (setup.mode !== 'paeds') return;
            var d = doses('paeds', MT.num(setup.weight));
            if (!d.ok) return;
            doseBox.appendChild(h('dl.kv', h('dt', 'Shock'), h('dd', d.shock), h('dt', 'Adrenaline'), h('dd', d.adrenaline), h('dt', 'Amiodarone'), h('dd', d.amio1)));
          }
          var paedsBox = h('div.stack-sm', { hidden: setup.mode !== 'paeds' },
            h('div.field', h('label', { for: wId }, 'Weight (kg) — measured, or length-based tape if possible'), wInp),
            h('div.row', h('div.field', { style: 'max-width:140px' }, h('label', { for: aId }, 'Or age (1–12 y)'), aInp), estEl, estBtn),
            doseBox);
          var seg = MT.ui.segmented([{ value: 'adult', label: 'Adult ALS' }, { value: 'paeds', label: 'Paediatric ALS' }], setup.mode, function (v) { setup.mode = v; paedsBox.hidden = v !== 'paeds'; showDoses(); });
          seg.classList.add('rs-seg');
          host.appendChild(h('div.card.stack',
            h('div', h('div.rs-lab', 'Step 1'), h('p', { style: 'margin:.2rem 0' }, 'Confirm cardiac arrest (unresponsive, not breathing normally), call for help / resuscitation team, start chest compressions, attach defibrillator or monitor.')),
            h('div.field', h('div.field-label', 'Patient group'), seg),
            paedsBox,
            h('button.rs-btn.p.rs-start', { type: 'button', onclick: start }, '▶ START CPR', h('small', 'starts the clock, the 2-minute cycle timer and the log')),
            h('div.small.muted', 'A running session is saved on this device and survives an accidental reload. It is cleared only when you start a new one.')));
          host.appendChild(refInfo());
        }

        function refInfo() {
          return h('details.disclosure', h('summary', 'Algorithm summary, sources and limits'),
            h('div.disclosure-body',
              h('ul', [
                h('li', 'CPR in 2-minute cycles; rhythm check at the end of each. Compressions 100–120/min (this timer’s metronome defaults to 110/min), depth about 5–6 cm in adults, minimise pauses.'),
                h('li', 'Adult: adrenaline 1 mg IV/IO as soon as possible in non-shockable rhythms, after the 3rd shock in shockable rhythms, then every 3–5 min. Amiodarone 300 mg after the 3rd shock, 150 mg after the 5th.'),
                h('li', 'Paediatric: shock 4 J/kg; adrenaline 10 microgram/kg (max 1 mg) and amiodarone 5 mg/kg (max 300 mg) after the 3rd shock, amiodarone repeated once after the 5th; adrenaline then every 3–5 min. Ratio 15:2 after 5 initial breaths.'),
                h('li', 'Sources: ERC Guidelines 2025 (adult ALS, paediatric life support); Resuscitation Council UK 2025 algorithms; AHA 2025 Guidelines for CPR and ECC.'),
                h('li', 'Limits: prompts follow the standard algorithms and assume you enter events accurately. They do not replace the team leader, local protocols or the drug chart. Special circumstances (pregnancy, hypothermia, drowning, anaphylaxis, trauma, opioid toxicity) change the approach.')])));
        }

        var elapsedEl, cycEl, barEl, bannerEl, statusEl, chipShock, chipAdr, chipAmio, chipRhythm, promptHost, metroHost, logHost;
        function renderRunning() {
          if (!s) { renderSetup(); return; }
          MT.clear(host); refs = {}; lastPromptKey = '';
          var d = doses(s.mode, s.weight);
          var ended = !!s.endedAt;

          elapsedEl = h('div.rs-clock', '0:00'); cycEl = h('div.rs-cyc', '2:00'); barEl = h('span'); bannerEl = h('div.rs-banner', { role: 'alert' }, '⚠ RHYTHM CHECK NOW — pause compressions < 10 s');
          chipRhythm = h('span.badge'); chipShock = h('span.badge'); chipAdr = h('span.badge'); chipAmio = h('span.badge');
          statusEl = h('div.rs-status', { 'aria-label': 'Resuscitation status' },
            h('div.rs-top',
              h('div', h('div.rs-lab', ended ? 'Total duration (ended)' : 'Total elapsed'), elapsedEl),
              h('div', { style: 'text-align:right' }, h('div.rs-lab', s.rosc ? 'ROSC' : 'CPR cycle ' + s.cycleNo + ' · time left'), s.rosc ? h('div.rs-cyc', { style: 'color:var(--ok)' }, 'ROSC ' + mmss(s.rosc - s.startedAt)) : cycEl)),
            h('div.rs-bar', h('span', { style: 'display:none' }), barEl), bannerEl,
            h('div.rs-chips', chipRhythm, chipShock, chipAdr, chipAmio));
          host.appendChild(statusEl);
          if (ended) host.appendChild(MT.ui.alert('info', 'Resuscitation ended', 'The record below can be copied, printed or downloaded. Start a new session when ready.'));

          var cols = h('div.rs-cols');
          var left = h('div.stack'), right = h('div.stack');

          if (!ended) {
            // rhythm + main actions
            left.appendChild(h('div.card.stack-sm',
              h('div.rs-lab', 'Rhythm (at last check)'),
              h('div.rs-grid2',
                h('button.rs-btn', { type: 'button', 'aria-pressed': String(s.rhythm === 'shockable'), onclick: act(function () { setRhythm(s, 'shockable'); }) }, 'Shockable', h('small', 'VF / pulseless VT')),
                h('button.rs-btn', { type: 'button', 'aria-pressed': String(s.rhythm === 'nonshockable'), onclick: act(function () { setRhythm(s, 'nonshockable'); }) }, 'Non-shockable', h('small', 'PEA / asystole')))));
            if (s.rosc) {
              left.appendChild(h('div.card.stack-sm', MT.ui.alert('ok', 'ROSC achieved', 'Work through the post-ROSC checklist. If the patient arrests again, tap Re-arrest.'),
                h('button.rs-btn.d', { type: 'button', style: 'width:100%', onclick: act(function () { reArrest(s); alerted = {}; }) }, 'Re-arrest — resume CPR')));
            } else {
              left.appendChild(h('div.card.stack-sm',
                h('div.rs-grid2',
                  h('button.rs-btn.d', { type: 'button', onclick: act(function () { giveShock(s); alerted = {}; }) }, '⚡ Shock delivered', h('small', 'shock ' + (s.shocks + 1) + (s.mode === 'paeds' && d.shockJ ? ' · ' + d.shockJ + ' J' : '') + ' · restarts 2-min CPR')),
                  h('button.rs-btn.p', { type: 'button', onclick: act(function () { var r = cycle(s, Date.now()); addEvent(s, 'check', 'Rhythm check (cycle ' + s.cycleNo + ')' + (s.rhythm ? ': ' + (s.rhythm === 'shockable' ? 'shockable' : 'non-shockable') : '')); startCycle(s); alerted = {}; }) }, '✓ Rhythm checked', h('small', 'start next 2-min cycle'))),
                h('div.rs-grid2',
                  h('button.rs-btn', { type: 'button', onclick: act(function () { giveAdrenaline(s); }) }, 'Adrenaline given', h('small', s.mode === 'paeds' && d.ok ? fmtN(Math.min(10 * s.weight, 1000)) + ' microgram' : '1 mg')),
                  h('button.rs-btn', { type: 'button', onclick: act(function () { giveAmiodarone(s); }) }, 'Amiodarone given', h('small', s.amiodarone.length ? (s.mode === 'paeds' ? '5 mg/kg repeat' : '150 mg') : (s.mode === 'paeds' ? '5 mg/kg' : '300 mg')))),
                h('button.rs-btn.ok', { type: 'button', style: 'width:100%', onclick: act(function () { setRosc(s); }) }, '✔ ROSC — pulse and organised rhythm')));
            }
            promptHost = h('div.stack-sm', { 'aria-live': 'polite' });
            if (!s.rosc) left.appendChild(h('div.card', h('div.rs-lab', 'Drug prompts'), promptHost));
            // events
            left.appendChild(h('div.card.stack-sm', h('div.rs-lab', 'Log an event (one tap)'),
              h('div.rs-grid3',
                h('button.rs-btn', { type: 'button', onclick: function () { logQuick('airway', 'Airway: advanced airway / device placed'); } }, '🫁 Airway'),
                h('button.rs-btn', { type: 'button', onclick: function () { logQuick('access', 'IV / IO access established'); } }, '💉 IV / IO access'),
                h('button.rs-btn', { type: 'button', onclick: function () { noteModal('Other drug given', ['Calcium chloride 10 mL 10 %', 'Sodium bicarbonate 50 mmol', 'Magnesium sulphate 2 g', 'Fluid bolus', 'Naloxone', 'Glucose'], 'drug'); } }, '💊 Drug…'),
                h('button.rs-btn', { type: 'button', onclick: rhythmModal }, '📈 Rhythm change'),
                h('button.rs-btn', { type: 'button', onclick: function () { logQuick('pulse', 'Pulse / ETCO₂ / ultrasound check performed'); } }, '🩺 Check'),
                h('button.rs-btn', { type: 'button', onclick: function () { noteModal('Other event', null, 'note'); } }, '✎ Other…'))));
          }

          // checklists
          function checkGroup(title, list, map, open) {
            return h('details.disclosure', { open: open }, h('summary', title),
              h('div.disclosure-body.stack-sm', list.map(function (c) {
                var id = MT.uid('rs');
                var cb = h('input', { type: 'checkbox', id: id, checked: !!map[c.id], onchange: function () { map[c.id] = cb.checked; if (cb.checked && c.hint) { addEvent(s, 'cause', 'Considered / treated: ' + c.label); } save(); } });
                return h('label.check', { for: id, style: 'min-height:48px' }, cb, h('span', h('strong', c.label), c.hint ? h('span.small.muted', { style: 'display:block' }, c.hint) : null));
              })));
          }
          if (!ended || true) {
            right.appendChild(h('div.card.stack-sm', h('div.rs-lab', 'Reversible causes — 4 Hs & 4 Ts (ERC)'), checkGroup('4 Hs', HS, s.hs, !ended), checkGroup('4 Ts', TS, s.ts, !ended)));
            if (s.rosc) right.appendChild(h('div.card.stack-sm', h('div.rs-lab', 'Post-ROSC checklist'),
              h('div.stack-sm', POST_ROSC.map(function (c) { var id = MT.uid('rs'); var cb = h('input', { type: 'checkbox', id: id, checked: !!s.post[c.id], onchange: function () { s.post[c.id] = cb.checked; save(); } }); return h('label.check', { for: id, style: 'min-height:48px' }, cb, h('span', c.label)); })),
              h('div.small.muted', 'Based on ERC / AHA 2025 post-cardiac-arrest care. Targets vary between guidelines: follow local protocol.')));
          }
          // metronome
          if (!ended) {
            metroHost = h('div.card.stack-sm');
            right.appendChild(metroHost); renderMetro();
            refs.wake = h('span.badge.badge-info'); updateWakeChip();
            right.appendChild(h('div.row', refs.wake, h('span.badge', settings.sound ? '🔊 sound on' : '🔇 sound off')));
          }
          // log
          logHost = h('div.card');
          right.appendChild(logHost); renderLog();

          cols.appendChild(left); cols.appendChild(right); host.appendChild(cols);
          // export & session buttons
          var txt = function () { return exportText(s); };
          host.appendChild(h('div.card.stack-sm', h('div.rs-lab', 'Record'),
            h('div.row',
              h('button.btn', { type: 'button', onclick: function () { MT.copy(txt()); } }, 'Copy log'),
              h('button.btn', { type: 'button', onclick: function () { buildPrint(); MT.print(container); } }, '🖨 Print'),
              h('button.btn', { type: 'button', onclick: function () { MT.download('resuscitation-log-' + MT.today() + '.txt', txt()); } }, 'Download .txt'),
              ended ? h('button.btn.btn-danger', { type: 'button', onclick: newOne }, 'New session') : h('button.btn.btn-danger', { type: 'button', onclick: endAndReview }, 'End resuscitation')),
            h('div.small.muted', 'No patient identifiers are stored. Add them in your own record.')));
          host.appendChild(refInfo());
          tick();
        }

        function buildPrint() { MT.clear(printHost); printHost.appendChild(h('pre', exportText(s))); }

        function renderMetro() {
          if (!metroHost) return;
          MT.clear(metroHost);
          pulseEl = h('div.rs-pulse', { 'aria-hidden': 'true' });
          var rate = h('span.mono', { style: 'font-weight:800;font-size:1.3rem;min-width:3.4em;text-align:center' }, settings.rate + '/min');
          function setRate(r) { settings.rate = MT.clamp(r, 100, 120); saveSettings(); if (metroOn) startMetro(); else renderMetro(); }
          metroHost.appendChild(h('div.rs-lab', 'CPR metronome'));
          metroHost.appendChild(h('div.row', { style: 'gap:12px' }, pulseEl,
            h('button.rs-btn' + (metroOn ? '.p' : ''), { type: 'button', style: 'flex:1;min-height:56px', 'aria-pressed': String(metroOn), onclick: function () { metroOn ? stopMetro() : startMetro(); } }, metroOn ? '■ Stop metronome' : '▶ Start metronome')));
          metroHost.appendChild(h('div.row.row-between',
            h('button.btn', { type: 'button', 'aria-label': 'Slower', onclick: function () { setRate(settings.rate - 5); } }, '− 5'), rate,
            h('button.btn', { type: 'button', 'aria-label': 'Faster', onclick: function () { setRate(settings.rate + 5); } }, '+ 5'),
            h('button.btn.btn-ghost', { type: 'button', onclick: function () { settings.sound = !settings.sound; saveSettings(); renderRunning(); } }, settings.sound ? 'Mute all' : 'Unmute')));
          metroHost.appendChild(h('div.small.muted', 'Target 100–120 compressions/min (ERC / AHA). On-screen pulse flashes with each click when sound is muted.'));
          if (metroOn && pulseEl) { /* keep pulse reference live */ }
        }

        function renderLog() {
          if (!logHost) return;
          MT.clear(logHost);
          logHost.appendChild(h('div.row.row-between', h('div.rs-lab', 'Event log (' + s.log.length + ')'), h('span.small.muted', 'Tap ✎ to edit time or text')));
          logHost.appendChild(h('ul.rs-log', s.log.slice().reverse().map(function (e) {
            return h('li', h('span.t', mmss(e.t - s.startedAt)), h('span.c', clock(e.t)), h('span', e.text),
              h('button.btn.btn-sm.btn-ghost', { type: 'button', 'aria-label': 'Edit entry: ' + e.text, onclick: function () { editEntry(e); } }, '✎'));
          })));
        }

        function renderPrompts(now) {
          if (!promptHost) return;
          var a = adrenalineStatus(s, now), m = amiodaroneStatus(s);
          var key = [a.state, a.text.replace(/\d+:\d\d/g, ''), m.state, m.text].join('|');
          if (key === lastPromptKey) { refs.adrText && (refs.adrText.textContent = a.text); return; }
          lastPromptKey = key;
          MT.clear(promptHost);
          function box(st, title, st2) {
            var cls = st2.state === 'due' ? '.due' : st2.state === 'overdue' ? '.overdue' : '';
            var textEl = h('strong', st2.text);
            if (title === 'Adrenaline') refs.adrText = textEl;
            return h('div.rs-prompt' + cls, h('div.rs-lab', { style: st2.state === 'overdue' ? 'color:inherit' : '' }, title), textEl, st2.dose ? h('div.small', st2.dose) : null);
          }
          promptHost.appendChild(box('a', 'Adrenaline', a));
          if (s.rhythm === 'shockable' || s.amiodarone.length) promptHost.appendChild(box('m', 'Amiodarone', m));
          if (s.mode === 'paeds') {
            var d = doses('paeds', s.weight);
            promptHost.appendChild(h('div.small.muted', 'Next shock: ' + d.shock + (d.lidocaine ? ' · Lidocaine alternative: ' + d.lidocaine : '')));
          } else promptHost.appendChild(h('div.small.muted', 'Shock: ' + doses('adult').shock + '. Lidocaine 1 mg/kg is the alternative if amiodarone is unavailable.'));
        }

        function tick() {
          if (!s || !alive) return;
          var now = Date.now();
          var end = s.endedAt || now;
          elapsedEl.textContent = mmss(end - s.startedAt);
          if (!s.endedAt && !s.rosc) {
            var c = cycle(s, now);
            if (c.overdue) { cycEl.textContent = '+' + mmss(-c.remainingMs); statusEl.classList.add('check'); barEl.style.width = '100%'; if (!alerted['c' + s.cycleNo]) { alerted['c' + s.cycleNo] = 1; alertTone(3); } }
            else { cycEl.textContent = mmss(c.remainingMs); statusEl.classList.remove('check'); barEl.style.width = (100 * (1 - c.remainingMs / CYCLE_MS)) + '%'; }
            var a = adrenalineStatus(s, now);
            if ((a.state === 'due' || a.state === 'overdue') && !alerted['a' + s.adrenaline.length]) { alerted['a' + s.adrenaline.length] = 1; alertTone(1); }
          } else { statusEl.classList.remove('check'); barEl.style.width = s.rosc ? '100%' : '0'; }
          chipRhythm.textContent = s.rhythm === 'shockable' ? 'Shockable' : s.rhythm === 'nonshockable' ? 'Non-shockable' : 'Rhythm: not set';
          chipRhythm.className = 'badge ' + (s.rhythm === 'shockable' ? 'badge-danger' : s.rhythm ? 'badge-info' : '');
          chipShock.textContent = '⚡ ' + s.shocks + ' shock' + (s.shocks === 1 ? '' : 's');
          var lastA = s.adrenaline.length ? ' · last ' + mmss(now - s.adrenaline[s.adrenaline.length - 1]) + ' ago' : '';
          chipAdr.textContent = 'Adrenaline ×' + s.adrenaline.length + (s.endedAt ? '' : lastA);
          chipAmio.textContent = 'Amiodarone ×' + s.amiodarone.length;
          if (!s.endedAt && !s.rosc) renderPrompts(now);
        }

        /* --------------------------------- init ------------------------------- */
        document.addEventListener('visibilitychange', onVis);
        if (s) {
          if (!s.endedAt) { requestWake(); MT.toast('Session restored — still running', 'ok'); }
          renderRunning();
        } else renderSetup();
        tickTimer = setInterval(tick, 250);
        container.appendChild(host); container.appendChild(printHost);
        if (s && !s.endedAt) { /* restored */ }

        return function cleanup() {
          alive = false; clearInterval(tickTimer); stopMetro(); releaseWake(); document.removeEventListener('visibilitychange', onVis);
          try { if (audio && audio.close) audio.close(); } catch (e) { /* ignore */ }
        };
      }
    });
  };

  return logic;
});
