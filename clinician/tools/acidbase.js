/* Open Medical Toolkit · Clinician Toolkit · package C2 — UI for the blood-gas interpreter and electrolyte tools.
 * Tools:  #/abg            stepwise blood-gas interpreter      #/abg/practice   practice library (17 cases)
 *         #/electrolytes   corrected Na and Ca, hyponatraemia planner, free water, K⁺/Mg²⁺ notes  (#/electrolytes/<tab>)
 * Logic lives in clinician/lib/acidbase.js (MTLib.acidbase); every formula and threshold is cited there.
 * Storage: clinician.c2.abgUnits {v:1,gas,lab,altMode,altUnit} · clinician.c2.abgPractice {v:1,answers:{caseId:optionIndex}}
 * Patient values are kept in memory only (never written to storage).
 */
(function () {
  'use strict';
  var h = MT.h;
  var AB = self.MTLib && self.MTLib.acidbase;

  MT.css('c2-ab', [
    '.c2-toolbar { display:flex; flex-wrap:wrap; gap:.6rem 1.2rem; align-items:center; margin-bottom:12px; }',
    '.c2-toolbar .c2-tl { font-size:.75rem; font-weight:750; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin-right:.4rem; }',
    '.c2-toolbar .segmented button { min-height:36px; }',
    '.c2-fs { margin:0; padding:0; border:0; min-width:0; }',
    '.c2-fs + .c2-fs { margin-top:14px; }',
    '.c2-fs > legend { font-size:.78rem; font-weight:750; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin-bottom:8px; }',
    '.c2-fields { display:grid; gap:12px; grid-template-columns:repeat(auto-fill, minmax(148px, 1fr)); }',
    '.c2-fields .field > label { font-size:.9rem; }',
    '.c2-fields .input-group > .addon { font-size:.8rem; padding:0 8px; min-width:3.2em; }',
    '.c2-fields .input-group > select { font-size:.85rem; padding:0 6px; }',
    '.c2-req { color:var(--danger); font-weight:800; }',
    '.c2-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:14px; }',
    '.c2-actions select { min-height:40px; max-width:100%; }',
    '.c2-headline { font-size:1.22rem; font-weight:800; line-height:1.3; margin:.25rem 0 .5rem; }',
    '.c2-dx { display:flex; flex-wrap:wrap; gap:6px; margin:.25rem 0 .5rem; }',
    '.c2-steps { display:grid; gap:12px; grid-template-columns:1fr; }',
    '@media (min-width:760px) { .c2-steps { grid-template-columns:1fr 1fr; } }',
    '.c2-step { display:flex; flex-direction:column; gap:.35rem; }',
    '.c2-step-head { display:flex; align-items:center; gap:.55rem; }',
    '.c2-step-head h3 { font-size:1rem; margin:0; flex:1; }',
    '.c2-num { width:26px; height:26px; border-radius:50%; background:var(--accent-soft); color:var(--accent-text); font-weight:800; font-size:.82rem; display:grid; place-items:center; flex:none; }',
    '.c2-step p { margin:0; font-size:.92rem; line-height:1.45; }',
    '.c2-step.is-na p { color:var(--muted); }',
    '.c2-step-wide { grid-column:1 / -1; }',
    '.c2-summary { white-space:pre-wrap; font-family:var(--mono); font-size:.8rem; line-height:1.5; background:var(--surface-2); border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px 12px; margin:0; max-height:420px; overflow:auto; }',
    '.c2-ddx { display:grid; gap:12px; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); }',
    '.c2-ddx h4 { font-size:.95rem; margin:0 0 .3rem; }',
    '.c2-ddx ul { margin:0; font-size:.9rem; }',
    '.c2-src { font-size:.78rem; color:var(--muted); margin-top:.35rem; }',
    '.c2-case-vals { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:4px 14px; font-size:.9rem; margin:.5rem 0 .75rem; padding:10px 12px; background:var(--surface-2); border-radius:var(--radius-sm); font-variant-numeric:tabular-nums; }',
    '.c2-case-vals span { color:var(--muted); }',
    '.c2-opts { display:grid; gap:8px; }',
    '.c2-opt { display:flex; gap:.6rem; align-items:flex-start; width:100%; text-align:left; padding:10px 12px; min-height:44px; border-radius:10px; border:1px solid var(--border-strong); background:var(--surface); color:var(--text); font:inherit; font-size:.93rem; cursor:pointer; line-height:1.35; }',
    '.c2-opt:hover { background:var(--surface-2); }',
    '.c2-opt:disabled { cursor:default; opacity:1; }',
    '.c2-opt .c2-mark { flex:none; font-weight:800; width:1.4em; }',
    '.c2-opt.is-correct { border-color:var(--ok-border); background:var(--ok-soft); }',
    '.c2-opt.is-wrong { border-color:var(--danger-border); background:var(--danger-soft); }',
    '.c2-case-head { display:flex; gap:.6rem; align-items:center; flex-wrap:wrap; }',
    '.c2-case-head h3 { margin:0; font-size:1.05rem; flex:1; min-width:12em; }',
    '.c2-progress { display:flex; gap:1rem; flex-wrap:wrap; align-items:center; }',
    '.c2-note-list li + li { margin-top:.4rem; }',
    '@media print { .c2-no-print { display:none !important; } .c2-summary { max-height:none; overflow:visible; } }'
  ].join('\n'));

  /* ------------------------------------------------------------------ shared helpers */
  function libMissing(container) {
    container.appendChild(MT.ui.alert('danger', 'Calculation library not loaded', 'clinician/lib/acidbase.js failed to load. Reload the page.'));
  }
  function fmt(x, dp) { return AB.fmt(x, dp); }
  function loadObj(key, fallback) {
    var v = MT.store.get(key, null);
    return v && typeof v === 'object' && v.v === 1 ? v : fallback;
  }
  function statusBadge(status, text) {
    var map = { ok: 'ok', warn: 'warn', danger: 'danger', info: 'info', na: '' };
    return MT.ui.badge(text, map[status] || '');
  }
  function refsBlock(list) {
    return h('details.disclosure', h('summary', 'References'), h('div.disclosure-body', h('ol', { style: 'margin:0;font-size:.88rem' }, list.map(function (r) { return h('li', r); }))));
  }

  var ABG_REFS = [
    'Kaufman DA. Interpretation of arterial blood gases. American Thoracic Society clinical education series (Henderson equation consistency check).',
    'Albert MS, Dell RB, Winters RW. Quantitative displacement of acid–base equilibrium in metabolic acidosis. Ann Intern Med 1967;66:312–22 (Winter\'s formula).',
    'Brandis K. Acid–base physiology: the bedside "Boston" rules for compensation (respiratory 1/4 and 2/5 per 10 mmHg; metabolic alkalosis 0.7 × HCO₃⁻ + 20 ± 5).',
    'Figge J, Jabor A, Kazda A, Fencl V. Anion gap and hypoalbuminemia. Crit Care Med 1998;26:1807–10.',
    'Gabow PA et al. Diagnostic importance of an increased serum anion gap. N Engl J Med 1980;303:854–8.',
    'Rastegar A. Use of the ΔAG/ΔHCO₃⁻ ratio in the diagnosis of mixed acid–base disorders. J Am Soc Nephrol 2007;18:2429–31.',
    'Hoffman RS et al. Osmol gaps revisited: normal values and limitations. J Toxicol Clin Toxicol 1993;31:81–93.',
    'Purssell RA et al. Derivation and validation of a formula to calculate the contribution of ethanol to the osmolal gap. Ann Emerg Med 2001;38:653–9.',
    'Mellemgaard K. The alveolar–arterial oxygen difference: its size and components in normal man. Acta Physiol Scand 1966;67:10–20.',
    'ARDS Definition Task Force. Acute respiratory distress syndrome: the Berlin Definition. JAMA 2012;307:2526–33.',
    'Mehta AN, Emmett JB, Emmett M. GOLD MARK: an anion gap mnemonic for the 21st century. Lancet 2008;372:892.',
    'Batlle DC et al. The use of the urinary anion gap in the diagnosis of hyperchloremic metabolic acidosis. N Engl J Med 1988;318:594–9.',
    'Berend K, de Vries APJ, Gans ROB. Physiological approach to assessment of acid–base disturbances. N Engl J Med 2014;371:1434–45.',
    'International Standard Atmosphere (ICAO / ISO 2533) for barometric pressure at altitude.'
  ];

  /* ------------------------------------------------------------------ ABG field definitions */
  var KINDS = {
    lactate: { si: { label: 'mmol/L', f: 1 }, conv: { label: 'mg/dL', f: 1 / 9.008 } },
    albumin: { si: { label: 'g/L', f: 1 }, conv: { label: 'g/dL', f: 10 } },
    glucose: { si: { label: 'mmol/L', f: 1 }, conv: { label: 'mg/dL', f: 1 / 18.016 } },
    urea: { si: { label: 'mmol/L', f: 1, name: 'Urea' }, conv: { label: 'mg/dL', f: 1 / 2.801, name: 'BUN' } },
    ethanol: { si: { label: 'mmol/L', f: 1 }, conv: { label: 'mg/dL', f: 1 / 4.607 } }
  };
  var FIELDS = [
    { id: 'ph', label: 'pH', group: 'gas', req: true, range: [6.5, 8.0], dp: 2, placeholder: '7.40' },
    { id: 'paco2', label: 'PaCO₂', group: 'gas', req: true, kind: 'pressure', range: [5, 200] },
    { id: 'hco3', label: 'HCO₃⁻', group: 'gas', req: true, unit: 'mmol/L', range: [1, 70] },
    { id: 'pao2', label: 'PaO₂', group: 'gas', kind: 'pressure', range: [10, 760] },
    { id: 'fio2', label: 'FiO₂', group: 'gas', unit: '0.21–1 or %', range: [0.21, 1], fio2: true, placeholder: '0.21' },
    { id: 'lactate', label: 'Lactate', group: 'gas', kind: 'lactate', range: [0, 40] },
    { id: 'na', label: 'Na⁺', group: 'chem', unit: 'mmol/L', range: [90, 200] },
    { id: 'cl', label: 'Cl⁻', group: 'chem', unit: 'mmol/L', range: [50, 160] },
    { id: 'albumin', label: 'Albumin', group: 'chem', kind: 'albumin', range: [5, 70] },
    { id: 'glucose', label: 'Glucose', group: 'chem', kind: 'glucose', range: [0.5, 150] },
    { id: 'urea', label: 'Urea', group: 'chem', kind: 'urea', range: [0.3, 150] },
    { id: 'osm', label: 'Measured osmolality', group: 'chem', unit: 'mOsm/kg', range: [200, 500] },
    { id: 'ethanol', label: 'Ethanol (if known)', group: 'chem', kind: 'ethanol', range: [0, 200] },
    { id: 'age', label: 'Age', group: 'pt', unit: 'years', range: [0, 120] }
  ];
  var ALT = { id: 'alt', range: [-500, 6000] };            // metres
  var PB = { id: 'pb', range: [300, 800] };                // mmHg
  var PREF_KEY = 'clinician.c2.abgUnits', PRACTICE_KEY = 'clinician.c2.abgPractice';
  var session = { values: {} };                            // raw strings (current display units), memory only

  function loadPrefs() {
    var d = MT.settings.get('units') === 'conv' ? { gas: 'mmHg', lab: 'conv' } : { gas: 'kPa', lab: 'si' };
    var p = loadObj(PREF_KEY, null);
    return {
      v: 1,
      gas: p && (p.gas === 'kPa' || p.gas === 'mmHg') ? p.gas : d.gas,
      lab: p && (p.lab === 'si' || p.lab === 'conv') ? p.lab : d.lab,
      altMode: p && p.altMode === 'pressure' ? 'pressure' : 'altitude',
      altUnit: p && p.altUnit === 'ft' ? 'ft' : 'm'
    };
  }
  function unitFor(def, prefs) {
    if (def.kind === 'pressure') return prefs.gas === 'kPa' ? { label: 'kPa', f: AB.MMHG_PER_KPA } : { label: 'mmHg', f: 1 };
    if (def.kind) return KINDS[def.kind][prefs.lab === 'conv' ? 'conv' : 'si'];
    return { label: def.unit || '', f: 1 };
  }
  function displayNum(x) { if (!isFinite(x)) return ''; var a = Math.abs(x); return String(+x.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : 2)); }

  /* ------------------------------------------------------------------ ABG interpreter view */
  function renderInterpreter(container, ctx) {
    var prefs = loadPrefs();
    var els = {};
    function savePrefs() { MT.store.set(PREF_KEY, prefs); }

    function makeField(def) {
      var fid = MT.uid('c2-' + def.id);
      var u = unitFor(def, prefs);
      var input = h('input', { id: fid, type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', placeholder: def.placeholder || '', 'aria-describedby': fid + '-e', value: session.values[def.id] || '' });
      var addon = h('span.addon', u.label);
      var err = h('div.error', { id: fid + '-e' });
      var lab = h('label', { for: fid }, def.kind === 'urea' ? u.name : def.label, def.req ? [' ', h('span.c2-req', { 'aria-hidden': 'true' }, '*'), h('span.sr-only', '(required)')] : null);
      els[def.id] = { def: def, input: input, addon: addon, err: err, label: lab };
      input.addEventListener('input', function () { session.values[def.id] = input.value; update(); });
      return h('div.field', lab, h('div.input-group', input, addon), err);
    }
    // altitude / barometric pressure
    var altInput = h('input', { id: MT.uid('c2-alt'), type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: prefs.altMode === 'altitude' ? '0 (sea level)' : '', value: session.values.alt || '' });
    var altErr = h('div.error', { id: altInput.id + '-e' });
    altInput.setAttribute('aria-describedby', altInput.id + '-e');
    var altUnitSel = h('select', { 'aria-label': 'Altitude unit' }, h('option', { value: 'm', selected: prefs.altUnit === 'm' }, 'm'), h('option', { value: 'ft', selected: prefs.altUnit === 'ft' }, 'ft'));
    var altAddon = h('span.addon', prefs.gas);
    var altLabel = h('label', { for: altInput.id });
    var altGroup = h('div.input-group');
    var altHint = h('div.hint');
    function drawAlt() {
      MT.clear(altGroup); altGroup.appendChild(altInput);
      if (prefs.altMode === 'altitude') { altLabel.textContent = 'Altitude'; altGroup.appendChild(altUnitSel); altInput.placeholder = '0 (sea level)'; altHint.textContent = 'Blank = sea level (760 mmHg).'; }
      else { altLabel.textContent = 'Barometric pressure'; altAddon.textContent = prefs.gas; altGroup.appendChild(altAddon); altInput.placeholder = prefs.gas === 'kPa' ? '101.3' : '760'; altHint.textContent = 'Blank = 760 mmHg (101.3 kPa).'; }
    }
    altInput.addEventListener('input', function () { session.values.alt = altInput.value; update(); });
    altUnitSel.addEventListener('change', function () {
      var n = MT.num(altInput.value);
      if (n != null) { var m = prefs.altUnit === 'ft' ? n * 0.3048 : n; altInput.value = String(Math.round(altUnitSel.value === 'ft' ? m / 0.3048 : m)); session.values.alt = altInput.value; }
      prefs.altUnit = altUnitSel.value; savePrefs(); update();
    });
    var altModeSeg = MT.ui.segmented([{ value: 'altitude', label: 'Altitude' }, { value: 'pressure', label: 'Pressure' }], prefs.altMode, function (v) {
      var cur = readAlt(); prefs.altMode = v; savePrefs();
      altInput.value = '';
      if (cur.pb != null && cur.given) {
        if (v === 'pressure') altInput.value = displayNum(prefs.gas === 'kPa' ? cur.pb / AB.MMHG_PER_KPA : cur.pb);
        else { var m = altitudeFromPb(cur.pb); altInput.value = String(Math.round(prefs.altUnit === 'ft' ? m / 0.3048 : m)); }
      }
      session.values.alt = altInput.value; drawAlt(); update();
    });
    altModeSeg.setAttribute('aria-label', 'Enter altitude or barometric pressure');
    function altitudeFromPb(pb) { return (1 - Math.pow(pb / 760, 1 / 5.25588)) / 2.25577e-5; }
    function readAlt() {
      var raw = altInput.value, n = MT.num(raw);
      altErr.textContent = ''; altInput.removeAttribute('aria-invalid');
      if (raw && raw.trim() && n == null) { altErr.textContent = 'Enter a number'; altInput.setAttribute('aria-invalid', 'true'); return { error: true }; }
      if (n == null) return { pb: 760, given: false };
      if (prefs.altMode === 'altitude') {
        var m = prefs.altUnit === 'ft' ? n * 0.3048 : n;
        if (m < ALT.range[0] || m > ALT.range[1]) { altErr.textContent = 'Plausible range −500 to 6000 m'; altInput.setAttribute('aria-invalid', 'true'); return { error: true }; }
        return { pb: AB.baroFromAltitude(m), given: true };
      }
      var pb = prefs.gas === 'kPa' ? n * AB.MMHG_PER_KPA : n;
      if (pb < PB.range[0] || pb > PB.range[1]) { altErr.textContent = 'Plausible range ' + (prefs.gas === 'kPa' ? '40–107 kPa' : '300–800 mmHg'); altInput.setAttribute('aria-invalid', 'true'); return { error: true }; }
      return { pb: pb, given: true };
    }

    function convertFields(changeFn) {
      // read values in the old units, apply the preference change, then rewrite in the new units
      var bases = {};
      FIELDS.forEach(function (d) { var n = MT.num(els[d.id].input.value); if (n != null && !d.fio2) bases[d.id] = n * unitFor(d, prefs).f; });
      var altBase = prefs.altMode === 'pressure' ? MT.num(altInput.value) : null;
      if (altBase != null) altBase = prefs.gas === 'kPa' ? altBase * AB.MMHG_PER_KPA : altBase;
      changeFn(); savePrefs();
      FIELDS.forEach(function (d) {
        var e = els[d.id], u = unitFor(d, prefs);
        e.addon.textContent = u.label;
        if (d.kind === 'urea') e.label.firstChild.textContent = u.name;
        if (bases[d.id] != null) { e.input.value = displayNum(bases[d.id] / u.f); session.values[d.id] = e.input.value; }
      });
      if (altBase != null) { altInput.value = displayNum(prefs.gas === 'kPa' ? altBase / AB.MMHG_PER_KPA : altBase); session.values.alt = altInput.value; }
      drawAlt(); update();
    }
    var gasSeg = MT.ui.segmented([{ value: 'kPa', label: 'kPa' }, { value: 'mmHg', label: 'mmHg' }], prefs.gas, function (v) { convertFields(function () { prefs.gas = v; }); });
    gasSeg.setAttribute('aria-label', 'Gas tension units');
    var labSeg = MT.ui.segmented([{ value: 'si', label: 'SI (mmol/L)' }, { value: 'conv', label: 'mg/dL' }], prefs.lab, function (v) { convertFields(function () { prefs.lab = v; }); });
    labSeg.setAttribute('aria-label', 'Chemistry units');

    function group(title, g) { return h('fieldset.c2-fs', h('legend', title), h('div.c2-fields', FIELDS.filter(function (d) { return d.group === g; }).map(makeField))); }
    var exampleSel = h('select.select', { 'aria-label': 'Load a practice case into the form', style: 'width:auto' },
      h('option', { value: '' }, 'Load an example case…'),
      AB.CASES.map(function (c, i) { return h('option', { value: c.id }, (i + 1) + '. ' + c.title); }));
    exampleSel.addEventListener('change', function () {
      var c = AB.CASES.filter(function (x) { return x.id === exampleSel.value; })[0];
      if (c) { fillFromCase(c, prefs); restoreInputs(); update(); MT.toast('Loaded: ' + c.title); }
      exampleSel.value = '';
    });
    var clearBtn = h('button.btn.btn-ghost', { type: 'button', onclick: function () { session.values = {}; restoreInputs(); update(); els.ph.input.focus(); } }, '↺ Clear');
    function restoreInputs() { FIELDS.forEach(function (d) { els[d.id].input.value = session.values[d.id] || ''; }); altInput.value = session.values.alt || ''; }

    var form = h('form.card', { novalidate: true, onsubmit: function (e) { e.preventDefault(); }, 'aria-label': 'Blood gas values' },
      h('div.c2-toolbar',
        h('div', h('span.c2-tl', 'Gases'), gasSeg),
        h('div', h('span.c2-tl', 'Chemistry'), labSeg)),
      group('Blood gas', 'gas'),
      group('Chemistry (optional)', 'chem'),
      h('fieldset.c2-fs', h('legend', 'Patient and setting (optional)'),
        h('div.c2-fields', makeField(FIELDS.filter(function (d) { return d.id === 'age'; })[0]),
          h('div.field', altLabel, altGroup, altHint, altErr),
          h('div.field', h('div.field-label', 'Enter as'), altModeSeg))),
      h('div.c2-actions', exampleSel, clearBtn, h('span.small.muted', h('span.c2-req', '*'), ' required. Values stay on this page only.')));
    drawAlt();

    var headline = h('div.c2-headline', { 'aria-live': 'polite', 'aria-atomic': 'true' });
    var headBox = h('div.result');
    var dxRow = h('div.c2-dx');
    var hintsBox = h('div.stack.stack-sm');
    var stepsHost = h('div.c2-steps');
    var ddxHost = h('div');
    var summaryPre = h('pre.c2-summary', { tabindex: '0', 'aria-label': 'Narrative summary' });
    var lastSummary = '';
    var copyBtn = h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: function () { if (lastSummary) MT.copy(lastSummary); } }, '📋 Copy summary');
    var printBtn = h('button.btn.btn-sm', { type: 'button', onclick: function () { MT.print(container); } }, '🖨 Print');
    headBox.appendChild(h('div.result-label', 'Interpretation'));
    headBox.appendChild(headline);
    headBox.appendChild(dxRow);
    headBox.appendChild(hintsBox);
    headBox.appendChild(h('div.row.c2-no-print', { style: '--gap:.5rem;margin-top:.6rem' }, copyBtn, printBtn));
    var summaryCard = h('section.card', h('h2', { style: 'font-size:1.05rem' }, '9 · Narrative summary'), summaryPre, h('div.row.c2-no-print', { style: '--gap:.5rem;margin-top:.6rem' }, h('button.btn.btn-sm', { type: 'button', onclick: function () { if (lastSummary) MT.copy(lastSummary); } }, '📋 Copy')));

    var resultsWrap = h('div.stack', { style: 'margin-top:16px' });
    container.appendChild(h('div.split', h('div.c2-no-print', form), h('div.stack.sticky-top', headBox, h('p.small.muted', { style: 'margin:0' }, 'Steps 1–8 are below. The interpretation updates as you type.'))));
    container.appendChild(resultsWrap);
    resultsWrap.appendChild(h('h2.section-title', 'Step by step'));
    resultsWrap.appendChild(stepsHost);
    resultsWrap.appendChild(ddxHost);
    resultsWrap.appendChild(summaryCard);
    resultsWrap.appendChild(refsBlock(ABG_REFS));

    function step(n, title, s, badgeText, extraClass) {
      var lines = (s && s.lines) || [];
      return h('section.card.c2-step' + (s && s.status === 'na' ? '.is-na' : '') + (extraClass || ''),
        h('div.c2-step-head', h('span.c2-num', { 'aria-hidden': 'true' }, String(n)), h('h3', h('span.sr-only', 'Step ' + n + ': '), title), badgeText ? statusBadge(s.status, badgeText) : null),
        lines.map(function (l) { return h('p', l); }));
    }

    function update() {
      var vals = {}, errors = 0;
      FIELDS.forEach(function (d) {
        var e = els[d.id], raw = e.input.value, n = MT.num(raw);
        e.err.textContent = ''; e.input.removeAttribute('aria-invalid');
        if (raw && raw.trim() && n == null) { e.err.textContent = 'Enter a number'; e.input.setAttribute('aria-invalid', 'true'); errors++; return; }
        if (n == null) return;
        var u = unitFor(d, prefs);
        var base = d.fio2 ? (n > 1 ? n / 100 : n) : n * u.f;
        if (base < d.range[0] - 1e-9 || base > d.range[1] + 1e-9) {
          e.err.textContent = d.fio2 ? 'Enter 0.21–1.0 (or 21–100%)' : 'Plausible range ' + displayNum(d.range[0] / u.f) + '–' + displayNum(d.range[1] / u.f) + ' ' + u.label;
          e.input.setAttribute('aria-invalid', 'true'); errors++; return;
        }
        vals[d.id] = base;
      });
      var alt = readAlt();
      if (alt.error) errors++; else vals.pb = alt.pb;
      var res = AB.interpret(vals, { gasUnit: prefs.gas });
      MT.clear(dxRow); MT.clear(hintsBox); MT.clear(stepsHost); MT.clear(ddxHost);
      headBox.className = 'result';
      if (!res.complete) {
        headline.textContent = 'Enter pH, PaCO₂ and HCO₃⁻ to start.';
        hintsBox.appendChild(h('p.small.muted', { style: 'margin:0' }, errors ? 'Check the highlighted fields.' : 'Still needed: ' + res.missing.join(', ') + '. Add Na⁺, Cl⁻ and albumin for the anion gap, and PaO₂ with FiO₂ for oxygenation.'));
        stepsHost.appendChild(MT.ui.empty('🩸', 'No interpretation yet', 'Type values from the blood gas, or load an example case to see how the steps work.'));
        summaryPre.textContent = '—'; lastSummary = ''; copyBtn.disabled = true;
        return;
      }
      copyBtn.disabled = false;
      headBox.className = 'result band-' + (res.status === 'ok' ? 'ok' : res.status);
      headline.textContent = res.headline;
      res.disorders.forEach(function (d) {
        var role = d.role === 'primary' ? 'primary' : d.role === 'hidden' ? 'hidden by normal HCO₃⁻' : 'additional';
        dxRow.appendChild(MT.ui.badge(AB.labelOf(d) + ' · ' + role, d.role === 'primary' ? 'accent' : 'warn'));
      });
      if (errors) hintsBox.appendChild(MT.ui.alert('warn', null, 'Some fields are out of range and were ignored — check the highlighted values.'));
      if (res.flags.indexOf('inconsistent') >= 0) hintsBox.appendChild(MT.ui.alert('danger', 'Values do not fit together', 'pH, PaCO₂ and HCO₃⁻ disagree by more than 10% (step 1). Recheck before acting on this interpretation.'));
      res.hints.forEach(function (t) { hintsBox.appendChild(MT.ui.alert('info', null, t)); });

      var s = res.steps;
      stepsHost.appendChild(step(1, 'Internal consistency', s.consistency, s.consistency.consistent ? 'Consistent' : 'Inconsistent'));
      var pBadge = { acidaemia: 'Acidaemia', alkalaemia: 'Alkalaemia', normal: 'Normal pH' }[s.primary.status];
      stepsHost.appendChild(step(2, 'Primary disorder', { status: s.primary.status === 'normal' ? 'info' : 'warn', lines: s.primary.lines }, pBadge));
      var cBadge = { appropriate: 'Appropriate', mixed: 'Mixed', none: '—', 'resp-acid': 'Too little', 'resp-alk': 'Too much', 'met-acid': 'Extra acidosis', 'met-alk': 'Extra alkalosis' }[s.compensation.verdict] || '';
      stepsHost.appendChild(step(3, 'Expected compensation', s.compensation, cBadge));
      stepsHost.appendChild(step(4, 'Anion gap', s.anionGap, s.anionGap.status === 'na' ? 'Needs Na⁺, Cl⁻' : s.anionGap.high ? 'Raised' : 'Normal'));
      stepsHost.appendChild(step(5, 'Delta ratio', s.delta, s.delta.status === 'na' ? 'Not applicable' : AB.isNum(s.delta.ratio) ? fmt(s.delta.ratio, 2) : 'HCO₃⁻ not low'));
      stepsHost.appendChild(step(6, 'Osmolar gap', s.osmolar, s.osmolar.status === 'na' ? 'Needs data' : s.osmolar.high ? 'Raised' : 'Normal'));
      var ox = s.oxygenation;
      var oBadge = ox.status === 'na' ? 'Needs PaO₂, FiO₂' : ox.hypoxaemic ? 'Respiratory failure' : ({ none: 'P/F > 300', mild: 'Mild range', moderate: 'Moderate range', severe: 'Severe range' }[ox.berlin]);
      stepsHost.appendChild(step(7, 'Oxygenation', ox, oBadge));
      // differentials
      var ddxCard = h('section.card.c2-step.c2-step-wide',
        h('div.c2-step-head', h('span.c2-num', { 'aria-hidden': 'true' }, '8'), h('h3', h('span.sr-only', 'Step 8: '), 'Differential diagnosis')));
      if (res.differentials.length) {
        ddxCard.appendChild(h('div.c2-ddx', res.differentials.map(function (d) {
          return h('div', h('h4', d.title), h('ul', d.items.map(function (i) { return h('li', i); })), d.extra ? h('p.small', { style: 'margin:.35rem 0 0' }, d.extra) : null, h('div.c2-src', 'Source: ' + d.source));
        })));
      } else ddxCard.appendChild(h('p', 'No acid–base disorder to explain.'));
      stepsHost.appendChild(ddxCard);
      lastSummary = res.summary;
      summaryPre.textContent = res.summary;
    }

    update();
    return function () { /* nothing to clean up: listeners die with the DOM */ };
  }

  function fillFromCase(c, prefs) {
    session.values = {};
    var v = c.values;
    FIELDS.forEach(function (d) {
      if (v[d.id] == null) return;
      var u = unitFor(d, prefs);
      session.values[d.id] = d.fio2 ? String(v[d.id]) : displayNum(v[d.id] / u.f);
    });
    if (v.altitude != null) {
      var stored = loadPrefs();
      if (stored.altMode === 'altitude') session.values.alt = String(Math.round(stored.altUnit === 'ft' ? v.altitude / 0.3048 : v.altitude));
      else { var pb = AB.baroFromAltitude(v.altitude); session.values.alt = displayNum(prefs.gas === 'kPa' ? pb / AB.MMHG_PER_KPA : pb); }
    }
  }

  /* ------------------------------------------------------------------ practice library */
  function hashStr(s) { var x = 2166136261; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
  /** Deterministic shuffle so the correct option is not always in the same place. */
  function optionOrder(c) {
    var idx = c.options.map(function (_, i) { return i; }), seed = hashStr(c.id);
    for (var i = idx.length - 1; i > 0; i--) { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; var j = seed % (i + 1); var t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    return idx;
  }
  function caseValueRows(c, prefs) {
    var v = c.values, out = [];
    function add(label, text) { out.push(h('div', h('span', label + ' '), text)); }
    var gp = function (mm) { return prefs.gas === 'kPa' ? (mm / AB.MMHG_PER_KPA).toFixed(1) + ' kPa (' + fmt(mm, 0) + ' mmHg)' : fmt(mm, 0) + ' mmHg (' + (mm / AB.MMHG_PER_KPA).toFixed(1) + ' kPa)'; };
    var lab = function (kind, x) { var u = KINDS[kind][prefs.lab === 'conv' ? 'conv' : 'si']; return displayNum(x / u.f) + ' ' + u.label; };
    add('pH', fmt(v.ph, 2));
    add('PaCO₂', gp(v.paco2));
    add('HCO₃⁻', fmt(v.hco3, 1) + ' mmol/L');
    if (v.pao2 != null) add('PaO₂', gp(v.pao2));
    if (v.fio2 != null) add('FiO₂', fmt(v.fio2, 2));
    if (v.na != null) add('Na⁺', fmt(v.na, 0));
    if (v.cl != null) add('Cl⁻', fmt(v.cl, 0));
    if (v.albumin != null) add('Albumin', lab('albumin', v.albumin));
    if (v.glucose != null) add('Glucose', lab('glucose', v.glucose));
    if (v.urea != null) add(prefs.lab === 'conv' ? 'BUN' : 'Urea', lab('urea', v.urea));
    if (v.lactate != null) add('Lactate', lab('lactate', v.lactate));
    if (v.osm != null) add('Osmolality', fmt(v.osm, 0) + ' mOsm/kg');
    if (v.age != null) add('Age', fmt(v.age, 0) + ' y');
    if (v.altitude != null) add('Altitude', fmt(v.altitude, 0) + ' m');
    return out;
  }

  function renderPractice(container, ctx) {
    var prefs = loadPrefs();
    var prog = loadObj(PRACTICE_KEY, { v: 1, answers: {} });
    if (!prog.answers || typeof prog.answers !== 'object') prog.answers = {};
    var scoreHost = h('div.c2-progress');
    function score() {
      var answered = 0, correct = 0;
      AB.CASES.forEach(function (c) { var a = prog.answers[c.id]; if (typeof a === 'number' && a >= 0 && a < c.options.length) { answered++; if (a === c.answer) correct++; } });
      MT.clear(scoreHost);
      scoreHost.appendChild(h('div.stat', h('span.stat-value', answered + ' / ' + AB.CASES.length), h('span.stat-label', 'answered')));
      scoreHost.appendChild(h('div.stat', h('span.stat-value', String(correct)), h('span.stat-label', 'correct')));
      scoreHost.appendChild(h('div.grow', h('div.progress', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(AB.CASES.length), 'aria-valuenow': String(answered), 'aria-label': 'Cases answered' }, h('span', { style: 'width:' + Math.round(answered / AB.CASES.length * 100) + '%' }))));
      scoreHost.appendChild(h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () {
        MT.confirm('Clear your practice answers?', { okLabel: 'Clear', danger: true }).then(function (ok) { if (ok) { prog = { v: 1, answers: {} }; MT.store.set(PRACTICE_KEY, prog); MT.clear(list); draw(); score(); } });
      } }, '↺ Reset'));
    }
    container.appendChild(h('section.card', h('p', { style: 'margin-top:0' }, AB.CASES.length + ' worked blood gases, from single disorders to triple mixed disorders. Work through the steps yourself, pick an answer, then compare with the stepwise explanation. Values show in your chosen units (', prefs.gas, ', ', prefs.lab === 'conv' ? 'mg/dL' : 'SI', ').'), scoreHost));
    var list = h('div.stack', { style: 'margin-top:14px' });
    container.appendChild(list);

    function caseCard(c, n) {
      var order = optionOrder(c);
      var feedback = h('div', { 'aria-live': 'polite' });
      var buttons = [];
      var opts = h('div.c2-opts', { role: 'group', 'aria-label': 'Answer options for case ' + n });
      order.forEach(function (oi, pos) {
        var b = h('button.c2-opt', { type: 'button', 'data-oi': String(oi), onclick: function () { choose(oi); } }, h('span.c2-mark', { 'aria-hidden': 'true' }, String.fromCharCode(65 + pos)), h('span', c.options[oi]));
        buttons.push(b); opts.appendChild(b);
      });
      function choose(oi) {
        prog.answers[c.id] = oi; MT.store.set(PRACTICE_KEY, prog);
        reveal(oi); score();
        feedback.setAttribute('tabindex', '-1'); // options are now disabled: move focus to the feedback
        try { feedback.focus({ preventScroll: false }); } catch (e) { feedback.focus(); }
      }
      function reveal(oi) {
        buttons.forEach(function (b) {
          var bi = Number(b.getAttribute('data-oi'));
          b.disabled = true;
          b.classList.toggle('is-correct', bi === c.answer);
          b.classList.toggle('is-wrong', bi === oi && oi !== c.answer);
          b.setAttribute('aria-pressed', String(bi === oi));
          var mark = b.querySelector('.c2-mark');
          if (bi === c.answer) mark.textContent = '✓'; else if (bi === oi) mark.textContent = '✗';
        });
        var r = AB.interpret(AB.caseInput(c.values), { gasUnit: prefs.gas });
        MT.clear(feedback);
        feedback.appendChild(h('div.stack.stack-sm', { style: 'margin-top:12px' },
          MT.ui.alert(oi === c.answer ? 'ok' : 'warn', oi === c.answer ? 'Correct' : 'Not quite — the answer is: ' + c.options[c.answer], c.explanation),
          c.teaching && c.teaching.length ? h('div', h('strong', 'Teaching points'), h('ul.c2-note-list', { style: 'margin:.3rem 0 0' }, c.teaching.map(function (t) { return h('li', t); }))) : null,
          h('details.disclosure', h('summary', 'Interpreter output, step by step'), h('div.disclosure-body', h('pre.c2-summary', r.summary))),
          h('div.row', { style: '--gap:.5rem' },
            h('button.btn.btn-sm.btn-soft', { type: 'button', onclick: function () { fillFromCase(c, loadPrefs()); ctx.navigate('#/abg'); } }, 'Open in the interpreter →'),
            h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: function () { delete prog.answers[c.id]; MT.store.set(PRACTICE_KEY, prog); var fresh = caseCard(c, n); card.replaceWith(fresh); score(); } }, 'Try again'))));
      }
      var card = h('section.card', { id: 'c2-case-' + c.id },
        h('div.c2-case-head', MT.ui.badge('Case ' + n, 'accent'), h('h3', c.title)),
        h('p', { style: 'margin:.5rem 0 0' }, c.vignette),
        h('div.c2-case-vals', caseValueRows(c, prefs)),
        h('p', { style: 'margin:0 0 .5rem;font-weight:650' }, 'What is the acid–base diagnosis?'),
        opts, feedback);
      var prev = prog.answers[c.id];
      if (typeof prev === 'number' && prev >= 0 && prev < c.options.length) reveal(prev);
      return card;
    }
    function draw() { AB.CASES.forEach(function (c, i) { list.appendChild(caseCard(c, i + 1)); }); }
    draw(); score();
    var target = ctx.params[1];
    if (target) setTimeout(function () { var el = document.getElementById('c2-case-' + target); if (el) el.scrollIntoView({ block: 'start' }); }, 30);
  }

  MT.registerTool({
    id: 'abg', title: 'Blood gas interpreter', category: 'labs', icon: '🩸', order: 1,
    description: 'Stepwise acid–base and oxygenation interpretation: consistency, compensation, anion and delta gaps, osmolar gap, A–a gradient, P/F ratio — with a 17-case practice library.',
    keywords: ['abg', 'vbg', 'arterial blood gas', 'acid base', 'acidosis', 'alkalosis', 'anion gap', 'winters', 'delta ratio', 'osmolar gap', 'a-a gradient', 'pf ratio', 'ards', 'berlin', 'practice'],
    render: function (container, ctx) {
      if (!AB) return libMissing(container);
      var practice = ctx.params[0] === 'practice';
      var tabs = MT.ui.tabs([{ id: 'interp', label: 'Interpreter' }, { id: 'practice', label: 'Practice cases (' + AB.CASES.length + ')' }], practice ? 'practice' : 'interp', function (id) {
        ctx.navigate(id === 'practice' ? '#/abg/practice' : '#/abg');
      });
      tabs.classList.add('c2-no-print');
      container.appendChild(tabs);
      var host = h('div');
      container.appendChild(host);
      var cleanup = practice ? renderPractice(host, ctx) : renderInterpreter(host, ctx);
      container.appendChild(h('div', { style: 'margin-top:16px' }, MT.ui.disclaimer('Decision support and education only. Interpret blood gases with the clinical picture, trends and local laboratory reference ranges.')));
      return cleanup;
    }
  });

  /* ================================================================== electrolytes */
  var NA_UNIT = 'mmol/L';
  var GLU_UNITS = [{ id: 'mmol', label: 'mmol/L', factor: 1, system: 'si' }, { id: 'mgdl', label: 'mg/dL', factor: 1 / 18.016, system: 'conv' }];
  var WT_UNITS = [{ id: 'kg', label: 'kg', factor: 1, system: 'si' }, { id: 'lb', label: 'lb', factor: 0.45359237, system: 'conv' }];

  function tbwText(f, w) { return 'Total body water ' + fmt(f, 2) + ' × ' + fmt(w, 1) + ' kg = ' + fmt(f * w, 1) + ' L'; }

  var DEF_NA = {
    id: 'c2-corrected-na', name: 'Sodium corrected for hyperglycaemia',
    inputs: [
      { id: 'c2na', label: 'Measured sodium', type: 'number', unit: NA_UNIT, min: 90, max: 200 },
      { id: 'c2glu', label: 'Glucose', type: 'number', units: GLU_UNITS, min: 0.5, max: 200 }
    ],
    compute: function (v) {
      var k = AB.correctedSodium(v.c2na, v.c2glu, 1.6), hi = AB.correctedSodium(v.c2na, v.c2glu, 2.4);
      var eff = 2 * v.c2na + v.c2glu;
      var band = 'info', title, interp;
      if (hi < 135) { band = 'warn'; title = 'Hyponatraemia persists after correction'; interp = 'Even allowing for glucose, sodium is below 135 mmol/L: true (hypotonic) hyponatraemia needs its own assessment.'; }
      else if (k > 145) { band = 'warn'; title = 'Hypernatraemia after correction'; interp = 'Corrected sodium above 145 mmol/L indicates a water deficit, often with marked hypertonicity in hyperglycaemic states.'; }
      else if (v.c2glu * 18.016 <= 100) { title = 'No correction needed'; interp = 'Glucose is not raised, so the measured sodium stands.'; }
      else { title = 'Sodium is within 135–145 mmol/L once glucose is allowed for'; interp = 'The low measured sodium is explained by water shifting out of cells (translocational hyponatraemia).'; }
      return {
        label: 'Corrected sodium (Katz · Hillier)', value: fmt(k, 1) + ' · ' + fmt(hi, 1), unit: 'mmol/L', band: band, title: title, interpretation: interp,
        details: [
          { label: 'Katz (1.6 per 100 mg/dL)', value: fmt(k, 1) + ' mmol/L' },
          { label: 'Hillier (2.4 per 100 mg/dL)', value: fmt(hi, 1) + ' mmol/L' },
          { label: 'Glucose', value: fmt(v.c2glu, 1) + ' mmol/L = ' + fmt(v.c2glu * 18.016, 0) + ' mg/dL' },
          { label: 'Effective osmolality (2 Na + glucose)', value: fmt(eff, 0) + ' mOsm/kg' }
        ],
        warnings: v.c2glu * 18.016 > 400 ? ['Glucose above 400 mg/dL (22 mmol/L): Hillier found the true fall in sodium even larger than 2.4 per 100 mg/dL; treat the corrected value as a minimum.'] : []
      };
    },
    formula: 'Corrected Na = measured Na + factor × (glucose [mg/dL] − 100) ÷ 100\nKatz 1973: factor 1.6 · Hillier 1999: factor 2.4\nGlucose mg/dL = mmol/L × 18.016 (no correction at or below 100 mg/dL)',
    pearls: ['Hyperglycaemia draws water out of cells and dilutes sodium; the effect reverses as glucose falls, so corrected sodium predicts where sodium will go during treatment.', 'A corrected sodium that rises during DKA treatment signals free-water loss.', 'This is different from pseudohyponatraemia (severe hyperlipidaemia or paraproteinaemia with indirect ion-selective electrodes) — check with a blood-gas analyser sodium.'],
    references: [{ label: 'Katz MA. Hyperglycemia-induced hyponatremia — calculation of expected serum sodium depression. N Engl J Med 1973;289:843–4.' }, { label: 'Hillier TA, Abbott RD, Barrett EJ. Hyponatremia: evaluating the correction factor for hyperglycemia. Am J Med 1999;106:399–403.' }]
  };

  var DEF_CA = {
    id: 'c2-adjusted-ca', name: 'Albumin-adjusted calcium (Payne)',
    inputs: [
      { id: 'c2ca', label: 'Total calcium', type: 'number', units: [{ id: 'mmol', label: 'mmol/L', factor: 1, system: 'si' }, { id: 'mgdl', label: 'mg/dL', factor: 1 / 4.008, system: 'conv' }], min: 0.5, max: 6 },
      { id: 'c2alb', label: 'Albumin', type: 'number', units: [{ id: 'gl', label: 'g/L', factor: 1, system: 'si' }, { id: 'gdl', label: 'g/dL', factor: 10, system: 'conv' }], min: 5, max: 70 }
    ],
    compute: function (v) {
      var adj = AB.adjustedCalcium(v.c2ca, v.c2alb);
      return {
        label: 'Adjusted calcium', value: fmt(adj, 2), unit: 'mmol/L', band: 'info',
        title: fmt(adj * 4.008, 1) + ' mg/dL',
        interpretation: 'Estimated total calcium if albumin were 40 g/L (4.0 g/dL). Compare with your laboratory\'s adjusted-calcium reference range (typically about 2.2–2.6 mmol/L).',
        details: [{ label: 'Measured total calcium', value: fmt(v.c2ca, 2) + ' mmol/L (' + fmt(v.c2ca * 4.008, 1) + ' mg/dL)' }, { label: 'Adjustment', value: (adj - v.c2ca >= 0 ? '+' : '') + fmt(adj - v.c2ca, 2) + ' mmol/L' }],
        warnings: ['Albumin adjustment is unreliable in critical illness, kidney failure, extremes of albumin and acid–base disturbance — measure ionised calcium when it matters.']
      };
    },
    formula: 'Payne 1973: adjusted Ca (mg/dL) = Ca (mg/dL) − albumin (g/dL) + 4.0\nSI equivalent: adjusted Ca (mmol/L) ≈ Ca + 0.025 × (40 − albumin [g/L])',
    pearls: ['Laboratories may use locally derived equations, so results can differ slightly from your laboratory\'s adjusted calcium.', 'Alkalaemia increases calcium binding to albumin and lowers ionised calcium even when total calcium is normal.'],
    references: [{ label: 'Payne RB, Little AJ, Williams RB, Milner JR. Interpretation of serum calcium in patients with abnormal serum proteins. BMJ 1973;4:643–6.' }]
  };

  var DEF_HYPO = {
    id: 'c2-hyponatraemia', name: 'Hyponatraemia correction planner (Adrogué–Madias)',
    inputs: [
      { type: 'note', text: 'For planned correction of chronic (> 48 h or unknown duration) hyponatraemia. Severe symptoms are an emergency: follow your local hypertonic saline protocol and seek senior help.' },
      { id: 'c2hna', label: 'Serum sodium', type: 'number', unit: 'mmol/L', min: 90, max: 160 },
      { id: 'c2hwt', label: 'Weight', type: 'number', units: WT_UNITS, min: 1, max: 300 },
      { id: 'c2hage', label: 'Age', type: 'number', unit: 'years', min: 0, max: 120 },
      { id: 'c2hsex', label: 'Sex', type: 'radio', options: [{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }] },
      { id: 'c2hinf', label: 'Infusate', type: 'select', options: AB.INFUSATES.map(function (f) { return { value: f.id, label: f.label + ' (Na⁺ ' + f.na + (f.k ? ', K⁺ ' + f.k : '') + ')' }; }).concat([{ value: 'custom', label: 'Custom — enter sodium below' }]) },
      { id: 'c2hcustom', label: 'Custom infusate Na⁺', type: 'number', unit: 'mmol/L', min: 0, max: 1000, required: false, hint: 'Used only when "Custom" is selected.' },
      { id: 'c2hk', label: 'Potassium added to the infusate', type: 'number', unit: 'mmol/L', min: 0, max: 80, required: false, hint: 'Added potassium raises sodium like sodium does (Adrogué–Madias).' },
      { id: 'c2htarget', label: 'Planned rise over the period', type: 'number', unit: 'mmol/L', min: 0.5, max: 20, hint: 'Never more than 10 mmol/L in 24 h (8 if high risk of osmotic demyelination).' },
      { id: 'c2hhours', label: 'Over', type: 'number', unit: 'hours', min: 1, max: 24, default: 24 },
      { type: 'heading', label: 'Osmotic demyelination risk factors (Na ≤ 105 mmol/L is detected automatically)' },
      { id: 'c2hr1', label: 'Hypokalaemia', type: 'bool' },
      { id: 'c2hr2', label: 'Alcohol use disorder', type: 'bool' },
      { id: 'c2hr3', label: 'Malnutrition', type: 'bool' },
      { id: 'c2hr4', label: 'Advanced liver disease', type: 'bool' }
    ],
    compute: function (v) {
      var inf = AB.INFUSATES.filter(function (f) { return f.id === v.c2hinf; })[0];
      var infNa = v.c2hinf === 'custom' ? v.c2hcustom : inf && inf.na;
      if (infNa == null || !isFinite(infNa)) return null;
      var infK = (v.c2hk || 0) + (inf && v.c2hinf !== 'custom' ? inf.k : 0);
      var highRisk = v.c2hr1 || v.c2hr2 || v.c2hr3 || v.c2hr4;
      var p = AB.hyponatraemiaPlan({ na: v.c2hna, weight: v.c2hwt, age: v.c2hage, sex: v.c2hsex, infusateNa: infNa, infusateK: infK, target: v.c2htarget, hours: v.c2hhours, highRisk: highRisk });
      if (!p) return null;
      var name = v.c2hinf === 'custom' ? 'the custom infusate' : inf.label;
      var warnings = [];
      if (v.c2hna >= 135) warnings.push('Sodium is not low (≥ 135 mmol/L): this planner is for hyponatraemia.');
      if (p.error === 'not-raising') {
        return { label: 'Expected change per litre', value: fmt(p.perLitre, 2), unit: 'mmol/L', band: 'danger', title: 'This fluid will not raise the sodium',
          interpretation: 'Its sodium (plus potassium) is not higher than the patient\'s sodium, so it will lower or not change the serum sodium.', details: [{ label: 'Total body water', value: tbwText(p.tbwFraction, v.c2hwt) }], warnings: warnings };
      }
      if (p.exceeds) warnings.push('The planned rise of ' + fmt(p.targetRequested, 1) + ' mmol/L exceeds the limit of ' + p.limit24 + ' mmol/L in any 24 h' + (p.highRisk ? ' for a patient at high risk of osmotic demyelination' : '') + '. The plan below is capped at ' + fmt(p.target, 1) + ' mmol/L.');
      if (p.highRisk) warnings.push('High risk of osmotic demyelination' + (v.c2hna <= 105 ? ' (sodium ≤ 105 mmol/L)' : '') + ': limit the rise to 8 mmol/L in any 24 h.');
      warnings.push('The formula assumes no other sodium or water gains or losses. A water diuresis (after correcting hypovolaemia, stopping thiazides or desmopressin, or treating cortisol deficiency) can raise sodium much faster than predicted — check sodium frequently and stop or reverse if overcorrecting, per local protocol.');
      return {
        label: 'Infusion rate', value: fmt(p.rateMlH, p.rateMlH < 10 ? 1 : 0), unit: 'mL/h', band: p.exceeds ? 'danger' : p.highRisk ? 'warn' : 'info',
        title: fmt(p.volumeL * 1000, 0) + ' mL of ' + name + ' over ' + fmt(v.c2hhours, 0) + ' h',
        interpretation: 'Predicted rise ' + fmt(p.target, 1) + ' mmol/L, to about ' + fmt(p.projectedNa, 0) + ' mmol/L. Each litre changes sodium by about ' + fmt(p.perLitre, 2) + ' mmol/L (≈ ' + fmt(p.mlPerMmol, 0) + ' mL per 1 mmol/L).',
        details: [
          { label: 'Total body water', value: tbwText(p.tbwFraction, v.c2hwt) },
          { label: 'Change per litre', value: '(' + fmt(infNa, 0) + (infK ? ' + ' + fmt(infK, 0) : '') + ' − ' + fmt(v.c2hna, 0) + ') ÷ (' + fmt(p.tbw, 1) + ' + 1) = ' + fmt(p.perLitre, 2) + ' mmol/L' },
          { label: 'Limit for any 24 h', value: p.limit24 + ' mmol/L' }
        ],
        warnings: warnings
      };
    },
    formula: 'Adrogué–Madias: Δ[Na⁺] per litre = (infusate Na⁺ + K⁺ − serum Na⁺) ÷ (total body water + 1)\nTotal body water = weight × 0.6 (children, men < 65 y), 0.5 (women < 65 y, men ≥ 65 y), 0.45 (women ≥ 65 y)\nVolume = planned rise ÷ Δ per litre; rate = volume ÷ hours',
    pearls: ['Limits for chronic hyponatraemia: no more than 10 mmol/L in the first 24 h (European guideline 2014: and 8 mmol/L in each further 24 h until 130 mmol/L); 8 mmol/L in any 24 h if the risk of osmotic demyelination is high (US expert panel 2013).', 'Age cut-offs for total body water (child < 18 y, older adult ≥ 65 y) are conventions used by this tool.', 'Recheck sodium frequently; the formula is a starting estimate, not a prescription.'],
    references: [
      { label: 'Adrogué HJ, Madias NE. Hyponatremia. N Engl J Med 2000;342:1581–9.' },
      { label: 'Spasovski G et al. Clinical practice guideline on diagnosis and treatment of hyponatraemia. Eur J Endocrinol 2014;170:G1–47.' },
      { label: 'Verbalis JG et al. Diagnosis, evaluation, and treatment of hyponatremia: expert panel recommendations. Am J Med 2013;126(10 Suppl 1):S1–42.' }
    ]
  };

  var DEF_HYPER = {
    id: 'c2-free-water', name: 'Free-water deficit and hypernatraemia plan',
    inputs: [
      { id: 'c2fna', label: 'Serum sodium', type: 'number', unit: 'mmol/L', min: 120, max: 200 },
      { id: 'c2fwt', label: 'Weight', type: 'number', units: WT_UNITS, min: 1, max: 300 },
      { id: 'c2fage', label: 'Age', type: 'number', unit: 'years', min: 0, max: 120 },
      { id: 'c2fsex', label: 'Sex', type: 'radio', options: [{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }] },
      { id: 'c2ffluid', label: 'Replacement fluid', type: 'select', options: [{ value: '0', label: '5% glucose (Na⁺ 0)' }, { value: '31', label: '0.18% sodium chloride with 4% glucose (Na⁺ 31)' }, { value: '77', label: '0.45% sodium chloride (Na⁺ 77)' }] },
      { id: 'c2ffall', label: 'Planned fall over the period', type: 'number', unit: 'mmol/L', min: 0.5, max: 20, hint: 'Chronic hypernatraemia: about 10 mmol/L per 24 h (Adrogué & Madias).' },
      { id: 'c2fhours', label: 'Over', type: 'number', unit: 'hours', min: 1, max: 24, default: 24 }
    ],
    compute: function (v) {
      var p = AB.hypernatraemiaPlan({ na: v.c2fna, weight: v.c2fwt, age: v.c2fage, sex: v.c2fsex, infusateNa: Number(v.c2ffluid), fall: v.c2ffall, hours: v.c2fhours });
      if (!p) return null;
      var warnings = [];
      if (v.c2fna <= 145) warnings.push('Sodium is not raised (≤ 145 mmol/L): there is no free-water deficit to replace.');
      if (p.error === 'not-lowering') return { label: 'Free-water deficit', value: fmt(Math.max(0, p.deficit), 1), unit: 'L', band: 'warn', title: 'This fluid will not lower the sodium', interpretation: 'Choose a fluid with less sodium than the patient.', warnings: warnings };
      if (p.exceeds) warnings.push('A fall of ' + fmt(p.fallRequested, 1) + ' mmol/L exceeds about 10 mmol/L per 24 h recommended for chronic hypernatraemia; plan capped at ' + fmt(p.fall, 1) + ' mmol/L. Faster correction is reasonable only when hypernatraemia developed over hours.');
      warnings.push('Add ongoing losses (urine, GI, insensible) to the planned volume; the formula covers the existing deficit only. Use enteral water where possible and recheck sodium frequently.');
      return {
        label: 'Free-water deficit', value: fmt(Math.max(0, p.deficit), 1), unit: 'L', band: p.exceeds ? 'danger' : 'info',
        title: 'Plan: ' + fmt(p.rateMlH, 0) + ' mL/h (' + fmt(p.volumeL * 1000, 0) + ' mL over ' + fmt(v.c2fhours, 0) + ' h) for a fall of ' + fmt(p.fall, 1) + ' mmol/L',
        interpretation: 'Deficit = TBW × (Na ÷ 140 − 1). Each litre of the chosen fluid lowers sodium by about ' + fmt(-p.perLitre, 2) + ' mmol/L (Adrogué–Madias), to about ' + fmt(p.projectedNa, 0) + ' mmol/L.',
        details: [{ label: 'Total body water', value: tbwText(p.tbwFraction, v.c2fwt) }, { label: 'Change per litre', value: '(' + v.c2ffluid + ' − ' + fmt(v.c2fna, 0) + ') ÷ (' + fmt(p.tbw, 1) + ' + 1) = ' + fmt(p.perLitre, 2) + ' mmol/L' }],
        warnings: warnings
      };
    },
    formula: 'Free-water deficit = total body water × (Na⁺ ÷ 140 − 1)\nAdrogué–Madias: Δ[Na⁺] per litre = (infusate Na⁺ − serum Na⁺) ÷ (total body water + 1)\nTotal body water fractions as in the hyponatraemia planner',
    pearls: ['The deficit underestimates needs if losses continue; reassess clinically and with repeated sodium measurements.', 'Hypernatraemia almost always means lack of access to water or inability to respond to thirst — address the cause.'],
    references: [{ label: 'Adrogué HJ, Madias NE. Hypernatremia. N Engl J Med 2000;342:1493–9.' }]
  };

  function renderKMg(container) {
    function card(title, items, source) {
      return h('section.card', h('h2', { style: 'font-size:1.05rem' }, title), h('ul.c2-note-list', { style: 'margin:0' }, items.map(function (i) { return h('li', i); })), source ? h('div.c2-src', source) : null);
    }
    container.appendChild(MT.ui.alert('info', 'Qualitative reference only', 'Doses, concentrations and infusion rates for potassium, magnesium, calcium and insulin–glucose are deliberately not given here — use your local protocol and formulary.'));
    container.appendChild(h('div.grid', { style: '--min:280px;margin-top:12px' },
      card('Hyperkalaemia', [
        'Severity (UK Kidney Association): mild 5.5–5.9, moderate 6.0–6.4, severe ≥ 6.5 mmol/L.',
        'ECG: peaked T waves, flattened or absent P waves, broad QRS, sine wave, bradycardia, VF — but a normal ECG does not exclude danger.',
        'Exclude pseudohyperkalaemia (haemolysis, delayed processing, EDTA contamination, very high platelets or white cells) without delaying treatment if the ECG is abnormal.',
        'Treatment principles: protect the myocardium (IV calcium) if ECG changes; shift potassium into cells (insulin–glucose, salbutamol); remove potassium (stop sources, binders, dialysis); monitor glucose and potassium.',
        'Look for the cause: kidney injury, drugs (ACE inhibitors, ARBs, spironolactone, trimethoprim, NSAIDs, heparin), rhabdomyolysis, tissue breakdown, hypoaldosteronism.'
      ], 'UK Kidney Association. Clinical practice guideline: treatment of acute hyperkalaemia in adults.'),
      card('Hypokalaemia', [
        'Causes: GI losses, diuretics, mineralocorticoid excess, intracellular shift (insulin, β-agonists, alkalosis, refeeding), magnesium deficiency.',
        'ECG: T-wave flattening, U waves, ST depression, QT/QU prolongation, ventricular ectopy and arrhythmias (especially with digoxin).',
        'Check magnesium: hypomagnesaemia keeps potassium low until corrected.',
        'Never give potassium as an IV bolus; follow local policy for concentration, rate and monitoring of IV potassium.'
      ]),
      card('Hypomagnesaemia', [
        'Causes: proton-pump inhibitors, diuretics, alcohol, diarrhoea, refeeding, aminoglycosides, cisplatin, ciclosporin.',
        'Effects: refractory hypokalaemia and hypocalcaemia, arrhythmias including torsades de pointes, tremor, tetany, seizures.',
        'Magnesium is mainly intracellular: a normal serum level does not exclude depletion.'
      ]),
      card('Hypermagnesaemia', [
        'Usually kidney failure plus magnesium-containing laxatives or antacids, or IV magnesium therapy (e.g. pre-eclampsia).',
        'Effects progress from loss of tendon reflexes to hypotension, bradycardia and heart block, then respiratory depression.',
        'Monitor reflexes, respiratory rate and urine output during magnesium infusions, per local protocol.'
      ])));
  }

  var ELEC_TABS = [
    { id: 'sodium', label: 'Na⁺ & glucose' },
    { id: 'calcium', label: 'Calcium' },
    { id: 'hyponatraemia', label: 'Hyponatraemia plan' },
    { id: 'free-water', label: 'Free water' },
    { id: 'potassium', label: 'K⁺ & Mg²⁺ notes' }
  ];
  var elecState = { tab: 'sodium' };

  MT.registerTool({
    id: 'electrolytes', title: 'Electrolytes', category: 'labs', icon: '🧂', order: 2,
    description: 'Sodium corrected for glucose, albumin-adjusted calcium, Adrogué–Madias hyponatraemia planner with safe limits, free-water deficit, and potassium/magnesium notes.',
    keywords: ['sodium', 'hyponatraemia', 'hyponatremia', 'hypernatraemia', 'adrogue', 'madias', 'free water deficit', 'corrected calcium', 'payne', 'katz', 'hillier', 'potassium', 'magnesium', 'osmotic demyelination'],
    render: function (container, ctx) {
      if (!AB) return libMissing(container);
      var want = ctx.params[0];
      if (ELEC_TABS.some(function (t) { return t.id === want; })) elecState.tab = want;
      var host = h('div');
      function show(id) {
        elecState.tab = id;
        MT.clear(host);
        if (id === 'potassium') renderKMg(host);
        else MT.calc.render({ sodium: DEF_NA, calcium: DEF_CA, hyponatraemia: DEF_HYPO, 'free-water': DEF_HYPER }[id], host);
      }
      container.appendChild(MT.ui.tabs(ELEC_TABS, elecState.tab, show));
      container.appendChild(host);
      show(elecState.tab);
      container.appendChild(h('div', { style: 'margin-top:16px' }, MT.ui.disclaimer('Decision support only. Electrolyte corrections need frequent laboratory monitoring and must follow local protocols.')));
    }
  });
})();
