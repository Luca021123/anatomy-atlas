/* Salus — Daily coach (H3): blood pressure, sleep, mood, breathing, movement, medicines, habits, and the "Today" widget.
 * All logic lives in health/lib/trackers.js (MTLib.trackers); this file is UI only.
 * Storage keys (all local, never sent anywhere):
 *   health.coach.bp      { v:1, readings:[...], plan:{ startDate } }      (shared shape, see docs/ARCHITECTURE.md)
 *   health.coach.meds    { v:1, items:[...] }                              (shared shape)
 *   health.coach.habits  { v:1, items:[...] }                              (shared shape)
 *   health.coach.medlog  { v:1, log:{ date:{ 'medId@HH:MM': true } } }
 *   health.coach.sleep   { v:1, entries:[...] }
 *   health.coach.mood    { v:1, checkins:[...], activities:[...], solves:[...] }
 *   health.coach.breathe { v:1, sessions:[...] }
 *   health.coach.move    { v:1, steps:{date:n}, minutes:[...], strength:[dates], snacks:{date:n}, readiness:{...}, prefs:{...} }
 */
(function () {
  'use strict';
  var h = MT.h, t = MT.t, T = MTLib.trackers, U = T.util;

  var K = {
    bp: 'health.coach.bp', meds: 'health.coach.meds', medlog: 'health.coach.medlog', habits: 'health.coach.habits',
    sleep: 'health.coach.sleep', mood: 'health.coach.mood', breathe: 'health.coach.breathe', move: 'health.coach.move'
  };

  /* ====================================================================
     Storage helpers (defensive: missing or corrupt data becomes empty data)
     ==================================================================== */
  function loadDoc(key, defaults) {
    var d = MT.store.get(key, null);
    if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
    Object.keys(defaults).forEach(function (k) {
      if (Array.isArray(defaults[k])) { if (!Array.isArray(d[k])) d[k] = []; }
      else if (defaults[k] && typeof defaults[k] === 'object') { if (!d[k] || typeof d[k] !== 'object' || Array.isArray(d[k])) d[k] = {}; }
      else if (d[k] == null) d[k] = defaults[k];
    });
    d.v = 1;
    return d;
  }
  function saveDoc(key, d) { d.v = 1; return MT.store.set(key, d); }
  var bpDoc = function () { return loadDoc(K.bp, { readings: [] }); };
  var medsDoc = function () { return loadDoc(K.meds, { items: [] }); };
  var habitsDoc = function () { return loadDoc(K.habits, { items: [] }); };
  var medLogDoc = function () { return loadDoc(K.medlog, { log: {} }); };
  var sleepDoc = function () { return loadDoc(K.sleep, { entries: [] }); };
  var moodDoc = function () { return loadDoc(K.mood, { checkins: [], activities: [], solves: [] }); };
  var breatheDoc = function () { return loadDoc(K.breathe, { sessions: [] }); };
  var moveDoc = function () { return loadDoc(K.move, { steps: {}, minutes: [], strength: [], snacks: {}, readiness: {}, prefs: {} }); };

  /* ====================================================================
     Small UI helpers
     ==================================================================== */
  var idn = 0;
  function nid() { return 'hc' + (++idn); }
  function today() { return MT.today(); }
  function field(label, input, hint) {
    if (!input.id) input.id = nid();
    return h('div.field', h('label', { 'for': input.id }, label), input, hint ? h('div.hint', hint) : null);
  }
  function numInput(opts) {
    return h('input', { type: 'text', inputmode: opts.decimal ? 'decimal' : 'numeric', autocomplete: 'off', placeholder: opts.placeholder || '', value: opts.value != null ? String(opts.value) : '', 'aria-describedby': opts.describedby || null, maxlength: opts.maxlength || 6 });
  }
  function nf(n) { try { return Number(n).toLocaleString(MT.i18n && MT.i18n.lang || undefined); } catch (e) { return String(n); } }
  function stat(value, label) { return h('div.stat', h('div.stat-value', value), h('div.stat-label', label)); }
  function note(text) { return h('p.small.muted', text); }
  function sectionTitle(text) { return h('h2.section-title', text); }
  function speak(getText) { return MT.speech.button(getText); }
  function dateLabel(ymd, opts) { return MT.formatDate(ymd, opts || { month: 'short', day: 'numeric' }); }
  function weekdayShort(ymd) { return MT.formatDate(ymd, { weekday: 'short' }); }
  function weekdayInitial(ymd) { return MT.formatDate(ymd, { weekday: 'narrow' }); }
  function timeLabel(hm) { var m = U.parseHM(hm); if (m == null) return hm; var d = new Date(2000, 0, 1, Math.floor(m / 60), m % 60); return MT.formatTime(d); }
  function minToHM(m) { var hrs = Math.floor(m / 60), mi = m % 60; return t('{h} h {m} min', { h: hrs, m: mi }); }
  function reducedMotion() { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not supported */ } }
  function profile() { try { return MT.profile.get() || {}; } catch (e) { return {}; } }

  function emergencyNumber() { try { return (MT.help && MT.help.emergencyNumber) ? MT.help.emergencyNumber() : null; } catch (e) { return null; } }
  /** Red "get emergency help" block. Always links to #/get-help; adds a Call button when H2's number is available. */
  function emergencyBlock(message) {
    var num = emergencyNumber();
    return h('div.alert.alert-danger.hc-emerg', { role: 'alert' }, h('span.alert-ico', { 'aria-hidden': 'true' }, '⛔'),
      h('div.stack', { style: 'gap:10px' }, h('strong', message),
        h('div.row', { style: 'flex-wrap:wrap;gap:8px' },
          num ? h('a.btn.btn-danger.btn-lg', { href: 'tel:' + String(num).replace(/[^\d+*#]/g, '') }, t('Call {number}', { number: num })) : null,
          h('a.btn.btn-lg', { href: '#/get-help' }, t('Open Get help now')))));
  }
  function getHelpLine() {
    return h('p.small', t('If you ever feel very unwell, do not wait. Get help now:'), ' ', h('a', { href: '#/get-help' }, t('Get help now')));
  }
  function refs(items) {
    return h('details.disclosure', h('summary', t('Sources and evidence')),
      h('div.disclosure-body', h('ul.small', { style: 'margin:0;padding-left:1.1rem' }, items.map(function (r) {
        return h('li', r.url ? h('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.label) : r.label, r.note ? ' — ' + r.note : '');
      }))));
  }
  function confirmThen(msg, fn, danger) { MT.confirm(msg, { danger: danger !== false }).then(function (ok) { if (ok) fn(); }); }

  /** Tabs with a panel; returns {el, panel, go, cleanup}. Each tab's render(panel, api) may return a cleanup function. */
  function tabbed(tabs, initial) {
    var bar = h('div.tabs', { role: 'tablist' }), panel = h('div.hc-panel', { role: 'tabpanel' }), cur = null, cleanup = null;
    var buttons = {};
    var api = { go: go };
    function go(id) {
      if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
      cur = id; MT.clear(panel);
      tabs.forEach(function (tb) { buttons[tb.id].setAttribute('aria-selected', String(tb.id === id)); });
      var tab = tabs.filter(function (x) { return x.id === id; })[0];
      var c = tab.render(panel, api); if (typeof c === 'function') cleanup = c;
    }
    tabs.forEach(function (tb) {
      var b = h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', onclick: function () { go(tb.id); } }, tb.label);
      buttons[tb.id] = b; bar.appendChild(b);
    });
    var el = h('div', bar, panel);
    go(initial || tabs[0].id);
    api.el = el; api.panel = panel;
    api.cleanup = function () { if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; } };
    return api;
  }

  /** Print a sheet: appended to the tool host, shown only when printing. */
  function printSheet(host, sheet) {
    var wrap = h('div.hc-sheet-wrap', sheet);
    host.appendChild(wrap); host.classList.add('hc-printmode');
    function done() { host.classList.remove('hc-printmode'); wrap.remove(); window.removeEventListener('afterprint', done); }
    window.addEventListener('afterprint', done);
    MT.print(host);
    setTimeout(done, 4000);
  }

  MT.css('hc', [
    '.hc-panel{min-height:120px}',
    '.result a,.alert a:not(.btn){color:inherit;font-weight:700;text-decoration:underline}',
    '.hc-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
    '.hc-big{font-size:2.2rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1}',
    '.hc-pair{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:end}',
    '.hc-pair .hc-slash{font-size:1.6rem;font-weight:700;padding-bottom:6px;color:var(--muted)}',
    '.hc-faces{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}',
    '.hc-face{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 2px;border:2px solid var(--border);background:var(--surface);border-radius:12px;cursor:pointer;font:inherit;color:var(--text);min-height:76px}',
    '.hc-face .e{font-size:1.9rem;line-height:1}.hc-face .l{font-size:.72rem;color:var(--muted);font-weight:600;text-align:center}',
    '.hc-face[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-soft)}',
    '.hc-face:hover{border-color:var(--border-strong)}',
    '.hc-days{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center}',
    '.hc-day{border:1px solid var(--border);border-radius:10px;padding:6px 2px;background:var(--surface);font-size:.78rem}',
    '.hc-day.today{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}',
    '.hc-day.skip{opacity:.65;background:var(--surface-2)}',
    '.hc-day b{display:block;font-size:.95rem}',
    '.hc-dot{display:inline-block;width:10px;height:10px;border-radius:50%;border:2px solid var(--border-strong);margin:1px}',
    '.hc-dot.on{background:var(--ok);border-color:var(--ok)}',
    '.hc-cell{width:30px;height:30px;border-radius:8px;border:1px solid var(--border);display:inline-grid;place-items:center;font-size:.72rem;color:var(--muted);background:var(--surface)}',
    '.hc-cell.on{background:var(--ok);border-color:var(--ok);color:#fff;font-weight:800}',
    '.hc-cell.today{outline:2px solid var(--accent);outline-offset:1px}',
    '.hc-grid7{display:flex;gap:4px;flex-wrap:nowrap}',
    '.hc-grid7>div{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:.68rem;color:var(--muted)}',
    '.hc-item{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}',
    '.hc-item h3{margin:0;font-size:1.05rem}',
    '.hc-sheet-wrap{display:none}',
    '.hc-sheet{background:var(--surface);color:var(--text)}',
    '.hc-sheet h2{margin:0 0 4px}.hc-sheet table{width:100%;border-collapse:collapse;font-size:.9rem;margin:8px 0}',
    '.hc-sheet th,.hc-sheet td{border:1px solid var(--border-strong);padding:5px 8px;text-align:left}',
    '.hc-sheet .blank{height:26px}',
    '.hc-bar{display:flex;align-items:flex-end;gap:6px;height:90px}',
    '.hc-bar>div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:2px;height:100%;font-size:.7rem;color:var(--muted)}',
    '.hc-bar i{display:block;width:100%;max-width:34px;background:var(--accent);border-radius:6px 6px 0 0;min-height:2px}',
    '.hc-bar i.miss{background:var(--surface-3)}',
    '.hc-helpbar{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:10px 14px;border-radius:12px;background:var(--info-soft);border:1px solid var(--info-border);margin-bottom:14px}',
    '.hc-pacer-wrap{display:grid;place-items:center;padding:12px 0;min-height:250px}',
    '.hc-pacer{width:230px;height:230px;max-width:65vw;max-height:65vw;border-radius:50%;background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--accent) 55%,#fff),var(--accent));box-shadow:0 0 0 8px var(--accent-soft);transform:scale(.55);will-change:transform}',
    '.hc-word{font-size:1.5rem;font-weight:800;min-height:1.9rem}.hc-count{font-size:2.6rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1;color:var(--accent-text)}',
    '.hc-pacer.still{display:none}',
    '.hc-big-step{font-size:1.25rem;line-height:1.6}',
    '.hc-opt{display:block;text-align:left;width:100%;padding:12px 14px;border:2px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text);font:inherit;cursor:pointer}',
    '.hc-opt[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-soft)}',
    '.hc-opt strong{display:block}.hc-opt span{color:var(--muted);font-size:.9rem}',
    '.hc-tick{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--surface);min-height:52px}',
    '.hc-tick input{width:24px;height:24px;accent-color:var(--accent);flex:none}',
    '.hc-tick.done{background:var(--ok-soft);border-color:var(--ok-border)}',
    '.hc-tick .t{flex:1;min-width:0}.hc-tick .s{display:block;color:var(--muted);font-size:.82rem}',
    '.hc-mini-faces{display:flex;gap:4px;flex-wrap:wrap}',
    '.hc-mini-faces button{width:44px;height:44px;font-size:1.5rem;border:2px solid var(--border);border-radius:12px;background:var(--surface);cursor:pointer}',
    '.hc-mini-faces button:hover{border-color:var(--accent)}',
    '@media (max-width:480px){.hc-big{font-size:1.9rem}.hc-faces{gap:4px}.hc-face .l{font-size:.66rem}}',
    '@media print{.hc-printmode>*:not(.hc-sheet-wrap){display:none!important}.hc-printmode>.hc-sheet-wrap{display:block!important}.hc-sheet{padding:0}}'
  ].join('\n'));

  /* ====================================================================
     1. BLOOD PRESSURE
     ==================================================================== */
  var BP_REFS = function () { return [
    { label: 'Mancia G, et al. 2023 ESH Guidelines for the management of arterial hypertension. J Hypertens 2023;41:1874-2071', note: t('home threshold 135/85, measuring method') },
    { label: 'Jones DW, et al. 2025 AHA/ACC guideline for high blood pressure in adults. Circulation 2025', note: t('categories, home monitoring, validated devices') },
    { label: 'American Heart Association: Hypertensive crisis (180/120): when to call emergency services', note: t('rest 5 minutes, re-check, symptoms'), url: 'https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings' },
    { label: 'Tucker KL, et al. Self-measured blood pressure monitoring with co-interventions lowers blood pressure. PLOS Medicine 2017;14:e1002389', note: t('readings help most when you act on them') }
  ]; };
  var SESSION_LABEL = function (s) { return s === 'am' ? t('Morning') : s === 'pm' ? t('Evening') : t('Other'); };
  var LEVEL_LABEL = function (l) { return ({ normal: t('Healthy range'), elevated: t('A little above ideal'), high: t('High at home'), crisis: t('Very high'), low: t('On the low side') })[l] || ''; };
  var LEVEL_BAND = { normal: 'ok', elevated: 'info', high: 'warn', crisis: 'danger', low: 'info' };
  function bpErrorText(code) {
    return ({
      'sys-range': t('The top number should be between 50 and 300. Please check it.'),
      'dia-range': t('The bottom number should be between 30 and 200. Please check it.'),
      'pulse-range': t('The pulse should be between 20 and 250. Please check it.'),
      'dia-ge-sys': t('The top number should be bigger than the bottom number. Did you swap them?')
    })[code] || code;
  }
  function bpWarnText(code) {
    return code === 'narrow-pp' ? t('The two numbers are very close together.') : t('The two numbers are very far apart.');
  }
  function fmtDT(iso) { var d = new Date(iso); return MT.formatDate(d, { month: 'short', day: 'numeric' }) + ' ' + MT.formatTime(d); }
  function localInputValue(d) { return U.ymd(d) + 'T' + MT.pad2(d.getHours()) + ':' + MT.pad2(d.getMinutes()); }

  var BP_SYMPTOMS = function () {
    return [['chest', t('Chest pain or pressure')], ['breath', t('Shortness of breath')], ['weak', t('Weakness or numbness in the face, arm or leg')],
      ['vision', t('A change in your vision')], ['speech', t('Trouble speaking or understanding')], ['head', t('A very bad headache')],
      ['conf', t('Confusion')], ['back', t('Very bad back pain')], ['seizure', t('A seizure (fit)')]];
  };

  /** Crisis flow for a reading at or above 180/120. */
  function crisisPanel(reading, reg) {
    var box = h('div.stack.hc-crisis', { role: 'region', 'aria-label': t('Very high reading: what to do') });
    var advice = h('div.stack', { 'aria-live': 'polite' });
    var checks = {};
    var recheck = null;
    box.appendChild(MT.ui.alert('danger', t('{sys}/{dia} is a very high reading.', { sys: reading.sys, dia: reading.dia }),
      t('Stay calm. This is often a one-off, but it needs a careful check now. Answer the questions below. If you feel very unwell at any point, get emergency help.')));
    var sy = h('fieldset', h('legend', t('Do you have any of these right now?')),
      h('div.grid', { style: '--min:250px;gap:6px' }, BP_SYMPTOMS().map(function (s) {
        var cb = h('input', { type: 'checkbox', onchange: refresh });
        checks[s[0]] = cb;
        return h('label.check', cb, h('span', s[1]));
      })));
    box.appendChild(sy);
    box.appendChild(advice);

    // 5-minute rest timer
    var timerOut = h('span.mono', { 'aria-hidden': 'true' }, '5:00'), timerBtn, left = 300, iv = null;
    function stopTimer() { if (iv) { clearInterval(iv); iv = null; } }
    reg(stopTimer);
    timerBtn = h('button.btn.btn-soft', { type: 'button', onclick: function () {
      if (iv) { stopTimer(); timerBtn.textContent = t('Start 5-minute rest'); return; }
      left = 300; timerBtn.textContent = t('Stop timer');
      iv = setInterval(function () {
        left--; timerOut.textContent = Math.floor(left / 60) + ':' + MT.pad2(left % 60);
        if (left <= 0) { stopTimer(); timerBtn.textContent = t('Start 5-minute rest'); vibrate([200, 100, 200]); MT.toast(t('Five minutes are up. Measure again now.'), 'ok', 5000); }
      }, 1000);
    } }, t('Start 5-minute rest'));
    var sys2 = numInput({ placeholder: t('Top'), maxlength: 3 }), dia2 = numInput({ placeholder: t('Bottom'), maxlength: 3 }), err2 = h('div.error', { role: 'alert' });
    var rcForm = h('div.stack', h('div.row', { style: 'gap:10px;flex-wrap:wrap' }, timerBtn, timerOut),
      h('div.hc-pair', field(t('Top number (systolic)'), sys2), h('div.hc-slash', '/'), field(t('Bottom number (diastolic)'), dia2)), err2,
      h('button.btn.btn-primary', { type: 'button', onclick: saveRecheck }, t('Save the new reading')));

    function anySymptom() { return Object.keys(checks).some(function (k) { return checks[k].checked; }); }
    function refresh() {
      MT.clear(advice);
      var sym = anySymptom();
      if (sym) {
        advice.appendChild(emergencyBlock(t('Get emergency help now. A very high reading with these symptoms can be an emergency. Do not drive yourself.')));
        return;
      }
      if (!recheck) {
        advice.appendChild(MT.ui.alert('warn', t('No symptoms: rest, then measure again'), t('Sit quietly for 5 minutes with your back supported and your feet flat. Then measure again and save the new reading here.')));
        advice.appendChild(rcForm);
        return;
      }
      var a = T.crisisAdvice(true, T.isCrisis(recheck.sys, recheck.dia), false);
      if (a === 'same-day') {
        advice.appendChild(MT.ui.alert('danger', t('Still very high ({sys}/{dia}). See a health worker today.', { sys: recheck.sys, dia: recheck.dia }),
          t('You have no emergency symptoms, but this level needs a health worker the same day. Call your clinic or doctor now, or go to the nearest clinic or emergency department. Do not skip or double any medicine on your own. If any symptom above starts, tick it here and get emergency help.')));
        advice.appendChild(h('div.row', { style: 'gap:8px;flex-wrap:wrap' }, h('a.btn.btn-primary', { href: '#/get-help' }, t('Open Get help now')), rcAgainBtn()));
      } else {
        advice.appendChild(MT.ui.alert('ok', t('Lower now ({sys}/{dia}). Thank you for re-checking.', { sys: recheck.sys, dia: recheck.dia }),
          t('A very high first reading often comes down after resting. Still tell a health worker about it within a day or two, and bring your readings. If you feel unwell or any symptom starts, get help.')));
        advice.appendChild(rcAgainBtn());
      }
    }
    function rcAgainBtn() { return h('button.btn.btn-ghost', { type: 'button', onclick: function () { recheck = null; refresh(); } }, t('Measure again')); }
    function saveRecheck() {
      var s = MT.num(sys2.value), d = MT.num(dia2.value), v = T.validateBP(s, d);
      err2.textContent = '';
      if (!v.ok) { err2.textContent = v.errors.map(bpErrorText).join(' '); return; }
      var doc = bpDoc();
      doc.readings.push({ id: MT.uid('bp'), t: new Date().toISOString(), sys: s, dia: d, pulse: null, arm: reading.arm || 'left', session: reading.session || 'other', note: t('Re-check after resting') });
      saveDoc(K.bp, doc);
      recheck = { sys: s, dia: d }; sys2.value = ''; dia2.value = '';
      refresh();
    }
    refresh();
    return box;
  }

  /** Message for a single saved reading. */
  function readingFeedback(r, reg) {
    var prof = profile();
    var a = T.assessReading(r.sys, r.dia, { pregnant: !!prof.pregnant });
    var out = h('div.stack', { 'aria-live': 'polite' });
    if (a.crisis) { out.appendChild(crisisPanel(r, reg)); return out; }
    if (a.pregnancyUrgent) {
      out.appendChild(MT.ui.alert('danger', t('{sys}/{dia} is too high for pregnancy.', { sys: r.sys, dia: r.dia }), t('Contact your midwife, doctor or maternity unit now, or go to the nearest hospital. If you also have a bad headache, vision changes, pain under the ribs or swelling of the face, get emergency help.')));
      out.appendChild(emergencyBlock(t('Very bad headache, vision changes, pain under the ribs, or a fit: get emergency help now.')));
      return out;
    }
    if (a.pregnancyHigh) out.appendChild(MT.ui.alert('warn', t('{sys}/{dia} is higher than expected in pregnancy.', { sys: r.sys, dia: r.dia }), t('Please contact your midwife or doctor today, even if you feel well.')));
    var lvl = a.level;
    var msgs = {
      normal: [t('Saved: {sys}/{dia}. In the healthy range.', { sys: r.sys, dia: r.dia }), t('Nice work. Keep measuring in the same way so the numbers can be compared.')],
      elevated: [t('Saved: {sys}/{dia}. A little above ideal.', { sys: r.sys, dia: r.dia }), t('One reading is only one piece of the picture. Keep going for the full week to see your real average.')],
      high: [t('Saved: {sys}/{dia}. At or above the 135/85 home level.', { sys: r.sys, dia: r.dia }), t('One high reading can come from rushing, stress, coffee or a full bladder. Keep measuring for the week. If most readings stay high, see a health worker.')],
      low: [t('Saved: {sys}/{dia}. On the low side.', { sys: r.sys, dia: r.dia }), t('Many healthy people have lower pressure. If you feel dizzy, faint, confused or have chest pain, sit or lie down and get medical help.')]
    };
    var m = msgs[lvl] || msgs.normal;
    out.appendChild(MT.ui.alert(lvl === 'high' ? 'warn' : lvl === 'normal' ? 'ok' : 'info', m[0], m[1]));
    out.appendChild(getHelpLine());
    return out;
  }

  function renderBPLog(panel, api, host, reg) {
    var doc = bpDoc();
    var now = new Date();
    var sysIn = numInput({ placeholder: '120', maxlength: 3 }), diaIn = numInput({ placeholder: '80', maxlength: 3 }), pulseIn = numInput({ placeholder: '70', maxlength: 3 });
    var errBox = h('div.error', { role: 'alert' });
    var dtIn = h('input', { type: 'datetime-local', value: localInputValue(now) });
    var noteIn = h('input', { type: 'text', maxlength: 120, placeholder: t('Optional, for example: after a walk') });
    var arm = 'left', sess = now.getHours() < 12 ? 'am' : 'pm';
    var armSeg = MT.ui.segmented([{ value: 'left', label: t('Left arm') }, { value: 'right', label: t('Right arm') }], arm, function (v) { arm = v; });
    var sessSeg = MT.ui.segmented([{ value: 'am', label: t('Morning') }, { value: 'pm', label: t('Evening') }, { value: 'other', label: t('Other') }], sess, function (v) { sess = v; });
    var feedback = h('div.hc-feedback');
    var listBox = h('div');

    function save() {
      errBox.textContent = '';
      var sys = MT.num(sysIn.value), dia = MT.num(diaIn.value), pulse = pulseIn.value.trim() ? MT.num(pulseIn.value) : undefined;
      var v = T.validateBP(sys, dia, pulse);
      if (!v.ok) { errBox.textContent = v.errors.map(bpErrorText).join(' '); return; }
      var when = dtIn.value ? new Date(dtIn.value) : new Date();
      if (isNaN(when)) when = new Date();
      if (when.getTime() > Date.now() + 3600000) { errBox.textContent = t('That time is in the future. Please check the date and time.'); return; }
      function commit() {
        var reading = { id: MT.uid('bp'), t: when.toISOString(), sys: sys, dia: dia, pulse: pulse != null ? pulse : null, arm: arm, session: sess, note: noteIn.value.trim() };
        var d = bpDoc(); d.readings.push(reading); saveDoc(K.bp, d);
        MT.clear(feedback); feedback.appendChild(readingFeedback(reading, reg));
        sysIn.value = ''; diaIn.value = ''; pulseIn.value = ''; noteIn.value = ''; dtIn.value = localInputValue(new Date());
        drawList();
        feedback.scrollIntoView && feedback.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
      }
      if (v.warnings.length) {
        MT.confirm(v.warnings.map(bpWarnText).join(' ') + ' ' + t('You entered {sys}/{dia}. Save it anyway?', { sys: sys, dia: dia }), {}).then(function (ok) { if (ok) commit(); });
      } else commit();
    }

    function drawList() {
      MT.clear(listBox);
      var rs = bpDoc().readings.slice().sort(function (a, b) { return a.t < b.t ? 1 : -1; }).slice(0, 6);
      if (!rs.length) { listBox.appendChild(MT.ui.empty('🩺', t('No readings yet'), t('Your first reading will appear here.'))); return; }
      listBox.appendChild(h('h3', { style: 'font-size:1rem;margin:0 0 8px' }, t('Latest readings')));
      listBox.appendChild(h('div.table-wrap', h('table.table', h('thead', h('tr', h('th', t('When')), h('th', t('Reading')), h('th', t('Pulse')))),
        h('tbody', rs.map(function (r) {
          var lvl = T.classifyHome(r.sys, r.dia);
          return h('tr', h('td', fmtDT(r.t), h('br'), h('span.small.muted', SESSION_LABEL(r.session))),
            h('td', h('strong', r.sys + '/' + r.dia), ' ', MT.ui.badge(LEVEL_LABEL(lvl), LEVEL_BAND[lvl] === 'ok' ? 'ok' : LEVEL_BAND[lvl] === 'warn' ? 'warn' : LEVEL_BAND[lvl] === 'danger' ? 'danger' : 'info')),
            h('td', r.pulse != null ? String(r.pulse) : '—'));
        })))));
    }

    var prot = bpDoc().plan && bpDoc().plan.startDate ? T.bpDueToday(doc.readings, doc.plan.startDate, today()) : { active: false };
    panel.appendChild(h('div.stack',
      prot.active ? MT.ui.alert('info', prot.discarded ? t('Day 1 of your 7-day week: practice day') : t('Day {n} of your 7-day week', { n: prot.dayIndex + 1 }),
        t('Morning reading: {am}. Evening reading: {pm}.', { am: prot.amDone ? t('done') : t('to do'), pm: prot.pmDone ? t('done') : t('to do') })) : null,
      h('div.card', h('div.stack',
        h('h2', { style: 'margin:0;font-size:1.1rem' }, t('Add a reading')),
        h('p.small.muted', { style: 'margin:0' }, t('Before you start: rest 5 minutes, sit with your back supported and feet flat, rest your arm at heart level, and wait 30 minutes after coffee, exercise or smoking.'), ' ',
          h('a', { href: '#', onclick: function (e) { e.preventDefault(); api.go('guide'); } }, t('Full guide'))),
        h('div.hc-pair', field(t('Top number (systolic)'), sysIn, t('mmHg')), h('div.hc-slash', { 'aria-hidden': 'true' }, '/'), field(t('Bottom number (diastolic)'), diaIn, t('mmHg'))),
        field(t('Pulse (optional)'), pulseIn, t('beats per minute')),
        h('div.field', h('div.field-label', t('Which session is this?')), sessSeg),
        h('div.field', h('div.field-label', t('Which arm?')), armSeg),
        h('details.disclosure', h('summary', t('Change the time or add a note')), h('div.disclosure-body.stack', field(t('Date and time'), dtIn), field(t('Note'), noteIn))),
        errBox,
        h('button.btn.btn-primary.btn-lg.btn-block', { type: 'button', onclick: save }, t('Save reading')))),
      feedback, listBox));
    drawList();
  }

  function renderBPSummary(panel, api, host, reg) {
    var doc = bpDoc(), plan = doc.plan || {};
    var p = T.bpProtocol(doc.readings, { startDate: plan.startDate || undefined });
    var td = today();
    var weekOver = plan.startDate && U.diffDays(plan.startDate, td) > 6;
    var wrap = h('div.stack');
    panel.appendChild(wrap);

    // Plan controls
    var startIn = h('input', { type: 'date', value: plan.startDate || td });
    var amIn = h('input', { type: 'time', value: plan.amTime || '07:30' }), pmIn = h('input', { type: 'time', value: plan.pmTime || '19:30' });
    function startWeek() {
      var d = bpDoc(); d.plan = Object.assign({}, d.plan, { startDate: startIn.value || today(), amTime: amIn.value, pmTime: pmIn.value }); saveDoc(K.bp, d);
      MT.toast(t('Your 7-day week has started. Day 1 is a practice day.'), 'ok'); MT.app.navigate('#/bp/week');
    }
    function downloadIcs() {
      var start = startIn.value || today();
      var ev = T.bpReminderEvents(start, { amTime: amIn.value, pmTime: pmIn.value,
        amLabel: t('morning'), pmLabel: t('evening'),
        titleTemplate: t('Blood pressure ({session}, day {day})'), descTemplate: t('Sit quietly for 5 minutes. Take 2 readings 1 minute apart. Write them in Salus.') });
      MT.ics.download('salus-blood-pressure-week.ics', { name: t('Blood pressure week'), events: ev });
      MT.toast(t('Reminder file saved. Open it to add the reminders to your calendar.'), 'ok', 4500);
    }

    var planCard = h('div.card', h('div.stack',
      h('h2', { style: 'margin:0;font-size:1.1rem' }, t('My 7-day measuring week')),
      plan.startDate && !weekOver ? h('p', { style: 'margin:0' }, t('Your week started on {date}. Day 1 is a practice day and is not counted.', { date: dateLabel(plan.startDate, { weekday: 'long', month: 'short', day: 'numeric' }) }))
        : h('p.muted', { style: 'margin:0' }, weekOver ? t('Your last week is finished. Start a new one any time.') : t('Measure twice in the morning and twice in the evening for 7 days. This gives a far more reliable picture than a single clinic reading.')),
      h('div.form-grid.cols-2', field(t('Start on'), startIn), h('div')),
      h('div.form-grid.cols-2', field(t('Morning reminder'), amIn), field(t('Evening reminder'), pmIn)),
      h('div.hc-row',
        h('button.btn.btn-primary', { type: 'button', onclick: startWeek }, plan.startDate && !weekOver ? t('Restart my week') : t('Start my 7-day week')),
        h('button.btn', { type: 'button', onclick: downloadIcs }, '📅 ' + t('Download reminders (.ics)'))),
      h('p.small.muted', { style: 'margin:0' }, t('The reminder file works with any phone calendar and needs no internet.'))));
    wrap.appendChild(planCard);

    // Day strip
    if (p.dayList.length) {
      wrap.appendChild(h('div.card', h('div.stack', h('h3', { style: 'margin:0;font-size:1rem' }, t('Your days')),
        h('div.hc-days', p.dayList.map(function (d) {
          return h('div.hc-day' + (d.date === td ? '.today' : '') + (d.discarded ? '.skip' : ''), { title: d.discarded ? t('Practice day: not counted') : '' },
            weekdayShort(d.date), h('b', String(d.index + 1)),
            h('span', { 'aria-label': t('Morning {n}, evening {m}', { n: d.am, m: d.pm }) }, h('span.hc-dot' + (d.am ? '.on' : '')), h('span.hc-dot' + (d.pm ? '.on' : ''))));
        })),
        h('p.small.muted', { style: 'margin:0' }, t('Left dot: morning. Right dot: evening. Filled means done.')))));
    }

    // Result
    if (p.avg) {
      var lvl = p.classification, band = LEVEL_BAND[lvl] || 'info';
      var text = {
        normal: t('This is in the healthy range. Keep up your healthy habits and check again in a few months.'),
        elevated: t('This is a little above ideal. Less salt, more vegetables, fruit and movement, less alcohol, and a healthy weight can all bring it down. Mention it at your next check-up.'),
        high: t('This is at or above the 135/85 level that suggests high blood pressure at home. It is not a diagnosis. Please book a visit with a health worker soon and bring your report. Do not start or stop any medicine on your own.'),
        low: t('This is on the low side. If you feel well, that is usually fine. If you feel dizzy or faint, tell a health worker.'),
        crisis: t('This average is very high. Please contact a health worker today.')
      }[lvl];
      wrap.appendChild(h('div.result.band-' + band, { role: 'region', 'aria-live': 'polite', 'aria-label': t('Your home average') },
        h('div.result-label', p.status === 'valid' ? t('Your home average (days 2 to 7)') : t('Early look (not enough days yet)')),
        h('div.result-value', p.avg.sys + '/' + p.avg.dia, h('span.unit', 'mmHg')),
        h('div.result-title', LEVEL_LABEL(lvl)),
        h('p', { style: 'margin:0 0 8px' }, text),
        p.status === 'provisional' ? h('p', { style: 'margin:0 0 8px' }, h('strong', t('Keep going: {n} more day(s) with readings are needed for a reliable average.', { n: p.neededDays }))) : null,
        h('dl.kv', h('dt', t('Readings counted')), h('dd', t('{n} from {d} days', { n: p.avg.n, d: p.usableDays })),
          p.am ? h('dt', t('Morning average')) : null, p.am ? h('dd', p.am.sys + '/' + p.am.dia) : null,
          p.pm ? h('dt', t('Evening average')) : null, p.pm ? h('dd', p.pm.sys + '/' + p.pm.dia) : null,
          p.avg.pulse != null ? h('dt', t('Average pulse')) : null, p.avg.pulse != null ? h('dd', t('{n} per minute', { n: p.avg.pulse })) : null),
        h('div', { style: 'margin-top:10px' }, h('div.small', t('Week completed: {a} of {b} readings', { a: p.total, b: p.expected })), h('div.progress', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(p.completeness * 100)) }, h('span', { style: 'width:' + Math.round(p.completeness * 100) + '%' }))),
        getHelpLine()));
      wrap.appendChild(h('div.card-soft', { style: 'padding:14px;border-radius:12px' }, h('strong', t('What helps lower blood pressure')),
        h('ul.small', { style: 'margin:6px 0 0;padding-left:1.1rem' },
          h('li', t('Eat less salt and processed food. Eat more vegetables, fruit, beans and nuts.')),
          h('li', t('Move: aim for 150 minutes a week of brisk activity.'), ' ', h('a', { href: '#/move' }, t('Open the activity coach'))),
          h('li', t('Keep a healthy weight, limit alcohol, and do not smoke.')),
          h('li', t('Sleep well and find ways to relax.'), ' ', h('a', { href: '#/breathe' }, t('Try slow breathing'))))));
    } else {
      wrap.appendChild(MT.ui.empty('📈', t('No average yet'), t('Add readings from day 2 of your week to see your home average.')));
    }

    // Chart
    var rs = doc.readings.filter(function (r) { return r.t && isFinite(new Date(r.t).getTime()); }).sort(function (a, b) { return a.t < b.t ? -1 : 1; });
    var recent = rs.filter(function (r) { return Date.now() - new Date(r.t).getTime() < 60 * 864e5; });
    if (recent.length >= 2) {
      var maxS = Math.max.apply(null, recent.map(function (r) { return r.sys; }));
      var yMax = Math.max(180, Math.ceil((maxS + 10) / 20) * 20);
      var chart = MT.chart.line({
        width: 640, height: 320, ariaLabel: t('Blood pressure readings over time with the home high levels of 135 and 85'),
        x: { time: true, label: t('Date') }, y: { min: 40, max: yMax, label: 'mmHg' },
        bands: [{ y0: 135, y1: yMax + 10, color: 'var(--danger-soft)', label: t('Top number 135 or more is high at home') }, { y0: 0, y1: 85, color: 'var(--ok-soft)', opacity: 0.5 }],
        hlines: [{ y: 85, label: t('Bottom number: 85 or more is high at home'), color: 'var(--warn)' }],
        series: [
          { name: t('Top number'), color: 'var(--chart-1)', markers: true, points: recent.map(function (r) { return [new Date(r.t).getTime(), r.sys]; }) },
          { name: t('Bottom number'), color: 'var(--chart-2)', markers: true, dash: '5 3', points: recent.map(function (r) { return [new Date(r.t).getTime(), r.dia]; }) }
        ]
      });
      wrap.appendChild(h('div.card', h('div.stack', h('h3', { style: 'margin:0;font-size:1rem' }, t('Trend (last 60 days)')), chart,
        h('p.small.muted', { style: 'margin:0' }, t('Shaded red: above the home high level for the top number. The green zone is below 85 for the bottom number.')))));
    }

    // All readings (with delete)
    if (rs.length) {
      wrap.appendChild(h('details.disclosure', h('summary', t('All readings ({n})', { n: rs.length })), h('div.disclosure-body',
        h('div.table-wrap', h('table.table', h('thead', h('tr', h('th', t('When')), h('th', t('Reading')), h('th', t('Pulse')), h('th', h('span.sr-only', t('Delete'))))),
          h('tbody', rs.slice().reverse().map(function (r) {
            return h('tr', h('td', fmtDT(r.t), h('br'), h('span.small.muted', SESSION_LABEL(r.session), r.note ? ' · ' + r.note : '')), h('td', h('strong', r.sys + '/' + r.dia)), h('td', r.pulse != null ? String(r.pulse) : '—'),
              h('td', h('button.btn.btn-sm.btn-ghost', { type: 'button', 'aria-label': t('Delete reading {sys}/{dia}', { sys: r.sys, dia: r.dia }), onclick: function () {
                confirmThen(t('Delete this reading?'), function () { var d = bpDoc(); d.readings = d.readings.filter(function (x) { return x.id !== r.id; }); saveDoc(K.bp, d); MT.app.navigate('#/bp/week'); });
              } }, '🗑')));
          })))))));
    }
  }

  function renderBPGuide(panel) {
    var steps = [
      t('Choose a validated upper-arm cuff. Wrist and finger monitors are less reliable. Check that the cuff size fits your arm: a cuff that is too small gives a falsely high number.'),
      t('Do not have coffee or tea, exercise or smoke for 30 minutes before. Go to the toilet first.'),
      t('Sit quietly for 5 minutes. Keep your back supported, feet flat on the floor and legs uncrossed. Do not talk.'),
      t('Rest your bare upper arm on a table so the cuff is level with your heart. Do not measure over clothing.'),
      t('Take 2 readings, 1 minute apart. Write down both. Measure in the morning before medicines and in the evening, every day for 7 days. Three days is the minimum.'),
      t('Day 1 is practice and is not counted. Salus averages all readings from days 2 to 7.')
    ];
    panel.appendChild(h('div.stack',
      h('div.card', h('div.stack', h('div.row', { style: 'justify-content:space-between;flex-wrap:wrap;gap:8px' }, h('h2', { style: 'margin:0;font-size:1.1rem' }, t('How to measure at home')), speak(function () { return t('How to measure your blood pressure at home.') + ' ' + steps.join(' '); })),
        h('ol.hc-big-step', { style: 'margin:0;padding-left:1.3rem;display:grid;gap:8px' }, steps.map(function (s) { return h('li', s); })))),
      MT.ui.alert('info', t('Why measure at home?'), t('Home readings tell you more than one reading at the clinic. Measuring and acting on the results, for example with advice from a health worker, lowers blood pressure more than measuring alone.')),
      MT.ui.alert('danger', t('Very high reading: 180/120 or more'), t('Rest for 5 minutes and measure again. If it is still that high AND you have chest pain, trouble breathing, weakness or numbness, vision changes, trouble speaking, a very bad headache or confusion, get emergency help now. If it is still that high but you feel fine, contact a health worker today.')),
      h('p.small.muted', t('Home targets used here: 135/85 mmHg or more on the home average is high (ESH 2023, AHA/ACC 2025). Your health worker may set a different target for you.')),
      refs(BP_REFS())));
  }

  function bpReportData() {
    var doc = bpDoc(), plan = doc.plan || {};
    var p = T.bpProtocol(doc.readings, { startDate: plan.startDate || undefined });
    return { doc: doc, p: p };
  }
  function bpReportText(p, readings) {
    var L = [t('Home blood pressure report (Salus)')];
    var prof = profile(); if (prof.name) L.push(t('Name: {name}', { name: prof.name }));
    if (p.startDate) L.push(t('Measuring week: {a} to {b}', { a: p.startDate, b: p.endDate }));
    if (p.avg) {
      L.push(t('Average of days 2 to 7: {sys}/{dia} mmHg ({n} readings, {d} days)', { sys: p.avg.sys, dia: p.avg.dia, n: p.avg.n, d: p.usableDays }));
      if (p.am) L.push(t('Morning average: {sys}/{dia}', { sys: p.am.sys, dia: p.am.dia }));
      if (p.pm) L.push(t('Evening average: {sys}/{dia}', { sys: p.pm.sys, dia: p.pm.dia }));
      L.push(t('Home high level: 135/85 or more'));
    }
    L.push(t('Readings in the week: {a} of {b} planned', { a: p.total, b: p.expected }));
    readings.forEach(function (r) { L.push(fmtDT(r.t) + '  ' + r.sys + '/' + r.dia + (r.pulse != null ? '  ' + t('pulse {n}', { n: r.pulse }) : '') + '  ' + SESSION_LABEL(r.session)); });
    return L.join('\n');
  }
  function renderBPReport(panel, api, host) {
    var d = bpReportData(), p = d.p, doc = d.doc;
    var inWin = doc.readings.filter(function (r) { if (!p.startDate) return false; var dd = U.dateOf(r.t); return dd >= p.startDate && dd <= p.endDate; }).sort(function (a, b) { return a.t < b.t ? -1 : 1; });
    var others = doc.readings.filter(function (r) { return inWin.indexOf(r) < 0; }).sort(function (a, b) { return a.t < b.t ? -1 : 1; }).slice(-60);
    function rowsOf(list) {
      return list.map(function (r) {
        var dd = U.dateOf(r.t), counted = p.startDate && dd >= p.startDate && dd <= p.endDate && U.diffDays(p.startDate, dd) >= 1;
        return h('tr', h('td', fmtDT(r.t)), h('td', SESSION_LABEL(r.session)), h('td', h('strong', r.sys + '/' + r.dia)), h('td', r.pulse != null ? String(r.pulse) : '—'), h('td', p.startDate && dd >= p.startDate && dd <= p.endDate ? (counted ? t('Yes') : t('Practice day')) : '—'), h('td', r.note || ''));
      });
    }
    function sheet() {
      var prof = profile();
      return h('div.hc-sheet',
        h('h2', t('Home blood pressure report')),
        h('p', prof.name ? t('Name: {name}', { name: prof.name }) : '', ' ', t('Printed: {date}', { date: dateLabel(today(), { year: 'numeric', month: 'long', day: 'numeric' }) })),
        p.avg ? h('div', h('p', h('strong', t('Average of days 2 to 7: {sys}/{dia} mmHg', { sys: p.avg.sys, dia: p.avg.dia })), ' (', t('{n} readings on {d} days', { n: p.avg.n, d: p.usableDays }), ')'),
          h('p', LEVEL_LABEL(p.classification), '. ', t('Home high level: 135/85 mmHg or more.')),
          h('p', p.am ? t('Morning average {sys}/{dia}.', { sys: p.am.sys, dia: p.am.dia }) : '', ' ', p.pm ? t('Evening average {sys}/{dia}.', { sys: p.pm.sys, dia: p.pm.dia }) : ''),
          p.status === 'provisional' ? h('p', h('strong', t('Not a full week yet: fewer than 3 usable days.'))) : null) : h('p', t('No average yet.')),
        h('p', t('Protocol: {a} of {b} planned readings; {c} of {d} sessions done.', { a: p.total, b: p.expected, c: p.sessionsDone, d: p.sessionsExpected }), ' ', t('Method: 2 readings 1 minute apart, morning and evening, 7 days; day 1 not counted; all other readings averaged.')),
        h('table', h('thead', h('tr', h('th', t('When')), h('th', t('Session')), h('th', t('Reading')), h('th', t('Pulse')), h('th', t('Counted')), h('th', t('Note')))), h('tbody', rowsOf(inWin.concat(others)))),
        h('p.small', t('Made with Salus. This report is a record of home readings. It is not a diagnosis. Please discuss it with a health worker.')));
    }
    panel.appendChild(h('div.stack',
      h('div.card', h('div.stack', h('h2', { style: 'margin:0;font-size:1.1rem' }, t('Report for your clinic')),
        h('p.muted', { style: 'margin:0' }, t('A one-page summary with your average, every reading and how complete the week was. Print it, save it as a PDF, or copy it as text to send.')),
        d.p.avg ? h('dl.kv', h('dt', t('Average')), h('dd', p.avg.sys + '/' + p.avg.dia + ' mmHg'), h('dt', t('Readings')), h('dd', t('{a} of {b}', { a: p.total, b: p.expected })), h('dt', t('Status')), h('dd', p.status === 'valid' ? t('Valid average') : t('Preview only'))) : doc.readings.length ? MT.ui.alert('info', t('No average yet'), t('Readings from day 1 are practice and are not counted. The report will still list them.')) : MT.ui.empty('📄', t('Nothing to report yet'), t('Add some readings first.')),
        h('div.hc-row',
          h('button.btn.btn-primary', { type: 'button', disabled: !doc.readings.length, onclick: function () { printSheet(host, sheet()); } }, '🖨 ' + t('Print or save as PDF')),
          h('button.btn', { type: 'button', disabled: !doc.readings.length, onclick: function () { MT.copy(bpReportText(p, inWin)); MT.toast(t('Copied'), 'ok'); } }, t('Copy as text'))))),
      refs(BP_REFS())));
  }

  MT.registerTool({
    id: 'bp', title: 'Blood pressure coach', category: 'daily', icon: '🩺', order: 10,
    description: 'Measure your blood pressure at home the right way, see your 7-day average, and print a report for your clinic.',
    keywords: ['blood pressure', 'hypertension', 'bp', 'cuff', 'sphygmomanometer', 'pulse', 'heart'],
    render: function (container, ctx) {
      var cleaners = []; var reg = function (fn) { cleaners.push(fn); };
      var tb = tabbed([
        { id: 'log', label: t('Add reading'), render: function (p, api) { return renderBPLog(p, api, container, reg); } },
        { id: 'week', label: t('My week'), render: function (p, api) { return renderBPSummary(p, api, container, reg); } },
        { id: 'guide', label: t('How to measure'), render: renderBPGuide },
        { id: 'report', label: t('Clinic report'), render: function (p, api) { return renderBPReport(p, api, container); } }
      ], ctx.params && ctx.params[0] === 'week' ? 'week' : 'log');
      container.appendChild(tb.el);
      container.appendChild(MT.ui.disclaimer(t('Salus gives general information and cannot diagnose you or replace a health worker. If you feel very unwell, get help now.')));
      return function () { tb.cleanup(); cleaners.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } }); };
    }
  });

  /* ====================================================================
     2. SLEEP DIARY
     ==================================================================== */
  var SLEEP_REFS = function () {
    return [
      { label: 'Phillips AJK, et al. Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing. Sci Rep 2017;7:3216', note: t('Sleep Regularity Index'), url: 'https://doi.org/10.1038/s41598-017-03171-4' },
      { label: 'Windred DP, et al. Sleep regularity is a stronger predictor of mortality risk than sleep duration. Sleep 2024;47(1):zsad253', note: t('regular sleep was linked with a lower risk of early death (observational)'), url: 'https://doi.org/10.1093/sleep/zsad253' },
      { label: 'Roenneberg T, et al. Social jetlag and obesity. Curr Biol 2012;22:939-943; Wittmann M, et al. Chronobiol Int 2006;23:497-509', note: t('social jetlag') },
      { label: 'Qaseem A, et al. Management of chronic insomnia disorder in adults: ACP guideline. Ann Intern Med 2016;165:125-133; Riemann D, et al. European insomnia guideline 2023. J Sleep Res 2023;32:e14035', note: t('CBT-I is the first treatment') },
      { label: 'Drake C, et al. Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed. J Clin Sleep Med 2013;9:1195-1200', note: t('caffeine 6 hours before bed') },
      { label: 'Watson NF, et al. Recommended amount of sleep for a healthy adult: AASM and SRS consensus. Sleep 2015;38:843-844', note: t('7 hours or more for adults') }
    ];
  };
  var SLEEP_TIPS = function () {
    return [
      ['⏰', t('Keep the same wake-up time every day'), t('A fixed wake time is the strongest way to steady your body clock, even after a poor night. Try to stay within one hour on weekends.')],
      ['☀️', t('Get light soon after waking'), t('Go outside or sit by a bright window for 15 to 30 minutes in the morning. Morning light helps you feel sleepy at the right time at night.')],
      ['☕', t('Stop caffeine 6 or more hours before bed'), t('Coffee, tea, cola and energy drinks can cut your sleep even when taken in the afternoon. Alcohol may make you drowsy but breaks up sleep later in the night.')],
      ['🛏️', t('Use your bed only for sleep'), t('Go to bed when you feel sleepy, not just tired. If you are awake for what feels like 20 minutes, get up, sit somewhere dim and do something calm until sleepy, then go back. This teaches your brain that bed means sleep.')],
      ['🌙', t('Wind down for an hour'), t('Dim the lights, put away screens and worries. Write tomorrow\'s to-do list, take a warm wash, or do slow breathing.'), '#/breathe'],
      ['🕐', t('Do not watch the clock'), t('Turn the clock face away. Checking the time makes worry and wakefulness worse.')],
      ['🌡️', t('Make the bedroom cool, dark and quiet'), t('Use a cover for the window, earplugs or a fan if they help. Keep phones out of arm\'s reach.')],
      ['😴', t('Keep naps short'), t('If you nap, keep it under 30 minutes and before mid-afternoon.')]
    ];
  };

  function sleepSaveEntry(e) {
    var d = sleepDoc();
    d.entries = d.entries.filter(function (x) { return x.date !== e.date; });
    d.entries.push(e);
    d.entries.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    d.entries = d.entries.slice(-400);
    saveDoc(K.sleep, d);
  }
  function renderSleepDiary(panel, api) {
    var d = sleepDoc(), last = d.entries[d.entries.length - 1] || {};
    var dateIn = h('input', { type: 'date', value: today(), max: today() });
    var bedIn = h('input', { type: 'time', value: last.bed || '23:00' }), wakeIn = h('input', { type: 'time', value: last.wake || '07:00' });
    var napIn = numInput({ placeholder: '0', maxlength: 3 }), cupIn = numInput({ placeholder: '0', maxlength: 2 }), lastCafIn = h('input', { type: 'time' }), alcIn = numInput({ placeholder: '0', maxlength: 2 });
    var dayType = h('select', h('option', { value: 'auto' }, t('Decide for me')), h('option', { value: 'work' }, t('Work or school day')), h('option', { value: 'free' }, t('Free day')));
    var quality = 3;
    var qSeg = MT.ui.segmented([1, 2, 3, 4, 5].map(function (n) { return { value: n, label: String(n) }; }), quality, function (v) { quality = v; });
    var preview = h('p.muted', { 'aria-live': 'polite', style: 'margin:0' });
    var err = h('div.error', { role: 'alert' });
    var listBox = h('div');
    function upd() {
      var m = T.sleepMinutes(bedIn.value, wakeIn.value);
      preview.textContent = m == null ? t('Enter a bedtime and a wake-up time.') : t('You slept about {time}. Middle of sleep: {mid}.', { time: minToHM(m), mid: timeLabel(U.fmtHM(T.midSleep(bedIn.value, wakeIn.value))) });
    }
    bedIn.addEventListener('input', upd); wakeIn.addEventListener('input', upd);
    function existing() {
      var e = sleepDoc().entries.filter(function (x) { return x.date === dateIn.value; })[0];
      if (e) { bedIn.value = e.bed; wakeIn.value = e.wake; quality = e.quality || 3; MT.$$('button', qSeg).forEach(function (b) { b.setAttribute('aria-pressed', String(+b.textContent === quality)); }); napIn.value = e.napMin || ''; cupIn.value = e.caffeine || ''; alcIn.value = e.alcohol || ''; lastCafIn.value = e.lastCaffeine || ''; dayType.value = e.free == null ? 'auto' : e.free ? 'free' : 'work'; upd(); }
    }
    dateIn.addEventListener('change', existing);
    function save() {
      err.textContent = '';
      var m = T.sleepMinutes(bedIn.value, wakeIn.value);
      if (!dateIn.value) { err.textContent = t('Please choose the morning date.'); return; }
      if (m == null) { err.textContent = t('Please enter a bedtime and a different wake-up time.'); return; }
      var naps = napIn.value.trim() ? MT.num(napIn.value) : 0, cups = cupIn.value.trim() ? MT.num(cupIn.value) : 0, alc = alcIn.value.trim() ? MT.num(alcIn.value) : 0;
      if (naps === undefined || cups === undefined || alc === undefined || naps < 0 || naps > 600 || cups < 0 || cups > 30 || alc < 0 || alc > 40) { err.textContent = t('Please check the nap, caffeine and alcohol numbers.'); return; }
      var entry = { date: dateIn.value, bed: bedIn.value, wake: wakeIn.value, quality: quality, napMin: naps, caffeine: cups, lastCaffeine: lastCafIn.value || '', alcohol: alc, free: dayType.value === 'auto' ? null : dayType.value === 'free' };
      function commit() { sleepSaveEntry(entry); MT.toast(t('Saved. Well done for keeping your diary.'), 'ok'); draw(); }
      if (m < 120 || m > 840) MT.confirm(t('That is {time} of sleep. Is that right?', { time: minToHM(m) }), {}).then(function (ok) { if (ok) commit(); }); else commit();
    }
    function draw() {
      MT.clear(listBox);
      var es = sleepDoc().entries.slice().reverse().slice(0, 7);
      if (!es.length) { listBox.appendChild(MT.ui.empty('🌙', t('Your diary is empty'), t('Fill in last night to start. Seven nights give you the most useful picture.'))); return; }
      listBox.appendChild(h('div.stack', h('h3', { style: 'margin:0;font-size:1rem' }, t('Recent nights')), es.map(function (e) {
        var m = T.sleepMinutes(e.bed, e.wake);
        return h('div.hc-tick', h('div.t', h('strong', dateLabel(e.date, { weekday: 'short', month: 'short', day: 'numeric' })), h('span.s', timeLabel(e.bed) + ' → ' + timeLabel(e.wake) + ' · ' + minToHM(m || 0) + (e.quality ? ' · ' + t('quality {n} of 5', { n: e.quality }) : ''))),
          h('button.btn.btn-sm.btn-ghost', { type: 'button', 'aria-label': t('Delete {date}', { date: dateLabel(e.date) }), onclick: function () { confirmThen(t('Delete this night?'), function () { var dd = sleepDoc(); dd.entries = dd.entries.filter(function (x) { return x.date !== e.date; }); saveDoc(K.sleep, dd); draw(); }); } }, '🗑'));
      })));
    }
    panel.appendChild(h('div.stack',
      h('div.card', h('div.stack', h('h2', { style: 'margin:0;font-size:1.1rem' }, t('Last night')),
        field(t('Morning date (the day you woke up)'), dateIn),
        h('div.form-grid.cols-2', field(t('Went to bed at'), bedIn), field(t('Woke up at'), wakeIn)),
        preview,
        h('div.field', h('div.field-label', t('How well did you sleep? (1 = very poorly, 5 = very well)')), qSeg),
        h('details.disclosure', h('summary', t('Naps, caffeine and alcohol (optional)')), h('div.disclosure-body.stack',
          h('div.form-grid.cols-2', field(t('Nap minutes yesterday'), napIn), field(t('Cups of coffee, tea or cola'), cupIn)),
          h('div.form-grid.cols-2', field(t('Time of last caffeine'), lastCafIn), field(t('Alcoholic drinks'), alcIn)),
          field(t('Type of day'), dayType, t('Used to work out social jetlag.')))),
        err,
        h('button.btn.btn-primary.btn-lg.btn-block', { type: 'button', onclick: save }, t('Save last night')))),
      listBox));
    upd(); draw();
  }

  function renderSleepInsights(panel, api) {
    var es = sleepDoc().entries, td = today();
    var s = T.sleepSummary(es, td, 7), reg = T.sleepRegularity(es), sj = T.socialJetlag(es.filter(function (e) { return U.diffDays(e.date, td) < 28 && U.diffDays(e.date, td) >= 0; }));
    var wrap = h('div.stack'); panel.appendChild(wrap);
    if (!es.length) { wrap.appendChild(MT.ui.empty('📊', t('Nothing to show yet'), t('Add a few nights in the diary tab.'))); return; }
    var stats = h('div.grid', { style: '--min:140px' },
      stat(s.avgMinutes != null ? minToHM(s.avgMinutes) : '—', t('Average sleep (last 7 days)')),
      stat(s.avgBedtime != null ? timeLabel(U.fmtHM(s.avgBedtime)) : '—', t('Usual bedtime')),
      stat(s.avgWake != null ? timeLabel(U.fmtHM(s.avgWake)) : '—', t('Usual wake-up')),
      stat(s.avgQuality != null ? s.avgQuality + ' / 5' : '—', t('Average quality')));
    wrap.appendChild(h('div.card', stats));
    // Duration message
    if (s.avgMinutes != null) {
      var lowSleep = s.avgMinutes < 420, hi = s.avgMinutes > 540;
      wrap.appendChild(MT.ui.alert(lowSleep ? 'warn' : hi ? 'info' : 'ok', lowSleep ? t('A little short on sleep') : hi ? t('Plenty of sleep') : t('Good amount of sleep'),
        lowSleep ? t('Most adults feel best with 7 to 9 hours (AASM and Sleep Research Society: 7 or more). A steady wake-up time and an earlier wind-down can help you get there.')
          : hi ? t('You are sleeping more than 9 hours on average. That is fine for some people. If you are always tired anyway, mention it to a health worker.')
          : t('You are in the 7 to 9 hour range that most adults need. Keep it up.')));
    }
    // Regularity
    var regCard = h('div.card', h('div.stack', h('h3', { style: 'margin:0;font-size:1rem' }, t('Regularity score')),
      reg.score == null ? h('p.muted', { style: 'margin:0' }, t('Keep logging. You need about 5 nights in a row to see this score ({n} so far).', { n: reg.pairs + 1 }))
        : h('div.stack', h('div.hc-row', h('span.hc-big', String(reg.score)), h('span', { style: 'color:var(--muted)' }, t('out of 100')), MT.ui.badge(reg.band === 'regular' ? t('Regular') : reg.band === 'somewhat' ? t('A bit irregular') : t('Irregular'), reg.band === 'regular' ? 'ok' : reg.band === 'somewhat' ? 'warn' : 'danger')),
          h('div.progress', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.max(0, reg.score)) }, h('span', { style: 'width:' + Math.max(0, reg.score) + '%' })),
          h('p.small', { style: 'margin:0' }, reg.band === 'regular' ? t('Your sleep times are steady from day to day. In a large study, regular sleep was linked with a lower risk of early death, more than the number of hours slept.') : t('Your sleep and wake times move around from day to day. Steadier times, especially a fixed wake-up time, are linked with better health.'))),
      s.bedtimeSD != null ? h('p.small.muted', { style: 'margin:0' }, t('Your bedtime varies by about {n} minutes from night to night.', { n: s.bedtimeSD })) : null,
      h('details.disclosure', h('summary', t('How is this worked out?')), h('div.disclosure-body.small',
        t('For each pair of nights in a row, Salus compares your sleep diary in 15-minute steps and counts how often you were in the same state (asleep or awake) at the same time of day. The average match is turned into a score from 0 (no match) to 100 (the same every day). This is a diary estimate of the Sleep Regularity Index (Phillips 2017). The study cut-off of about 72 came from wrist sensors (Windred 2024), so treat your number as a guide, not a test result.')))));
    wrap.appendChild(regCard);
    // Social jetlag
    wrap.appendChild(h('div.card', h('div.stack', h('h3', { style: 'margin:0;font-size:1rem' }, t('Social jetlag')),
      sj.minutes == null ? h('p.muted', { style: 'margin:0' }, t('Needs at least 2 free days and 2 work days in the diary (last 4 weeks).'))
        : h('div.stack', h('div.hc-row', h('span.hc-big', minToHM(Math.round(sj.minutes)))),
          h('p.small', { style: 'margin:0' }, sj.minutes < 60 ? t('Your body clock hardly changes between work days and free days. That is a good sign.')
            : sj.direction === 'later' ? t('On free days the middle of your sleep is this much later than on work days, like flying across time zones every weekend. Try to keep your wake-up time within one hour.') : t('On free days the middle of your sleep is this much earlier than on work days.'))),
      h('p.small.muted', { style: 'margin:0' }, t('Social jetlag is the gap between the middle of your sleep on free days and on work days (Roenneberg 2006).')))));
    // Chart
    var rec = es.filter(function (e) { var k = U.diffDays(e.date, td); return k >= 0 && k < 28 && T.sleepMinutes(e.bed, e.wake) != null; });
    if (rec.length >= 2) {
      wrap.appendChild(h('div.card', h('div.stack', h('h3', { style: 'margin:0;font-size:1rem' }, t('Hours slept (last 4 weeks)')),
        MT.chart.line({ width: 640, height: 280, ariaLabel: t('Hours of sleep per night. The green zone is 7 to 9 hours.'), x: { time: true, label: t('Date') }, y: { min: 0, max: 12, label: t('Hours') },
          bands: [{ y0: 7, y1: 9, color: 'var(--ok-soft)', label: t('7 to 9 hours') }],
          series: [{ name: t('Sleep'), color: 'var(--chart-5)', markers: true, points: rec.map(function (e) { var p = U.parseYmd(e.date); return [p.getTime(), Math.round(T.sleepMinutes(e.bed, e.wake) / 6) / 10]; }) }] }))));
    }
    wrap.appendChild(refs(SLEEP_REFS()));
  }

  function renderSleepTips(panel) {
    var tips = SLEEP_TIPS();
    panel.appendChild(h('div.stack',
      h('div.hc-row', { style: 'justify-content:space-between' }, h('p.muted', { style: 'margin:0;flex:1' }, t('These are the habits used in CBT-I, the talking therapy that doctors recommend first for long-term sleep problems.')), speak(function () { return tips.map(function (x) { return x[1] + '. ' + x[2]; }).join(' '); })),
      tips.map(function (x) { return h('div.card', h('div.hc-item', { style: 'justify-content:flex-start' }, h('div', { style: 'font-size:1.7rem', 'aria-hidden': 'true' }, x[0]), h('div', { style: 'flex:1;min-width:0' }, h('h3', x[1]), h('p', { style: 'margin:4px 0 0' }, x[2]), x[3] ? h('a', { href: x[3] }, t('Open breathing exercises')) : null))); }),
      MT.ui.alert('info', t('Trying to cut your time in bed?'), t('Sleep restriction is part of CBT-I but can leave you very sleepy at first. Do it only with a trained helper, not on your own.')),
      refs(SLEEP_REFS())));
  }

  function renderSleepCheck(panel) {
    var q = { snoring: false, sleepy: false, witnessed: false, drowsy: false, months: 0 };
    var out = h('div.stack', { 'aria-live': 'polite' });
    function cb(key, label) { var c = h('input', { type: 'checkbox', onchange: function () { q[key] = c.checked; upd(); } }); return h('label.check', c, h('span', label)); }
    var monthsSel = h('select', { onchange: function () { q.months = +monthsSel.value; upd(); } },
      h('option', { value: '0' }, t('I do not have trouble sleeping')), h('option', { value: '1' }, t('Less than 3 months')), h('option', { value: '3' }, t('3 months or more')));
    function upd() {
      MT.clear(out);
      var s = T.sleepSummary(sleepDoc().entries, today(), 7);
      var flags = T.sleepFlags({ snoring: q.snoring, sleepy: q.sleepy, witnessedApneas: q.witnessed, troubleMonths: q.months, drowsyDriving: q.drowsy, avgMinutes: s.avgMinutes });
      if (!flags.length) { out.appendChild(MT.ui.alert('ok', t('Nothing here needs special attention'), t('If your sleep still worries you, talk to a health worker.'))); return; }
      flags.forEach(function (f) {
        if (f.id === 'osa') out.appendChild(MT.ui.alert('warn', t('Snoring and daytime sleepiness can be a sign of sleep apnoea'), h('span', t('Sleep apnoea is common and treatable. Answer the short STOP-BANG questions in the health check, then show the result to a health worker.'), ' ', h('a.btn.btn-sm.btn-primary', { href: '#/checkup' }, t('Open the health check')))));
        if (f.id === 'insomnia-3mo') out.appendChild(MT.ui.alert('warn', t('Trouble sleeping for 3 months or more: please see a health worker'), t('Long-term insomnia is treatable. CBT-I, a talking therapy for sleep, is the first choice, ahead of sleeping tablets. Ask a health worker or clinic about it. The sleep tips here are a good start.')));
        if (f.id === 'drowsy-driving') out.appendChild(MT.ui.alert('danger', t('Do not drive or use machines when you feel sleepy'), t('Falling asleep at the wheel is a leading cause of crashes. Pull over safely and rest. Please talk to a health worker soon about your sleepiness.')));
        if (f.id === 'short-sleep') out.appendChild(MT.ui.alert('info', t('Your diary shows under 6 hours a night'), t('Try moving bedtime 15 minutes earlier each week.')));
      });
    }
    panel.appendChild(h('div.stack',
      h('div.card', h('div.stack', h('h2', { style: 'margin:0;font-size:1.1rem' }, t('A quick sleep check')),
        h('div.choice-list', cb('snoring', t('I snore loudly (louder than talking, or others can hear it through a door)')), cb('witnessed', t('Someone has seen me stop breathing in my sleep')), cb('sleepy', t('I often feel very sleepy or tired in the daytime')), cb('drowsy', t('I have nodded off while driving or in traffic'))),
        field(t('Trouble falling or staying asleep'), monthsSel))),
      out, MT.ui.disclaimer(t('This check points you to the right help. It does not diagnose anything.'))));
    upd();
  }

  MT.registerTool({
    id: 'sleep', title: 'Sleep diary', category: 'mind', icon: '🌙', order: 20,
    description: 'Log your sleep, see how steady it is, and get simple tips that really help.',
    keywords: ['sleep', 'insomnia', 'bedtime', 'snoring', 'apnoea', 'tired', 'cbt-i', 'jetlag'],
    render: function (container) {
      var tb = tabbed([
        { id: 'diary', label: t('Diary'), render: renderSleepDiary },
        { id: 'insights', label: t('My sleep'), render: renderSleepInsights },
        { id: 'tips', label: t('Tips'), render: renderSleepTips },
        { id: 'check', label: t('Sleep check'), render: renderSleepCheck }
      ]);
      container.appendChild(tb.el);
      return tb.cleanup;
    }
  });

  /* ====================================================================
     3. MOOD: check-in, activity planner, problem solving, calming skills
     ==================================================================== */
  var FACES = function () { return [[1, '😞', t('Very low')], [2, '😕', t('Low')], [3, '😐', t('Okay')], [4, '🙂', t('Good')], [5, '😄', t('Very good')]]; };
  var MOOD_WORDS = function () {
    return [['calm', t('Calm')], ['happy', t('Happy')], ['hopeful', t('Hopeful')], ['grateful', t('Grateful')], ['energetic', t('Full of energy')], ['loved', t('Loved')], ['proud', t('Proud')],
      ['tired', t('Tired')], ['worried', t('Worried')], ['sad', t('Sad')], ['angry', t('Angry')], ['lonely', t('Lonely')], ['stressed', t('Stressed')], ['numb', t('Numb')], ['overwhelmed', t('Overwhelmed')], ['bored', t('Bored')]];
  };
  var MOOD_REFS = function () {
    return [
      { label: 'Chibanda D, et al. Effect of a primary care-based psychological intervention on symptoms of common mental disorders in Zimbabwe (Friendship Bench). JAMA 2016;316:2618-2626', note: t('problem-solving steps'), url: 'https://doi.org/10.1001/jama.2016.19102' },
      { label: 'World Health Organization. Problem Management Plus (PM+): individual psychological help for adults impaired by distress in communities exposed to adversity. 2016', note: t('problem-solving steps') },
      { label: 'World Health Organization. Doing What Matters in Times of Stress: An Illustrated Guide. 2020', note: t('grounding, unhooking, acting on values, kindness and making room (these exercises are written in the same spirit, in our own words)'), url: 'https://www.who.int/publications/i/item/9789240003927' },
      { label: 'Lejuez CW, et al. Ten year revision of the brief behavioral activation treatment for depression (BATD). Behav Modif 2011;35:111-161', note: t('activity planning') },
      { label: 'Kroenke K, et al. The PHQ-9. J Gen Intern Med 2001;16:606-613', note: t('depression screening in the health check') }
    ];
  };
  function helpBar() {
    return h('div.hc-helpbar', { role: 'region', 'aria-label': t('Help now') }, h('span', h('strong', t('Need help now?')), ' ', t('If you feel unsafe or are thinking of harming yourself, support is available right away.')),
      h('a.btn.btn-primary.btn-sm', { href: '#/crisis' }, t('Need help now?')));
  }

  function moodMsg(score) {
    if (score <= 2) return MT.ui.alert('info', t('Thank you for being honest about how you feel'), h('span', t('Hard days happen, and they pass for most people. Try one small, kind thing for yourself today. If this feels too heavy to carry alone, please talk to someone you trust or a health worker.'), ' ', h('a', { href: '#/crisis' }, t('Need help now?'))));
    if (score === 3) return MT.ui.alert('ok', t('Checked in. Steady days count.'), t('Small things, like a walk, a call to a friend or good sleep, can nudge the day up.'));
    return MT.ui.alert('ok', t('Lovely. Notice what is helping.'), t('Writing down what went well makes it easier to repeat.'));
  }

  function renderMoodCheckin(panel) {
    var score = 0, words = {};
    var faceBtns = FACES().map(function (f) {
      var b = h('button.hc-face', { type: 'button', 'aria-pressed': 'false', 'aria-label': f[2], onclick: function () { score = f[0]; faceBtns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); } }, h('span.e', { 'aria-hidden': 'true' }, f[1]), h('span.l', f[2]));
      return b;
    });
    var wordsBox = h('div.hc-row', MOOD_WORDS().map(function (w) {
      var c = h('button.chip', { type: 'button', 'aria-pressed': 'false', onclick: function () { words[w[0]] = !words[w[0]]; c.setAttribute('aria-pressed', String(!!words[w[0]])); } }, w[1]);
      return c;
    }));
    var noteIn = h('textarea', { rows: 2, maxlength: 400, placeholder: t('Optional: one line about your day') });
    var feedback = h('div'), trend = h('div.stack');
    function save() {
      if (!score) { MT.toast(t('Tap a face first'), 'warn'); return; }
      var d = moodDoc();
      d.checkins.push({ id: MT.uid('md'), t: new Date().toISOString(), date: today(), score: score, words: Object.keys(words).filter(function (k) { return words[k]; }), note: noteIn.value.trim() });
      d.checkins = d.checkins.slice(-800);
      saveDoc(K.mood, d);
      MT.clear(feedback); feedback.appendChild(moodMsg(score));
      score = 0; words = {}; noteIn.value = ''; faceBtns.forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); MT.$$('.chip', wordsBox).forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
      drawTrend();
    }
    function drawTrend() {
      MT.clear(trend);
      var d = moodDoc(), td = today();
      var daily = T.moodDaily(d.checkins, td, 30), tr = T.moodTrend(d.checkins, td), low = T.lowMoodFlag(d.checkins, td);
      if (low.flag) trend.appendChild(MT.ui.alert('warn', t('Your mood has been low on many days lately'), h('span', t('This is common and help works. Please talk to someone you trust or a health worker. The health check has a short, private questionnaire (PHQ-9) you can show them.'), ' ', h('a.btn.btn-sm', { href: '#/checkup' }, t('Open the health check')), ' ', h('a.btn.btn-sm.btn-primary', { href: '#/crisis' }, t('Need help now?')))));
      if (!daily.length) { trend.appendChild(MT.ui.empty('🙂', t('No check-ins yet'), t('Your mood chart will grow as you check in.'))); return; }
      var msg = tr.trend === 'better' ? t('Up from last week.') : tr.trend === 'lower' ? t('A little lower than last week. Be gentle with yourself.') : tr.trend === 'steady' ? t('About the same as last week.') : '';
      trend.appendChild(h('div.card', h('div.stack', h('h3', { style: 'margin:0;font-size:1rem' }, t('Your mood, last 30 days')),
        daily.length >= 2 ? MT.chart.line({ width: 640, height: 260, ariaLabel: t('Daily mood from 1 (very low) to 5 (very good)'), x: { time: true, label: t('Date') }, y: { min: 1, max: 5, ticks: [1, 2, 3, 4, 5], label: t('Mood (1 to 5)') },
          bands: [{ y0: 1, y1: 2, color: 'var(--warn-soft)', opacity: 0.6 }],
          series: [{ name: t('Mood'), color: 'var(--chart-5)', markers: true, points: daily.map(function (x) { return [U.parseYmd(x.date).getTime(), x.score]; }) }] }) : null,
        tr.recent != null ? h('p', { style: 'margin:0' }, t('Last 7 days average: {n} of 5.', { n: tr.recent }), ' ', msg) : null)));
      var recent = d.checkins.slice(-5).reverse();
      trend.appendChild(h('div.stack', recent.map(function (c) {
        var f = FACES().filter(function (x) { return x[0] === c.score; })[0];
        return h('div.hc-tick', h('span', { style: 'font-size:1.6rem', 'aria-hidden': 'true' }, f ? f[1] : ''), h('div.t', h('strong', f ? f[2] : ''), h('span.s', fmtDT(c.t) + (c.words && c.words.length ? ' · ' + c.words.map(function (k) { var m = MOOD_WORDS().filter(function (w) { return w[0] === k; })[0]; return m ? m[1] : k; }).join(', ') : '')), c.note ? h('span.s', c.note) : null));
      })));
    }
    panel.appendChild(h('div.stack',
      h('div.card', h('div.stack', h('h2', { style: 'margin:0;font-size:1.1rem' }, t('How are you feeling right now?')),
        h('div.hc-faces', { role: 'group', 'aria-label': t('Mood from 1 to 5') }, faceBtns),
        h('div.field', h('div.field-label', t('Pick any words that fit (optional)')), wordsBox),
        field(t('Note (optional)'), noteIn),
        h('button.btn.btn-primary.btn-lg.btn-block', { type: 'button', onclick: save }, t('Save check-in')))),
      feedback, trend));
    drawTrend();
  }

  var ACTIVITY_IDEAS = function () { return [t('Take a 10-minute walk'), t('Call or message a friend'), t('Listen to a song I like'), t('Sit in the sun for 10 minutes'), t('Cook a simple meal'), t('Tidy one small spot'), t('Wash and dress for the day'), t('Help someone with a small task')]; };
  var ACT_TYPES = function () { return [{ value: 'enjoy', label: t('Enjoyable') }, { value: 'achieve', label: t('Achievement') }, { value: 'connect', label: t('With others') }]; };

  function renderMoodPlan(panel) {
    var wrap = h('div.stack'); panel.appendChild(wrap);
    var type = 'enjoy';
    var titleIn = h('input', { type: 'text', maxlength: 100, placeholder: t('For example: walk to the market') });
    var dateIn = h('input', { type: 'date', value: today() }), timeIn = h('input', { type: 'time' });
    var typeSeg = MT.ui.segmented(ACT_TYPES(), type, function (v) { type = v; });
    var err = h('div.error', { role: 'alert' });
    var listBox = h('div.stack');
    function add() {
      err.textContent = '';
      if (!titleIn.value.trim()) { err.textContent = t('Please write what you will do.'); return; }
      var d = moodDoc(); d.activities.push({ id: MT.uid('ac'), title: titleIn.value.trim(), date: dateIn.value || today(), time: timeIn.value || '', type: type, done: false });
      saveDoc(K.mood, d); titleIn.value = ''; MT.toast(t('Added to your plan'), 'ok'); draw();
    }
    function rate(a) {
      var before = 3, after = 3;
      var mk = function (get, set) { return MT.ui.segmented(FACES().map(function (f) { return { value: f[0], label: f[1] }; }), get, set); };
      var body = h('div.stack', h('p', t('Rate how you felt before and after. It is fine if nothing changed.')),
        h('div.field', h('div.field-label', t('Before (1 = very low, 5 = very good)')), mk(3, function (v) { before = v; })),
        h('div.field', h('div.field-label', t('After')), mk(3, function (v) { after = v; })));
      MT.modal({ title: a.title, body: body, actions: [{ label: t('Cancel'), variant: 'ghost' }, { label: t('Save'), variant: 'primary', onClick: function () {
        var d = moodDoc(); d.activities.forEach(function (x) { if (x.id === a.id) { x.done = true; x.before = before; x.after = after; x.doneAt = new Date().toISOString(); } }); saveDoc(K.mood, d); draw();
        MT.toast(after > before ? t('Nice. You lifted your mood by taking action.') : t('Well done for doing it, whatever the mood.'), 'ok');
      } }] });
    }
    function draw() {
      MT.clear(listBox);
      var d = moodDoc(), td = today();
      var acts = d.activities.slice().sort(function (a, b) { return (a.date + (a.time || '')) < (b.date + (b.time || '')) ? -1 : 1; });
      var upcoming = acts.filter(function (a) { return !a.done && a.date >= td; }), overdue = acts.filter(function (a) { return !a.done && a.date < td; }).slice(-3), doneL = acts.filter(function (a) { return a.done; }).slice(-5).reverse();
      var sm = T.activationSummary(d.activities.filter(function (a) { return U.diffDays(a.date, td) < 28; }));
      if (sm.rated >= 2 && sm.avgChange != null) listBox.appendChild(MT.ui.alert(sm.avgChange > 0 ? 'ok' : 'info', t('Your activities and your mood'), sm.avgChange > 0 ? t('On average, your mood was {n} points higher after you did your planned activities.', { n: sm.avgChange }) : t('You did {n} planned activities. Keep going: mood often follows action.', { n: sm.done })));
      function row(a, isDone) {
        var f = FACES();
        return h('div.hc-tick' + (isDone ? '.done' : ''), h('div.t', h('strong', a.title), h('span.s', dateLabel(a.date, { weekday: 'short', month: 'short', day: 'numeric' }) + (a.time ? ' · ' + timeLabel(a.time) : '') + ' · ' + (ACT_TYPES().filter(function (x) { return x.value === a.type; })[0] || {}).label + (isDone && a.before ? ' · ' + f[a.before - 1][1] + ' → ' + f[a.after - 1][1] : ''))),
          isDone ? null : h('button.btn.btn-sm.btn-primary', { type: 'button', onclick: function () { rate(a); } }, t('I did it')),
          h('button.btn.btn-sm.btn-ghost', { type: 'button', 'aria-label': t('Delete {name}', { name: a.title }), onclick: function () { var dd = moodDoc(); dd.activities = dd.activities.filter(function (x) { return x.id !== a.id; }); saveDoc(K.mood, dd); draw(); } }, '🗑'));
      }
      if (upcoming.length || overdue.length) { listBox.appendChild(h('h3', { style: 'margin:0;font-size:1rem' }, t('Coming up'))); overdue.concat(upcoming).forEach(function (a) { listBox.appendChild(row(a, false)); }); }
      else listBox.appendChild(MT.ui.empty('🗓️', t('Nothing planned yet'), t('Plan one small thing for today. Small is good.')));
      if (doneL.length) { listBox.appendChild(h('h3', { style: 'margin:8px 0 0;font-size:1rem' }, t('Done recently'))); doneL.forEach(function (a) { listBox.appendChild(row(a, true)); }); }
    }
    wrap.appendChild(h('div.card', h('div.stack', h('h2', { style: 'margin:0;font-size:1.1rem' }, t('Plan something small')),
      h('p.muted', { style: 'margin:0' }, t('When mood is low, we do less, and then feel worse. Doing small things on purpose, even when you do not feel like it, helps mood climb back. Plan it, do it, then notice how you feel.')),
      field(t('What will you do?'), titleIn),
      h('div.hc-row', ACTIVITY_IDEAS().map(function (s) { return h('button.chip', { type: 'button', onclick: function () { titleIn.value = s; } }, s); })),
      h('div.form-grid.cols-2', field(t('Day'), dateIn), field(t('Time (optional)'), timeIn)),
      h('div.field', h('div.field-label', t('What kind of activity?')), typeSeg), err,
      h('button.btn.btn-primary', { type: 'button', onclick: add }, t('Add to my plan')))));
    wrap.appendChild(listBox);
    draw();
  }

  var PS_STEPS = function () {
    return [
      { id: 'problem', title: t('1. Name one problem'), help: t('Pick one problem that you can do something about. Be specific. "I cannot pay the school fee this month" is easier to work on than "everything is bad".'), label: t('The problem is') },
      { id: 'goal', title: t('2. What do you want to be different?'), help: t('Describe a small, realistic goal. What would be a bit better?'), label: t('I would like') },
      { id: 'ideas', title: t('3. List ideas'), help: t('Write down every idea you can think of, even silly ones. Do not judge yet. Think about who could help you and what has worked before.'), label: t('An idea') },
      { id: 'chosen', title: t('4. Choose one idea'), help: t('Look at your ideas. Which one is possible and likely to help? Pick one to try first.'), label: t('I will try') },
      { id: 'plan', title: t('5. Make a plan'), help: t('Say what you will do, when, and who can help. Start with a first step you can do today.'), label: t('My plan') },
      { id: 'done', title: t('6. Try it, then look back'), help: t('Save your plan. A few days later come back, say how it went, and choose a next step. Even a partly worked plan is progress.'), label: '' }
    ];
  };
  function renderMoodSolve(panel) {
    var steps = PS_STEPS(), cur = 0, ps = { problem: '', goal: '', ideas: [], chosen: '', what: '', when: '', who: '' };
    var stage = h('div.stack'), listBox = h('div.stack');
    function reviewDlg(w) {
      var res = 3, noteIn = h('textarea', { rows: 3, maxlength: 400, placeholder: t('What happened? What will you do next?') });
      MT.modal({ title: t('How did it go?'), body: h('div.stack', h('div.field', h('div.field-label', t('1 = not at all, 5 = very well')), MT.ui.segmented([1, 2, 3, 4, 5].map(function (n) { return { value: n, label: String(n) }; }), res, function (v) { res = v; })), field(t('Notes'), noteIn)),
        actions: [{ label: t('Cancel'), variant: 'ghost' }, { label: t('Save'), variant: 'primary', onClick: function () { var d = moodDoc(); d.solves.forEach(function (x) { if (x.id === w.id) x.review = { result: res, note: noteIn.value.trim(), at: new Date().toISOString() }; }); saveDoc(K.mood, d); drawList(); MT.toast(t('Well done for trying.'), 'ok'); } }] });
    }
    function drawList() {
      MT.clear(listBox);
      var ws = moodDoc().solves.slice().reverse().slice(0, 5);
      if (!ws.length) return;
      listBox.appendChild(h('h3', { style: 'margin:8px 0 0;font-size:1rem' }, t('My plans')));
      ws.forEach(function (w) {
        listBox.appendChild(h('div.card', h('div.stack', h('strong', w.problem), h('div.small', t('I will try: {x}', { x: w.chosen })), w.what ? h('div.small', t('Plan: {what} ({when}). Who can help: {who}', { what: w.what, when: w.when || '—', who: w.who || '—' })) : null,
          w.review ? MT.ui.badge(t('Looked back: {n} of 5', { n: w.review.result }), 'ok') : h('button.btn.btn-sm', { type: 'button', onclick: function () { reviewDlg(w); } }, t('Look back: how did it go?')),
          h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { var d = moodDoc(); d.solves = d.solves.filter(function (x) { return x.id !== w.id; }); saveDoc(K.mood, d); drawList(); } }, t('Delete')))));
      });
    }
    function show() {
      MT.clear(stage);
      var s = steps[cur], inputEl = null;
      stage.appendChild(h('div.small.muted', t('Step {n} of {total}', { n: cur + 1, total: steps.length })));
      stage.appendChild(h('div.progress', h('span', { style: 'width:' + Math.round((cur + 1) / steps.length * 100) + '%' })));
      stage.appendChild(h('h2', { style: 'margin:6px 0;font-size:1.15rem' }, s.title));
      stage.appendChild(h('div.row', { style: 'gap:8px;align-items:flex-start' }, h('p.hc-big-step', { style: 'margin:0;flex:1' }, s.help), speak(function () { return s.title + '. ' + s.help; })));
      if (s.id === 'problem' || s.id === 'goal') { inputEl = h('textarea', { rows: 3, maxlength: 300 }, ''); inputEl.value = ps[s.id]; stage.appendChild(field(s.label, inputEl)); }
      if (s.id === 'ideas') {
        var ideaIn = h('input', { type: 'text', maxlength: 120 }), ul = h('ul', { style: 'margin:0;padding-left:1.2rem' });
        var drawIdeas = function () { MT.clear(ul); ps.ideas.forEach(function (x, i) { ul.appendChild(h('li', x, ' ', h('button.btn.btn-sm.btn-ghost', { type: 'button', 'aria-label': t('Remove {name}', { name: x }), onclick: function () { ps.ideas.splice(i, 1); drawIdeas(); } }, '✕'))); }); };
        var addIdea = function () { if (ideaIn.value.trim()) { ps.ideas.push(ideaIn.value.trim()); ideaIn.value = ''; drawIdeas(); ideaIn.focus(); } };
        ideaIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addIdea(); } });
        stage.appendChild(h('div.stack', field(s.label, ideaIn), h('button.btn', { type: 'button', onclick: addIdea }, t('Add idea')), ul)); drawIdeas();
      }
      if (s.id === 'chosen') {
        if (ps.ideas.length) stage.appendChild(h('div.choice-list', ps.ideas.map(function (x) { var r = h('input', { type: 'radio', name: 'ps-choice', checked: ps.chosen === x, onchange: function () { ps.chosen = x; } }); return h('label.check', r, h('span', x)); })));
        inputEl = h('input', { type: 'text', maxlength: 160 }); inputEl.value = ps.chosen; stage.appendChild(field(t('Or write your choice'), inputEl));
      }
      if (s.id === 'plan') {
        var w1 = h('input', { type: 'text', maxlength: 160 }), w2 = h('input', { type: 'text', maxlength: 80 }), w3 = h('input', { type: 'text', maxlength: 100 });
        w1.value = ps.what; w2.value = ps.when; w3.value = ps.who;
        stage.appendChild(h('div.stack', field(t('What exactly will I do first?'), w1), field(t('When?'), w2), field(t('Who can help me?'), w3)));
        inputEl = { get value() { ps.what = w1.value; ps.when = w2.value; ps.who = w3.value; return w1.value; } };
      }
      if (s.id === 'done') stage.appendChild(h('div.card-soft', { style: 'padding:14px;border-radius:12px' }, h('p', { style: 'margin:0' }, h('strong', ps.problem || '—')), h('p.small', { style: 'margin:6px 0 0' }, t('I will try: {x}', { x: ps.chosen || '—' })), h('p.small', { style: 'margin:6px 0 0' }, t('Plan: {what} ({when}). Who can help: {who}', { what: ps.what || '—', when: ps.when || '—', who: ps.who || '—' }))));
      var err = h('div.error', { role: 'alert' });
      stage.appendChild(err);
      function capture() { if (!inputEl) return true; if (s.id === 'problem' || s.id === 'goal') ps[s.id] = inputEl.value.trim(); else if (s.id === 'chosen') ps.chosen = (inputEl.value.trim() || ps.chosen); else void inputEl.value; return true; }
      stage.appendChild(h('div.row', { style: 'justify-content:space-between;gap:8px' },
        h('button.btn', { type: 'button', disabled: cur === 0, onclick: function () { capture(); cur--; show(); } }, t('Back')),
        cur < steps.length - 1 ? h('button.btn.btn-primary', { type: 'button', onclick: function () {
          capture();
          if (s.id === 'problem' && !ps.problem) { err.textContent = t('Please write the problem first.'); return; }
          if (s.id === 'chosen' && !ps.chosen) { err.textContent = t('Please choose or write one idea.'); return; }
          cur++; show();
        } }, t('Next')) : h('button.btn.btn-primary', { type: 'button', onclick: function () {
          var d = moodDoc(); d.solves.push({ id: MT.uid('ps'), createdAt: new Date().toISOString(), problem: ps.problem, goal: ps.goal, ideas: ps.ideas.slice(), chosen: ps.chosen, what: ps.what, when: ps.when, who: ps.who }); saveDoc(K.mood, d);
          MT.toast(t('Saved. You have a plan. One step at a time.'), 'ok'); ps = { problem: '', goal: '', ideas: [], chosen: '', what: '', when: '', who: '' }; cur = 0; show(); drawList();
        } }, t('Save my plan'))));
    }
    panel.appendChild(h('div.stack', h('div.card', stage), listBox, refs(MOOD_REFS())));
    show(); drawList();
  }

  var SKILLS = function () {
    return [
      { id: 'ground', icon: '🦶', title: t('Grounding'), intro: t('Use this when your mind is racing or you feel overwhelmed. It brings your attention back to the here and now.'), steps: [
        t('Sit or stand. Feel your feet on the floor. Press them down gently.'),
        t('Feel the weight of your body on the chair or floor.'),
        t('Breathe out slowly, as if blowing on hot tea. Let your shoulders drop.'),
        t('Look around and name 5 things you can see.'),
        t('Now name 4 things you can touch, and touch them.'),
        t('Listen. Name 3 sounds you can hear.'),
        t('Say to yourself: I am here. I am safe enough right now. I can take one step at a time.')] },
      { id: 'unhook', icon: '🎣', title: t('Unhooking from hard thoughts'), intro: t('Hard thoughts and feelings can hook us and drag us along. You cannot always stop them, but you can loosen their grip.'), steps: [
        t('Notice that you have been hooked. Say to yourself: I am being hooked.'),
        t('Name what is hooking you. Try: I notice I am having the thought that... or I notice a feeling of...'),
        t('Say thank you to your mind for trying to protect you. You do not have to argue with it.'),
        t('Look around the room. Name 3 things you can see, to bring yourself back.'),
        t('Now give your full attention to what you are doing, or to something that matters to you.')] },
      { id: 'values', icon: '🧭', title: t('Acting on what matters'), intro: t('When life is hard, we can still choose small actions that fit who we want to be.'), steps: [
        t('Think of something that matters to you. It could be family, being kind, learning, faith, work or your health.'),
        t('Ask yourself: what is one small thing I could do today that fits this?'),
        t('Make it very small, something that takes 5 minutes or less.'),
        t('Decide when you will do it. Say it out loud: Today at ___, I will ___.'),
        t('Do it. Afterwards, notice how it felt. Even a small action counts.')] },
      { id: 'kind', icon: '💛', title: t('Being kind'), intro: t('Kindness to others and to ourselves helps us feel less alone and less stressed.'), steps: [
        t('Think of something kind you could do for another person today. A message, a smile, some help.'),
        t('Do it, or plan when you will.'),
        t('Now think about how you talk to yourself. Would you talk to a good friend that way?'),
        t('Say something kind to yourself, the way you would to a friend in your place.'),
        t('Do one thing that looks after you: a glass of water, a rest, a meal, a short walk.')] },
      { id: 'room', icon: '🌤️', title: t('Making room'), intro: t('Pushing away a hard feeling often makes it louder. Making room means letting it be there while you carry on with what matters.'), steps: [
        t('Notice where in your body you feel the emotion. Is it the chest, throat, stomach?'),
        t('Breathe slowly toward that place. Imagine your breath making a little more space around it.'),
        t('Say to yourself: this is a hard feeling. I can make room for it.'),
        t('Picture the feeling like weather. It can rain, and it will move on. You do not have to fight it.'),
        t('Now do one thing that matters to you, with the feeling still there.')] }
    ];
  };
  function renderMoodSkills(panel) {
    var skills = SKILLS(), box = h('div.stack');
    panel.appendChild(h('div.stack', box,
      h('p.small.muted', t('These short exercises are written in the spirit of the WHO guide "Doing What Matters in Times of Stress". They help with everyday stress. They are not treatment.')),
      refs(MOOD_REFS())));
    function list() {
      MT.clear(box);
      box.appendChild(h('div.grid', { style: '--min:240px' }, skills.map(function (s) {
        return h('div.card', h('div.stack', h('div', { style: 'font-size:1.8rem', 'aria-hidden': 'true' }, s.icon), h('h3', { style: 'margin:0' }, s.title), h('p.small', { style: 'margin:0' }, s.intro),
          h('button.btn.btn-primary', { type: 'button', onclick: function () { run(s); } }, t('Start ({n} steps)', { n: s.steps.length }))));
      })));
    }
    function run(s) {
      var i = 0;
      function draw() {
        MT.clear(box);
        box.appendChild(h('div.card', h('div.stack',
          h('div.row', { style: 'justify-content:space-between;gap:8px' }, h('h2', { style: 'margin:0;font-size:1.15rem' }, s.icon + ' ' + s.title), h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { MT.speech.stop(); list(); } }, t('Close'))),
          h('div.small.muted', t('Step {n} of {total}', { n: i + 1, total: s.steps.length })), h('div.progress', h('span', { style: 'width:' + Math.round((i + 1) / s.steps.length * 100) + '%' })),
          h('p.hc-big-step', { 'aria-live': 'polite', style: 'margin:8px 0' }, s.steps[i]),
          h('div.row', { style: 'gap:8px;flex-wrap:wrap' }, MT.speech.button(function () { return s.steps[i]; }, { label: t('Read this step') }), MT.speech.button(function () { return s.title + '. ' + s.intro + ' ' + s.steps.join(' '); }, { label: t('Read the whole exercise') })),
          h('div.row', { style: 'justify-content:space-between;gap:8px' },
            h('button.btn', { type: 'button', disabled: i === 0, onclick: function () { MT.speech.stop(); i--; draw(); } }, t('Back')),
            i < s.steps.length - 1 ? h('button.btn.btn-primary', { type: 'button', onclick: function () { MT.speech.stop(); i++; draw(); } }, t('Next'))
              : h('button.btn.btn-primary', { type: 'button', onclick: function () { MT.speech.stop(); MT.toast(t('Well done. Be proud of taking this time.'), 'ok'); list(); } }, t('Finish'))))));
      }
      draw();
    }
    list();
  }

  MT.registerTool({
    id: 'mood', title: 'Mood and stress', category: 'mind', icon: '🙂', order: 10,
    description: 'Check in with your mood, plan small helpful activities, work through a problem step by step, and learn calming skills.',
    keywords: ['mood', 'depression', 'anxiety', 'stress', 'behavioural activation', 'problem solving', 'grounding', 'friendship bench', 'mental health', 'wellbeing'],
    render: function (container) {
      container.appendChild(helpBar());
      var tb = tabbed([
        { id: 'checkin', label: t('Check-in'), render: renderMoodCheckin },
        { id: 'plan', label: t('Activity plan'), render: renderMoodPlan },
        { id: 'solve', label: t('Solve a problem'), render: renderMoodSolve },
        { id: 'skills', label: t('Calming skills'), render: renderMoodSkills }
      ]);
      container.appendChild(tb.el);
      container.appendChild(MT.ui.disclaimer(t('This tool offers self-help and cannot diagnose or treat anything. If you are in crisis, use the Need help now? link.')));
      return function () { tb.cleanup(); MT.speech.stop(); };
    }
  });

  /* ====================================================================
     4. BREATHING
     ==================================================================== */
  var BREATH_REFS = function () {
    return [
      { label: 'Balban MY, et al. Brief structured respiration practices enhance mood and reduce physiological arousal. Cell Rep Med 2023;4:100895', note: t('cyclic sighing, 5 minutes a day for 28 days, in 108 healthy adults'), url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9873947/' },
      { label: 'Zaccaro A, et al. How breath-control can change your life: a systematic review on psycho-physiological correlates of slow breathing. Front Hum Neurosci 2018;12:353', note: t('slow breathing at about 6 breaths a minute') }
    ];
  };
  var BREATH_INFO = function () {
    return {
      sigh: { title: t('Cyclic sighing'), blurb: t('A short breath in through the nose, a second small sip of air on top, then a long, slow breath out. In one study, 5 minutes a day lifted mood more than mindfulness practice.'), cue: t('About 6.7 breaths a minute') },
      resonance: { title: t('Slow even breathing'), blurb: t('Breathe in and out smoothly at about 5.5 to 6 breaths a minute. It is a gentle way to settle your body when you feel tense.'), cue: t('About 5.7 breaths a minute') },
      box: { title: t('Box breathing'), blurb: t('Breathe in for 4, hold for 4, out for 4, hold for 4. Good for focus. If holding feels uncomfortable, make the holds shorter or skip them.'), cue: t('Four equal counts') }
    };
  };
  var PHASE_WORD = function (k) { return ({ 'in': t('Breathe in'), in2: t('Sip in a little more'), hold: t('Hold gently'), out: t('Breathe out slowly') })[k] || ''; };
  var PHASE_FREQ = { 'in': 440, in2: 523, out: 330 };

  /* shared soft audio cue */
  function makeAudio() { try { var AC = window.AudioContext || window.webkitAudioContext; return AC ? new AC() : null; } catch (e) { return null; } }
  function beep(ctx, freq, dur) {
    if (!ctx || !freq) return;
    try {
      var o = ctx.createOscillator(), g = ctx.createGain(), n = ctx.currentTime;
      o.type = 'sine'; o.frequency.value = freq; g.gain.setValueAtTime(0.0001, n);
      g.gain.exponentialRampToValueAtTime(0.05, n + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, n + (dur || 0.4));
      o.connect(g); g.connect(ctx.destination); o.start(n); o.stop(n + (dur || 0.4) + 0.05);
    } catch (e) { /* audio not available */ }
  }

  MT.registerTool({
    id: 'breathe', title: 'Calm breathing', category: 'mind', icon: '🫁', order: 30,
    description: 'Guided slow breathing with a simple pacer. Five minutes can help you feel calmer.',
    keywords: ['breathing', 'breathe', 'calm', 'anxiety', 'stress', 'cyclic sighing', 'box breathing', 'relax', 'panic'],
    render: function (container) {
      var pattern = 'sigh', minutes = 5, sound = false, vib = false;
      var main = h('div.stack'), stopFn = null;
      var info = BREATH_INFO();
      container.appendChild(main);

      function stats() {
        var d = breatheDoc(), td = today(), ws = U.weekStart(td);
        var week = d.sessions.filter(function (s) { return U.dateOf(s.t) >= ws; });
        var secs = week.reduce(function (a, s) { return a + (s.seconds || 0); }, 0);
        var log = {}; d.sessions.forEach(function (s) { log[U.dateOf(s.t)] = true; });
        return { sessions: week.length, minutes: Math.round(secs / 60), streak: T.streak(log, td) };
      }

      function idle() {
        MT.clear(main);
        var st = stats();
        var pCards = T.BREATH_PATTERNS.map(function (p) {
          var inf = info[p.id];
          var b = h('button.hc-opt', { type: 'button', 'aria-pressed': String(p.id === pattern), onclick: function () { pattern = p.id; minutes = p.minutes; MT.$$('.hc-opt', main).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); MT.$$('[data-min]', main).forEach(function (x) { x.setAttribute('aria-pressed', String(+x.dataset.min === minutes)); }); } },
            h('strong', inf.title), h('span', inf.blurb), h('span.small', { style: 'display:block;margin-top:4px' }, inf.cue));
          return b;
        });
        var minSeg = h('div.segmented', { role: 'group', 'aria-label': t('Length') }, [2, 3, 5, 10].map(function (m) { return h('button', { type: 'button', 'data-min': String(m), 'aria-pressed': String(m === minutes), onclick: function () { minutes = m; MT.$$('[data-min]', main).forEach(function (x) { x.setAttribute('aria-pressed', String(+x.dataset.min === m)); }); } }, t('{n} min', { n: m })); }));
        var sCb = h('input', { type: 'checkbox', checked: sound, onchange: function () { sound = sCb.checked; } }), vCb = h('input', { type: 'checkbox', checked: vib, onchange: function () { vib = vCb.checked; } });
        var instr = t('Sit comfortably with your back supported. Breathe in gently through your nose. Breathe out slowly through your nose or mouth. Keep your shoulders loose. Never force it. If you feel dizzy or tingly, stop and breathe normally.');
        main.appendChild(h('div.card', h('div.stack',
          h('div.row', { style: 'justify-content:space-between;gap:8px;flex-wrap:wrap' }, h('h2', { style: 'margin:0;font-size:1.1rem' }, t('Choose a pattern')), speak(function () { return instr; })),
          h('div.stack', { style: 'gap:8px' }, pCards),
          h('div.field', h('div.field-label', t('How long?')), minSeg),
          h('div.choice-list', h('label.check', sCb, h('span', t('Soft sound cues'))), h('label.check', vCb, h('span', t('Gentle vibration (if your phone supports it)')))),
          h('button.btn.btn-primary.btn-lg.btn-block', { type: 'button', onclick: run }, t('Start')),
          h('p.small.muted', { style: 'margin:0' }, instr))));
        main.appendChild(MT.ui.alert('info', t('Take it gently'), t('If you have asthma, a lung or heart condition, or are pregnant, breathe at a comfortable pace and skip any breath holds. Stop if you feel unwell.')));
        main.appendChild(h('div.card', h('div.grid', { style: '--min:120px' }, stat(String(st.sessions), t('Sessions this week')), stat(String(st.minutes), t('Minutes this week')), stat(String(st.streak), t('Day streak')))));
        main.appendChild(refs(BREATH_REFS()));
      }

      function run() {
        var p = T.breathPattern(pattern), cyc = T.cycleSeconds(p), total = Math.ceil(minutes * 60 / cyc) * cyc;
        var still = reducedMotion(), ctx = sound ? makeAudio() : null;
        var word = h('div.hc-word'), cnt = h('div.hc-count'), pacer = h('div.hc-pacer' + (still ? '.still' : ''), { 'aria-hidden': 'true' });
        var left = h('div.mono.muted', { 'aria-hidden': 'true' }), status = h('div.sr-only', { role: 'status', 'aria-live': 'polite' }, t('Breathing exercise started. {n} minutes.', { n: minutes }));
        var started = Date.now(), raf = null, iv = null, lastKey = '', ended = false;
        MT.clear(main);
        function end(completed) {
          if (ended) return; ended = true;
          if (raf) cancelAnimationFrame(raf); if (iv) clearInterval(iv);
          if (ctx && ctx.close) { try { ctx.close(); } catch (e) { /* ignore */ } }
          stopFn = null;
          var secs = Math.min(total, Math.round((Date.now() - started) / 1000));
          if (secs >= 30) { var d = breatheDoc(); d.sessions.push({ t: new Date().toISOString(), pattern: pattern, seconds: secs }); d.sessions = d.sessions.slice(-500); saveDoc(K.breathe, d); }
          if (completed) { vibrate(150); MT.toast(t('Well done. You took {n} minutes for yourself.', { n: Math.max(1, Math.round(secs / 60)) }), 'ok', 4000); }
          idle();
        }
        stopFn = function () { ended = true; if (raf) cancelAnimationFrame(raf); if (iv) clearInterval(iv); if (ctx && ctx.close) { try { ctx.close(); } catch (e) { /* ignore */ } } };
        function tick() {
          if (ended) return;
          var el = (Date.now() - started) / 1000;
          if (el >= total) { end(true); return; }
          var s = T.phaseAt(p, el), key = s.cycle + ':' + s.phaseIndex;
          if (key !== lastKey) { lastKey = key; word.textContent = PHASE_WORD(s.kind); if (sound && ctx) beep(ctx, PHASE_FREQ[s.kind], 0.5); if (vib && s.kind !== 'hold') vibrate(s.kind === 'out' ? 30 : 60); }
          cnt.textContent = String(s.remaining);
          if (!still) pacer.style.transform = 'scale(' + (0.55 + 0.45 * s.scale).toFixed(3) + ')';
          var rem = Math.ceil(total - el); left.textContent = Math.floor(rem / 60) + ':' + MT.pad2(rem % 60);
          if (!still) raf = requestAnimationFrame(tick);
        }
        if (still) iv = setInterval(tick, 250);
        main.appendChild(h('div.card', h('div.stack', { style: 'align-items:center;text-align:center' },
          h('h2', { style: 'margin:0;font-size:1.1rem' }, info[pattern].title),
          h('div.hc-pacer-wrap', pacer), h('div', { 'aria-hidden': 'true' }, word, cnt), left, status,
          h('button.btn.btn-lg', { type: 'button', onclick: function () { end(false); } }, t('Stop')))));
        tick();
      }
      idle();
      return function () { if (stopFn) stopFn(); MT.speech.stop(); };
    }
  });

  /* ====================================================================
     5. MOVEMENT COACH
     ==================================================================== */
  var MOVE_REFS = function () {
    return [
      { label: 'Ding D, et al. Daily steps and health outcomes in adults: a systematic review and dose-response meta-analysis. Lancet Public Health 2025;10:e668-e681', note: t('7,000 steps a day vs 2,000: about 47% lower risk of death, 25% lower risk of heart disease, 38% lower risk of dementia; most of the benefit comes before 7,000 (observational studies)'), url: 'https://pubmed.ncbi.nlm.nih.gov/40713949/' },
      { label: 'Bull FC, et al. World Health Organization 2020 guidelines on physical activity and sedentary behaviour. Br J Sports Med 2020;54:1451-1462', note: t('150 to 300 minutes of moderate or 75 to 150 minutes of vigorous activity a week, plus strengthening on 2 or more days'), url: 'https://doi.org/10.1136/bjsports-2020-102955' },
      { label: 'Stamatakis E, et al. Association of wearable device-measured vigorous intermittent lifestyle physical activity with mortality. Nat Med 2022;28:2521-2529', note: t('about 3 bursts of 1 to 2 minutes of vigorous effort a day in people who do not exercise: around 40% lower risk of death (observational)'), url: 'https://www.nature.com/articles/s41591-022-02101-w' },
      { label: 'Momma H, et al. Muscle-strengthening activities are associated with lower risk and mortality in major non-communicable diseases: a systematic review and meta-analysis of cohort studies. Br J Sports Med 2022;56:755-763', note: t('10 to 17% lower risk with strengthening') },
      { label: 'Warburton DER, et al. The Physical Activity Readiness Questionnaire for Everyone (PAR-Q+) and ePARmed-X+. Health Fitness J Canada 2011;4:3-23; ACSM pre-participation screening 2015', note: t('the readiness questions here are adapted from these') },
      { label: 'Obesity Reviews 2026 meta-analysis and Applied Sciences 2024 network meta-analysis of sitting-break trials', note: t('short activity breaks every 15 to 30 minutes lowered blood sugar after meals (short-term studies)') }
    ];
  };
  var READY_Q = function () {
    return [
      ['chest', t('Do you get chest pain or pressure when you are active, or at rest?'), 'check'],
      ['faint', t('Do you faint or get very dizzy when you exert yourself?'), 'check'],
      ['heartDoc', t('Has a doctor said you have a heart problem and should only be active with supervision?'), 'check'],
      ['breathless', t('Do you get unusually out of breath with light effort, like walking slowly?'), 'check'],
      ['pain', t('Do you have a bone, joint or muscle problem that activity makes worse?'), 'care'],
      ['bp', t('Do you take medicine for blood pressure, heart disease or diabetes?'), 'care'],
      ['pregnant', t('Are you pregnant, or did you have a baby in the last 6 weeks?'), 'care'],
      ['newCondition', t('Were you very unwell or did you have an operation in the last 3 months?'), 'care']
    ];
  };

  /* Sitting-break reminder: runs while Salus is open (module-level so it keeps going between pages) */
  var breakTimer = null;
  function applyBreaks() {
    if (breakTimer) { clearInterval(breakTimer); breakTimer = null; }
    var pr = moveDoc().prefs;
    if (!pr.breaksOn) return;
    var every = (pr.breakMin || 30) * 60000, next = Date.now() + every;
    breakTimer = setInterval(function () {
      if (Date.now() >= next) { next = Date.now() + every; MT.toast(t('Time to stand up and move for 2 minutes.'), 'ok', 9000); vibrate(100); }
    }, 15000);
  }
  applyBreaks();

  function setPref(k, v) { var d = moveDoc(); d.prefs[k] = v; saveDoc(K.move, d); }

  function renderReadiness(panel, onDone) {
    var ans = {}, d = moveDoc();
    var qs = READY_Q();
    var rows = qs.map(function (q) {
      var yes = h('input', { type: 'radio', name: 'rq-' + q[0], onchange: function () { ans[q[0]] = true; } }), no = h('input', { type: 'radio', name: 'rq-' + q[0], onchange: function () { ans[q[0]] = false; } });
      return h('fieldset.card', h('legend', { style: 'font-weight:600;padding:0 0 8px' }, q[1]), h('div.row', { style: 'gap:8px' }, h('label.check', { style: 'flex:1' }, yes, h('span', t('Yes'))), h('label.check', { style: 'flex:1' }, no, h('span', t('No')))));
    });
    var err = h('div.error', { role: 'alert' });
    panel.appendChild(h('div.stack',
      h('div.card', h('div.stack', h('h2', { style: 'margin:0;font-size:1.1rem' }, t('Quick safety check before you start')),
        h('p.muted', { style: 'margin:0' }, t('Eight yes/no questions. Being active is safe for most people, and this helps find the few who should check with a health worker first.')))),
      MT.ui.alert('danger', t('Chest pain right now?'), h('span', t('If you have chest pain, pressure or trouble breathing at this moment, stop and get emergency help.'), ' ', h('a.btn.btn-sm.btn-danger', { href: '#/get-help' }, t('Get help now')))),
      rows, err,
      h('button.btn.btn-primary.btn-lg', { type: 'button', onclick: function () {
        if (qs.some(function (q) { return ans[q[0]] === undefined; })) { err.textContent = t('Please answer every question.'); return; }
        var r = T.readiness(ans), dd = moveDoc(); dd.readiness = { answers: ans, level: r.level, check: r.check, care: r.care, at: new Date().toISOString(), cleared: false }; saveDoc(K.move, dd); onDone();
      } }, t('See my result')),
      refs(MOVE_REFS().slice(4, 5))));
  }

  function renderMove(container, ctx) {
    var d = moveDoc();
    var wrap = h('div.stack'); container.appendChild(wrap);
    var cleaners = [];
    var tb = null;
    function start() {
      MT.clear(wrap); cleaners.forEach(function (f) { f(); }); cleaners = [];
      d = moveDoc();
      if (!d.readiness || !d.readiness.level) { renderReadiness(wrap, start); return; }
      var rd = d.readiness, limited = rd.level === 'check' && !rd.cleared;
      var msg;
      if (rd.level === 'check') {
        msg = rd.cleared ? MT.ui.alert('ok', t('You have checked with a health worker'), t('Build up slowly and stop if you feel chest pain, faintness or unusual breathlessness.'))
          : MT.ui.alert('warn', t('Please talk to a health worker before harder activity'), h('div', t('Some of your answers mean a quick check-up first is wise. Until then, easy walking at your own pace is usually fine. Harder exercise, exercise snacks and strength work are switched off. Stop and get help for chest pain, fainting or severe breathlessness.'),
            h('div.row', { style: 'margin-top:8px;gap:8px;flex-wrap:wrap' }, h('button.btn.btn-sm', { type: 'button', onclick: function () { var dd = moveDoc(); dd.readiness.cleared = true; saveDoc(K.move, dd); start(); } }, t('A health worker has said I can')), h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { var dd = moveDoc(); dd.readiness = {}; saveDoc(K.move, dd); start(); } }, t('Answer again')))));
      } else if (rd.level === 'care') msg = MT.ui.alert('info', t('Go gently and listen to your body'), t('You can start. Build up slowly. If you take medicines, or are pregnant, ask your health worker or pharmacist what is right for you. Stop if you feel chest pain, faintness or unusual breathlessness.'));
      else msg = MT.ui.alert('ok', t('You are good to start'), t('Build up slowly, and stop if you feel chest pain, faintness or unusual breathlessness.'));
      wrap.appendChild(msg);
      if (rd.level !== 'check') wrap.appendChild(h('button.btn.btn-sm.btn-ghost', { type: 'button', style: 'align-self:flex-start', onclick: function () { var dd = moveDoc(); dd.readiness = {}; saveDoc(K.move, dd); start(); } }, t('Redo the safety check')));
      tb = tabbed([
        { id: 'steps', label: t('Steps'), render: function (p) { return moveSteps(p, start); } },
        { id: 'minutes', label: t('Active minutes'), render: function (p) { return moveMinutes(p, limited); } },
        { id: 'snacks', label: t('Exercise snacks'), render: function (p) { return moveSnacks(p, limited); } },
        { id: 'strength', label: t('Strength'), render: function (p) { return moveStrength(p, limited, container); } },
        { id: 'sit', label: t('Sit less'), render: moveSit }
      ], ctx && ctx.params && ctx.params[0] ? ctx.params[0] : 'steps');
      wrap.appendChild(tb.el);
      wrap.appendChild(refs(MOVE_REFS()));
    }
    start();
    return function () { if (tb) tb.cleanup(); cleaners.forEach(function (f) { f(); }); MT.speech.stop(); };
  }

  function moveSteps(panel, rerender) {
    var d = moveDoc(), td = today();
    var avg = T.stepsAverage(d.steps, td), lad = T.nextStepTarget(avg, !!d.prefs.optional10k);
    var dateIn = h('input', { type: 'date', value: td, max: td }), stepsIn = numInput({ placeholder: '4500', maxlength: 6 });
    function load() { var v = moveDoc().steps[dateIn.value]; stepsIn.value = v != null ? String(v) : ''; }
    dateIn.addEventListener('change', load); load();
    var err = h('div.error', { role: 'alert' });
    function save() {
      var n = MT.num(stepsIn.value);
      if (n === undefined || n < 0 || n > 100000) { err.textContent = t('Please enter the number of steps (0 to 100,000).'); return; }
      err.textContent = ''; var dd = moveDoc(); dd.steps[dateIn.value || td] = Math.round(n); saveDoc(K.move, dd); MT.toast(t('Saved'), 'ok'); rerender();
    }
    var todaySteps = d.steps[td];
    var days = []; for (var i = 6; i >= 0; i--) days.push(U.addDays(td, -i));
    var maxV = Math.max(lad.target, Math.max.apply(null, days.map(function (x) { return d.steps[x] || 0; })));
    var optCb = h('input', { type: 'checkbox', checked: !!d.prefs.optional10k, onchange: function () { setPref('optional10k', optCb.checked); rerender(); } });
    panel.appendChild(h('div.stack',
      h('div.card', h('div.stack', h('h2', { style: 'margin:0;font-size:1.1rem' }, t('Your step ladder')),
        avg == null ? h('p', { style: 'margin:0' }, t('Log your steps for 3 days and Salus will set a goal that fits you. A phone or watch counts them. To start, aim for about {n} steps a day.', { n: nf(lad.target) }))
          : lad.reached ? MT.ui.alert('ok', t('You reached {n} steps a day. Great work!', { n: nf(lad.target) }), lad.stage === 1 ? t('Benefits grow most up to around 7,000 steps and then level off. Keep it going. You can try the optional step toward 10,000 below if you like.') : t('Keep it going. More is fine, but not needed.'))
          : h('div.result.band-info', h('div.result-label', t('This week\'s goal')), h('div.result-value', nf(lad.target), h('span.unit', t('steps a day'))), h('p', { style: 'margin:0' }, t('That is about 1,000 more than your recent average of {avg}. Small steps add up: 10 minutes of walking is roughly 1,000 steps.', { avg: nf(avg) }))),
        h('div.hc-bar', { role: 'img', 'aria-label': t('Steps for the last 7 days') }, days.map(function (x) {
          var v = d.steps[x]; return h('div', h('span', v != null ? (v >= 1000 ? Math.round(v / 100) / 10 + 'k' : String(v)) : ''), h('i' + (v == null ? '.miss' : ''), { style: 'height:' + (v ? Math.max(4, Math.round(v / maxV * 100)) : 4) + '%' }), weekdayInitial(x));
        })),
        todaySteps != null ? h('div', h('div.small', t('Today: {a} of {b} steps', { a: nf(todaySteps), b: nf(lad.target) })), h('div.progress', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(lad.target), 'aria-valuenow': String(todaySteps) }, h('span', { style: 'width:' + Math.min(100, Math.round(todaySteps / lad.target * 100)) + '%' }))) : null,
        h('label.check', optCb, h('span', t('Optional: aim for 10,000 steps once I reach 7,000'))))),
      h('div.card', h('div.stack', h('h3', { style: 'margin:0;font-size:1rem' }, t('Log steps')),
        h('div.form-grid.cols-2', field(t('Day'), dateIn), field(t('Steps'), stepsIn)), err, h('button.btn.btn-primary', { type: 'button', onclick: save }, t('Save steps')))),
      h('p.small.muted', t('Why 7,000? A large review found that people who walked 7,000 steps a day had around half the risk of dying early compared with 2,000, and even 4,000 helped. The benefit levels off from about 5,000 to 7,000 steps (Ding 2025, observational).'))));
  }

  function moveMinutes(panel, limited) {
    var d = moveDoc(), td = today();
    var w = T.weeklyMinutes(d.minutes, td);
    var inten = 'moderate';
    var dateIn = h('input', { type: 'date', value: td, max: td }), minIn = numInput({ placeholder: '30', maxlength: 3 });
    var seg = MT.ui.segmented([{ value: 'moderate', label: t('Moderate') }].concat(limited ? [] : [{ value: 'vigorous', label: t('Vigorous') }]), inten, function (v) { inten = v; });
    var err = h('div.error', { role: 'alert' });
    function save() {
      var n = MT.num(minIn.value);
      if (n === undefined || n <= 0 || n > 600) { err.textContent = t('Please enter minutes between 1 and 600.'); return; }
      err.textContent = ''; var dd = moveDoc(); dd.minutes.push({ id: MT.uid('mv'), date: dateIn.value || td, minutes: Math.round(n), intensity: inten }); dd.minutes = dd.minutes.slice(-400); saveDoc(K.move, dd); MT.toast(t('Added. Every minute counts.'), 'ok'); MT.app.navigate('#/move/minutes');
    }
    var recent = d.minutes.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 8);
    panel.appendChild(h('div.stack',
      h('div.card', h('div.stack', h('h2', { style: 'margin:0;font-size:1.1rem' }, t('This week')),
        h('div.hc-row', h('span.hc-big', String(w.equivalent)), h('span.muted', t('of 150 minutes (moderate-equivalent)'))),
        h('div.progress', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '150', 'aria-valuenow': String(Math.min(150, w.equivalent)) }, h('span', { style: 'width:' + Math.round(w.pct150 * 100) + '%' })),
        h('p.small', { style: 'margin:0' }, t('{m} min moderate + {v} min vigorous (each vigorous minute counts double).', { m: w.moderate, v: w.vigorous })),
        w.reached300 ? MT.ui.alert('ok', t('Above 300 minutes. Excellent!'), t('You have gone beyond the top of the WHO range. Rest well too.')) : w.reached150 ? MT.ui.alert('ok', t('You reached the WHO target of 150 minutes!'), t('More helps a little: the full range is 150 to 300 minutes a week.')) : h('p.small.muted', { style: 'margin:0' }, t('WHO advice for adults: 150 to 300 minutes of moderate activity a week, or 75 to 150 minutes of vigorous activity. Any activity is better than none.')))),
      h('div.card', h('div.stack', h('h3', { style: 'margin:0;font-size:1rem' }, t('Add activity')),
        h('div.form-grid.cols-2', field(t('Day'), dateIn), field(t('Minutes'), minIn)),
        h('div.field', h('div.field-label', t('How hard?')), seg),
        h('p.small.muted', { style: 'margin:0' }, t('Moderate: you can talk but not sing (brisk walk, cycling, dancing). Vigorous: you can say only a few words (running, fast cycling, climbing).')),
        err, h('button.btn.btn-primary', { type: 'button', onclick: save }, t('Add')))),
      recent.length ? h('div.stack', h('h3', { style: 'margin:0;font-size:1rem' }, t('Recent')), recent.map(function (a) {
        return h('div.hc-tick', h('div.t', h('strong', t('{n} min', { n: a.minutes })), h('span.s', dateLabel(a.date, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + (a.intensity === 'vigorous' ? t('Vigorous') : t('Moderate')))),
          h('button.btn.btn-sm.btn-ghost', { type: 'button', 'aria-label': t('Delete'), onclick: function () { var dd = moveDoc(); dd.minutes = dd.minutes.filter(function (x) { return x.id !== a.id; }); saveDoc(K.move, dd); MT.app.navigate('#/move/minutes'); } }, '🗑'));
      })) : null));
  }

  function moveSnacks(panel, limited) {
    if (limited) { panel.appendChild(MT.ui.alert('warn', t('Switched on after a health worker check'), t('Exercise snacks are hard bursts. Please talk to a health worker first (see the note above).'))); return; }
    var d = moveDoc(), td = today(), count = d.snacks[td] || 0;
    var stage = h('div.stack', { style: 'align-items:center;text-align:center' });
    var iv = null, ctx = null;
    function setCount(n) { var dd = moveDoc(); dd.snacks[td] = Math.max(0, n); saveDoc(K.move, dd); count = dd.snacks[td]; draw(); }
    function dots() { return h('div.hc-row', { style: 'justify-content:center', role: 'img', 'aria-label': t('{n} of 3 bursts done today', { n: Math.min(3, count) }) }, [0, 1, 2].map(function (i) { return h('span.hc-dot' + (i < count ? '.on' : ''), { style: 'width:22px;height:22px' }); }), count > 3 ? h('span.muted', '+' + (count - 3)) : null); }
    function draw() {
      MT.clear(stage);
      stage.appendChild(h('h2', { style: 'margin:0;font-size:1.1rem' }, t('Today: {n} of 3 bursts', { n: count })));
      stage.appendChild(dots());
      stage.appendChild(count >= 3 ? MT.ui.alert('ok', t('All 3 done. Brilliant!'), t('That is a great day of movement.')) : h('button.btn.btn-primary.btn-lg', { type: 'button', onclick: begin }, t('Start a 1-minute burst')));
      stage.appendChild(h('div.row', { style: 'gap:8px;justify-content:center' }, h('button.btn.btn-sm', { type: 'button', onclick: function () { setCount(count + 1); } }, t('I did one already')), count > 0 ? h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { setCount(count - 1); } }, t('Undo one')) : null));
    }
    function begin() {
      var left = 5, phase = 'ready', big = h('div.hc-big', { 'aria-hidden': 'true' }), lab = h('p.hc-big-step', { style: 'margin:0', 'aria-live': 'polite' });
      ctx = makeAudio();
      MT.clear(stage); stage.appendChild(lab); stage.appendChild(big);
      stage.appendChild(h('button.btn', { type: 'button', onclick: function () { halt(); draw(); } }, t('Stop')));
      function readyText() { return t('Get ready. Stand where you have space.'); }
      function goText() { return left > 30 ? t('Go! Push hard so talking is difficult.') : left > 10 ? t('Halfway. You are doing great.') : t('Ten more seconds!'); }
      big.textContent = String(left); lab.textContent = readyText();
      iv = setInterval(function () {
        left--;
        if (left <= 0) {
          if (phase === 'ready') { phase = 'go'; left = 60; vibrate(200); beep(ctx, 660, 0.4); }
          else { halt(); vibrate([200, 100, 200]); beep(ctx, 440, 0.6); MT.toast(t('Burst done. Well done!'), 'ok'); setCount(count + 1); return; }
        }
        big.textContent = String(left);
        lab.textContent = phase === 'ready' ? readyText() : goText();
      }, 1000);
    }
    function halt() { if (iv) { clearInterval(iv); iv = null; } if (ctx && ctx.close) { try { ctx.close(); } catch (e) { /* ignore */ } ctx = null; } }
    var ideas = [t('Climb stairs fast, or walk fast up a hill'), t('March or jog on the spot, swinging your arms'), t('Fast walking, as if late for a bus'), t('Cycle hard on a flat road'), t('Dance fast to a lively song')];
    panel.appendChild(h('div.stack',
      h('div.card', stage),
      h('div.card', h('div.stack', h('h3', { style: 'margin:0;font-size:1rem' }, t('What is an exercise snack?')),
        h('p', { style: 'margin:0' }, t('A short burst of hard effort, about 1 minute, spread through the day. Aim for 3 a day. In a study of people who did not exercise, those who did about 3 bursts of 1 to 2 minutes a day had around 40% lower risk of dying over 7 years. This was an observational study, so it shows a link, not proof.')),
        h('ul', { style: 'margin:0;padding-left:1.2rem' }, ideas.map(function (x) { return h('li', x); })),
        h('p.small.muted', { style: 'margin:0' }, t('Warm up with an easy minute first. Stop if you feel chest pain, dizziness or pain in a joint.')))),
      h('p.small.muted', t('Source: Stamatakis 2022, Nature Medicine.'))));
    draw();
    return halt;
  }

  var STRENGTH = function () {
    return [
      [t('Chair stands'), t('8 to 12'), t('Sit near the front of a sturdy chair, with its back against a wall. Feet flat, hip-width apart. Lean forward a little and stand up. Sit back down slowly for 3 counts. Use your hands to help if you need to.')],
      [t('Wall push-ups'), t('8 to 12'), t('Stand an arm\'s length from a wall. Put your hands on the wall at shoulder height. Bend your elbows to bring your chest toward the wall, then push back. Keep your body in a straight line.')],
      [t('Step-ups'), t('8 on each leg'), t('Use a low, sturdy step, like the bottom stair, near a rail or wall. Step up with one foot, bring the other up, then step down slowly. Switch legs.')],
      [t('Heel raises'), t('10 to 15'), t('Hold the back of a chair. Rise up onto your toes, then lower slowly.')],
      [t('Hip bridges'), t('8 to 12'), t('Lie on your back with knees bent and feet flat. Lift your hips until your body is in a line from shoulders to knees. Lower slowly. Skip this if getting down to the floor is hard.')],
      [t('Bag rows'), t('8 to 12 on each side'), t('Hold a bag with a few books or bottles in one hand. Rest the other hand on a table and lean forward with a flat back. Pull the bag toward your hip, then lower slowly.')]
    ];
  };
  function moveStrength(panel, limited, host) {
    if (limited) { panel.appendChild(MT.ui.alert('warn', t('Switched on after a health worker check'), t('Please talk to a health worker first (see the note above).'))); return; }
    var td = today(), ex = STRENGTH();
    var wk = h('div'), btn;
    function draw() {
      var dd = moveDoc(), doneToday = dd.strength.indexOf(td) >= 0, w = T.weeklyStrength(dd.strength, td);
      MT.clear(wk);
      wk.appendChild(h('div.card', h('div.stack', h('div.hc-row', h('span.hc-big', w.days + ' / 2'), h('span.muted', t('strength days this week'))),
        h('div.progress', h('span', { style: 'width:' + Math.min(100, w.days / 2 * 100) + '%' })),
        w.reached ? MT.ui.alert('ok', t('You reached 2 days this week!'), t('That meets the WHO advice for strengthening.')) : null,
        h('button.btn' + (doneToday ? '' : '.btn-primary'), { type: 'button', onclick: function () { var x = moveDoc(); if (x.strength.indexOf(td) >= 0) x.strength = x.strength.filter(function (s) { return s !== td; }); else { x.strength.push(td); MT.toast(t('Strong work!'), 'ok'); } saveDoc(K.move, x); draw(); } }, doneToday ? t('Done today (tap to undo)') : t('I did my strength session today')))));
    }
    panel.appendChild(h('div.stack', wk,
      h('div.card', h('div.stack', h('div.row', { style: 'justify-content:space-between;gap:8px;flex-wrap:wrap' }, h('h2', { style: 'margin:0;font-size:1.1rem' }, t('Strength at home, no equipment')), speak(function () { return t('Do 1 or 2 rounds, resting for a minute between exercises. Two days a week, with a rest day between.') + ' ' + ex.map(function (e) { return e[0] + ', ' + e[1] + '. ' + e[2]; }).join(' '); })),
        h('p', { style: 'margin:0' }, t('Do these on 2 days a week, with a rest day between. Do 1 or 2 rounds. Rest for a minute between exercises. Take 2 to 3 seconds to lift and 3 to 4 to lower.')),
        ex.map(function (e) { return h('details.disclosure', h('summary', e[0], ' · ', h('span.muted', e[1])), h('div.disclosure-body', h('p', { style: 'margin:0' }, e[2]))); }))),
      MT.ui.alert('warn', t('Stay safe'), h('ul', { style: 'margin:0;padding-left:1.1rem' },
        h('li', t('Breathe out as you lift. Never hold your breath.')), h('li', t('Use a sturdy chair and a clear floor. Wear shoes with grip.')), h('li', t('Start easy. It is normal to feel muscles working, but stop for sharp pain.')),
        h('li', t('Stop and get help for chest pain, dizziness, or unusual breathlessness.')), h('li', t('If you are pregnant, have weak bones, or recent surgery, ask a health worker which moves suit you.')))),
      h('p.small.muted', t('Source: WHO 2020 guidelines (2 or more days of strengthening a week); Momma 2022 (about 10 to 17% lower risk of early death and disease).'))));
    draw();
  }

  function moveSit(panel) {
    var d = moveDoc(), pr = d.prefs;
    var on = h('input', { type: 'checkbox', checked: !!pr.breaksOn, onchange: function () { setPref('breaksOn', on.checked); applyBreaks(); MT.toast(on.checked ? t('Reminders on while Salus is open') : t('Reminders off'), 'ok'); } });
    var sel = h('select', { onchange: function () { setPref('breakMin', +sel.value); applyBreaks(); } }, [30, 45, 60].map(function (m) { return h('option', { value: String(m), selected: (pr.breakMin || 30) === m }, t('Every {n} minutes', { n: m })); }));
    panel.appendChild(h('div.stack', h('div.card', h('div.stack', h('h2', { style: 'margin:0;font-size:1.1rem' }, t('Break up your sitting')),
      h('p', { style: 'margin:0' }, t('Sitting for hours is bad for blood sugar and the heart. Standing up and walking for 2 minutes every half hour or so helps. Short breaks like this lowered blood sugar after meals in trials.')),
      h('label.check', on, h('span', t('Remind me to move while Salus is open'))),
      field(t('How often?'), sel),
      h('p.small.muted', { style: 'margin:0' }, t('Reminders only appear while this page is open on your screen. For reminders at other times, set a phone alarm.')))),
      h('div.card', h('h3', { style: 'margin:0 0 6px;font-size:1rem' }, t('Ideas for a 2-minute break')), h('ul', { style: 'margin:0;padding-left:1.2rem' }, h('li', t('Walk to get a drink of water')), h('li', t('Stand and stretch your arms overhead')), h('li', t('Do 10 calf raises or chair stands')), h('li', t('Take a phone call while walking'))))));
  }

  MT.registerTool({
    id: 'move', title: 'Activity coach', category: 'daily', icon: '🚶', order: 20,
    description: 'Build up steps and active minutes a little at a time, with short exercise snacks and simple strength moves.',
    keywords: ['exercise', 'steps', 'walking', 'physical activity', 'strength', 'sitting', 'fitness', 'move', 'vilpa'],
    render: renderMove
  });

  /* ====================================================================
     6. MEDICINES
     ==================================================================== */
  var MED_NOTE = function () { return t('Salus only keeps your list and reminders. It does not check for interactions or tell you what dose to take. Ask your pharmacist or health worker.'); };
  function medTimesText(m) { return (m.times || []).map(timeLabel).join(', ') || '—'; }

  function medForm(item, onSave) {
    var m = item || {};
    var nameIn = h('input', { type: 'text', maxlength: 80, value: m.name || '', placeholder: t('For example: Metformin') });
    var doseIn = h('input', { type: 'text', maxlength: 60, value: m.dose || '', placeholder: t('For example: 500 mg tablet') });
    var purposeIn = h('input', { type: 'text', maxlength: 100, value: m.purpose || '', placeholder: t('What is it for?') });
    var notesIn = h('input', { type: 'text', maxlength: 160, value: m.notes || '', placeholder: t('For example: take with food') });
    var times = (m.times && m.times.length ? m.times : ['08:00']).slice();
    var timesBox = h('div.stack', { style: 'gap:6px' });
    function drawTimes() {
      MT.clear(timesBox);
      times.forEach(function (tm, i) {
        var inp = h('input', { type: 'time', value: tm, 'aria-label': t('Time {n}', { n: i + 1 }), onchange: function () { times[i] = inp.value; } });
        timesBox.appendChild(h('div.row', { style: 'gap:6px' }, h('div', { style: 'flex:1' }, inp), times.length > 1 ? h('button.btn.btn-sm.btn-ghost', { type: 'button', 'aria-label': t('Remove time {n}', { n: i + 1 }), onclick: function () { times.splice(i, 1); drawTimes(); } }, '✕') : null));
      });
      if (times.length < 6) timesBox.appendChild(h('button.btn.btn-sm', { type: 'button', style: 'align-self:flex-start', onclick: function () { times.push('20:00'); drawTimes(); } }, '+ ' + t('Add another time')));
    }
    drawTimes();
    var startIn = h('input', { type: 'date', value: m.startDate || today() });
    var left = numInput({ value: m.pillsLeft != null ? m.pillsLeft : '', placeholder: '30', decimal: true, maxlength: 5 }), perDay = numInput({ value: m.pillsPerDay != null ? m.pillsPerDay : '', placeholder: '1', decimal: true, maxlength: 4 });
    var err = h('div.error', { role: 'alert' });
    var body = h('div.stack', field(t('Medicine name'), nameIn), field(t('Dose'), doseIn), field(t('Purpose'), purposeIn), h('div.field', h('div.field-label', t('Times each day')), timesBox),
      field(t('Notes'), notesIn), field(t('Start date'), startIn),
      h('details.disclosure', { open: m.pillsLeft != null }, h('summary', t('Refill reminder (optional)')), h('div.disclosure-body.stack',
        h('div.form-grid.cols-2', field(t('Pills left now'), left), field(t('Pills per day'), perDay)), h('p.small.muted', { style: 'margin:0' }, t('Count the pills you have today. Salus works out when they will run out.')))), err);
    function collect() {
      var name = nameIn.value.trim();
      if (!name) { err.textContent = t('Please enter the medicine name.'); return null; }
      var ts = times.filter(function (x) { return U.parseHM(x) != null; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).sort();
      if (!ts.length) { err.textContent = t('Please add at least one time.'); return null; }
      var pl = left.value.trim() ? MT.num(left.value) : null, pd = perDay.value.trim() ? MT.num(perDay.value) : null;
      if ((left.value.trim() && (pl === undefined || pl < 0)) || (perDay.value.trim() && (pd === undefined || pd <= 0))) { err.textContent = t('Please check the pill numbers.'); return null; }
      if (pl != null && pd == null) pd = ts.length;
      var out = Object.assign({}, m, { id: m.id || MT.uid('md'), name: name, dose: doseIn.value.trim(), purpose: purposeIn.value.trim(), notes: notesIn.value.trim(), times: ts, active: m.active !== false, startDate: startIn.value || today(), pillsLeft: pl, pillsPerDay: pd });
      out.pillsAsOf = pl != null ? ((m.pillsLeft === pl && m.pillsPerDay === pd && m.pillsAsOf) ? m.pillsAsOf : today()) : null;
      return out;
    }
    MT.modal({ title: item ? t('Edit medicine') : t('Add a medicine'), body: body, actions: [{ label: t('Cancel'), variant: 'ghost' }, { label: t('Save'), variant: 'primary', onClick: function () { var o = collect(); if (!o) return false; onSave(o); } }] });
  }
  function saveMed(item) {
    var d = medsDoc(), i = -1; d.items.forEach(function (x, k) { if (x.id === item.id) i = k; });
    if (i >= 0) d.items[i] = item; else d.items.push(item);
    saveDoc(K.meds, d);
  }
  function takenToggle(date, key, on) {
    var d = medLogDoc(); d.log[date] = d.log[date] || {};
    if (on) d.log[date][key] = true; else delete d.log[date][key];
    // keep ~120 days of history
    Object.keys(d.log).forEach(function (k) { if (U.diffDays(k, today()) > 120) delete d.log[k]; });
    saveDoc(K.medlog, d);
  }

  function renderMedsToday(panel, api) {
    var items = medsDoc().items.filter(function (m) { return m.active !== false; }), td = today();
    if (!items.length) {
      panel.appendChild(h('div.stack', MT.ui.empty('💊', t('No medicines yet'), t('Add the medicines you take to get reminders and a daily checklist.')), h('button.btn.btn-primary.btn-lg', { type: 'button', onclick: function () { api.go('list'); } }, t('Add a medicine'))));
      return;
    }
    var list = h('div.stack'), summary = h('div');
    var nowHM = U.fmtHM(new Date().getHours() * 60 + new Date().getMinutes());
    function drawSummary() {
      MT.clear(summary);
      var log = medLogDoc().log, a7 = T.adherence(items, log, U.addDays(td, -6), td), a30 = T.adherence(items, log, U.addDays(td, -29), td);
      var cells = a7.byDay.map(function (x) { return h('div', h('span.hc-cell' + (x.due && x.taken === x.due ? '.on' : '') + (x.date === td ? '.today' : ''), { title: x.taken + '/' + x.due, 'aria-label': dateLabel(x.date) + ': ' + t('{a} of {b} taken', { a: x.taken, b: x.due }) }, x.due ? (x.taken === x.due ? '✓' : String(x.taken)) : '–'), weekdayInitial(x.date)); });
      summary.appendChild(h('div.card', h('div.stack', h('h3', { style: 'margin:0;font-size:1rem' }, t('How it is going')),
        h('div.grid', { style: '--min:130px' }, stat(a7.pct != null ? MT.pct(a7.pct) : '—', t('Taken, last 7 days')), stat(a30.pct != null ? MT.pct(a30.pct) : '—', t('Taken, last 30 days'))),
        h('div.hc-grid7', { role: 'img', 'aria-label': t('Doses taken each day this week') }, cells),
        a7.pct != null && a7.pct < 0.8 ? h('p.small', { style: 'margin:0' }, t('Missing doses happens to everyone. If it is hard to remember, set the phone reminders or link it to a daily habit. If side effects or cost are the problem, talk to your health worker. Do not stop medicines on your own.')) : h('p.small.muted', { style: 'margin:0' }, t('Well done for staying on track.')))));
    }
    var due = T.dosesDue(items, td), log = medLogDoc().log[td] || {};
    due.forEach(function (x) {
      var cb = h('input', { type: 'checkbox', checked: !!log[x.key], id: nid() });
      var row = h('label.hc-tick' + (log[x.key] ? '.done' : ''), { 'for': cb.id }, cb, h('div.t', h('strong', x.name), h('span.s', timeLabel(x.time) + (x.dose ? ' · ' + x.dose : ''))), x.time < nowHM && !log[x.key] ? MT.ui.badge(t('Earlier today'), 'warn') : null);
      cb.addEventListener('change', function () { takenToggle(td, x.key, cb.checked); row.classList.toggle('done', cb.checked); drawSummary(); });
      list.appendChild(row);
    });
    panel.appendChild(h('div.stack', h('div.card', h('div.stack', h('h2', { style: 'margin:0;font-size:1.1rem' }, t('Today\'s medicines')), due.length ? list : h('p.muted', { style: 'margin:0' }, t('Nothing is due today.')))), summary, note(MED_NOTE())));
    drawSummary();
  }

  function renderMedsList(panel, api) {
    var box = h('div.stack'); panel.appendChild(box);
    function draw() {
      MT.clear(box);
      var d = medsDoc(), td = today();
      box.appendChild(h('button.btn.btn-primary', { type: 'button', style: 'align-self:flex-start', onclick: function () { medForm(null, function (o) { saveMed(o); MT.toast(t('Saved'), 'ok'); draw(); }); } }, '+ ' + t('Add a medicine')));
      if (!d.items.length) box.appendChild(MT.ui.empty('💊', t('Your list is empty'), t('Add each medicine, with the times you take it.')));
      d.items.forEach(function (m) {
        var r = T.refillInfo(m, td, 7);
        box.appendChild(h('div.card' + (m.active === false ? '.card-soft' : ''), h('div.stack',
          h('div.hc-item', h('div', h('h3', m.name), h('div.small.muted', [m.dose, medTimesText(m)].filter(Boolean).join(' · '))), m.active === false ? MT.ui.badge(t('Paused'), '') : null),
          m.purpose ? h('div.small', t('For: {x}', { x: m.purpose })) : null, m.notes ? h('div.small', t('Note: {x}', { x: m.notes })) : null,
          r ? (r.out ? MT.ui.alert('danger', t('Out of pills'), t('Please get more from your pharmacy or clinic. Do not stop taking your medicine without asking a health worker.'))
            : MT.ui.alert(r.soon ? 'warn' : 'info', t('About {n} days of pills left', { n: r.daysLeft }), t('They run out around {date}. Plan your refill by {remind}.', { date: dateLabel(r.runOutDate, { month: 'short', day: 'numeric' }), remind: dateLabel(r.remindDate, { month: 'short', day: 'numeric' }) }))) : null,
          h('div.hc-row',
            h('button.btn.btn-sm', { type: 'button', onclick: function () { medForm(m, function (o) { saveMed(o); draw(); }); } }, t('Edit')),
            m.pillsLeft != null ? h('button.btn.btn-sm', { type: 'button', onclick: function () { refilled(m); } }, t('I refilled')) : null,
            h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { m.active = m.active === false; saveMed(m); draw(); } }, m.active === false ? t('Resume') : t('Pause')),
            h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { confirmThen(t('Delete {name} from your list?', { name: m.name }), function () { var dd = medsDoc(); dd.items = dd.items.filter(function (x) { return x.id !== m.id; }); saveDoc(K.meds, dd); draw(); }); } }, t('Delete'))))));
      });
      box.appendChild(note(MED_NOTE()));
    }
    function refilled(m) {
      var inp = numInput({ decimal: true, placeholder: '30', maxlength: 5 });
      MT.modal({ title: t('How many pills do you have now?'), body: field(t('Pills'), inp), actions: [{ label: t('Cancel'), variant: 'ghost' }, { label: t('Save'), variant: 'primary', onClick: function () {
        var n = MT.num(inp.value); if (n === undefined || n < 0) { MT.toast(t('Please enter a number'), 'warn'); return false; }
        m.pillsLeft = n; m.pillsAsOf = today(); saveMed(m); draw(); } }] });
    }
    draw();
  }

  function medPrintSheet() {
    var items = medsDoc().items.filter(function (m) { return m.active !== false; }), prof = profile();
    var rows = items.map(function (m) { return h('tr', h('td', h('strong', m.name)), h('td', m.dose || ''), h('td', medTimesText(m)), h('td', m.purpose || ''), h('td', m.notes || '')); });
    for (var i = 0; i < 3; i++) rows.push(h('tr', h('td.blank'), h('td'), h('td'), h('td'), h('td')));
    return h('div.hc-sheet',
      h('h2', t('My medicines')), h('p', prof.name ? t('Name: {name}', { name: prof.name }) + '. ' : '', t('Printed: {date}', { date: dateLabel(today(), { year: 'numeric', month: 'long', day: 'numeric' }) })),
      h('table', h('thead', h('tr', h('th', t('Medicine')), h('th', t('Dose')), h('th', t('When I take it')), h('th', t('What it is for')), h('th', t('Notes')))), h('tbody', rows)),
      h('p', t('Allergies or bad reactions to medicines:'), ' ______________________________'),
      h('p', t('Other things I take (herbal remedies, vitamins, over-the-counter medicines):'), ' ______________________________'),
      h('p.small', t('Bring this list to every health visit. Ask your pharmacist or health worker if you are unsure about any medicine or how medicines mix. Made with Salus; it is a personal record, not medical advice.')));
  }

  function renderMedsReminders(panel, api, host) {
    var lead = 7, alarm = 0;
    var leadSel = h('select', { onchange: function () { lead = +leadSel.value; } }, [3, 7, 14].map(function (n) { return h('option', { value: String(n), selected: n === 7 }, t('{n} days before they run out', { n: n })); }));
    var alarmSel = h('select', { onchange: function () { alarm = +alarmSel.value; } }, [0, 10, 30].map(function (n) { return h('option', { value: String(n) }, n ? t('{n} minutes before', { n: n }) : t('At the time')); }));
    function download() {
      var items = medsDoc().items.filter(function (m) { return m.active !== false; });
      if (!items.length) { MT.toast(t('Add a medicine first'), 'warn'); return; }
      var ev = T.medEvents(items, { startDate: today(), today: today(), leadDays: lead, alarmMin: alarm,
        titleTemplate: t('Take {name}'), descTemplate: t('Dose: {dose}. For: {purpose}. Ask your pharmacist or health worker if you are unsure.'), refillTitle: t('Get more {name}'), refillDesc: t('About {days} days of {name} left (runs out on {date}).') });
      MT.ics.download('salus-medicine-reminders.ics', { name: t('My medicines'), events: ev });
      MT.toast(t('Reminder file saved. Open it to add the reminders to your calendar.'), 'ok', 4500);
    }
    panel.appendChild(h('div.stack',
      h('div.card', h('div.stack', h('h2', { style: 'margin:0;font-size:1.1rem' }, t('Phone reminders')),
        h('p', { style: 'margin:0' }, t('Make a calendar file with a daily reminder for each medicine time, and a refill reminder. It works with any phone calendar and needs no internet.')),
        h('div.form-grid.cols-2', field(t('Refill reminder'), leadSel), field(t('Alert'), alarmSel)),
        h('button.btn.btn-primary', { type: 'button', onclick: download }, '📅 ' + t('Download reminders (.ics)')),
        h('details.disclosure', h('summary', t('How do I use the file?')), h('div.disclosure-body.small', h('ul', { style: 'margin:0;padding-left:1.1rem' }, h('li', t('Android: open the downloaded file and choose your calendar app.')), h('li', t('iPhone: open the file from Files or Mail and tap Add All.')), h('li', t('Computer: double-click the file to add it to your calendar.')), h('li', t('If you change your list, download a new file and delete the old events.'))))))),
      h('div.card', h('div.stack', h('h2', { style: 'margin:0;font-size:1.1rem' }, t('Bring this list to your clinic')),
        h('p', { style: 'margin:0' }, t('A one-page list of your medicines to print or save as a PDF.')),
        h('button.btn', { type: 'button', onclick: function () { if (!medsDoc().items.length) { MT.toast(t('Add a medicine first'), 'warn'); return; } printSheet(host, medPrintSheet()); } }, '🖨 ' + t('Print or save as PDF')))),
      note(MED_NOTE())));
  }

  MT.registerTool({
    id: 'meds', title: 'My medicines', category: 'daily', icon: '💊', order: 30,
    description: 'Keep a list of your medicines, get daily reminders, tick off what you take, and plan refills.',
    keywords: ['medicine', 'medication', 'pills', 'reminder', 'refill', 'adherence', 'pharmacy', 'tablet'],
    render: function (container) {
      var tb = tabbed([
        { id: 'today', label: t('Today'), render: renderMedsToday },
        { id: 'list', label: t('My list'), render: renderMedsList },
        { id: 'remind', label: t('Reminders and print'), render: function (p, api) { return renderMedsReminders(p, api, container); } }
      ]);
      container.appendChild(tb.el);
      container.appendChild(MT.ui.disclaimer(MED_NOTE()));
      return tb.cleanup;
    }
  });

  /* ====================================================================
     7. HABITS
     ==================================================================== */
  var HABIT_REFS = function () {
    return [
      { label: 'Gollwitzer PM, Sheeran P. Implementation intentions and goal achievement: a meta-analysis of effects and processes. Adv Exp Soc Psychol 2006;38:69-119', note: t('"When X, I will Y" plans help people reach goals (medium to large effect)') },
      { label: 'Lally P, et al. How are habits formed: modelling habit formation in the real world. Eur J Soc Psychol 2010;40:998-1009', note: t('it took about 2 months on average, and missing one day did not ruin it'), url: 'https://doi.org/10.1002/ejsp.674' },
      { label: 'Fogg BJ. Tiny Habits. 2019; Clear J. Atomic Habits. 2018', note: t('tiny starts and habit stacking are popular methods, not trial-tested here') }
    ];
  };
  var HABIT_IDEAS_UI = function () {
    return [
      [t('I wake up'), t('drink a glass of water'), t('take one sip of water')],
      [t('I finish lunch'), t('walk for 10 minutes'), t('put my shoes on and step outside')],
      [t('I finish a phone call'), t('stand up and stretch'), t('stand up')],
      [t('I make my morning tea or coffee'), t('take my medicine'), t('put my medicine next to my cup')],
      [t('I brush my teeth'), t('do 10 chair stands'), t('do 2 chair stands')],
      [t('I get into bed'), t('breathe slowly for 3 minutes'), t('take 3 slow breaths')],
      [t('I sit down for dinner'), t('put a vegetable on my plate first'), t('put one piece of vegetable on my plate')],
      [t('I plug in my phone for the night'), t('leave it outside the bedroom'), t('put it on the other side of the room')],
      [t('I turn off the light'), t('think of one good thing from today'), t('think of one good thing')],
      [t('I come home'), t('wash my hands with soap'), t('wet my hands and reach for the soap')]
    ];
  };
  function habitSentence(hb) {
    var cue = String(hb.cue || '').trim().replace(/[.,;]+$/, ''), plan = String(hb.plan || '').trim().replace(/^i will\s+/i, '').replace(/[.]+$/, '');
    if (!plan) return '';
    if (!cue) return t('I will {plan}.', { plan: plan });
    return /^(when|after|before|if|as soon as|every)\b/i.test(cue) ? t('{cue}, I will {plan}.', { cue: cue, plan: plan }) : t('When {cue}, I will {plan}.', { cue: cue, plan: plan });
  }

  /* Hand-off for H1's action plan: MT.coach.addHabit({ title, cue, plan, tiny, source }) -> id */
  MT.coach = MT.coach || {};
  MT.coach.addHabit = function (o) {
    o = o || {};
    var title = String(o.title || o.plan || '').trim(); if (!title) return null;
    var d = habitsDoc();
    var existing = d.items.filter(function (x) { return x.title.toLowerCase() === title.toLowerCase() && (x.source || '') === (o.source || ''); })[0];
    if (existing) return existing.id;
    var item = { id: MT.uid('hb'), title: title, cue: String(o.cue || ''), plan: String(o.plan || ''), tiny: String(o.tiny || ''), source: String(o.source || ''), createdAt: new Date().toISOString(), log: {} };
    d.items.push(item); saveDoc(K.habits, d);
    return item.id;
  };
  function habitToggle(id, date, on) {
    var d = habitsDoc();
    d.items.forEach(function (x) { if (x.id === id) { x.log = x.log || {}; if (on) x.log[date] = true; else delete x.log[date]; } });
    saveDoc(K.habits, d);
  }

  function habitForm(box, existing, onDone) {
    var items = habitsDoc().items;
    var titleIn = h('input', { type: 'text', maxlength: 80, value: existing ? existing.title : '', placeholder: t('For example: Walk after lunch') });
    var cueIn = h('input', { type: 'text', maxlength: 100, value: existing ? existing.cue : '', placeholder: t('For example: I finish lunch') });
    var planIn = h('input', { type: 'text', maxlength: 120, value: existing ? existing.plan : '', placeholder: t('For example: walk for 10 minutes') });
    var tinyIn = h('input', { type: 'text', maxlength: 120, value: existing ? existing.tiny : '', placeholder: t('For example: put my shoes on and step outside') });
    var preview = h('p.card-soft', { style: 'padding:12px;border-radius:10px;margin:0', 'aria-live': 'polite' });
    var err = h('div.error', { role: 'alert' });
    function upd() {
      var s = habitSentence({ cue: cueIn.value, plan: planIn.value });
      MT.clear(preview);
      preview.appendChild(h('strong', s || t('Your plan will appear here.')));
      if (tinyIn.value.trim()) preview.appendChild(h('div.small', { style: 'margin-top:4px' }, t('On a hard day, I will just {tiny}.', { tiny: tinyIn.value.trim().replace(/[.]+$/, '') })));
    }
    [cueIn, planIn, tinyIn].forEach(function (i) { i.addEventListener('input', upd); });
    var ideas = HABIT_IDEAS_UI();
    var stack = items.slice(0, 6);
    var form = h('div.card', h('div.stack',
      h('h2', { style: 'margin:0;font-size:1.1rem' }, existing ? t('Edit habit') : t('Build a habit')),
      h('p.muted', { style: 'margin:0' }, t('Tie a new habit to something you already do. A clear plan makes it much more likely to happen.')),
      !existing ? h('div.stack', { style: 'gap:6px' }, h('div.field-label', t('Ideas (tap to use)')), h('div.hc-row', ideas.map(function (x) { return h('button.chip', { type: 'button', onclick: function () { cueIn.value = x[0]; planIn.value = x[1]; tinyIn.value = x[2]; titleIn.value = titleIn.value || x[1].charAt(0).toUpperCase() + x[1].slice(1); upd(); } }, x[1]); }))) : null,
      stack.length && !existing ? h('div.stack', { style: 'gap:6px' }, h('div.field-label', t('Stack it after a habit you already track')), h('div.hc-row', stack.map(function (x) { return h('button.chip', { type: 'button', onclick: function () { cueIn.value = t('I finish "{habit}"', { habit: x.title }); upd(); cueIn.focus(); } }, x.title); }))) : null,
      field(t('Habit name'), titleIn),
      field(t('When I...'), cueIn, t('The thing you already do. For example: I brush my teeth.')),
      field(t('I will...'), planIn, t('The new habit. Keep it small and clear.')),
      field(t('Tiny version for hard days'), tinyIn, t('So small you cannot say no. Doing the tiny version still counts.')),
      preview, err,
      h('div.hc-row', h('button.btn.btn-primary', { type: 'button', onclick: function () {
        var title = titleIn.value.trim() || planIn.value.trim();
        if (!title || !planIn.value.trim()) { err.textContent = t('Please write what you will do.'); return; }
        var d = habitsDoc();
        if (existing) d.items.forEach(function (x) { if (x.id === existing.id) { x.title = title; x.cue = cueIn.value.trim(); x.plan = planIn.value.trim(); x.tiny = tinyIn.value.trim(); } });
        else d.items.push({ id: MT.uid('hb'), title: title, cue: cueIn.value.trim(), plan: planIn.value.trim(), tiny: tinyIn.value.trim(), source: 'user', createdAt: new Date().toISOString(), log: {} });
        saveDoc(K.habits, d); MT.toast(existing ? t('Saved') : t('Habit added. Start today with the tiny version if you like.'), 'ok'); onDone();
      } }, t('Save habit')), h('button.btn.btn-ghost', { type: 'button', onclick: onDone }, t('Cancel')))));
    MT.clear(box); box.appendChild(form); upd();
    titleIn.focus && titleIn.focus();
  }

  MT.registerTool({
    id: 'habits', title: 'Habit builder', category: 'daily', icon: '✅', order: 40,
    description: 'Turn good intentions into small daily habits with clear plans, tiny starts and streaks.',
    keywords: ['habit', 'routine', 'streak', 'goal', 'implementation intention', 'tiny habits', 'behaviour change', 'plan'],
    render: function (container) {
      var box = h('div.stack');
      container.appendChild(box);
      function draw() {
        MT.clear(box);
        var d = habitsDoc(), td = today();
        box.appendChild(h('button.btn.btn-primary', { type: 'button', style: 'align-self:flex-start', onclick: function () { habitForm(box, null, draw); } }, '+ ' + t('Build a habit')));
        if (!d.items.length) {
          box.appendChild(MT.ui.empty('🌱', t('Start with one small habit'), t('Pick something tiny you can do every day. Tap "Build a habit".')));
        }
        d.items.forEach(function (hb) {
          var log = hb.log || {}, st = T.streak(log, td), best = T.bestStreak(log), grid = T.weekGrid(log, td, 7), done = !!log[td];
          var weekCount = grid.filter(function (g) { return g.done; }).length;
          var cb = h('input', { type: 'checkbox', checked: done, id: nid(), 'aria-label': t('Done today: {name}', { name: hb.title }) });
          var tick = h('label.hc-tick' + (done ? '.done' : ''), { 'for': cb.id }, cb, h('div.t', h('strong', t('Done today'))));
          var streakEl = h('span.badge.badge-accent'), gridEl = h('div.hc-grid7'), statEl = h('div.small.muted');
          var refreshHabit = function () {
            var lg = log, g2 = T.weekGrid(lg, td, 7), n = g2.filter(function (g) { return g.done; }).length, s2 = T.streak(lg, td);
            streakEl.textContent = s2 ? t('{n}-day streak', { n: s2 }) : t('No streak yet');
            gridEl.setAttribute('role', 'img'); gridEl.setAttribute('aria-label', t('Last 7 days: {n} done', { n: n }));
            MT.clear(gridEl); g2.forEach(function (g) { gridEl.appendChild(h('div', h('span.hc-cell' + (g.done ? '.on' : '') + (g.date === td ? '.today' : ''), g.done ? '✓' : ''), weekdayInitial(g.date))); });
            statEl.textContent = t('This week: {a} of 7 days. Best streak: {b} days.', { a: n, b: T.bestStreak(lg) });
            return s2;
          };
          cb.addEventListener('change', function () {
            habitToggle(hb.id, td, cb.checked); tick.classList.toggle('done', cb.checked);
            if (cb.checked) log[td] = true; else delete log[td];
            var ns = refreshHabit();
            if (cb.checked) MT.toast(ns > 1 ? t('{n} days in a row. Keep it up!', { n: ns }) : t('Done. Every day you do it makes it easier.'), 'ok');
          });
          refreshHabit(); void best; void st; void weekCount;
          var sentence = habitSentence(hb);
          var nudge = !done && T.missedYesterday(log, td) && T.bestStreak(log) > 0 ? MT.ui.alert('info', t('Missed yesterday? That is okay.'), t('The rule is never miss twice. Do the tiny version today to stay on track.')) : null;
          box.appendChild(h('div.card', h('div.stack',
            h('div.hc-item', h('div', { style: 'flex:1;min-width:0' }, h('h3', hb.title), sentence ? h('div.small', sentence) : null, hb.tiny ? h('div.small.muted', t('Tiny version: {tiny}', { tiny: hb.tiny })) : null), streakEl),
            gridEl, statEl,
            nudge, tick,
            h('div.hc-row',
              h('button.btn.btn-sm', { type: 'button', onclick: function () { habitForm(box, hb, draw); } }, t('Edit')),
              h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { confirmThen(t('Delete this habit and its history?'), function () { var dd = habitsDoc(); dd.items = dd.items.filter(function (x) { return x.id !== hb.id; }); saveDoc(K.habits, dd); draw(); }); } }, t('Delete'))))));
        });
        box.appendChild(h('details.disclosure', h('summary', t('Tips for making habits stick')), h('div.disclosure-body.small', h('ul', { style: 'margin:0;padding-left:1.1rem' },
          h('li', t('Start tiny. Two chair stands beat a big plan you drop.')), h('li', t('Link it to something you already do every day (habit stacking).')), h('li', t('Never miss twice. One missed day does not matter much.')),
          h('li', t('On average it took about 2 months for a new habit to feel automatic. Be patient with yourself.'))))));
        box.appendChild(refs(HABIT_REFS()));
      }
      draw();
    }
  });

  /* ====================================================================
     8. HOME WIDGET: today's check-ins
     ==================================================================== */
  MT.registerWidget({
    id: 'today', order: 20,
    render: function (box) {
      var td = today(), sections = [];
      // Blood pressure
      var bd = bpDoc();
      if (bd.plan && bd.plan.startDate) {
        var due = T.bpDueToday(bd.readings, bd.plan.startDate, td);
        if (due.active && (!due.amDone || !due.pmDone)) {
          var which = !due.amDone && !due.pmDone ? t('morning and evening') : !due.amDone ? t('morning') : t('evening');
          sections.push(h('div.hc-tick', h('span', { 'aria-hidden': 'true', style: 'font-size:1.4rem' }, '🩺'), h('div.t', h('strong', t('Blood pressure: {when} reading due', { when: which })), h('span.s', due.discarded ? t('Day 1 is practice') : t('Day {n} of 7', { n: due.dayIndex + 1 }))), h('a.btn.btn-sm.btn-primary', { href: '#/bp' }, t('Log reading'))));
        }
      }
      // Medicines
      var meds = medsDoc().items.filter(function (m) { return m.active !== false; });
      if (meds.length) {
        var log = medLogDoc().log[td] || {}, dueMeds = T.dosesDue(meds, td);
        if (dueMeds.length) {
          var medBox = h('div.stack', { style: 'gap:6px' }, h('div.field-label', t('Medicines')));
          dueMeds.slice(0, 8).forEach(function (x) {
            var cb = h('input', { type: 'checkbox', checked: !!log[x.key], id: nid() });
            var row = h('label.hc-tick' + (log[x.key] ? '.done' : ''), { 'for': cb.id }, cb, h('div.t', h('strong', x.name), h('span.s', timeLabel(x.time) + (x.dose ? ' · ' + x.dose : ''))));
            cb.addEventListener('change', function () { takenToggle(td, x.key, cb.checked); row.classList.toggle('done', cb.checked); });
            medBox.appendChild(row);
          });
          if (dueMeds.length > 8) medBox.appendChild(h('a.small', { href: '#/meds' }, t('See all medicines')));
          sections.push(medBox);
        }
      }
      // Habits
      var habits = habitsDoc().items;
      if (habits.length) {
        var hbox = h('div.stack', { style: 'gap:6px' }, h('div.field-label', t('Habits')));
        habits.slice(0, 5).forEach(function (hb) {
          var done = !!(hb.log && hb.log[td]), cb = h('input', { type: 'checkbox', checked: done, id: nid() });
          var row = h('label.hc-tick' + (done ? '.done' : ''), { 'for': cb.id }, cb, h('div.t', h('strong', hb.title), hb.tiny ? h('span.s', t('Tiny version: {tiny}', { tiny: hb.tiny })) : null));
          cb.addEventListener('change', function () { habitToggle(hb.id, td, cb.checked); row.classList.toggle('done', cb.checked); });
          hbox.appendChild(row);
        });
        if (habits.length > 5) hbox.appendChild(h('a.small', { href: '#/habits' }, t('See all {n} habits', { n: habits.length })));
        sections.push(hbox);
      }
      // Mood
      var md = moodDoc();
      if (!md.checkins.some(function (c) { return (c.date || U.dateOf(c.t)) === td; })) {
        var moodBox = h('div.stack', { style: 'gap:6px' }, h('div.field-label', t('How are you feeling today?')));
        var faces = h('div.hc-mini-faces', { role: 'group', 'aria-label': t('Mood from 1 to 5') }, FACES().map(function (f) {
          return h('button', { type: 'button', 'aria-label': f[2], title: f[2], onclick: function () {
            var d = moodDoc(); d.checkins.push({ id: MT.uid('md'), t: new Date().toISOString(), date: td, score: f[0], words: [], note: '' }); saveDoc(K.mood, d);
            MT.clear(moodBox); moodBox.appendChild(moodMsg(f[0])); moodBox.appendChild(h('a.small', { href: '#/mood' }, t('Open mood and stress tools')));
          } }, f[1]);
        }));
        moodBox.appendChild(faces); sections.push(moodBox);
      }
      if (!sections.length) {
        sections.push(h('div.stack', h('p.muted', { style: 'margin:0' }, t('Small daily steps add up. Pick one to start:')),
          h('div.hc-row', h('a.btn.btn-sm', { href: '#/habits' }, t('Build a habit')), h('a.btn.btn-sm', { href: '#/bp' }, t('Check blood pressure')), h('a.btn.btn-sm', { href: '#/meds' }, t('Add medicines')), h('a.btn.btn-sm', { href: '#/breathe' }, t('Breathe')))));
      }
      box.appendChild(h('div.card', h('div.stack', h('h2', { style: 'margin:0;font-size:1.1rem' }, t('Today')), sections)));
    }
  });
})();



