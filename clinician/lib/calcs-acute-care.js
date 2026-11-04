/* Clinician Toolkit — C1b calculator definitions
 * Acute & critical care, emergency decision rules, respiratory & infection, neurology,
 * gastroenterology, psychiatry & substance use, geriatrics, obstetrics & neonatal, VTE and sleep.
 *
 * Schema: assets/js/core.js section 9. Listed automatically by clinician/tools/calculators.js
 * at #/calculators/<id>. Every compute() is pure (no DOM, no MT); numbers arrive in the base unit
 * (first entry of `units`); compute() returns null only when no meaningful result is possible.
 *
 * Each definition cites its source in a comment and in `references`. Instrument wording:
 *  - PHQ-9 and GAD-7: developed by Drs Spitzer, Williams, Kroenke and colleagues with an educational
 *    grant from Pfizer Inc.; no permission required to reproduce, translate, display or distribute.
 *  - AUDIT / AUDIT-C: WHO (Babor et al., 2nd ed. 2001), reproduced with attribution.
 *  - NIHSS: NINDS, public domain.  CIWA-Ar: "not copyrighted and may be reproduced freely" (Sullivan 1989).
 *  - COWS: Wesson & Ling 2003.  4AT: free to use (www.the4at.com).
 *  - EPDS: copyright Royal College of Psychiatrists, which requires written permission for republication
 *    (including online), so the item text is NOT reproduced: the calculator totals item scores entered
 *    from a completed official form.
 *  - Clinical Frailty Scale 2.0: copyright Rockwood/Dalhousie University; official level names with
 *    brief summaries only (use the official chart).  STOP-Bang: copyright University Health Network;
 *    criteria paraphrased.
 */
(function (root, factory) {
  var defs = factory();
  if (typeof module === 'object' && module.exports) module.exports = defs;
  else root.MTCalcs = (root.MTCalcs || []).concat(defs);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* =========================== helpers (pure) =========================== */
  // Remove floating-point noise from unit conversion before comparing with published cut-offs.
  function snap(x) { return Math.round(x * 1e6) / 1e6; }
  function round(x, dp) { var f = Math.pow(10, dp || 0); return Math.round(x * f) / f; }
  function assign(o, extra) { if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k]; return o; }
  function heading(label) { return { type: 'heading', label: label }; }
  function note(text) { return { type: 'note', text: text }; }
  function bool(id, label, points, hint) { var o = { id: id, label: label, type: 'bool' }; if (points != null) o.points = points; if (hint) o.hint = hint; return o; }
  function radio(id, label, options, extra) { return assign({ id: id, label: label, type: 'radio', options: options }, extra); }
  function select(id, label, options, extra) { return assign({ id: id, label: label, type: 'select', options: options }, extra); }
  function num(id, label, unit, min, max, extra) {
    var o = { id: id, label: label, type: 'number', min: min, max: max };
    if (typeof unit === 'string') o.unit = unit; else if (unit) o.units = unit;
    return assign(o, extra);
  }
  // [[value, label, hint?], ...] -> options whose points equal their value
  function scored(list) { return list.map(function (x) { var o = { value: x[0], label: x[1], points: x[0] }; if (x[2]) o.hint = x[2]; return o; }); }
  // [[value, descriptor], ...] -> select options labelled "value — descriptor" (instrument score shown in the label)
  function anchored(list) { return list.map(function (x) { return { value: x[0], label: x[1] ? x[0] + ' — ' + x[1] : String(x[0]), points: x[0] }; }); }
  function findInput(inputs, id) { for (var i = 0; i < inputs.length; i++) if (inputs[i].id === id) return inputs[i]; return null; }
  function findOption(inputs, id, value) {
    var inp = findInput(inputs, id); if (!inp || !inp.options) return null;
    for (var i = 0; i < inp.options.length; i++) if (String(inp.options[i].value) === String(value)) return inp.options[i];
    return null;
  }
  function optLabel(inputs, id, value) { var o = findOption(inputs, id, value); return o ? o.label : String(value); }
  function sumPoints(inputs, v) {
    var t = 0;
    inputs.forEach(function (inp) {
      var x = v[inp.id];
      if (inp.type === 'bool' && x && inp.points) t += inp.points;
      if ((inp.type === 'radio' || inp.type === 'select') && x != null) { var o = findOption(inputs, inp.id, x); if (o && typeof o.points === 'number') t += o.points; }
    });
    return t;
  }
  function tickedLabels(inputs, v, ids) {
    return inputs.filter(function (i) { return i.type === 'bool' && v[i.id] && (!ids || ids.indexOf(i.id) >= 0); }).map(function (i) { return i.label; });
  }
  function any(v, ids) { for (var i = 0; i < ids.length; i++) if (v[ids[i]]) return true; return false; }
  function result(o) {
    return { value: o.value == null ? null : o.value, unit: o.unit || '', label: o.label || 'Score', band: o.band || 'info', title: o.title || '',
      interpretation: o.interpretation || '', details: o.details || [], warnings: o.warnings || [] };
  }
  function itemDetails(inputs, v, ids) {
    return ids.map(function (id) { var inp = findInput(inputs, id); return { label: inp.label, value: optLabel(inputs, id, v[id]) }; });
  }
  function bandMax(a, b) { var r = { ok: 0, info: 1, warn: 2, danger: 3 }; return r[a] >= r[b] ? a : b; }

  var SUICIDE_SAFETY = 'Ask directly about suicidal thoughts, plans, intent and access to means today, and follow your local suicide-risk pathway. If there is immediate danger, do not leave the person alone and contact emergency services.';
  var DOI = 'https://doi.org/';

  /* Units (base unit first). */
  var U_TEMP = [{ id: 'c', label: '°C', factor: 1, system: 'si' }, { id: 'f', label: '°F', system: 'conv', toBase: function (f) { return (f - 32) * 5 / 9; }, fromBase: function (c) { return c * 9 / 5 + 32; } }];
  var U_PAO2 = [{ id: 'mmhg', label: 'mmHg', factor: 1, system: 'conv' }, { id: 'kpa', label: 'kPa', factor: 7.50062, system: 'si' }];
  var U_FIO2 = [{ id: 'pct', label: '%', factor: 1 }, { id: 'frac', label: 'fraction (0.21–1)', factor: 100 }];
  var U_HB = [{ id: 'gl', label: 'g/L', factor: 1, system: 'si' }, { id: 'gdl', label: 'g/dL', factor: 10, system: 'conv' }];
  var U_UREA = [{ id: 'mmol', label: 'mmol/L (urea)', factor: 1, system: 'si' }, { id: 'bun', label: 'mg/dL (BUN)', system: 'conv', toBase: function (x) { return x / 2.8; }, fromBase: function (x) { return x * 2.8; } }];

  var defs = [];

  /* ======================================================================
     CRITICAL CARE
     ====================================================================== */

  /* --- Glasgow Coma Scale with GCS-P -------------------------------------
     Teasdale G, Jennett B. Lancet 1974;2:81-4. Terminology, descriptors and non-testable (NT) handling
     from the structured approach: Teasdale G et al. Lancet Neurol 2014;13:844-54 (glasgowcomascale.org):
     an untestable component is recorded as NT, not 1, and no total is reported.
     GCS-P = GCS − Pupil Reactivity Score (0 both react, 1 one unreactive, 2 both unreactive), range 1–15:
     Brennan PM, Murray GD, Teasdale GM. J Neurosurg 2018;128:1612-20.
     Severity bands (head-injury convention): 13–15 mild, 9–12 moderate, 3–8 severe. */
  function gcsResult(inputs, v, name, withPupils) {
    var parts = [['E', 'eye', v.eye], ['V', 'verbal', v.verbal], ['M', 'motor', v.motor]];
    var nt = parts.filter(function (p) { return p[2] === 'NT'; });
    var notation = parts.map(function (p) { return p[0] + (p[2] === 'NT' ? 'NT' : p[2]); }).join(' ');
    var details = parts.map(function (p) { return { label: findInput(inputs, p[1]).label, value: optLabel(inputs, p[1], p[2]) + (p[2] === 'NT' ? '' : ' (' + p[2] + ')') }; });
    var warnings = [];
    if (nt.length) {
      if (withPupils && (v.pupils === 0 || v.pupils === 1 || v.pupils === 2)) warnings.push('GCS-P needs all three components, so it cannot be calculated while a component is non-testable.');
      return result({ value: notation, label: name + ' (components)', band: 'info',
        title: 'Total not calculated: ' + nt.map(function (p) { return p[0]; }).join(' and ') + ' non-testable',
        interpretation: 'Report the components (' + notation + ') rather than a sum. Scoring a non-testable component as 1 would understate the level of consciousness. Follow the testable components, especially the motor response, over time.',
        details: details, warnings: warnings });
    }
    var total = v.eye + v.verbal + v.motor;
    details.push({ label: 'Notation', value: notation });
    if (withPupils && (v.pupils === 0 || v.pupils === 1 || v.pupils === 2)) details.push({ label: 'GCS-P', value: (total - v.pupils) + ' (GCS ' + total + ' − pupil reactivity score ' + v.pupils + ')' });
    if (total <= 8) warnings.push('GCS ≤8 (coma): the airway is at risk. Call for senior and critical-care help and consider a definitive airway.');
    var o;
    if (total === 15) o = { band: 'ok', title: 'GCS 15: no impairment on the scale', interpretation: 'No impairment of consciousness on the GCS. After a head injury, GCS 13–15 is classed as mild; amnesia, vomiting, anticoagulant use and mechanism of injury then guide imaging.' };
    else if (total >= 13) o = { band: 'warn', title: 'Mild impairment (13–14)', interpretation: 'Mildly impaired consciousness (mild range 13–15 after head injury). Look for and treat causes (hypoxia, hypotension, hypoglycaemia, drugs, intracranial pathology) and repeat neurological observations frequently.' };
    else if (total >= 9) o = { band: 'danger', title: 'Moderate (9–12)', interpretation: 'Moderately impaired consciousness. Needs urgent senior assessment, a cause-focused work-up and close neurological observation; a fall of 2 or more points is a serious deterioration.' };
    else o = { band: 'danger', title: 'Severe (3–8)', interpretation: 'Severely impaired consciousness (coma). Emergency: protect the airway, treat reversible causes and involve critical care.' };
    return result(assign({ value: total, unit: '/ 15', label: name, details: details, warnings: warnings }, o));
  }
  var GCS_INPUTS = [
    note('Score the best response in each component. If something prevents assessment (intubation, swelling, paralysis), record NT (non-testable) rather than 1.'),
    radio('eye', 'Eye opening (E)', [
      { value: 4, label: 'Spontaneous', hint: 'Eyes open before any stimulus', points: 4 },
      { value: 3, label: 'To sound', hint: 'After a spoken or shouted request', points: 3 },
      { value: 2, label: 'To pressure', hint: 'After fingertip pressure stimulus', points: 2 },
      { value: 1, label: 'None', hint: 'No eye opening at any time, no interfering factor', points: 1 },
      { value: 'NT', label: 'Non-testable (NT)', hint: 'Eyes closed by a local factor, e.g. swelling' }
    ]),
    radio('verbal', 'Verbal response (V)', [
      { value: 5, label: 'Orientated', hint: 'Correctly gives name, place and date', points: 5 },
      { value: 4, label: 'Confused', hint: 'Not orientated but communicates coherently', points: 4 },
      { value: 3, label: 'Words', hint: 'Intelligible single words', points: 3 },
      { value: 2, label: 'Sounds', hint: 'Only moans or groans', points: 2 },
      { value: 1, label: 'None', hint: 'No audible response, no interfering factor', points: 1 },
      { value: 'NT', label: 'Non-testable (NT)', hint: 'Factor interfering with communication, e.g. intubation' }
    ]),
    radio('motor', 'Best motor response (M)', [
      { value: 6, label: 'Obeys commands', hint: 'Obeys a two-part request', points: 6 },
      { value: 5, label: 'Localising', hint: 'Brings hand above the clavicle to a stimulus on the head or neck', points: 5 },
      { value: 4, label: 'Normal flexion', hint: 'Bends arm at the elbow rapidly; features not predominantly abnormal', points: 4 },
      { value: 3, label: 'Abnormal flexion', hint: 'Bends arm at the elbow; features clearly predominantly abnormal', points: 3 },
      { value: 2, label: 'Extension', hint: 'Extends arm at the elbow', points: 2 },
      { value: 1, label: 'None', hint: 'No movement in arms or legs, no interfering factor', points: 1 },
      { value: 'NT', label: 'Non-testable (NT)', hint: 'Paralysed or other limiting factor' }
    ]),
    radio('pupils', 'Pupil reactivity to light (optional, for GCS-P)', [
      { value: 0, label: 'Both pupils react', hint: 'Pupil reactivity score 0' },
      { value: 1, label: 'One pupil unreactive', hint: 'Pupil reactivity score 1' },
      { value: 2, label: 'Both pupils unreactive', hint: 'Pupil reactivity score 2' },
      { value: 'NT', label: 'Cannot be assessed', hint: 'e.g. orbital swelling or eye injury' }
    ], { required: false })
  ];
  defs.push({
    id: 'gcs', name: 'Glasgow Coma Scale (GCS) with GCS-P', category: 'Critical care',
    summary: 'Level of consciousness from eye, verbal and motor responses, with non-testable components and the GCS-Pupils score.',
    keywords: ['gcs', 'coma', 'consciousness', 'head injury', 'tbi', 'trauma', 'pupils', 'gcs-p', 'neuro observations', 'avpu'],
    inputs: GCS_INPUTS,
    compute: function (v) { return gcsResult(GCS_INPUTS, v, 'GCS', true); },
    formula: 'GCS = E (1–4) + V (1–5) + M (1–6), range 3–15.\nNT (non-testable) components are reported as such and no total is given.\nGCS-P = GCS − pupil reactivity score (0 = both react, 1 = one unreactive, 2 = both unreactive), range 1–15.\nHead-injury severity: 13–15 mild, 9–12 moderate, 3–8 severe.',
    pearls: [
      'Use the structured approach: check for factors that interfere with communication or response, observe, then stimulate (sound, then fingertip, trapezius or supraorbital pressure) and rate the best response.',
      'Report the components (e.g. E3 V4 M5) as well as the total: the motor score carries the most prognostic information.',
      'A non-testable component is NT, never 1 (e.g. verbal in an intubated patient).',
      'GCS-P extends the prognostic range at the severe end; record which pupil is unreactive separately.',
      'Confounders: sedation, intoxication, hypoxia, hypotension, hypoglycaemia, post-ictal state, dysphasia, deafness and language barriers.',
      'For children under 5 years, use the paediatric GCS.'
    ],
    references: [
      { label: 'Teasdale G, Jennett B. Assessment of coma and impaired consciousness: a practical scale. Lancet 1974;2:81-4.', url: DOI + '10.1016/S0140-6736(74)91639-0' },
      { label: 'Teasdale G, Maas A, Lecky F, et al. The Glasgow Coma Scale at 40 years: standing the test of time. Lancet Neurol 2014;13:844-54.', url: DOI + '10.1016/S1474-4422(14)70120-6' },
      { label: 'Brennan PM, Murray GD, Teasdale GM. Simplifying the use of prognostic information in traumatic brain injury. Part 1: the GCS-Pupils score. J Neurosurg 2018;128:1612-20.', url: DOI + '10.3171/2017.12.JNS172780' },
      { label: 'Glasgow Coma Scale structured assessment aid: www.glasgowcomascale.org', url: 'https://www.glasgowcomascale.org' }
    ]
  });

  /* --- Paediatric GCS -----------------------------------------------------
     Modified GCS for infants and children: James HE. Pediatr Ann 1986;15:16-22; evaluated in
     Holmes JF et al. Acad Emerg Med 2005;12:814-9 (descriptors as in the MSD Manual table
     "Modified Glasgow Coma Scale for Infants and Children"). Same 3–15 range and NT handling as the GCS. */
  var PGCS_INPUTS = [
    note('Use the infant descriptors for preverbal children (typically under 2 years) and the child descriptors once the child is verbal. Record NT if a component cannot be tested.'),
    radio('eye', 'Eye opening (E)', [
      { value: 4, label: 'Spontaneous', points: 4 },
      { value: 3, label: 'To speech or sound', points: 3 },
      { value: 2, label: 'To pain', points: 2 },
      { value: 1, label: 'No response', points: 1 },
      { value: 'NT', label: 'Non-testable (NT)', hint: 'e.g. eyes swollen shut' }
    ]),
    radio('verbal', 'Best verbal response (V)', [
      { value: 5, label: 'Child: orientated, appropriate · Infant: coos and babbles', points: 5 },
      { value: 4, label: 'Child: confused · Infant: irritable cries', points: 4 },
      { value: 3, label: 'Child: inappropriate words · Infant: cries to pain', points: 3 },
      { value: 2, label: 'Child: incomprehensible sounds · Infant: moans to pain', points: 2 },
      { value: 1, label: 'No response', points: 1 },
      { value: 'NT', label: 'Non-testable (NT)', hint: 'e.g. intubated' }
    ]),
    radio('motor', 'Best motor response (M)', [
      { value: 6, label: 'Child: obeys commands · Infant: moves spontaneously and purposefully', points: 6 },
      { value: 5, label: 'Child: localises painful stimulus · Infant: withdraws to touch', points: 5 },
      { value: 4, label: 'Withdraws in response to pain', points: 4 },
      { value: 3, label: 'Abnormal flexion to pain (decorticate posturing)', points: 3 },
      { value: 2, label: 'Abnormal extension to pain (decerebrate posturing)', points: 2 },
      { value: 1, label: 'No response', points: 1 },
      { value: 'NT', label: 'Non-testable (NT)', hint: 'e.g. paralysed or neuromuscular blockade' }
    ])
  ];
  defs.push({
    id: 'gcs-paediatric', name: 'Paediatric Glasgow Coma Scale', category: 'Critical care',
    summary: 'Modified GCS for infants and young children, with infant and child descriptors for the verbal and motor responses.',
    keywords: ['pgcs', 'pediatric', 'paediatric', 'child', 'infant', 'coma', 'consciousness', 'head injury', 'gcs'],
    inputs: PGCS_INPUTS,
    compute: function (v) { return gcsResult(PGCS_INPUTS, v, 'Paediatric GCS', false); },
    formula: 'E (1–4) + V (1–5) + M (1–6) = 3–15, with age-appropriate verbal and motor descriptors.\nNon-testable components are reported as NT and no total is given.',
    pearls: [
      'Several paediatric adaptations exist (e.g. James, Adelaide and UK versions). Use the one your service uses, consistently.',
      'The motor response carries the most weight in preverbal and intubated children.',
      'Assess after correcting hypoxia, hypotension and hypoglycaemia, and note sedation or post-ictal state.',
      'Severity bands (13–15 mild, 9–12 moderate, 3–8 severe) are carried over from adult head-injury practice.'
    ],
    references: [
      { label: 'James HE. Neurologic evaluation and support in the child with an acute brain insult. Pediatr Ann 1986;15:16-22.' },
      { label: 'Holmes JF, Palchak MJ, MacFarlane T, Kuppermann N. Performance of the pediatric Glasgow Coma Scale in children with blunt head trauma. Acad Emerg Med 2005;12:814-9.', url: DOI + '10.1197/j.aem.2005.04.019' },
      { label: 'MSD Manual Professional: Modified Glasgow Coma Scale for infants and children.', url: 'https://www.msdmanuals.com/professional/multimedia/table/modified-glasgow-coma-scale-for-infants-and-children' }
    ]
  });

  /* --- NEWS2 -------------------------------------------------------------
     Royal College of Physicians. National Early Warning Score (NEWS) 2: standardising the assessment of
     acute-illness severity in the NHS. London: RCP, 2017. Chart 1 (scoring), Chart 2 (thresholds and
     triggers), Chart 3 (monitoring frequency) and Chart 4 (clinical response).
     SpO2 Scale 2 (target 88–92%): ≤83→3, 84–85→2, 86–87→1, 88–92 or ≥93 on air→0, 93–94 on O2→1,
     95–96 on O2→2, ≥97 on O2→3. */
  function news2Parts(v) {
    var rr = v.rr, sp = v.spo2, onO2 = v.o2 === 'o2', sbp = v.sbp, hr = v.hr, t = snap(v.temp);
    var p = {};
    p.rr = rr <= 8 ? 3 : rr <= 11 ? 1 : rr <= 20 ? 0 : rr <= 24 ? 2 : 3;
    if (Number(v.scale) === 2) p.spo2 = sp <= 83 ? 3 : sp <= 85 ? 2 : sp <= 87 ? 1 : (sp <= 92 || !onO2) ? 0 : sp <= 94 ? 1 : sp <= 96 ? 2 : 3;
    else p.spo2 = sp <= 91 ? 3 : sp <= 93 ? 2 : sp <= 95 ? 1 : 0;
    p.o2 = onO2 ? 2 : 0;
    p.sbp = sbp <= 90 ? 3 : sbp <= 100 ? 2 : sbp <= 110 ? 1 : sbp <= 219 ? 0 : 3;
    p.hr = hr <= 40 ? 3 : hr <= 50 ? 1 : hr <= 90 ? 0 : hr <= 110 ? 1 : hr <= 130 ? 2 : 3;
    p.acvpu = v.acvpu === 'A' ? 0 : 3;
    p.temp = t <= 35 ? 3 : t <= 36 ? 1 : t <= 38 ? 0 : t <= 39 ? 1 : 2;
    return p;
  }
  var NEWS2_INPUTS = [
    num('rr', 'Respiration rate', 'breaths/min', 0, 80, { step: 1 }),
    num('spo2', 'SpO₂', '%', 50, 100, { step: 1 }),
    radio('scale', 'SpO₂ scale', [
      { value: 1, label: 'Scale 1 (standard)' },
      { value: 2, label: 'Scale 2: prescribed target 88–92%', hint: 'Only for hypercapnic respiratory failure, with the target documented by a clinician' }
    ], { default: 1 }),
    radio('o2', 'Air or oxygen?', [
      { value: 'air', label: 'Air', points: 0 },
      { value: 'o2', label: 'Supplemental oxygen (any device)', points: 2 }
    ]),
    num('sbp', 'Systolic blood pressure', 'mmHg', 30, 300, { step: 1 }),
    num('hr', 'Pulse', 'beats/min', 20, 250, { step: 1 }),
    radio('acvpu', 'Consciousness (ACVPU)', [
      { value: 'A', label: 'Alert', points: 0 },
      { value: 'C', label: 'New confusion', hint: 'New-onset or worsening confusion, delirium or other altered mentation; treat as new until confirmed otherwise', points: 3 },
      { value: 'V', label: 'Responds to voice', points: 3 },
      { value: 'P', label: 'Responds to pain', points: 3 },
      { value: 'U', label: 'Unresponsive', points: 3 }
    ]),
    num('temp', 'Temperature', U_TEMP, 25, 45, { step: 0.1 })
  ];
  defs.push({
    id: 'news2', name: 'NEWS2 (National Early Warning Score 2)', category: 'Critical care',
    summary: 'Aggregate early-warning score from 7 parameters, with SpO₂ scales 1 and 2, the single-parameter rule and the RCP response thresholds.',
    keywords: ['news', 'news2', 'early warning', 'ews', 'deterioration', 'track and trigger', 'vital signs', 'sepsis', 'escalation', 'observations'],
    inputs: NEWS2_INPUTS,
    compute: function (v) {
      var p = news2Parts(v);
      var total = p.rr + p.spo2 + p.o2 + p.sbp + p.hr + p.acvpu + p.temp;
      var names = { rr: 'Respiration rate', spo2: 'SpO₂ (scale ' + Number(v.scale) + ')', sbp: 'Systolic BP', hr: 'Pulse', acvpu: 'Consciousness', temp: 'Temperature' };
      var red = ['rr', 'spo2', 'sbp', 'hr', 'acvpu', 'temp'].filter(function (k) { return p[k] === 3; });
      var o;
      if (total >= 7) o = { band: 'danger', title: 'High clinical risk (7 or more): emergency response', freq: 'Continuous monitoring of vital signs',
        interpretation: 'Registered nurse immediately informs the medical team (at least specialist registrar level). Emergency assessment by a team with critical-care competencies, including advanced airway skills. Consider transfer to level 2 or 3 care (HDU or ICU); care in an environment with monitoring facilities.' };
      else if (total >= 5) o = { band: 'warn', title: 'Medium clinical risk (5–6): urgent response threshold', freq: 'Minimum every hour',
        interpretation: 'Registered nurse immediately informs the medical team and requests urgent assessment by a clinician or team with competencies in acute illness. Provide care in an environment with monitoring facilities.' };
      else if (red.length) o = { band: 'warn', title: 'Low–medium clinical risk: score of 3 in a single parameter', freq: 'Minimum every hour',
        interpretation: 'Urgent ward-based response: the registered nurse informs the medical team caring for the patient, who review and decide whether escalation of care is needed.' };
      else if (total >= 1) o = { band: 'ok', title: 'Low clinical risk (1–4)', freq: 'Minimum every 4–6 hours',
        interpretation: 'Ward-based response: a registered nurse assesses the patient and decides whether to increase monitoring frequency or escalate care.' };
      else o = { band: 'ok', title: 'Low clinical risk (0)', freq: 'Minimum every 12 hours', interpretation: 'Continue routine NEWS2 monitoring.' };
      var details = [
        { label: 'Respiration rate ' + v.rr + '/min', value: p.rr },
        { label: 'SpO₂ ' + v.spo2 + '% (scale ' + Number(v.scale) + ')', value: p.spo2 },
        { label: v.o2 === 'o2' ? 'On supplemental oxygen' : 'On air', value: p.o2 },
        { label: 'Systolic BP ' + v.sbp + ' mmHg', value: p.sbp },
        { label: 'Pulse ' + v.hr + '/min', value: p.hr },
        { label: 'Consciousness: ' + optLabel(NEWS2_INPUTS, 'acvpu', v.acvpu), value: p.acvpu },
        { label: 'Temperature ' + round(v.temp, 1) + ' °C', value: p.temp },
        { label: 'Monitoring frequency', value: o.freq }
      ];
      if (red.length) details.push({ label: 'Parameters scoring 3', value: red.map(function (k) { return names[k]; }).join(', ') });
      var warnings = [];
      if (Number(v.scale) === 2) warnings.push('SpO₂ Scale 2 is only for patients with a clinician-prescribed target of 88–92% (e.g. confirmed hypercapnic respiratory failure). Everyone else should be scored on Scale 1.');
      return result({ value: total, label: 'NEWS2 score', band: o.band, title: o.title, interpretation: o.interpretation, details: details, warnings: warnings });
    },
    formula: 'Respiration rate: ≤8 → 3; 9–11 → 1; 12–20 → 0; 21–24 → 2; ≥25 → 3\nSpO₂ scale 1: ≤91 → 3; 92–93 → 2; 94–95 → 1; ≥96 → 0\nSpO₂ scale 2: ≤83 → 3; 84–85 → 2; 86–87 → 1; 88–92 or ≥93 on air → 0; 93–94 on O₂ → 1; 95–96 on O₂ → 2; ≥97 on O₂ → 3\nAir → 0; oxygen → 2\nSystolic BP: ≤90 → 3; 91–100 → 2; 101–110 → 1; 111–219 → 0; ≥220 → 3\nPulse: ≤40 → 3; 41–50 → 1; 51–90 → 0; 91–110 → 1; 111–130 → 2; ≥131 → 3\nConsciousness: alert → 0; new confusion, voice, pain or unresponsive → 3\nTemperature: ≤35.0 → 3; 35.1–36.0 → 1; 36.1–38.0 → 0; 38.1–39.0 → 1; ≥39.1 → 2\nThresholds: 0–4 low; 3 in any single parameter low–medium; 5–6 medium (urgent); ≥7 high (emergency).',
    pearls: [
      'NEWS2 is not validated in children under 16 or in pregnancy: use a paediatric or obstetric early-warning score.',
      'Any new confusion scores 3. Treat confusion as new until shown otherwise.',
      'Scale 2 needs a documented clinical decision. Using it for every COPD patient under-scores hypoxaemia.',
      'NEWS2 supports clinical judgement and does not replace it: escalate a worried patient, nurse or relative regardless of the score.',
      'A total of 5 or more is the key trigger for urgent assessment for sepsis in patients with suspected infection.'
    ],
    references: [
      { label: 'Royal College of Physicians. National Early Warning Score (NEWS) 2: standardising the assessment of acute-illness severity in the NHS. Updated report of a working party. London: RCP, 2017.' }
    ]
  });

  /* --- qSOFA ---------------------------------------------------------------
     Seymour CW et al. JAMA 2016;315:762-74; Singer M et al. (Sepsis-3) JAMA 2016;315:801-10.
     Respiratory rate ≥22/min, altered mentation (GCS <15), systolic BP ≤100 mmHg; ≥2 = positive.
     Surviving Sepsis Campaign 2021 (Evans L et al. Crit Care Med 2021;49:e1063-143): recommends against
     using qSOFA alone, compared with SIRS, NEWS or MEWS, as a single screening tool. */
  var QSOFA_INPUTS = [
    bool('rr', 'Respiratory rate ≥22/min', 1),
    bool('mentation', 'Altered mentation (GCS <15)', 1),
    bool('sbp', 'Systolic blood pressure ≤100 mmHg', 1)
  ];
  defs.push({
    id: 'qsofa', name: 'qSOFA (quick SOFA)', category: 'Critical care',
    summary: 'Bedside prompt for patients with suspected infection outside the ICU who are at higher risk of a poor outcome.',
    keywords: ['qsofa', 'quick sofa', 'sepsis', 'sepsis-3', 'infection', 'septic shock'],
    inputs: QSOFA_INPUTS,
    compute: function (v) {
      var s = sumPoints(QSOFA_INPUTS, v);
      if (s >= 2) return result({ value: s, unit: '/ 3', label: 'qSOFA', band: 'danger', title: 'Positive (2 or more): higher risk of a poor outcome',
        interpretation: 'In suspected infection outside the ICU, qSOFA ≥2 identifies patients at higher risk of death or prolonged ICU stay. Assess for organ dysfunction (SOFA, lactate), start sepsis management and escalate according to your local pathway.',
        details: tickedLabels(QSOFA_INPUTS, v) });
      return result({ value: s, unit: '/ 3', label: 'qSOFA', band: s === 1 ? 'info' : 'ok', title: 'Negative (below 2)',
        interpretation: 'A negative qSOFA does not exclude sepsis because its sensitivity is low. Keep monitoring (e.g. NEWS2) and reassess if the patient deteriorates.',
        details: tickedLabels(QSOFA_INPUTS, v) });
    },
    formula: 'One point each: respiratory rate ≥22/min; altered mentation (GCS <15); systolic BP ≤100 mmHg.\nqSOFA ≥2 = positive.',
    pearls: [
      'qSOFA is a prognostic prompt, not a diagnostic test for sepsis.',
      'The Surviving Sepsis Campaign (2021) recommends against using qSOFA alone as a screening tool compared with SIRS, NEWS or MEWS.',
      'Sepsis-3 defines sepsis as life-threatening organ dysfunction (acute SOFA rise ≥2) caused by a dysregulated host response to infection.'
    ],
    references: [
      { label: 'Seymour CW, Liu VX, Iwashyna TJ, et al. Assessment of clinical criteria for sepsis (Sepsis-3). JAMA 2016;315:762-74.', url: DOI + '10.1001/jama.2016.0288' },
      { label: 'Singer M, Deutschman CS, Seymour CW, et al. The Third International Consensus Definitions for Sepsis and Septic Shock (Sepsis-3). JAMA 2016;315:801-10.', url: DOI + '10.1001/jama.2016.0287' },
      { label: 'Evans L, Rhodes A, Alhazzani W, et al. Surviving Sepsis Campaign: international guidelines for management of sepsis and septic shock 2021. Crit Care Med 2021;49:e1063-e1143.', url: DOI + '10.1097/CCM.0000000000005337' }
    ]
  });

  /* --- SOFA ------------------------------------------------------------------
     Vincent JL et al. Intensive Care Med 1996;22:707-10 (Table 1). Respiration PaO2/FiO2 (mmHg):
     ≥400 0; <400 1; <300 2; <200 with respiratory support 3; <100 with respiratory support 4.
     Platelets ×10³/µL: ≥150 0; <150 1; <100 2; <50 3; <20 4. Bilirubin mg/dL (µmol/L): <1.2 (<20) 0;
     1.2–1.9 (20–32) 1; 2.0–5.9 (33–101) 2; 6.0–11.9 (102–204) 3; >12 (>204) 4. Cardiovascular: MAP ≥70 0;
     MAP <70 1; dopamine ≤5 or dobutamine (any dose) 2; dopamine >5, adrenaline ≤0.1 or noradrenaline ≤0.1 3;
     dopamine >15, adrenaline >0.1 or noradrenaline >0.1 4 (µg/kg/min, given for ≥1 h). GCS 15 0; 13–14 1;
     10–12 2; 6–9 3; <6 4. Creatinine mg/dL (µmol/L): <1.2 (<110) 0; 1.2–1.9 (110–170) 1; 2.0–3.4 (171–299) 2;
     3.5–4.9 (300–440) or urine output <500 mL/day 3; >5.0 (>440) or urine output <200 mL/day 4.
     Bilirubin and creatinine are entered as the published bands so both unit systems match the table exactly.
     Organ failure = organ score ≥3 (Vincent JL et al. Crit Care Med 1998;26:1793-800).
     Sepsis-3: acute change ≥2 points = organ dysfunction (Singer 2016). SOFA-2: Ranzani OT et al. JAMA 2025. */
  var SOFA_INPUTS = [
    heading('Respiration'),
    num('pao2', 'PaO₂', U_PAO2, 20, 700),
    num('fio2', 'FiO₂', U_FIO2, 21, 100),
    bool('vent', 'Receiving respiratory support (invasive or non-invasive ventilation, including CPAP)', null, 'The 3- and 4-point respiratory bands require respiratory support.'),
    heading('Coagulation'),
    num('plt', 'Platelets', '×10⁹/L (= ×10³/µL)', 0, 2000),
    heading('Liver'),
    radio('bili', 'Bilirubin', [
      { value: 0, label: '<20 µmol/L (<1.2 mg/dL)', points: 0 },
      { value: 1, label: '20–32 µmol/L (1.2–1.9 mg/dL)', points: 1 },
      { value: 2, label: '33–101 µmol/L (2.0–5.9 mg/dL)', points: 2 },
      { value: 3, label: '102–204 µmol/L (6.0–11.9 mg/dL)', points: 3 },
      { value: 4, label: '>204 µmol/L (≥12.0 mg/dL)', points: 4 }
    ]),
    heading('Cardiovascular'),
    num('map', 'Mean arterial pressure', 'mmHg', 10, 200),
    note('Vasoactive drugs given for at least 1 hour. Leave a dose blank if the drug is not running.'),
    num('dopamine', 'Dopamine', 'µg/kg/min', 0, 50, { required: false }),
    bool('dobutamine', 'Dobutamine (any dose)'),
    num('adrenaline', 'Adrenaline (epinephrine)', 'µg/kg/min', 0, 5, { required: false }),
    num('noradrenaline', 'Noradrenaline (norepinephrine)', 'µg/kg/min', 0, 5, { required: false }),
    heading('Central nervous system'),
    num('gcs', 'Glasgow Coma Scale', 'points', 3, 15, { step: 1, hint: 'In sedated patients, a common convention is to use the best estimate of the GCS without sedation.' }),
    heading('Renal'),
    radio('creat', 'Creatinine', [
      { value: 0, label: '<110 µmol/L (<1.2 mg/dL)', points: 0 },
      { value: 1, label: '110–170 µmol/L (1.2–1.9 mg/dL)', points: 1 },
      { value: 2, label: '171–299 µmol/L (2.0–3.4 mg/dL)', points: 2 },
      { value: 3, label: '300–440 µmol/L (3.5–4.9 mg/dL)', points: 3 },
      { value: 4, label: '>440 µmol/L (≥5.0 mg/dL)', points: 4 }
    ]),
    radio('uo', 'Urine output over 24 hours', [
      { value: 'ok', label: '500 mL/day or more, or not measured', points: 0 },
      { value: 'lt500', label: 'Less than 500 mL/day', points: 3 },
      { value: 'lt200', label: 'Less than 200 mL/day', points: 4 }
    ], { default: 'ok' })
  ];
  function sofaParts(v) {
    var pf = snap(v.pao2 / (v.fio2 / 100));
    var resp = pf >= 400 ? 0 : pf >= 300 ? 1 : pf >= 200 ? 2 : !v.vent ? 2 : pf >= 100 ? 3 : 4;
    var plt = v.plt >= 150 ? 0 : v.plt >= 100 ? 1 : v.plt >= 50 ? 2 : v.plt >= 20 ? 3 : 4;
    var dopa = v.dopamine || 0, adr = v.adrenaline || 0, nor = v.noradrenaline || 0;
    var cv = (dopa > 15 || adr > 0.1 || nor > 0.1) ? 4 : (dopa > 5 || adr > 0 || nor > 0) ? 3 : (dopa > 0 || v.dobutamine) ? 2 : v.map < 70 ? 1 : 0;
    var g = v.gcs, cns = g >= 15 ? 0 : g >= 13 ? 1 : g >= 10 ? 2 : g >= 6 ? 3 : 4;
    var uo = v.uo === 'lt200' ? 4 : v.uo === 'lt500' ? 3 : 0;
    return { pf: pf, resp: resp, coag: plt, liver: Number(v.bili), cv: cv, cns: cns, renal: Math.max(Number(v.creat), uo) };
  }
  defs.push({
    id: 'sofa', name: 'SOFA score (Sequential Organ Failure Assessment)', category: 'Critical care',
    summary: 'Organ dysfunction across six systems, including ventilation status and vasopressor doses; the basis of the Sepsis-3 definition.',
    keywords: ['sofa', 'organ failure', 'sepsis', 'sepsis-3', 'icu', 'vasopressor', 'pf ratio', 'p/f', 'noradrenaline', 'norepinephrine'],
    inputs: SOFA_INPUTS,
    compute: function (v) {
      var p = sofaParts(v);
      var total = p.resp + p.coag + p.liver + p.cv + p.cns + p.renal;
      var systems = [['Respiration', p.resp, 'PaO₂/FiO₂ ' + round(p.pf, 0) + ' mmHg' + (v.vent ? ', on respiratory support' : '')], ['Coagulation', p.coag, 'platelets ' + v.plt + ' ×10⁹/L'],
        ['Liver', p.liver, 'bilirubin ' + optLabel(SOFA_INPUTS, 'bili', v.bili)], ['Cardiovascular', p.cv, 'MAP ' + v.map + ' mmHg'], ['CNS', p.cns, 'GCS ' + v.gcs], ['Renal', p.renal, 'creatinine ' + optLabel(SOFA_INPUTS, 'creat', v.creat) + '; ' + optLabel(SOFA_INPUTS, 'uo', v.uo).toLowerCase()]];
      var failing = systems.filter(function (s) { return s[1] >= 3; }).map(function (s) { return s[0]; });
      var details = systems.map(function (s) { return { label: s[0] + ' (' + s[2] + ')', value: s[1] }; });
      var warnings = [];
      if (p.pf < 200 && !v.vent) warnings.push('PaO₂/FiO₂ is below 200 without respiratory support, which scores 2: the 3- and 4-point bands require respiratory support.');
      var band = failing.length ? 'danger' : total >= 2 ? 'warn' : total === 1 ? 'info' : 'ok';
      var title = failing.length ? 'Organ failure (score ≥3) in: ' + failing.join(', ') : total >= 2 ? 'Organ dysfunction present (2 or more points)' : total === 1 ? 'Minimal organ dysfunction' : 'No organ dysfunction on SOFA';
      return result({ value: total, unit: '/ 24', label: 'SOFA score', band: band, title: title,
        interpretation: 'In suspected infection, an acute rise of 2 or more points from baseline indicates organ dysfunction, i.e. sepsis (Sepsis-3). Assume a baseline of 0 unless pre-existing organ dysfunction is known. In a general hospital population with suspected infection, SOFA ≥2 is associated with an overall mortality risk of about 10%. Trends over time (e.g. every 24–48 h) carry more information than a single value.',
        details: details, warnings: warnings });
    },
    formula: 'Six systems scored 0–4, total 0–24 (Vincent 1996).\nRespiration, PaO₂/FiO₂ (mmHg): ≥400 → 0; <400 → 1; <300 → 2; <200 with respiratory support → 3; <100 with respiratory support → 4.\nCoagulation, platelets ×10⁹/L: ≥150 → 0; <150 → 1; <100 → 2; <50 → 3; <20 → 4.\nLiver, bilirubin: <20 µmol/L (<1.2 mg/dL) → 0; 20–32 (1.2–1.9) → 1; 33–101 (2.0–5.9) → 2; 102–204 (6.0–11.9) → 3; >204 (≥12) → 4.\nCardiovascular: MAP ≥70 → 0; MAP <70 → 1; dopamine ≤5 or any dobutamine → 2; dopamine >5, adrenaline ≤0.1 or noradrenaline ≤0.1 → 3; dopamine >15, adrenaline >0.1 or noradrenaline >0.1 → 4 (µg/kg/min for ≥1 h).\nCNS, GCS: 15 → 0; 13–14 → 1; 10–12 → 2; 6–9 → 3; <6 → 4.\nRenal: creatinine <110 µmol/L (<1.2 mg/dL) → 0; 110–170 (1.2–1.9) → 1; 171–299 (2.0–3.4) → 2; 300–440 (3.5–4.9) or urine <500 mL/day → 3; >440 (≥5.0) or urine <200 mL/day → 4.\nPaO₂ in kPa is converted (1 kPa = 7.50 mmHg); FiO₂ may be entered as % or fraction.',
    pearls: [
      'Sepsis-3 uses the change in SOFA from baseline, not the absolute value.',
      'The original method scores the worst value in each 24-hour period.',
      'Vasopressin, phenylephrine and other vasoactive drugs are not part of the original score.',
      'Renal score is the worse of the creatinine and urine output criteria.',
      'An updated SOFA-2 score (Ranzani et al., JAMA 2025) revises variables and thresholds. This calculator implements the original 1996 SOFA used in Sepsis-3.'
    ],
    references: [
      { label: 'Vincent JL, Moreno R, Takala J, et al. The SOFA (Sepsis-related Organ Failure Assessment) score to describe organ dysfunction/failure. Intensive Care Med 1996;22:707-10.', url: DOI + '10.1007/BF01709751' },
      { label: 'Vincent JL, de Mendonça A, Cantraine F, et al. Use of the SOFA score to assess the incidence of organ dysfunction/failure in intensive care units. Crit Care Med 1998;26:1793-800.' },
      { label: 'Singer M, Deutschman CS, Seymour CW, et al. The Third International Consensus Definitions for Sepsis and Septic Shock (Sepsis-3). JAMA 2016;315:801-10.', url: DOI + '10.1001/jama.2016.0287' },
      { label: 'Ranzani OT, Singer M, Salluh JIF, et al. Development and validation of the Sequential Organ Failure Assessment (SOFA)-2 score. JAMA 2025;334:2090-2103.', url: DOI + '10.1001/jama.2025.20516' }
    ]
  });

  /* --- SIRS ---------------------------------------------------------------------
     Bone RC et al. ACCP/SCCM Consensus Conference. Chest 1992;101:1644-55: two or more of temperature
     >38 °C or <36 °C; heart rate >90/min; respiratory rate >20/min or PaCO2 <32 mmHg (4.3 kPa);
     WBC >12 or <4 ×10⁹/L or >10% immature (band) forms. Kaukonen KM et al. NEJM 2015;372:1629-38:
     about 1 in 8 ICU patients with infection and new organ failure did not meet ≥2 SIRS criteria. */
  var SIRS_INPUTS = [
    bool('temp', 'Temperature >38 °C or <36 °C', 1),
    bool('hr', 'Heart rate >90/min', 1),
    bool('rr', 'Respiratory rate >20/min or PaCO₂ <32 mmHg (4.3 kPa)', 1),
    bool('wbc', 'White cells >12 ×10⁹/L or <4 ×10⁹/L, or >10% immature (band) forms', 1),
    bool('infection', 'Suspected or confirmed infection', null, 'Not a SIRS criterion; used for the 1992 sepsis definition.')
  ];
  defs.push({
    id: 'sirs', name: 'SIRS criteria', category: 'Critical care',
    summary: 'Systemic inflammatory response syndrome criteria (1992 ACCP/SCCM consensus).',
    keywords: ['sirs', 'systemic inflammatory response', 'sepsis', 'infection', 'fever', 'tachycardia', 'leukocytosis'],
    inputs: SIRS_INPUTS,
    compute: function (v) {
      var n = sumPoints(SIRS_INPUTS, v);
      var details = tickedLabels(SIRS_INPUTS, v, ['temp', 'hr', 'rr', 'wbc']);
      if (n >= 2) return result({ value: n, unit: '/ 4', label: 'SIRS criteria met', band: 'warn',
        title: v.infection ? 'SIRS (2 or more criteria) with suspected infection' : 'SIRS present (2 or more criteria)',
        interpretation: v.infection ? 'Meets the 1992 definition of sepsis (SIRS plus infection). Sepsis-3 instead defines sepsis by infection with organ dysfunction: assess organ function (SOFA, lactate) and treat according to your sepsis pathway.'
          : 'Two or more SIRS criteria. SIRS is non-specific and common in non-infective inflammation (trauma, surgery, pancreatitis, burns). Look for a cause.',
        details: details });
      return result({ value: n, unit: '/ 4', label: 'SIRS criteria met', band: 'ok', title: 'SIRS criteria not met (fewer than 2)',
        interpretation: 'Fewer than two SIRS criteria. This does not exclude serious infection: about 1 in 8 ICU patients with infection and new organ failure do not meet the SIRS criteria.',
        details: details });
    },
    formula: 'SIRS = 2 or more of:\n• temperature >38 °C or <36 °C\n• heart rate >90/min\n• respiratory rate >20/min or PaCO₂ <32 mmHg (4.3 kPa)\n• white cells >12 ×10⁹/L or <4 ×10⁹/L, or >10% band forms',
    pearls: [
      'SIRS is sensitive but non-specific: many patients with uncomplicated infection, or with no infection, meet the criteria.',
      'Sepsis-3 (2016) no longer uses SIRS to define sepsis, but SIRS remains a reasonable screening prompt alongside early-warning scores.'
    ],
    references: [
      { label: 'Bone RC, Balk RA, Cerra FB, et al. Definitions for sepsis and organ failure and guidelines for the use of innovative therapies in sepsis. ACCP/SCCM Consensus Conference Committee. Chest 1992;101:1644-55.', url: DOI + '10.1378/chest.101.6.1644' },
      { label: 'Kaukonen KM, Bailey M, Pilcher D, Cooper DJ, Bellomo R. Systemic inflammatory response syndrome criteria in defining severe sepsis. N Engl J Med 2015;372:1629-38.', url: DOI + '10.1056/NEJMoa1415236' }
    ]
  });

  /* --- Shock index -------------------------------------------------------------
     SI = heart rate / systolic BP (Allgöwer M, Burri C. Dtsch Med Wochenschr 1967;92:1947-50).
     Normal 0.5–0.7; SI >0.9 associated with immediate treatment, admission and ICU care in ED patients
     with apparently stable vital signs (Rady MY et al. Ann Emerg Med 1994;24:685-90).
     Trauma classes I <0.6, II 0.6–<1.0, III 1.0–<1.4, IV ≥1.4; mortality 10.9% (I) to 39.8% (IV);
     ≥10 units of blood before ICU in 31% (III) and 57% (IV) (Mutschler M et al. Crit Care 2013;17:R172). */
  defs.push({
    id: 'shock-index', name: 'Shock index', category: 'Emergency',
    summary: 'Heart rate divided by systolic blood pressure: a quick marker of occult shock and transfusion need.',
    keywords: ['shock index', 'si', 'hypovolaemia', 'haemorrhage', 'hemorrhage', 'trauma', 'transfusion', 'heart rate', 'blood pressure'],
    inputs: [
      num('hr', 'Heart rate', 'beats/min', 20, 250, { step: 1 }),
      num('sbp', 'Systolic blood pressure', 'mmHg', 30, 300, { step: 1 })
    ],
    compute: function (v) {
      var si = snap(v.hr / v.sbp);
      var cls = si < 0.6 ? 'I (<0.6)' : si < 1.0 ? 'II (0.6 to <1.0)' : si < 1.4 ? 'III (1.0 to <1.4)' : 'IV (≥1.4)';
      var o;
      if (si >= 1.4) o = { band: 'danger', title: 'Markedly raised (1.4 or more)', interpretation: 'Strongly suggests significant shock. In trauma registry data, 57% of patients with SI ≥1.4 needed 10 or more units of blood before ICU admission and mortality was about 40%. Resuscitate, find and control the cause, and activate major-haemorrhage or sepsis pathways as appropriate.' };
      else if (si >= 1.0) o = { band: 'danger', title: 'Raised (1.0 or more)', interpretation: 'Suggests haemodynamic compromise (e.g. occult haemorrhage or sepsis) even when heart rate and blood pressure look acceptable individually. In trauma, SI 1.0–1.4 was associated with higher transfusion needs (31% needed 10 or more units) and mortality. Assess perfusion and resuscitate.' };
      else if (si > 0.9) o = { band: 'warn', title: 'Raised (above 0.9)', interpretation: 'In ED patients with apparently stable vital signs, SI >0.9 was associated with need for immediate treatment, hospital admission and intensive care. Reassess and look for occult shock.' };
      else if (si > 0.7) o = { band: 'info', title: 'Slightly above the normal range', interpretation: 'Above the normal range for healthy adults (0.5–0.7) but not above 0.9. Interpret with the clinical picture and the trend.' };
      else o = { band: 'ok', title: si >= 0.5 ? 'Normal range (0.5–0.7)' : 'Below 0.5', interpretation: 'No evidence of shock from the shock index. A normal value does not exclude shock, especially with beta-blockers, pacemakers or in older and hypertensive patients.' };
      return result(assign({ value: round(si, 2), label: 'Shock index', details: [
        { label: 'Calculation', value: v.hr + ' ÷ ' + v.sbp },
        { label: 'Trauma class (Mutschler 2013)', value: cls }
      ] }, o));
    },
    formula: 'Shock index = heart rate (beats/min) ÷ systolic BP (mmHg).\nNormal 0.5–0.7 in healthy adults; >0.9 abnormal (Rady 1994).\nTrauma classes (Mutschler 2013): I <0.6; II 0.6 to <1.0; III 1.0 to <1.4; IV ≥1.4.',
    pearls: [
      'The trend over time is more useful than a single value.',
      'Beta-blockers, pacemakers, pain, anxiety, fever and pregnancy alter the heart rate and blood pressure and therefore the index.',
      'Older people and those with chronic hypertension can be shocked with an apparently normal index.'
    ],
    references: [
      { label: 'Allgöwer M, Burri C. "Schockindex". Dtsch Med Wochenschr 1967;92:1947-50.' },
      { label: 'Rady MY, Smithline HA, Blake H, Nowak R, Rivers E. A comparison of the shock index and conventional vital signs to identify acute, critical illness in the emergency department. Ann Emerg Med 1994;24:685-90.', url: DOI + '10.1016/s0196-0644(94)70279-9' },
      { label: 'Mutschler M, Nienaber U, Münzberg M, et al. The Shock Index revisited: a fast guide to transfusion requirement? A retrospective analysis on 21,853 patients derived from the TraumaRegister DGU. Crit Care 2013;17:R172.', url: DOI + '10.1186/cc12851' }
    ]
  });

  /* --- Padua prediction score -------------------------------------------------------
     Barbar S et al. J Thromb Haemost 2010;8:2450-7: high risk ≥4 points. VTE at 90 days in 11.0% of
     high-risk patients without prophylaxis vs 2.2% with prophylaxis; 0.3% of low-risk patients.
     Kahn SR et al. ACCP 9th ed. Chest 2012;141(2 Suppl):e195S-e226S: anticoagulant thromboprophylaxis for
     acutely ill medical inpatients at increased risk (Padua ≥4); none for low-risk patients. */
  var PADUA_INPUTS = [
    bool('cancer', 'Active cancer', 3, 'Local or distant metastases and/or chemotherapy or radiotherapy in the previous 6 months'),
    bool('vte', 'Previous VTE (excluding superficial vein thrombosis)', 3),
    bool('mobility', 'Reduced mobility', 3, 'Bed rest with bathroom privileges (because of the patient’s limitations or on medical orders) for at least 3 days'),
    bool('thrombophilia', 'Known thrombophilic condition', 3, 'Antithrombin, protein C or S deficiency, factor V Leiden, prothrombin G20210A mutation, antiphospholipid syndrome'),
    bool('trauma', 'Recent (≤1 month) trauma and/or surgery', 2),
    bool('age', 'Age 70 years or older', 1),
    bool('failure', 'Heart and/or respiratory failure', 1),
    bool('mistroke', 'Acute myocardial infarction and/or ischaemic stroke', 1),
    bool('infection', 'Acute infection and/or rheumatological disorder', 1),
    bool('obesity', 'Obesity (BMI ≥30 kg/m²)', 1),
    bool('hormonal', 'Ongoing hormonal treatment', 1)
  ];
  defs.push({
    id: 'padua', name: 'Padua prediction score (VTE risk in medical inpatients)', category: 'Critical care',
    summary: 'Venous thromboembolism risk in hospitalised medical patients, to guide thromboprophylaxis.',
    keywords: ['padua', 'vte', 'venous thromboembolism', 'dvt', 'pe', 'thromboprophylaxis', 'prophylaxis', 'medical inpatient', 'heparin'],
    inputs: PADUA_INPUTS,
    compute: function (v) {
      var s = sumPoints(PADUA_INPUTS, v);
      var details = tickedLabels(PADUA_INPUTS, v);
      if (s >= 4) return result({ value: s, label: 'Padua score', band: 'warn', title: 'High risk of VTE (4 or more)',
        interpretation: 'In the derivation cohort, 11.0% of high-risk patients without prophylaxis developed VTE within 90 days, versus 2.2% with prophylaxis. Offer pharmacological thromboprophylaxis unless the bleeding risk is high or it is contraindicated; use mechanical prophylaxis if anticoagulation cannot be given.',
        details: details, warnings: ['Assess bleeding risk before starting pharmacological prophylaxis.'] });
      return result({ value: s, label: 'Padua score', band: 'ok', title: 'Low risk of VTE (below 4)',
        interpretation: 'VTE occurred in 0.3% of low-risk patients in the derivation cohort. Routine pharmacological or mechanical prophylaxis is not recommended (ACCP 2012). Reassess if the clinical situation changes.',
        details: details });
    },
    formula: '3 points: active cancer; previous VTE; reduced mobility; known thrombophilia.\n2 points: recent (≤1 month) trauma and/or surgery.\n1 point: age ≥70; heart and/or respiratory failure; acute MI and/or ischaemic stroke; acute infection and/or rheumatological disorder; obesity (BMI ≥30); ongoing hormonal treatment.\nHigh risk: ≥4 points.',
    pearls: [
      'For acutely ill medical inpatients, not surgical or obstetric patients, who need procedure-specific tools.',
      'Pair the Padua score with a bleeding-risk assessment (e.g. IMPROVE bleeding score) before prescribing.',
      'Reassess on transfer, after procedures and when mobility changes.'
    ],
    references: [
      { label: 'Barbar S, Noventa F, Rossetto V, et al. A risk assessment model for the identification of hospitalized medical patients at risk for venous thromboembolism: the Padua Prediction Score. J Thromb Haemost 2010;8:2450-7.', url: DOI + '10.1111/j.1538-7836.2010.04044.x' },
      { label: 'Kahn SR, Lim W, Dunn AS, et al. Prevention of VTE in nonsurgical patients: antithrombotic therapy and prevention of thrombosis, 9th ed: ACCP evidence-based clinical practice guidelines. Chest 2012;141(2 Suppl):e195S-e226S.', url: DOI + '10.1378/chest.11-2296' }
    ]
  });

  /* ======================================================================
     RESPIRATORY & INFECTION
     ====================================================================== */

  /* --- CURB-65 / CRB-65 ------------------------------------------------------------
     Lim WS et al. Thorax 2003;58:377-82: confusion (AMT ≤8 or new disorientation), urea >7 mmol/L,
     RR ≥30/min, SBP <90 or DBP ≤60 mmHg, age ≥65. Risk groups and actions: NICE CG191 (2014, updated 2019):
     CURB65 0–1 low (<3% mortality), 2 intermediate (3–15%), 3–5 high (>15%); CRB65 0 low (<1%),
     1–2 intermediate (1–10%), 3–4 high (>10%). Site-of-care advice: Lim WS et al. BTS guidelines for
     CAP in adults: update 2009. Thorax 2009;64 Suppl 3:iii1-55. */
  var CURB_INPUTS = [
    bool('confusion', 'Confusion: new disorientation in person, place or time (or abbreviated mental test ≤8)', 1),
    bool('urea', 'Urea >7 mmol/L (BUN >19.6 mg/dL)', 1),
    bool('rr', 'Respiratory rate ≥30/min', 1),
    bool('bp', 'Blood pressure: systolic <90 mmHg or diastolic ≤60 mmHg', 1),
    bool('age', 'Age 65 years or older', 1)
  ];
  var CRB_INPUTS = CURB_INPUTS.filter(function (i) { return i.id !== 'urea'; });
  var CAP_PEARLS = [
    'Clinical judgement overrides the score: hypoxaemia (SpO₂ <92% or new oxygen need), multilobar change, sepsis, frailty, comorbidity, pregnancy, social circumstances and inability to take oral medicines can all justify hospital care.',
    'Derived in adults with community-acquired pneumonia; not validated in children, immunocompromised patients or hospital-acquired pneumonia.'
  ];
  defs.push({
    id: 'curb-65', name: 'CURB-65 (pneumonia severity)', category: 'Respiratory & infection',
    summary: 'Severity of community-acquired pneumonia in hospital: 30-day mortality risk and site of care.',
    keywords: ['curb', 'curb65', 'curb-65', 'pneumonia', 'cap', 'community-acquired pneumonia', 'severity', 'bts', 'nice'],
    inputs: CURB_INPUTS,
    compute: function (v) {
      var s = sumPoints(CURB_INPUTS, v);
      var o = s <= 1 ? { band: 'ok', title: 'Low risk (0–1): 30-day mortality below 3%', interpretation: 'Consider home-based care if otherwise appropriate (NICE CG191, BTS 2009).' }
        : s === 2 ? { band: 'warn', title: 'Intermediate risk (2): 30-day mortality 3–15%', interpretation: 'Consider hospital-based care, for example a short inpatient stay or hospital-supervised outpatient treatment.' }
        : { band: 'danger', title: 'High risk (3–5): 30-day mortality above 15%', interpretation: 'Manage in hospital as severe pneumonia. Assess for critical care, especially with a score of 4 or 5.' };
      return result(assign({ value: s, unit: '/ 5', label: 'CURB-65', details: tickedLabels(CURB_INPUTS, v) }, o));
    },
    formula: 'One point each: Confusion; Urea >7 mmol/L; Respiratory rate ≥30/min; Blood pressure (SBP <90 or DBP ≤60 mmHg); age ≥65.\nNICE risk groups: 0–1 low (<3% 30-day mortality); 2 intermediate (3–15%); 3–5 high (>15%).',
    pearls: CAP_PEARLS.concat(['In the community, or without a urea result, use CRB-65.']),
    references: [
      { label: 'Lim WS, van der Eerden MM, Laing R, et al. Defining community acquired pneumonia severity on presentation to hospital: an international derivation and validation study. Thorax 2003;58:377-82.', url: DOI + '10.1136/thorax.58.5.377' },
      { label: 'NICE CG191. Pneumonia in adults: diagnosis and management (2014, updated 2019).', url: 'https://www.nice.org.uk/guidance/cg191' },
      { label: 'Lim WS, Baudouin SV, George RC, et al. BTS guidelines for the management of community acquired pneumonia in adults: update 2009. Thorax 2009;64 Suppl 3:iii1-55.', url: DOI + '10.1136/thx.2009.121434' }
    ]
  });
  defs.push({
    id: 'crb-65', name: 'CRB-65 (pneumonia severity, community)', category: 'Respiratory & infection',
    summary: 'CURB-65 without urea, for primary care and settings without blood tests.',
    keywords: ['crb', 'crb65', 'crb-65', 'pneumonia', 'cap', 'primary care', 'community', 'severity'],
    inputs: CRB_INPUTS,
    compute: function (v) {
      var s = sumPoints(CRB_INPUTS, v);
      var o = s === 0 ? { band: 'ok', title: 'Low risk (0): 30-day mortality below 1%', interpretation: 'Consider home-based care if otherwise appropriate.' }
        : s <= 2 ? { band: 'warn', title: 'Intermediate risk (1–2): 30-day mortality 1–10%', interpretation: 'Consider hospital assessment, particularly with a score of 2.' }
        : { band: 'danger', title: 'High risk (3–4): 30-day mortality above 10%', interpretation: 'Arrange urgent hospital admission.' };
      return result(assign({ value: s, unit: '/ 4', label: 'CRB-65', details: tickedLabels(CRB_INPUTS, v) }, o));
    },
    formula: 'One point each: Confusion; Respiratory rate ≥30/min; Blood pressure (SBP <90 or DBP ≤60 mmHg); age ≥65.\nNICE risk groups: 0 low (<1% mortality); 1–2 intermediate (1–10%); 3–4 high (>10%).',
    pearls: CAP_PEARLS,
    references: [
      { label: 'NICE CG191. Pneumonia in adults: diagnosis and management (2014, updated 2019).', url: 'https://www.nice.org.uk/guidance/cg191' },
      { label: 'Lim WS, Baudouin SV, George RC, et al. BTS guidelines for the management of community acquired pneumonia in adults: update 2009. Thorax 2009;64 Suppl 3:iii1-55.', url: DOI + '10.1136/thx.2009.121434' },
      { label: 'Lim WS, van der Eerden MM, Laing R, et al. Defining community acquired pneumonia severity on presentation to hospital. Thorax 2003;58:377-82.', url: DOI + '10.1136/thorax.58.5.377' }
    ]
  });

  /* --- Pneumonia Severity Index (PSI / PORT) -------------------------------------------
     Fine MJ et al. N Engl J Med 1997;336:243-50. Step 1: class I if age ≤50 with none of the five
     coexisting illnesses and none of the five examination abnormalities. Step 2 points: age (years; women
     −10), nursing home +10, neoplastic disease +30, liver disease +20, CHF +10, cerebrovascular disease +10,
     renal disease +10, altered mental status +20, RR ≥30 +20, SBP <90 +20, temperature <35 or ≥40 °C +15,
     pulse ≥125 +10, pH <7.35 +30, BUN ≥30 mg/dL (11 mmol/L) +20, sodium <130 +20, glucose ≥250 mg/dL
     (14 mmol/L) +10, haematocrit <30% +10, PaO2 <60 mmHg (SpO2 <90% in the PORT cohort) +10, pleural
     effusion +10. Class II ≤70, III 71–90, IV 91–130, V >130. 30-day mortality across the three cohorts:
     I 0.1–0.4%, II 0.6–0.7%, III 0.9–2.8%; PORT cohort IV 9.3%, V 27.0%. Use with clinical judgement
     (Metlay JP et al. ATS/IDSA. Am J Respir Crit Care Med 2019;200:e45-e67, which prefers PSI to CURB-65). */
  var PSI_INPUTS = [
    num('age', 'Age', 'years', 18, 120, { step: 1 }),
    radio('sex', 'Sex', [{ value: 'female', label: 'Female (age − 10)' }, { value: 'male', label: 'Male' }]),
    bool('nursing', 'Nursing-home resident', 10),
    heading('Coexisting illnesses'),
    bool('neoplastic', 'Neoplastic disease', 30, 'Any cancer except basal- or squamous-cell skin cancer that was active at presentation or diagnosed within 1 year'),
    bool('liver', 'Liver disease', 20, 'Cirrhosis or other chronic liver disease, e.g. chronic active hepatitis'),
    bool('chf', 'Congestive heart failure', 10, 'Systolic or diastolic dysfunction documented by history and examination, chest radiograph, echocardiogram, MUGA or ventriculogram'),
    bool('cvd', 'Cerebrovascular disease', 10, 'Clinical diagnosis of stroke or TIA, or stroke documented by MRI or CT'),
    bool('renal', 'Renal disease', 10, 'History of chronic renal disease or abnormal urea (BUN) and creatinine documented in the record'),
    heading('Examination'),
    bool('ams', 'Altered mental status', 20, 'Disorientation (person, place or time, not known to be chronic), stupor or coma'),
    bool('rr', 'Respiratory rate ≥30/min', 20),
    bool('sbp', 'Systolic blood pressure <90 mmHg', 20),
    bool('temp', 'Temperature <35 °C or ≥40 °C', 15),
    bool('pulse', 'Pulse ≥125/min', 10),
    heading('Laboratory and radiographic findings'),
    note('Tick only abnormal results. Unmeasured values count as normal, which can underestimate risk.'),
    bool('ph', 'Arterial pH <7.35', 30),
    bool('bun', 'Urea ≥11 mmol/L (BUN ≥30 mg/dL)', 20),
    bool('na', 'Sodium <130 mmol/L', 20),
    bool('glucose', 'Glucose ≥14 mmol/L (≥250 mg/dL)', 10),
    bool('hct', 'Haematocrit <30%', 10),
    bool('pao2', 'PaO₂ <60 mmHg (8 kPa) or SpO₂ <90%', 10),
    bool('effusion', 'Pleural effusion on chest radiograph', 10)
  ];
  var PSI_STEP1 = ['neoplastic', 'liver', 'chf', 'cvd', 'renal', 'ams', 'rr', 'sbp', 'temp', 'pulse'];
  var PSI_LABS = ['ph', 'bun', 'na', 'glucose', 'hct', 'pao2', 'effusion'];
  defs.push({
    id: 'psi-port', name: 'Pneumonia Severity Index (PSI / PORT score)', category: 'Respiratory & infection',
    summary: 'Five risk classes for 30-day mortality in community-acquired pneumonia, to support the site-of-care decision.',
    keywords: ['psi', 'port', 'pneumonia severity index', 'pneumonia', 'cap', 'fine', 'admission', 'outpatient'],
    inputs: PSI_INPUTS,
    compute: function (v) {
      var points = (v.sex === 'female' ? v.age - 10 : v.age) + sumPoints(PSI_INPUTS, v);
      var classI = v.age <= 50 && !any(v, PSI_STEP1);
      var cls = classI ? 1 : points <= 70 ? 2 : points <= 90 ? 3 : points <= 130 ? 4 : 5;
      var mort = ['', '0.1–0.4%', '0.6–0.7%', '0.9–2.8%', 'about 8–9% (9.3% in the PORT cohort)', 'about 27–31% (27.0% in the PORT cohort)'][cls];
      var roman = ['', 'I', 'II', 'III', 'IV', 'V'][cls];
      var care = cls <= 2 ? 'Usually suitable for outpatient treatment if clinically appropriate.'
        : cls === 3 ? 'Outpatient treatment or a brief inpatient (observation) stay, according to clinical judgement.'
        : 'Inpatient treatment; assess severity for higher-level care.';
      var details = [
        { label: 'Points', value: classI ? points + ' (not needed for class I)' : points },
        { label: 'Risk class', value: roman },
        { label: '30-day mortality (Fine 1997)', value: mort }
      ];
      var warnings = [];
      if (classI && any(v, PSI_LABS)) warnings.push('Class I is assigned from age, history and examination alone. Abnormal laboratory or radiographic findings are present: use clinical judgement.');
      return result({ value: roman, label: 'PSI risk class', band: cls <= 2 ? 'ok' : cls === 3 ? 'warn' : 'danger',
        title: 'Risk class ' + roman + (classI ? ' (step 1: age ≤50, no risk factors)' : ' (' + points + ' points)'),
        interpretation: '30-day mortality ' + mort + '. ' + care + ' Hypoxaemia, social circumstances, inability to take oral medicines and patient preference can justify admission whatever the class.',
        details: details, warnings: warnings });
    },
    formula: 'Step 1: risk class I if age ≤50 and none of: neoplastic, liver, heart, cerebrovascular or renal disease; altered mental status; pulse ≥125; RR ≥30; SBP <90; temperature <35 or ≥40 °C.\nStep 2 points: age in years (women: age − 10); nursing home +10; neoplastic +30; liver +20; CHF +10; cerebrovascular +10; renal +10; altered mental status +20; RR ≥30 +20; SBP <90 +20; temperature <35 or ≥40 °C +15; pulse ≥125 +10; pH <7.35 +30; urea ≥11 mmol/L (BUN ≥30 mg/dL) +20; sodium <130 +20; glucose ≥14 mmol/L (≥250 mg/dL) +10; haematocrit <30% +10; PaO₂ <60 mmHg or SpO₂ <90% +10; pleural effusion +10.\nClass II ≤70; III 71–90; IV 91–130; V >130.',
    pearls: [
      'PSI was designed to identify low-risk patients who can be treated safely as outpatients, not to define severe pneumonia needing ICU care.',
      'Because age dominates the score, PSI can underestimate severity in young adults with abnormal physiology.',
      'ATS/IDSA (2019) recommends clinical judgement plus a validated rule, preferably PSI over CURB-65, to decide on hospitalisation.'
    ],
    references: [
      { label: 'Fine MJ, Auble TE, Yealy DM, et al. A prediction rule to identify low-risk patients with community-acquired pneumonia. N Engl J Med 1997;336:243-50.', url: DOI + '10.1056/NEJM199701233360402' },
      { label: 'Metlay JP, Waterer GW, Long AC, et al. Diagnosis and treatment of adults with community-acquired pneumonia: an official clinical practice guideline of the ATS and IDSA. Am J Respir Crit Care Med 2019;200:e45-e67.', url: DOI + '10.1164/rccm.201908-1581ST' }
    ]
  });

  /* --- Centor (original) ---------------------------------------------------------------
     Centor RM et al. Med Decis Making 1981;1:239-46 (adults in an emergency department): tonsillar exudate,
     tender anterior cervical lymphadenopathy or lymphadenitis, history of fever, absence of cough.
     NICE NG84 (2018): Centor 3–4 = 32–56% likelihood of isolating streptococcus; Centor 0–2: do not offer
     an antibiotic; 3–4: consider immediate or back-up antibiotic. IDSA 2012 (Shulman ST et al.
     Clin Infect Dis 2012;55:e86-102): confirm GAS with a rapid antigen test and/or culture. */
  var CENTOR_INPUTS = [
    bool('exudate', 'Tonsillar exudate', 1),
    bool('nodes', 'Tender anterior cervical lymphadenopathy or lymphadenitis', 1),
    bool('fever', 'History of fever (over 38 °C)', 1),
    bool('nocough', 'Absence of cough', 1)
  ];
  var THROAT_PEARLS = [
    'Red flags need urgent assessment rather than a score: stridor, drooling, trismus, muffled voice, unilateral swelling or a toxic-looking patient (peritonsillar abscess, epiglottitis, deep neck infection).',
    'IDSA 2012 recommends confirming group A streptococcus with a rapid antigen test and/or culture before antibiotics, not testing when overt viral features are present (cough, rhinorrhoea, hoarseness, oral ulcers), and generally not testing children under 3.'
  ];
  defs.push({
    id: 'centor', name: 'Centor score (sore throat)', category: 'Respiratory & infection',
    summary: 'Likelihood of group A streptococcal pharyngitis in adults with sore throat (original Centor criteria).',
    keywords: ['centor', 'sore throat', 'pharyngitis', 'tonsillitis', 'strep', 'streptococcus', 'gas', 'antibiotics'],
    inputs: CENTOR_INPUTS,
    compute: function (v) {
      var s = sumPoints(CENTOR_INPUTS, v);
      if (s >= 3) return result({ value: s, unit: '/ 4', label: 'Centor score', band: 'warn', title: 'Higher likelihood of streptococcal infection (3–4)',
        interpretation: '32–56% likelihood of isolating streptococcus. NICE NG84: consider an immediate antibiotic or a back-up antibiotic prescription. Where testing is available, confirm with a rapid antigen test or culture (IDSA 2012).',
        details: tickedLabels(CENTOR_INPUTS, v) });
      return result({ value: s, unit: '/ 4', label: 'Centor score', band: 'ok', title: 'Lower likelihood of streptococcal infection (0–2)',
        interpretation: 'NICE NG84: do not offer an antibiotic. Offer self-care advice and safety-netting (return if symptoms worsen rapidly, or with difficulty swallowing or breathing).',
        details: tickedLabels(CENTOR_INPUTS, v) });
    },
    formula: 'One point each: tonsillar exudate; tender anterior cervical lymphadenopathy or lymphadenitis; history of fever (>38 °C); absence of cough. Range 0–4.',
    pearls: ['Derived in adults attending an emergency department. For children aged 3 years and over, use the McIsaac version, which adds age points.'].concat(THROAT_PEARLS),
    references: [
      { label: 'Centor RM, Witherspoon JM, Dalton HP, Brody CE, Link K. The diagnosis of strep throat in adults in the emergency room. Med Decis Making 1981;1:239-46.', url: DOI + '10.1177/0272989X8100100304' },
      { label: 'NICE NG84. Sore throat (acute): antimicrobial prescribing (2018).', url: 'https://www.nice.org.uk/guidance/ng84' },
      { label: 'Shulman ST, Bisno AL, Clegg HW, et al. Clinical practice guideline for the diagnosis and management of group A streptococcal pharyngitis: 2012 update by the IDSA. Clin Infect Dis 2012;55:e86-102.', url: DOI + '10.1093/cid/cis629' }
    ]
  });

  /* --- McIsaac (modified Centor) ----------------------------------------------------------
     McIsaac WJ, White D, Tannenbaum D, Low DE. CMAJ 1998;158:75-83; McIsaac WJ et al. JAMA 2004;291:1587-95.
     Temperature >38 °C, absence of cough, swollen tender anterior cervical nodes, tonsillar swelling or
     exudate (1 point each); age 3–14 +1, 15–44 0, ≥45 −1. GAS probability by score (ranges across the
     McIsaac cohorts): ≤0 1–2.5%, 1 5–10%, 2 11–17%, 3 28–35%, ≥4 51–53%. */
  var MCISAAC_INPUTS = [
    bool('temp', 'Temperature >38 °C', 1),
    bool('nocough', 'Absence of cough', 1),
    bool('nodes', 'Swollen, tender anterior cervical nodes', 1),
    bool('tonsils', 'Tonsillar swelling or exudate', 1),
    radio('age', 'Age', [
      { value: 'child', label: '3–14 years', points: 1 },
      { value: 'adult', label: '15–44 years', points: 0 },
      { value: 'older', label: '45 years or older', points: -1 }
    ])
  ];
  defs.push({
    id: 'mcisaac', name: 'McIsaac score (modified Centor)', category: 'Respiratory & infection',
    summary: 'Centor criteria with an age adjustment, for children aged 3 years and over and adults with sore throat.',
    keywords: ['mcisaac', 'modified centor', 'centor', 'sore throat', 'pharyngitis', 'strep', 'streptococcus', 'children', 'antibiotics'],
    inputs: MCISAAC_INPUTS,
    compute: function (v) {
      var s = sumPoints(MCISAAC_INPUTS, v);
      var o = s <= 0 ? { band: 'ok', title: 'Score 0 or less: GAS probability about 1–2.5%', interpretation: 'No throat swab or antibiotic needed. Give self-care advice and safety-netting.' }
        : s === 1 ? { band: 'ok', title: 'Score 1: GAS probability about 5–10%', interpretation: 'No throat swab or antibiotic needed. Give self-care advice and safety-netting.' }
        : s === 2 ? { band: 'warn', title: 'Score 2: GAS probability about 11–17%', interpretation: 'Test (rapid antigen test or culture) and give antibiotics only if positive.' }
        : s === 3 ? { band: 'warn', title: 'Score 3: GAS probability about 28–35%', interpretation: 'Test (rapid antigen test or culture) and give antibiotics only if positive.' }
        : { band: 'danger', title: 'Score 4 or more: GAS probability about 51–53%', interpretation: 'High probability of group A streptococcus. The original rule allowed empirical treatment, but current IDSA guidance is to confirm with a rapid antigen test or culture before antibiotics where testing is available.' };
      return result(assign({ value: s, label: 'McIsaac score', details: tickedLabels(MCISAAC_INPUTS, v).concat(['Age: ' + optLabel(MCISAAC_INPUTS, 'age', v.age)]) }, o));
    },
    formula: 'One point each: temperature >38 °C; absence of cough; swollen, tender anterior cervical nodes; tonsillar swelling or exudate.\nAge 3–14 +1; 15–44 0; ≥45 −1. Range −1 to 5.',
    pearls: ['Not for children under 3 years, in whom streptococcal pharyngitis and rheumatic fever are rare.'].concat(THROAT_PEARLS),
    references: [
      { label: 'McIsaac WJ, White D, Tannenbaum D, Low DE. A clinical score to reduce unnecessary antibiotic use in patients with sore throat. CMAJ 1998;158:75-83.', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC1228750/' },
      { label: 'McIsaac WJ, Kellner JD, Aufricht P, Vanjaka A, Low DE. Empirical validation of guidelines for the management of pharyngitis in children and adults. JAMA 2004;291:1587-95.', url: DOI + '10.1001/jama.291.13.1587' },
      { label: 'Shulman ST, Bisno AL, Clegg HW, et al. Clinical practice guideline for the diagnosis and management of group A streptococcal pharyngitis: 2012 update by the IDSA. Clin Infect Dis 2012;55:e86-102.', url: DOI + '10.1093/cid/cis629' }
    ]
  });

  /* ======================================================================
     EMERGENCY: trauma and imaging decision rules
     ====================================================================== */

  /* --- Ottawa ankle and foot rules -------------------------------------------------------
     Stiell IG et al. Ann Emerg Med 1992;21:384-90; JAMA 1993;269:1127-32. Ankle series if pain in the
     malleolar zone and bone tenderness at the posterior edge or tip of either malleolus (distal 6 cm) or
     inability to bear weight both immediately and in the ED (4 steps). Foot series if pain in the midfoot
     zone and tenderness at the base of the 5th metatarsal or the navicular, or the same weight-bearing
     criterion. Bachmann LM et al. BMJ 2003;326:417: sensitivity close to 100%. */
  var ANKLE_INPUTS = [
    heading('Ankle'),
    bool('anklePain', 'Pain in the malleolar zone'),
    bool('lateral', 'Bone tenderness at the posterior edge or tip of the lateral malleolus (distal 6 cm)'),
    bool('medial', 'Bone tenderness at the posterior edge or tip of the medial malleolus (distal 6 cm)'),
    heading('Midfoot'),
    bool('footPain', 'Pain in the midfoot zone'),
    bool('mt5', 'Bone tenderness at the base of the fifth metatarsal'),
    bool('navicular', 'Bone tenderness at the navicular'),
    heading('Weight bearing'),
    bool('nwb', 'Unable to bear weight both immediately after the injury and in the emergency department', null, 'Unable to take four steps (two transfers onto each foot), regardless of limping.')
  ];
  defs.push({
    id: 'ottawa-ankle', name: 'Ottawa ankle and foot rules', category: 'Emergency',
    summary: 'Which adults with an acute ankle or midfoot injury need an ankle or foot X-ray.',
    keywords: ['ottawa', 'ankle', 'foot', 'midfoot', 'fracture', 'x-ray', 'radiograph', 'sprain', 'fifth metatarsal', 'navicular'],
    inputs: ANKLE_INPUTS,
    compute: function (v) {
      var ankle = v.anklePain && (v.lateral || v.medial || v.nwb);
      var foot = v.footPain && (v.mt5 || v.navicular || v.nwb);
      var warnings = [];
      if (!v.anklePain && (v.lateral || v.medial)) warnings.push('Malleolar tenderness is ticked without pain in the malleolar zone: check the findings.');
      if (!v.footPain && (v.mt5 || v.navicular)) warnings.push('Midfoot tenderness is ticked without pain in the midfoot zone: check the findings.');
      var lim = ' Use clinical judgement rather than the rules when assessment is unreliable (intoxication, head injury, multiple painful injuries, reduced sensation) and for injuries more than 10 days old.';
      if (ankle || foot) {
        var which = ankle && foot ? 'Ankle and foot X-ray series indicated' : ankle ? 'Ankle X-ray series indicated' : 'Foot X-ray series indicated';
        return result({ label: 'Ottawa rules', band: 'warn', title: which, interpretation: 'At least one Ottawa criterion is positive for the zone(s) shown.' + lim, details: tickedLabels(ANKLE_INPUTS, v), warnings: warnings });
      }
      return result({ label: 'Ottawa rules', band: 'ok', title: 'No X-ray needed by the Ottawa rules',
        interpretation: 'Fracture is very unlikely (rule sensitivity close to 100%). Treat as a soft-tissue injury with advice to return if unable to weight-bear or if pain is not improving within about a week.' + lim,
        details: tickedLabels(ANKLE_INPUTS, v), warnings: warnings });
    },
    formula: 'Ankle X-ray series if pain in the malleolar zone AND any of: bone tenderness at the posterior edge or tip of the lateral malleolus (distal 6 cm); the same at the medial malleolus; inability to bear weight immediately and in the ED (4 steps).\nFoot X-ray series if pain in the midfoot zone AND any of: tenderness at the base of the 5th metatarsal; tenderness at the navicular; inability to bear weight immediately and in the ED.',
    pearls: [
      'Palpate the posterior edge of each malleolus over its distal 6 cm, not just the tip, to catch posterior malleolar fractures.',
      'Derived and validated in adults (18 years and over). Specificity is modest, so many X-rays requested under the rules are still normal.'
    ],
    references: [
      { label: 'Stiell IG, Greenberg GH, McKnight RD, et al. A study to develop clinical decision rules for the use of radiography in acute ankle injuries. Ann Emerg Med 1992;21:384-90.', url: DOI + '10.1016/S0196-0644(05)82656-3' },
      { label: 'Stiell IG, Greenberg GH, McKnight RD, et al. Decision rules for the use of radiography in acute ankle injuries: refinement and prospective validation. JAMA 1993;269:1127-32.', url: DOI + '10.1001/jama.1993.03500090063034' },
      { label: 'Bachmann LM, Kolb E, Koller MT, Steurer J, ter Riet G. Accuracy of Ottawa ankle rules to exclude fractures of the ankle and mid-foot: systematic review. BMJ 2003;326:417.', url: DOI + '10.1136/bmj.326.7386.417' }
    ]
  });

  /* --- Ottawa knee rule -------------------------------------------------------------------
     Stiell IG et al. Ann Emerg Med 1995;26:405-13; JAMA 1996;275:611-5. X-ray if any of: age ≥55; isolated
     tenderness of the patella; tenderness at the head of the fibula; inability to flex to 90°; inability to
     bear weight both immediately and in the ED (4 steps). */
  var KNEE_INPUTS = [
    bool('age55', 'Age 55 years or older'),
    bool('patella', 'Isolated tenderness of the patella (no other bony tenderness of the knee)'),
    bool('fibula', 'Tenderness at the head of the fibula'),
    bool('flex', 'Unable to flex the knee to 90°'),
    bool('nwb', 'Unable to bear weight both immediately after the injury and in the emergency department', null, 'Unable to take four steps (two transfers onto each leg), regardless of limping.')
  ];
  defs.push({
    id: 'ottawa-knee', name: 'Ottawa knee rule', category: 'Emergency',
    summary: 'Which adults with an acute knee injury need a knee X-ray.',
    keywords: ['ottawa', 'knee', 'fracture', 'x-ray', 'radiograph', 'patella', 'fibula', 'tibial plateau'],
    inputs: KNEE_INPUTS,
    compute: function (v) {
      var pos = tickedLabels(KNEE_INPUTS, v);
      if (pos.length) return result({ label: 'Ottawa knee rule', band: 'warn', title: 'Knee X-ray indicated', interpretation: 'At least one Ottawa knee criterion is present.', details: pos });
      return result({ label: 'Ottawa knee rule', band: 'ok', title: 'No X-ray needed by the Ottawa knee rule',
        interpretation: 'Fracture is very unlikely. Advise review if unable to weight-bear or if pain is not improving. Use clinical judgement when assessment is unreliable (intoxication, altered consciousness, multiple injuries, reduced sensation).', details: pos });
    },
    formula: 'Knee X-ray if any of: age ≥55; isolated tenderness of the patella; tenderness at the head of the fibula; inability to flex to 90°; inability to bear weight both immediately and in the ED (4 steps).',
    pearls: ['Derived and validated in adults with acute knee injuries; not for isolated skin injuries or injuries several days old.', 'The rule targets fractures, not ligament or meniscal injuries, which need clinical follow-up.'],
    references: [
      { label: 'Stiell IG, Greenberg GH, Wells GA, et al. Derivation of a decision rule for the use of radiography in acute knee injuries. Ann Emerg Med 1995;26:405-13.', url: DOI + '10.1016/S0196-0644(95)70106-0' },
      { label: 'Stiell IG, Greenberg GH, Wells GA, et al. Prospective validation of a decision rule for the use of radiography in acute knee injuries. JAMA 1996;275:611-5.', url: DOI + '10.1001/jama.1996.03530320035031' }
    ]
  });

  /* --- Canadian CT Head Rule ------------------------------------------------------------------
     Stiell IG et al. Lancet 2001;357:1391-6. For minor head injury (GCS 13–15 with witnessed loss of
     consciousness, definite amnesia or witnessed disorientation) in patients ≥16 years. High risk (for
     neurosurgical intervention): GCS <15 at 2 h; suspected open or depressed skull fracture; any sign of
     basal skull fracture; vomiting ≥2 episodes; age ≥65. Medium risk (for brain injury on CT): amnesia
     before impact >30 min; dangerous mechanism (pedestrian struck by motor vehicle, occupant ejected,
     fall from >3 feet or 5 stairs). Sensitivity 100% for neurosurgical intervention and 98.4% for
     clinically important brain injury. */
  var CCHR_EXCL = ['xAge', 'xAnticoag', 'xSeizure', 'xDeficit', 'xUnstable', 'xMinimal'];
  var CCHR_HIGH = ['gcs2h', 'skull', 'basal', 'vomit', 'age65'];
  var CCHR_MED = ['amnesia', 'mechanism'];
  var CCHR_INPUTS = [
    note('For patients with blunt head injury, GCS 13–15, and witnessed loss of consciousness, definite amnesia or witnessed disorientation.'),
    heading('Rule does not apply if any of these'),
    bool('xAge', 'Age under 16 years'),
    bool('xAnticoag', 'Taking an anticoagulant or has a bleeding disorder'),
    bool('xSeizure', 'Seizure after the injury'),
    bool('xDeficit', 'Acute focal neurological deficit'),
    bool('xUnstable', 'Unstable vital signs or major trauma'),
    bool('xMinimal', 'No loss of consciousness, amnesia or disorientation'),
    heading('High risk (for neurosurgical intervention)'),
    bool('gcs2h', 'GCS below 15 at 2 hours after the injury'),
    bool('skull', 'Suspected open or depressed skull fracture'),
    bool('basal', 'Any sign of basal skull fracture', null, 'Haemotympanum, "raccoon" eyes, CSF otorrhoea or rhinorrhoea, Battle’s sign'),
    bool('vomit', 'Vomiting, 2 or more episodes'),
    bool('age65', 'Age 65 years or older'),
    heading('Medium risk (for brain injury on CT)'),
    bool('amnesia', 'Amnesia for events before the impact of more than 30 minutes (retrograde amnesia)'),
    bool('mechanism', 'Dangerous mechanism', null, 'Pedestrian struck by a motor vehicle, occupant ejected from a motor vehicle, or fall from more than 3 feet (0.91 m) or 5 stairs')
  ];
  defs.push({
    id: 'canadian-ct-head', name: 'Canadian CT Head Rule', category: 'Emergency',
    summary: 'Which adults with minor head injury (GCS 13–15) need a CT head scan.',
    keywords: ['canadian ct head', 'cchr', 'head injury', 'minor head injury', 'ct', 'tbi', 'concussion', 'imaging'],
    inputs: CCHR_INPUTS,
    compute: function (v) {
      if (any(v, CCHR_EXCL)) return result({ label: 'Canadian CT Head Rule', band: 'info', title: 'Rule does not apply',
        interpretation: 'These patients were excluded from the derivation study. Use clinical judgement and local head-injury guidance; anticoagulated patients, those with seizures or focal deficits and children need a different pathway.',
        details: tickedLabels(CCHR_INPUTS, v, CCHR_EXCL) });
      var high = tickedLabels(CCHR_INPUTS, v, CCHR_HIGH), med = tickedLabels(CCHR_INPUTS, v, CCHR_MED);
      if (high.length) return result({ label: 'Canadian CT Head Rule', band: 'danger', title: 'CT head required: high risk',
        interpretation: 'High risk of needing neurosurgical intervention (these factors were 100% sensitive in the derivation study).', details: high.concat(med) });
      if (med.length) return result({ label: 'Canadian CT Head Rule', band: 'warn', title: 'CT head required: medium risk',
        interpretation: 'Medium risk of clinically important brain injury on CT (high- and medium-risk factors together were 98.4% sensitive).', details: med });
      return result({ label: 'Canadian CT Head Rule', band: 'ok', title: 'CT not required by the rule',
        interpretation: 'No high- or medium-risk factors. Discharge with written head-injury advice and a responsible adult, if otherwise appropriate, and return if headache worsens, vomiting, drowsiness, confusion or new neurological symptoms develop.' });
    },
    formula: 'CT is required for minor head injury with any one of:\nHigh risk: GCS <15 at 2 h; suspected open or depressed skull fracture; any sign of basal skull fracture; vomiting ≥2 episodes; age ≥65.\nMedium risk: amnesia before impact >30 min; dangerous mechanism (pedestrian struck, occupant ejected, fall >3 feet or 5 stairs).',
    pearls: [
      'Not for patients on anticoagulants or with bleeding disorders: most guidelines advise a low threshold for CT in these patients.',
      'National guidance (e.g. NICE NG232) uses its own criteria, including timing of CT. Follow your local pathway.'
    ],
    references: [
      { label: 'Stiell IG, Wells GA, Vandemheen K, et al. The Canadian CT Head Rule for patients with minor head injury. Lancet 2001;357:1391-6.', url: DOI + '10.1016/S0140-6736(00)04561-X' }
    ]
  });

  /* --- NEXUS ---------------------------------------------------------------------------------
     Hoffman JR et al. N Engl J Med 2000;343:94-9. Imaging not needed if all five low-risk criteria are met:
     no posterior midline cervical tenderness, no evidence of intoxication, normal level of alertness,
     no focal neurological deficit, no painful distracting injury. Sensitivity 99.6% (95% CI 98.6–100) for
     clinically significant injury; specificity 12.9%. Definitions of alertness and distracting injury from
     the NEXUS study. */
  var NEXUS_INPUTS = [
    note('Tick any finding that is present. For blunt trauma patients in whom cervical-spine injury is suspected.'),
    bool('tender', 'Posterior midline cervical-spine tenderness'),
    bool('intox', 'Evidence of intoxication'),
    bool('alert', 'Abnormal level of alertness', null, 'e.g. GCS ≤14, disorientation, unable to remember 3 objects at 5 minutes, delayed or inappropriate response to stimuli'),
    bool('focal', 'Focal neurological deficit'),
    bool('distract', 'Painful distracting injury', null, 'e.g. long-bone fracture, large laceration, degloving or crush injury, large burn, or any injury causing acute functional impairment')
  ];
  defs.push({
    id: 'nexus-c-spine', name: 'NEXUS cervical-spine criteria', category: 'Emergency',
    summary: 'Low-risk criteria that rule out the need for cervical-spine imaging after blunt trauma.',
    keywords: ['nexus', 'c-spine', 'cervical spine', 'neck', 'trauma', 'imaging', 'collar', 'clearance'],
    inputs: NEXUS_INPUTS,
    compute: function (v) {
      var pos = tickedLabels(NEXUS_INPUTS, v);
      if (pos.length) return result({ label: 'NEXUS', band: 'warn', title: 'Imaging indicated: not low risk', interpretation: 'At least one NEXUS low-risk criterion is not met, so the cervical spine cannot be cleared clinically. Keep the neck immobilised as per protocol and image (CT is usually preferred in adults).', details: pos });
      return result({ label: 'NEXUS', band: 'ok', title: 'Low risk: imaging not required', interpretation: 'All five low-risk criteria are met, so the cervical spine can be cleared clinically (sensitivity 99.6% for clinically significant injury in the NEXUS study).', details: pos });
    },
    formula: 'Imaging is not required if ALL are absent: posterior midline cervical tenderness; evidence of intoxication; abnormal alertness; focal neurological deficit; painful distracting injury.',
    pearls: [
      'Specificity is low (about 13%), so many patients who need imaging under NEXUS have no injury.',
      'In alert, stable adults, the Canadian C-Spine Rule was more sensitive and specific than NEXUS in a head-to-head study (Stiell 2003).',
      'Few very young children were enrolled; apply with caution under 2 years.'
    ],
    references: [
      { label: 'Hoffman JR, Mower WR, Wolfson AB, Todd KH, Zucker MI. Validity of a set of clinical criteria to rule out injury to the cervical spine in patients with blunt trauma. N Engl J Med 2000;343:94-9.', url: DOI + '10.1056/NEJM200007133430203' },
      { label: 'Stiell IG, Clement CM, McKnight RD, et al. The Canadian C-spine rule versus the NEXUS low-risk criteria in patients with trauma. N Engl J Med 2003;349:2510-8.', url: DOI + '10.1056/NEJMoa031375' }
    ]
  });

  /* --- Canadian C-Spine Rule ----------------------------------------------------------------------
     Stiell IG et al. JAMA 2001;286:1841-8. For alert (GCS 15), stable trauma patients. (1) High-risk factor
     (age ≥65, dangerous mechanism, paraesthesias in extremities) → radiography. (2) Low-risk factor that
     allows safe assessment of range of motion (simple rear-end MVC, sitting position in ED, ambulatory at
     any time, delayed onset of neck pain, absence of midline c-spine tenderness)? None → radiography.
     (3) Able to actively rotate neck 45° left and right? Unable → radiography. Sensitivity 100%,
     specificity 42.5% for clinically important c-spine injury. */
  var CCR_EXCL = ['xGcs', 'xUnstable', 'xAge', 'xParalysis', 'xKnown'];
  var CCR_HIGH = ['age65', 'mechanism', 'paraesthesia'];
  var CCR_LOW = ['rearEnd', 'sitting', 'ambulatory', 'delayed', 'noMidline'];
  var CCR_INPUTS = [
    note('For alert (GCS 15), stable adults after trauma in whom cervical-spine injury is a concern.'),
    heading('Rule does not apply if any of these'),
    bool('xGcs', 'GCS below 15'),
    bool('xUnstable', 'Unstable vital signs (systolic BP <90 mmHg, or respiratory rate <10 or >24/min)'),
    bool('xAge', 'Age under 16 years'),
    bool('xParalysis', 'Acute paralysis'),
    bool('xKnown', 'Known vertebral disease or previous cervical-spine surgery'),
    heading('1. Any high-risk factor that mandates imaging?'),
    bool('age65', 'Age 65 years or older'),
    bool('mechanism', 'Dangerous mechanism', null, 'Fall from 3 feet (0.91 m) or 5 stairs or more; axial load to the head (e.g. diving); motor vehicle collision at high speed (>100 km/h), rollover or ejection; motorised recreational vehicle; bicycle collision'),
    bool('paraesthesia', 'Paraesthesias in the extremities'),
    heading('2. Any low-risk factor that allows safe assessment of range of motion?'),
    bool('rearEnd', 'Simple rear-end motor vehicle collision', null, 'Excludes being pushed into oncoming traffic, hit by a bus or large truck, rollover, or hit by a high-speed vehicle'),
    bool('sitting', 'Sitting position in the emergency department'),
    bool('ambulatory', 'Ambulatory at any time since the injury'),
    bool('delayed', 'Delayed (not immediate) onset of neck pain'),
    bool('noMidline', 'Absence of midline cervical-spine tenderness'),
    heading('3. Range of motion'),
    radio('rotate', 'Able to actively rotate the neck 45° to the left and right?', [
      { value: 'yes', label: 'Yes, able' },
      { value: 'no', label: 'No, unable' }
    ], { required: false, hint: 'Assess only if no high-risk factor and at least one low-risk factor is present.' })
  ];
  defs.push({
    id: 'canadian-c-spine', name: 'Canadian C-Spine Rule', category: 'Emergency',
    summary: 'Which alert, stable adult trauma patients need cervical-spine imaging.',
    keywords: ['canadian c-spine', 'ccr', 'cervical spine', 'c-spine', 'neck', 'trauma', 'imaging', 'clearance', 'whiplash'],
    inputs: CCR_INPUTS,
    compute: function (v) {
      var name = 'Canadian C-Spine Rule';
      if (any(v, CCR_EXCL)) return result({ label: name, band: 'info', title: 'Rule does not apply',
        interpretation: 'These patients were excluded from the derivation study. Immobilise as per protocol and use clinical judgement and local trauma guidance.', details: tickedLabels(CCR_INPUTS, v, CCR_EXCL) });
      var high = tickedLabels(CCR_INPUTS, v, CCR_HIGH);
      if (high.length) return result({ label: name, band: 'warn', title: 'Imaging indicated: high-risk factor', interpretation: 'Image the cervical spine (CT is usually preferred in adults; follow local guidance).', details: high });
      var low = tickedLabels(CCR_INPUTS, v, CCR_LOW);
      if (!low.length) return result({ label: name, band: 'warn', title: 'Imaging indicated: no low-risk factor', interpretation: 'Range of motion cannot be assessed safely without a low-risk factor. Image the cervical spine.' });
      if (v.rotate === 'yes') return result({ label: name, band: 'ok', title: 'No imaging needed', interpretation: 'No high-risk factor, at least one low-risk factor, and able to rotate the neck 45° each way: the cervical spine can be cleared clinically (rule sensitivity 100% in the derivation study).', details: low });
      if (v.rotate === 'no') return result({ label: name, band: 'warn', title: 'Imaging indicated: unable to rotate 45°', interpretation: 'Image the cervical spine (CT is usually preferred in adults; follow local guidance).', details: low });
      return result({ label: name, band: 'info', title: 'Assess active neck rotation to complete the rule', interpretation: 'No high-risk factor and at least one low-risk factor: ask the patient to actively rotate the neck 45° to the left and right, then record the answer above.', details: low });
    },
    formula: '1. High-risk factor (age ≥65, dangerous mechanism, paraesthesias in extremities) → imaging.\n2. No low-risk factor (simple rear-end MVC, sitting in ED, ambulatory at any time, delayed onset of neck pain, no midline tenderness) → imaging.\n3. Unable to actively rotate the neck 45° left and right → imaging; able → no imaging.',
    pearls: [
      'The rule was 100% sensitive and 42.5% specific for clinically important cervical-spine injury in the derivation study.',
      'In a head-to-head study it was more sensitive and more specific than NEXUS (Stiell 2003).'
    ],
    references: [
      { label: 'Stiell IG, Wells GA, Vandemheen KL, et al. The Canadian C-spine rule for radiography in alert and stable trauma patients. JAMA 2001;286:1841-8.', url: DOI + '10.1001/jama.286.15.1841' },
      { label: 'Stiell IG, Clement CM, McKnight RD, et al. The Canadian C-spine rule versus the NEXUS low-risk criteria in patients with trauma. N Engl J Med 2003;349:2510-8.', url: DOI + '10.1056/NEJMoa031375' }
    ]
  });

  /* --- PECARN paediatric head injury rule -----------------------------------------------------------
     Kuppermann N et al. Lancet 2009;374:1160-70. Children <18 years with GCS 14–15 within 24 h of head trauma.
     <2 years: GCS 14 or other signs of altered mental status, or palpable skull fracture → CT recommended
     (4.4% risk of ciTBI); occipital/parietal/temporal scalp haematoma, LOC ≥5 s, severe mechanism, or not acting
     normally per parent → observation versus CT (0.9%); none → CT not recommended (<0.02%).
     ≥2 years: GCS 14 or other signs of altered mental status, or signs of basilar skull fracture → CT (4.3%);
     history of LOC, vomiting, severe mechanism or severe headache → observation versus CT (0.9%);
     none → CT not recommended (<0.05%). Validation: NPV 100% (<2 y) and 99.95% (≥2 y). */
  var PECARN_UNDER2 = { high: ['ams', 'skullFx'], mid: ['haematoma', 'loc5', 'mechanism', 'notNormal'] };
  var PECARN_OVER2 = { high: ['ams', 'basilar'], mid: ['loc', 'vomiting', 'mechanism', 'headache'] };
  var PECARN_INPUTS = [
    radio('age', 'Age group', [{ value: 'under2', label: 'Under 2 years' }, { value: 'over2', label: '2 years and older' }]),
    note('For children with GCS 14–15 within 24 hours of head trauma. Not for trivial mechanisms (ground-level falls or walking into stationary objects with no signs other than scalp abrasions or lacerations), penetrating trauma, known brain tumours, pre-existing neurological disorders, ventricular shunts or bleeding disorders.'),
    heading('Both age groups'),
    bool('ams', 'GCS 14 or other signs of altered mental status', null, 'Agitation, somnolence, repetitive questioning or slow response to verbal communication'),
    bool('mechanism', 'Severe mechanism of injury', null, 'Motor vehicle crash with ejection, death of another passenger or rollover; pedestrian or cyclist without helmet struck by a motorised vehicle; fall of more than 0.9 m (3 ft) if under 2 years or more than 1.5 m (5 ft) if 2 or older; head struck by a high-impact object'),
    heading('Under 2 years'),
    bool('skullFx', 'Palpable skull fracture'),
    bool('haematoma', 'Occipital, parietal or temporal scalp haematoma'),
    bool('loc5', 'Loss of consciousness for 5 seconds or more'),
    bool('notNormal', 'Not acting normally according to the parent'),
    heading('2 years and older'),
    bool('basilar', 'Signs of basilar skull fracture'),
    bool('loc', 'Any history of loss of consciousness'),
    bool('vomiting', 'History of vomiting'),
    bool('headache', 'Severe headache')
  ];
  defs.push({
    id: 'pecarn-head', name: 'PECARN paediatric head injury rule', category: 'Emergency',
    summary: 'Identifies children with minor head trauma (GCS 14–15) at very low risk of clinically important brain injury, in whom CT can be avoided.',
    keywords: ['pecarn', 'paediatric', 'pediatric', 'child', 'head injury', 'ct', 'citbi', 'minor head trauma', 'kuppermann'],
    inputs: PECARN_INPUTS,
    compute: function (v) {
      var u2 = v.age === 'under2', set = u2 ? PECARN_UNDER2 : PECARN_OVER2, other = u2 ? PECARN_OVER2 : PECARN_UNDER2;
      var high = tickedLabels(PECARN_INPUTS, v, set.high), mid = tickedLabels(PECARN_INPUTS, v, set.mid);
      var used = set.high.concat(set.mid);
      var ignored = tickedLabels(PECARN_INPUTS, v, other.high.concat(other.mid).filter(function (id) { return used.indexOf(id) < 0; }));
      var warnings = ignored.length ? ['Not part of the rule for this age group, so not scored: ' + ignored.join('; ') + '. Use clinical judgement.'] : [];
      var name = 'PECARN (' + (u2 ? 'under 2 years' : '2 years and older') + ')';
      if (high.length) return result({ label: name, band: 'danger', title: 'CT recommended', interpretation: 'Risk of clinically important traumatic brain injury about ' + (u2 ? '4.4%' : '4.3%') + '.', details: high.concat(mid), warnings: warnings });
      if (mid.length) return result({ label: name, band: 'warn', title: 'Observation versus CT', interpretation: 'Risk of clinically important brain injury about 0.9%. Decide between a period of observation and CT using: clinician experience, multiple versus isolated findings, worsening symptoms or signs during observation' + (u2 ? ', age under 3 months' : '') + ', and parental preference.', details: mid, warnings: warnings });
      return result({ label: name, band: 'ok', title: 'CT not recommended', interpretation: 'Very low risk of clinically important brain injury (' + (u2 ? 'below 0.02%' : 'below 0.05%') + '). Discharge with head-injury advice to a responsible carer if otherwise well, with clear return advice.', warnings: warnings });
    },
    formula: 'Under 2 years: altered mental status (incl. GCS 14) or palpable skull fracture → CT (≈4.4% ciTBI). Otherwise occipital/parietal/temporal scalp haematoma, LOC ≥5 s, severe mechanism or not acting normally per parent → observation versus CT (≈0.9%). None → CT not recommended (<0.02%).\n2 years and older: altered mental status (incl. GCS 14) or signs of basilar skull fracture → CT (≈4.3%). Otherwise any LOC, vomiting, severe mechanism or severe headache → observation versus CT (≈0.9%). None → CT not recommended (<0.05%).\nciTBI = death from TBI, neurosurgery, intubation >24 h, or admission ≥2 nights for TBI.',
    pearls: [
      'In validation, the rule had a negative predictive value of 100% under 2 years and 99.95% at 2 years and older, and missed no neurosurgical cases.',
      'Consider non-accidental injury in every infant with a head injury, especially without a consistent history.'
    ],
    references: [
      { label: 'Kuppermann N, Holmes JF, Dayan PS, et al. Identification of children at very low risk of clinically-important brain injuries after head trauma: a prospective cohort study. Lancet 2009;374:1160-70.', url: DOI + '10.1016/S0140-6736(09)61558-0' }
    ]
  });

  /* ======================================================================
     NEUROLOGY
     ====================================================================== */

  /* --- ABCD² ------------------------------------------------------------------------------------
     Johnston SC et al. Lancet 2007;369:283-92: age ≥60 (1); BP ≥140/90 (1); unilateral weakness (2) or speech
     impairment without weakness (1); duration ≥60 min (2) or 10–59 min (1); diabetes (1). 2-day stroke risk:
     0–3 1.0%, 4–5 4.1%, 6–7 8.1%. NICE NG128 (2019): do not use scoring systems such as ABCD2 to assess
     risk or decide urgency; give aspirin 300 mg immediately unless contraindicated and refer for specialist
     assessment within 24 hours of symptom onset. */
  var ABCD2_INPUTS = [
    bool('age', 'Age 60 years or older', 1),
    bool('bp', 'Blood pressure ≥140/90 mmHg at first assessment (systolic ≥140 or diastolic ≥90)', 1),
    radio('clinical', 'Clinical features', [
      { value: 'weakness', label: 'Unilateral weakness', points: 2 },
      { value: 'speech', label: 'Speech disturbance without weakness', points: 1 },
      { value: 'other', label: 'Other symptoms', points: 0 }
    ]),
    radio('duration', 'Duration of symptoms', [
      { value: 'long', label: '60 minutes or more', points: 2 },
      { value: 'mid', label: '10–59 minutes', points: 1 },
      { value: 'short', label: 'Less than 10 minutes', points: 0 }
    ]),
    bool('diabetes', 'Diabetes', 1)
  ];
  defs.push({
    id: 'abcd2', name: 'ABCD² score (TIA)', category: 'Neurology',
    summary: 'Early stroke risk after transient ischaemic attack, with current guidance on its limited role.',
    keywords: ['abcd2', 'abcd', 'tia', 'transient ischaemic attack', 'transient ischemic attack', 'stroke risk', 'mini-stroke'],
    inputs: ABCD2_INPUTS,
    compute: function (v) {
      var s = sumPoints(ABCD2_INPUTS, v);
      var o = s <= 3 ? { band: 'info', title: 'Low score (0–3): 2-day stroke risk about 1.0%' } : s <= 5 ? { band: 'warn', title: 'Moderate score (4–5): 2-day stroke risk about 4.1%' } : { band: 'danger', title: 'High score (6–7): 2-day stroke risk about 8.1%' };
      return result(assign({ value: s, unit: '/ 7', label: 'ABCD²',
        interpretation: 'A low score does not exclude a TIA or a high-risk cause (e.g. atrial fibrillation, carotid stenosis). NICE NG128 advises against using ABCD² to decide urgency: give aspirin 300 mg immediately unless contraindicated and arrange specialist assessment within 24 hours of symptom onset for every suspected TIA.',
        details: tickedLabels(ABCD2_INPUTS, v).concat([optLabel(ABCD2_INPUTS, 'clinical', v.clinical), 'Duration: ' + optLabel(ABCD2_INPUTS, 'duration', v.duration)]),
        warnings: ['If symptoms are still present, treat as an acute stroke and activate the stroke pathway: reperfusion treatment may be possible.'] }, o));
    },
    formula: 'Age ≥60: 1. Blood pressure ≥140/90 mmHg: 1. Clinical features: unilateral weakness 2; speech disturbance without weakness 1. Duration: ≥60 min 2; 10–59 min 1. Diabetes: 1. Range 0–7.\n2-day stroke risk (Johnston 2007): 0–3 1.0%; 4–5 4.1%; 6–7 8.1%.',
    pearls: [
      'The score discriminates poorly in individual patients; imaging and the underlying mechanism (carotid stenosis, atrial fibrillation) matter more.',
      'Do not use for patients with ongoing symptoms or other acute neurological presentations.'
    ],
    references: [
      { label: 'Johnston SC, Rothwell PM, Nguyen-Huynh MN, et al. Validation and refinement of scores to predict very early stroke risk after transient ischaemic attack. Lancet 2007;369:283-92.', url: DOI + '10.1016/S0140-6736(07)60150-0' },
      { label: 'NICE NG128. Stroke and transient ischaemic attack in over 16s: diagnosis and initial management (2019, updated 2022).', url: 'https://www.nice.org.uk/guidance/ng128' }
    ]
  });

  /* --- NIH Stroke Scale ------------------------------------------------------------------------------
     NIH Stroke Scale (NINDS; public domain). Brott T et al. Stroke 1989;20:864-70. Item wording follows the
     official NINDS form. UN (untestable: amputation, joint fusion, intubation) items contribute 0 to the total.
     Severity bands: 0 no stroke symptoms; 1–4 minor; 5–15 moderate; 16–20 moderate to severe; 21–42 severe
     (Kwah LK, Diong J. J Physiother 2014;60:61). */
  var UN_LIMB = { value: 'UN', label: 'UN = Amputation or joint fusion (document the reason)' };
  function armOptions() {
    return scored([
      [0, 'No drift; limb holds 90 (or 45) degrees for full 10 seconds.'],
      [1, 'Drift; limb holds 90 (or 45) degrees, but drifts down before full 10 seconds; does not hit bed or other support.'],
      [2, 'Some effort against gravity; limb cannot get to or maintain (if cued) 90 (or 45) degrees, drifts down to bed, but has some effort against gravity.'],
      [3, 'No effort against gravity; limb falls.'],
      [4, 'No movement.']
    ]).concat([UN_LIMB]);
  }
  function legOptions() {
    return scored([
      [0, 'No drift; leg holds 30-degree position for full 5 seconds.'],
      [1, 'Drift; leg falls by the end of the 5-second period but does not hit bed.'],
      [2, 'Some effort against gravity; leg falls to bed by 5 seconds, but has some effort against gravity.'],
      [3, 'No effort against gravity; leg falls to bed immediately.'],
      [4, 'No movement.']
    ]).concat([UN_LIMB]);
  }
  var NIHSS_INPUTS = [
    note('Score what the patient does on the first attempt, in the order listed, without coaching. NIH Stroke Scale, National Institute of Neurological Disorders and Stroke (public domain).'),
    radio('loc', '1a. Level of consciousness', scored([
      [0, 'Alert; keenly responsive.'],
      [1, 'Not alert; but arousable by minor stimulation to obey, answer, or respond.'],
      [2, 'Not alert; requires repeated stimulation to attend, or is obtunded and requires strong or painful stimulation to make movements (not stereotyped).'],
      [3, 'Responds only with reflex motor or autonomic effects or totally unresponsive, flaccid, and areflexic.']
    ])),
    radio('locQ', '1b. LOC questions (month and age)', scored([
      [0, 'Answers both questions correctly.'],
      [1, 'Answers one question correctly.'],
      [2, 'Answers neither question correctly.']
    ]), { hint: 'Aphasic or stuporous patients who do not understand score 2. Patients unable to speak because of intubation, orotracheal trauma, severe dysarthria, language barrier or another problem not caused by aphasia score 1.' }),
    radio('locC', '1c. LOC commands (open and close eyes; grip and release non-paretic hand)', scored([
      [0, 'Performs both tasks correctly.'],
      [1, 'Performs one task correctly.'],
      [2, 'Performs neither task correctly.']
    ])),
    radio('gaze', '2. Best gaze (horizontal eye movements)', scored([
      [0, 'Normal.'],
      [1, 'Partial gaze palsy; gaze is abnormal in one or both eyes, but forced deviation or total gaze paresis is not present.'],
      [2, 'Forced deviation, or total gaze paresis not overcome by the oculocephalic maneuver.']
    ]), { hint: 'An isolated peripheral nerve paresis (CN III, IV or VI) scores 1.' }),
    radio('visual', '3. Visual fields', scored([
      [0, 'No visual loss.'],
      [1, 'Partial hemianopia.'],
      [2, 'Complete hemianopia.'],
      [3, 'Bilateral hemianopia (blind including cortical blindness).']
    ]), { hint: 'If the patient is blind from any cause, score 3.' }),
    radio('face', '4. Facial palsy', scored([
      [0, 'Normal symmetrical movements.'],
      [1, 'Minor paralysis (flattened nasolabial fold, asymmetry on smiling).'],
      [2, 'Partial paralysis (total or near-total paralysis of lower face).'],
      [3, 'Complete paralysis of one or both sides (absence of facial movement in the upper and lower face).']
    ])),
    radio('armL', '5a. Motor arm: left', armOptions()),
    radio('armR', '5b. Motor arm: right', armOptions()),
    radio('legL', '6a. Motor leg: left', legOptions()),
    radio('legR', '6b. Motor leg: right', legOptions()),
    radio('ataxia', '7. Limb ataxia', scored([
      [0, 'Absent.'],
      [1, 'Present in one limb.'],
      [2, 'Present in two limbs.']
    ]).concat([UN_LIMB]), { hint: 'Ataxia is scored absent (0) if the patient cannot understand or is paralysed.' }),
    radio('sensory', '8. Sensory', scored([
      [0, 'Normal; no sensory loss.'],
      [1, 'Mild-to-moderate sensory loss; patient feels pinprick is less sharp or is dull on the affected side; or there is a loss of superficial pain with pinprick, but patient is aware of being touched.'],
      [2, 'Severe to total sensory loss; patient is not aware of being touched in the face, arm, and leg.']
    ]), { hint: 'A patient in coma (1a = 3) is scored 2.' }),
    radio('language', '9. Best language', scored([
      [0, 'No aphasia; normal.'],
      [1, 'Mild-to-moderate aphasia; some obvious loss of fluency or facility of comprehension, without significant limitation on ideas expressed or form of expression. Reduction of speech and/or comprehension, however, makes conversation about provided materials difficult or impossible.'],
      [2, 'Severe aphasia; all communication is through fragmentary expression; great need for inference, questioning, and guessing by the listener. Range of information that can be exchanged is limited; listener carries burden of communication.'],
      [3, 'Mute, global aphasia; no usable speech or auditory comprehension.']
    ]), { hint: 'A patient in coma (1a = 3) is scored 3.' }),
    radio('dysarthria', '10. Dysarthria', scored([
      [0, 'Normal.'],
      [1, 'Mild-to-moderate dysarthria; patient slurs at least some words and, at worst, can be understood with some difficulty.'],
      [2, 'Severe dysarthria; patient\'s speech is so slurred as to be unintelligible in the absence of or out of proportion to any dysphasia, or is mute/anarthric.']
    ]).concat([{ value: 'UN', label: 'UN = Intubated or other physical barrier (document the reason)' }])),
    radio('neglect', '11. Extinction and inattention (formerly neglect)', scored([
      [0, 'No abnormality.'],
      [1, 'Visual, tactile, auditory, spatial, or personal inattention or extinction to bilateral simultaneous stimulation in one of the sensory modalities.'],
      [2, 'Profound hemi-inattention or extinction to more than one modality; does not recognize own hand or orients to only one side of space.']
    ]))
  ];
  var NIHSS_ITEMS = ['loc', 'locQ', 'locC', 'gaze', 'visual', 'face', 'armL', 'armR', 'legL', 'legR', 'ataxia', 'sensory', 'language', 'dysarthria', 'neglect'];
  defs.push({
    id: 'nihss', name: 'NIH Stroke Scale (NIHSS)', category: 'Neurology',
    summary: 'All 15 items of the NIH Stroke Scale with the official descriptors, for quantifying stroke severity.',
    keywords: ['nihss', 'nih stroke scale', 'stroke', 'cva', 'thrombolysis', 'thrombectomy', 'neurology', 'deficit'],
    inputs: NIHSS_INPUTS,
    compute: function (v) {
      var total = 0, un = [];
      NIHSS_ITEMS.forEach(function (id) { if (v[id] === 'UN') un.push(findInput(NIHSS_INPUTS, id).label.split('.')[0]); else total += Number(v[id]); });
      var o = total === 0 ? { band: 'ok', title: 'No stroke symptoms on the scale (0)' } : total <= 4 ? { band: 'info', title: 'Minor stroke (1–4)' } : total <= 15 ? { band: 'warn', title: 'Moderate stroke (5–15)' } : total <= 20 ? { band: 'danger', title: 'Moderate to severe stroke (16–20)' } : { band: 'danger', title: 'Severe stroke (21–42)' };
      var details = NIHSS_ITEMS.filter(function (id) { return v[id] !== 0; }).map(function (id) { return { label: findInput(NIHSS_INPUTS, id).label, value: v[id] }; });
      var warnings = un.length ? ['Untestable (UN) item' + (un.length > 1 ? 's ' : ' ') + un.join(', ') + ' count as 0, so the total may understate the deficit.'] : [];
      return result(assign({ value: total, unit: '/ 42', label: 'NIHSS',
        interpretation: 'Severity bands are descriptive. A low score does not exclude a disabling stroke (e.g. isolated aphasia, hemianopia or posterior-circulation stroke), and eligibility for thrombolysis or thrombectomy depends on the whole clinical picture and imaging, not the score alone.',
        details: details, warnings: warnings }, o));
    },
    formula: 'Sum of 15 items: 1a (0–3), 1b (0–2), 1c (0–2), 2 (0–2), 3 (0–3), 4 (0–3), 5a/5b (0–4 each), 6a/6b (0–4 each), 7 (0–2), 8 (0–2), 9 (0–3), 10 (0–2), 11 (0–2). Range 0–42. UN items count 0.\nSeverity: 0 none; 1–4 minor; 5–15 moderate; 16–20 moderate to severe; 21–42 severe.',
    pearls: [
      'Record items in order and do not go back to change scores.',
      'The scale weights language and other left-hemisphere and anterior-circulation deficits; posterior-circulation strokes can score low despite disability.',
      'Certification training improves reliability between examiners.'
    ],
    references: [
      { label: 'NIH Stroke Scale. National Institute of Neurological Disorders and Stroke (public domain).' },
      { label: 'Brott T, Adams HP Jr, Olinger CP, et al. Measurements of acute cerebral infarction: a clinical examination scale. Stroke 1989;20:864-70.', url: DOI + '10.1161/01.STR.20.7.864' },
      { label: 'Kwah LK, Diong J. National Institutes of Health Stroke Scale (NIHSS). J Physiother 2014;60:61.', url: DOI + '10.1016/j.jphys.2013.12.012' }
    ]
  });

  /* ======================================================================
     GASTROENTEROLOGY
     ====================================================================== */

  /* --- Glasgow–Blatchford score ------------------------------------------------------------------------
     Blatchford O, Murray WR, Blatchford M. Lancet 2000;356:1318-21. Urea (mmol/L) <6.5 0; 6.5–7.9 2; 8.0–9.9 3;
     10.0–24.9 4; ≥25 6. Hb (g/L) men ≥130 0; 120–129 1; 100–119 3; <100 6; women ≥120 0; 100–119 1; <100 6.
     SBP ≥110 0; 100–109 1; 90–99 2; <90 3. Pulse ≥100 1; melaena 1; syncope 2; hepatic disease 2; cardiac
     failure 2. Range 0–23. NICE CG141 (2012): consider early discharge with a pre-endoscopy score of 0.
     Stanley AJ et al. BMJ 2017;356:i6432 and Gralnek IM et al. ESGE guideline, Endoscopy 2021;53:300-32:
     score 0–1 = very low risk, outpatient management without early endoscopy. BUN (mg/dL) = urea × 2.8. */
  var GBS_INPUTS = [
    num('urea', 'Blood urea', U_UREA, 0, 150),
    num('hb', 'Haemoglobin', U_HB, 20, 250),
    radio('sex', 'Sex (haemoglobin cut-offs differ)', [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]),
    num('sbp', 'Systolic blood pressure', 'mmHg', 30, 300, { step: 1 }),
    bool('pulse', 'Pulse ≥100/min', 1),
    bool('melaena', 'Presentation with melaena', 1),
    bool('syncope', 'Presentation with syncope', 2),
    bool('hepatic', 'Hepatic disease', 2, 'Known history, or clinical and laboratory evidence, of chronic or acute liver disease'),
    bool('cardiac', 'Cardiac failure', 2, 'Known history, or clinical and echocardiographic evidence, of cardiac failure')
  ];
  defs.push({
    id: 'glasgow-blatchford', name: 'Glasgow–Blatchford bleeding score', category: 'Gastroenterology',
    summary: 'Pre-endoscopy risk in upper gastrointestinal bleeding: identifies very-low-risk patients suitable for outpatient care.',
    keywords: ['glasgow blatchford', 'blatchford', 'gbs', 'upper gi bleed', 'ugib', 'haematemesis', 'hematemesis', 'melaena', 'melena', 'endoscopy'],
    inputs: GBS_INPUTS,
    compute: function (v) {
      var u = snap(v.urea), hb = snap(v.hb);
      var ureaP = u < 6.5 ? 0 : u < 8 ? 2 : u < 10 ? 3 : u < 25 ? 4 : 6;
      var hbP = v.sex === 'male' ? (hb >= 130 ? 0 : hb >= 120 ? 1 : hb >= 100 ? 3 : 6) : (hb >= 120 ? 0 : hb >= 100 ? 1 : 6);
      var sbpP = v.sbp >= 110 ? 0 : v.sbp >= 100 ? 1 : v.sbp >= 90 ? 2 : 3;
      var s = ureaP + hbP + sbpP + sumPoints(GBS_INPUTS, v);
      var details = [
        { label: 'Urea ' + round(u, 1) + ' mmol/L', value: ureaP },
        { label: 'Haemoglobin ' + round(hb, 0) + ' g/L (' + v.sex + ')', value: hbP },
        { label: 'Systolic BP ' + v.sbp + ' mmHg', value: sbpP }
      ].concat(GBS_INPUTS.filter(function (i) { return i.type === 'bool' && v[i.id]; }).map(function (i) { return { label: i.label, value: i.points }; }));
      var warnings = v.sbp < 90 ? ['Systolic BP below 90 mmHg: resuscitate and arrange endoscopy immediately after resuscitation if the patient is unstable.'] : [];
      var o = s === 0 ? { band: 'ok', title: 'Very low risk (0)', interpretation: 'Very low risk of needing intervention or of death. NICE CG141: consider early discharge without inpatient endoscopy, with outpatient follow-up.' }
        : s === 1 ? { band: 'ok', title: 'Very low risk (1)', interpretation: 'Very low risk. ESGE (2021) and international consensus: outpatients with a score of 0–1 do not need early endoscopy or admission; arrange outpatient investigation and clear return advice.' }
        : { band: v.sbp < 90 ? 'danger' : 'warn', title: 'Not low risk (2 or more)', interpretation: 'Admit for assessment and endoscopy, generally within 24 hours of presentation. Higher scores indicate a greater likelihood of needing transfusion or endoscopic or surgical intervention.' };
      return result(assign({ value: s, unit: '/ 23', label: 'Glasgow–Blatchford score', details: details, warnings: warnings }, o));
    },
    formula: 'Urea (mmol/L): <6.5 → 0; 6.5–7.9 → 2; 8.0–9.9 → 3; 10.0–24.9 → 4; ≥25 → 6 (BUN mg/dL = urea × 2.8).\nHaemoglobin (g/L), men: ≥130 → 0; 120–129 → 1; 100–119 → 3; <100 → 6. Women: ≥120 → 0; 100–119 → 1; <100 → 6.\nSystolic BP: ≥110 → 0; 100–109 → 1; 90–99 → 2; <90 → 3.\nPulse ≥100 → 1; melaena → 1; syncope → 2; hepatic disease → 2; cardiac failure → 2. Range 0–23.',
    pearls: [
      'Use the score before endoscopy. It does not replace assessment of haemodynamic instability.',
      'Urea rises with upper GI blood loss; a raised urea with a normal creatinine supports an upper GI source.'
    ],
    references: [
      { label: 'Blatchford O, Murray WR, Blatchford M. A risk score to predict need for treatment for upper-gastrointestinal haemorrhage. Lancet 2000;356:1318-21.', url: DOI + '10.1016/S0140-6736(00)02816-6' },
      { label: 'Stanley AJ, Laine L, Dalton HR, et al. Comparison of risk scoring systems for patients presenting with upper gastrointestinal bleeding: international multicentre prospective study. BMJ 2017;356:i6432.', url: DOI + '10.1136/bmj.i6432' },
      { label: 'Gralnek IM, Stanley AJ, Morris AJ, et al. Endoscopic diagnosis and management of nonvariceal upper gastrointestinal hemorrhage: ESGE Guideline – Update 2021. Endoscopy 2021;53:300-32.' },
      { label: 'NICE CG141. Acute upper gastrointestinal bleeding in over 16s: management (2012).', url: 'https://www.nice.org.uk/guidance/cg141' }
    ]
  });

  /* --- Alvarado score ---------------------------------------------------------------------------------------
     Alvarado A. Ann Emerg Med 1986;15:557-64 (MANTRELS): migration 1, anorexia 1, nausea/vomiting 1, RLQ
     tenderness 2, rebound 1, elevated temperature (≥37.3 °C) 1, leucocytosis 2, shift to the left 1. Ohle R et al.
     BMC Med 2011;9:139: cut-off 5 rules out (sensitivity 99%); cut-off 7 performs poorly for ruling in
     (specificity 81%); well calibrated in men, over-predicts in women and (intermediate/high) children. */
  var ALVARADO_INPUTS = [
    bool('migration', 'Migration of pain to the right iliac fossa', 1),
    bool('anorexia', 'Anorexia (or ketones in the urine)', 1),
    bool('nausea', 'Nausea or vomiting', 1),
    bool('tenderness', 'Tenderness in the right iliac fossa', 2),
    bool('rebound', 'Rebound tenderness', 1),
    bool('fever', 'Elevated temperature (37.3 °C or more)', 1),
    bool('wbc', 'Leucocytosis (white cells >10 ×10⁹/L)', 2),
    bool('shift', 'Shift to the left (neutrophils >75%)', 1)
  ];
  defs.push({
    id: 'alvarado', name: 'Alvarado score (appendicitis)', category: 'Gastroenterology',
    summary: 'MANTRELS score for suspected acute appendicitis: most useful for ruling it out.',
    keywords: ['alvarado', 'mantrels', 'appendicitis', 'appendix', 'right iliac fossa', 'rif pain', 'abdominal pain'],
    inputs: ALVARADO_INPUTS,
    compute: function (v) {
      var s = sumPoints(ALVARADO_INPUTS, v);
      var o = s <= 4 ? { band: 'ok', title: 'Low risk (0–4)', interpretation: 'Appendicitis unlikely: a cut-off of 5 rules out appendicitis well (sensitivity 99% in a systematic review). Consider other causes, and discharge with safety-netting or arrange review if symptoms persist or worsen.' }
        : s <= 6 ? { band: 'warn', title: 'Intermediate (5–6): compatible with appendicitis', interpretation: 'Observe, re-examine and consider imaging (ultrasound or CT) and surgical review.' }
        : s <= 8 ? { band: 'danger', title: 'High (7–8): probable appendicitis', interpretation: 'Surgical review. The score alone is not specific enough to confirm appendicitis, especially in women and children; consider imaging.' }
        : { band: 'danger', title: 'Very high (9–10): very probable appendicitis', interpretation: 'Surgical review. Consider imaging where the diagnosis is uncertain.' };
      return result(assign({ value: s, unit: '/ 10', label: 'Alvarado score', details: tickedLabels(ALVARADO_INPUTS, v) }, o));
    },
    formula: 'Migration of pain to RIF 1; anorexia 1; nausea or vomiting 1; RIF tenderness 2; rebound tenderness 1; temperature ≥37.3 °C 1; leucocytosis (>10 ×10⁹/L) 2; neutrophils >75% 1. Range 0–10.\nAlvarado 1986: 5–6 compatible, 7–8 probable, 9–10 very probable appendicitis.',
    pearls: [
      'Best used to rule out: at a cut-off of 5 the sensitivity was 99% in men, women and children.',
      'The score over-predicts appendicitis in women and in children at intermediate and high scores (Ohle 2011).',
      'Always consider pregnancy (test for it) and gynaecological causes in women with right iliac fossa pain.'
    ],
    references: [
      { label: 'Alvarado A. A practical score for the early diagnosis of acute appendicitis. Ann Emerg Med 1986;15:557-64.', url: DOI + '10.1016/S0196-0644(86)80993-3' },
      { label: 'Ohle R, O’Reilly F, O’Brien KK, Fahey T, Dimitrov BD. The Alvarado score for predicting acute appendicitis: a systematic review. BMC Med 2011;9:139.', url: DOI + '10.1186/1741-7015-9-139' }
    ]
  });

  /* ======================================================================
     PSYCHIATRY & SUBSTANCE USE
     ====================================================================== */

  var FREQ = [
    { value: 0, label: 'Not at all', points: 0 },
    { value: 1, label: 'Several days', points: 1 },
    { value: 2, label: 'More than half the days', points: 2 },
    { value: 3, label: 'Nearly every day', points: 3 }
  ];
  var DIFFICULTY = [
    { value: 'not', label: 'Not difficult at all' },
    { value: 'somewhat', label: 'Somewhat difficult' },
    { value: 'very', label: 'Very difficult' },
    { value: 'extremely', label: 'Extremely difficult' }
  ];
  var PFIZER_NOTE = 'Developed by Drs Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with an educational grant from Pfizer Inc. No permission required to reproduce, translate, display or distribute.';

  /* --- PHQ-9 ------------------------------------------------------------------------------------------------
     Kroenke K, Spitzer RL, Williams JBW. J Gen Intern Med 2001;16:606-13: severity 0–4 minimal, 5–9 mild,
     10–14 moderate, 15–19 moderately severe, 20–27 severe; ≥10 sensitivity 88%, specificity 88% for major
     depression. Diagnostic algorithm: major depressive syndrome if ≥5 items at least "more than half the days"
     including item 1 or 2 (item 9 counts if present at all); other depressive syndrome if 2–4 such items.
     Treatment actions: Kroenke K, Spitzer RL. Psychiatr Ann 2002;32:509-15. */
  var PHQ9_ITEMS = [
    'Little interest or pleasure in doing things',
    'Feeling down, depressed, or hopeless',
    'Trouble falling or staying asleep, or sleeping too much',
    'Feeling tired or having little energy',
    'Poor appetite or overeating',
    'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
    'Trouble concentrating on things, such as reading the newspaper or watching television',
    'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual',
    'Thoughts that you would be better off dead or of hurting yourself in some way'
  ];
  var PHQ9_INPUTS = [note('Over the last 2 weeks, how often have you been bothered by any of the following problems?')]
    .concat(PHQ9_ITEMS.map(function (t, i) { return radio('q' + (i + 1), (i + 1) + '. ' + t, FREQ); }))
    .concat([radio('difficulty', 'If you checked off any problems, how difficult have these problems made it for you to do your work, take care of things at home, or get along with other people?', DIFFICULTY, { required: false, hint: 'Not scored; records functional impact.' })]);
  defs.push({
    id: 'phq-9', name: 'PHQ-9 (depression)', category: 'Psychiatry',
    summary: 'Patient Health Questionnaire depression severity score, with an item-9 safety prompt and the diagnostic algorithm.',
    keywords: ['phq', 'phq9', 'phq-9', 'depression', 'mood', 'low mood', 'suicide', 'mental health', 'screening'],
    inputs: PHQ9_INPUTS,
    compute: function (v) {
      var s = 0, freq = 0;
      for (var i = 1; i <= 9; i++) { s += v['q' + i]; if (v['q' + i] >= 2 || (i === 9 && v.q9 >= 1)) freq++; }
      var cardinal = v.q1 >= 2 || v.q2 >= 2;
      var algo = cardinal && freq >= 5 ? 'Meets the PHQ-9 algorithm for a major depressive syndrome (provisional; confirm clinically)'
        : cardinal && freq >= 2 ? 'Meets the PHQ-9 algorithm for another depressive syndrome (provisional; confirm clinically)'
        : 'Does not meet the PHQ-9 diagnostic algorithm';
      var o = s <= 4 ? { band: 'ok', title: 'Minimal or none (0–4)', interpretation: 'No treatment action indicated by the score.' }
        : s <= 9 ? { band: 'info', title: 'Mild (5–9)', interpretation: 'Watchful waiting; repeat the PHQ-9 at follow-up.' }
        : s <= 14 ? { band: 'warn', title: 'Moderate (10–14)', interpretation: 'Treatment plan, considering counselling, follow-up and/or pharmacotherapy.' }
        : s <= 19 ? { band: 'danger', title: 'Moderately severe (15–19)', interpretation: 'Active treatment with pharmacotherapy and/or psychotherapy.' }
        : { band: 'danger', title: 'Severe (20–27)', interpretation: 'Immediate initiation of pharmacotherapy and, if severe impairment or poor response to therapy, expedited referral to a mental health specialist for psychotherapy and/or collaborative management.' };
      var details = [{ label: 'Diagnostic algorithm', value: algo }, { label: 'Item 9 (thoughts of death or self-harm)', value: optLabel(PHQ9_INPUTS, 'q9', v.q9) }];
      if (v.difficulty) details.push({ label: 'Functional difficulty', value: optLabel(PHQ9_INPUTS, 'difficulty', v.difficulty) });
      var warnings = [];
      if (v.q9 >= 1) { o.band = bandMax(o.band, 'danger'); o.title += ' · item 9 positive'; warnings.push('Item 9 is positive (thoughts of being better off dead or of self-harm). ' + SUICIDE_SAFETY); }
      return result(assign({ value: s, unit: '/ 27', label: 'PHQ-9 score', details: details, warnings: warnings }, o));
    },
    formula: 'Nine items scored 0 (not at all) to 3 (nearly every day); total 0–27.\nSeverity: 0–4 minimal; 5–9 mild; 10–14 moderate; 15–19 moderately severe; 20–27 severe.\nAlgorithm: major depressive syndrome if 5 or more items are scored at least "more than half the days" (item 9 counts if present at all) and one of them is item 1 or 2; other depressive syndrome if 2–4 such items including item 1 or 2.',
    pearls: [
      'A score of 10 or more had 88% sensitivity and 88% specificity for major depression in primary care.',
      'The PHQ-9 supports, but does not replace, a clinical diagnostic interview; exclude bipolar disorder, grief, substance use and medical causes.',
      'Repeat the PHQ-9 to monitor response: a fall of 5 or more points is generally considered clinically meaningful.',
      PFIZER_NOTE
    ],
    references: [
      { label: 'Kroenke K, Spitzer RL, Williams JBW. The PHQ-9: validity of a brief depression severity measure. J Gen Intern Med 2001;16:606-13.', url: DOI + '10.1046/j.1525-1497.2001.016009606.x' },
      { label: 'Kroenke K, Spitzer RL. The PHQ-9: a new depression diagnostic and severity measure. Psychiatr Ann 2002;32:509-15.' }
    ]
  });

  /* --- GAD-7 ------------------------------------------------------------------------------------------------
     Spitzer RL, Kroenke K, Williams JBW, Löwe B. Arch Intern Med 2006;166:1092-7: 0–4 minimal, 5–9 mild,
     10–14 moderate, 15–21 severe; ≥10 sensitivity 89%, specificity 82% for GAD. Kroenke K et al. Ann Intern Med
     2007;146:317-25: also detects panic, social anxiety and post-traumatic stress disorder. */
  var GAD7_ITEMS = [
    'Feeling nervous, anxious or on edge',
    'Not being able to stop or control worrying',
    'Worrying too much about different things',
    'Trouble relaxing',
    'Being so restless that it is hard to sit still',
    'Becoming easily annoyed or irritable',
    'Feeling afraid as if something awful might happen'
  ];
  var GAD7_INPUTS = [note('Over the last 2 weeks, how often have you been bothered by the following problems?')]
    .concat(GAD7_ITEMS.map(function (t, i) { return radio('q' + (i + 1), (i + 1) + '. ' + t, FREQ); }))
    .concat([radio('difficulty', 'If you checked off any problems, how difficult have these problems made it for you to do your work, take care of things at home, or get along with other people?', DIFFICULTY, { required: false, hint: 'Not scored; records functional impact.' })]);
  defs.push({
    id: 'gad-7', name: 'GAD-7 (anxiety)', category: 'Psychiatry',
    summary: 'Generalised Anxiety Disorder 7-item severity score.',
    keywords: ['gad', 'gad7', 'gad-7', 'anxiety', 'worry', 'panic', 'mental health', 'screening'],
    inputs: GAD7_INPUTS,
    compute: function (v) {
      var s = 0; for (var i = 1; i <= 7; i++) s += v['q' + i];
      var o = s <= 4 ? { band: 'ok', title: 'Minimal anxiety (0–4)', interpretation: 'Symptoms below the threshold for further assessment.' }
        : s <= 9 ? { band: 'info', title: 'Mild anxiety (5–9)', interpretation: 'Monitor; consider self-help resources and repeat the GAD-7.' }
        : s <= 14 ? { band: 'warn', title: 'Moderate anxiety (10–14)', interpretation: 'Above the usual cut-off of 10: assess further for an anxiety disorder and discuss treatment options (psychological therapy and/or medication).' }
        : { band: 'danger', title: 'Severe anxiety (15–21)', interpretation: 'Assess further for an anxiety disorder and offer active treatment; consider specialist referral, and ask about depression, substance use and risk.' };
      var details = v.difficulty ? [{ label: 'Functional difficulty', value: optLabel(GAD7_INPUTS, 'difficulty', v.difficulty) }] : [];
      return result(assign({ value: s, unit: '/ 21', label: 'GAD-7 score', details: details }, o));
    },
    formula: 'Seven items scored 0 (not at all) to 3 (nearly every day); total 0–21.\nSeverity: 0–4 minimal; 5–9 mild; 10–14 moderate; 15–21 severe. Cut-off for further evaluation: ≥10.',
    pearls: [
      'A score of 10 or more had 89% sensitivity and 82% specificity for generalised anxiety disorder.',
      'It also screens reasonably for panic disorder, social anxiety disorder and post-traumatic stress disorder.',
      'A screening and monitoring tool; confirm the diagnosis clinically and consider physical causes (e.g. thyrotoxicosis, stimulants).',
      PFIZER_NOTE
    ],
    references: [
      { label: 'Spitzer RL, Kroenke K, Williams JBW, Löwe B. A brief measure for assessing generalized anxiety disorder: the GAD-7. Arch Intern Med 2006;166:1092-7.', url: DOI + '10.1001/archinte.166.10.1092' },
      { label: 'Kroenke K, Spitzer RL, Williams JBW, Monahan PO, Löwe B. Anxiety disorders in primary care: prevalence, impairment, comorbidity, and detection. Ann Intern Med 2007;146:317-25.', url: DOI + '10.7326/0003-4819-146-5-200703060-00004' }
    ]
  });

  /* --- AUDIT / AUDIT-C ---------------------------------------------------------------------------------------
     Babor TF, Higgins-Biddle JC, Saunders JB, Monteiro MG. AUDIT: guidelines for use in primary care, 2nd ed.
     Geneva: WHO, 2001. Zones: I 0–7 alcohol education; II 8–15 simple advice; III 16–19 simple advice plus brief
     counselling and continued monitoring; IV 20–40 referral to a specialist for diagnostic evaluation and treatment.
     AUDIT-C (items 1–3): Bush K et al. Arch Intern Med 1998;158:1789-95; positive ≥4 men, ≥3 women
     (Bradley KA et al. Alcohol Clin Exp Res 2007;31:1208-17). */
  var AUDIT_FREQ = scored([[0, 'Never'], [1, 'Less than monthly'], [2, 'Monthly'], [3, 'Weekly'], [4, 'Daily or almost daily']]);
  var AUDIT_HARM = [{ value: 0, label: 'No', points: 0 }, { value: 2, label: 'Yes, but not in the last year', points: 2 }, { value: 4, label: 'Yes, during the last year', points: 4 }];
  var AUDIT_Q1 = radio('q1', '1. How often do you have a drink containing alcohol?', scored([[0, 'Never'], [1, 'Monthly or less'], [2, '2 to 4 times a month'], [3, '2 to 3 times a week'], [4, '4 or more times a week']]));
  var AUDIT_Q2 = radio('q2', '2. How many drinks containing alcohol do you have on a typical day when you are drinking?', scored([[0, '1 or 2'], [1, '3 or 4'], [2, '5 or 6'], [3, '7, 8, or 9'], [4, '10 or more']]));
  var AUDIT_Q3 = radio('q3', '3. How often do you have six or more drinks on one occasion?', AUDIT_FREQ);
  var DRINK_NOTE = 'A "drink" is a standard drink: about 10 g of pure alcohol in the WHO AUDIT (local definitions vary, e.g. 14 g in the USA and 8 g per UK unit).';
  var AUDIT_INPUTS = [
    note(DRINK_NOTE + ' If the answer to question 1 is "Never", score questions 2–8 as 0.'),
    AUDIT_Q1, AUDIT_Q2, AUDIT_Q3,
    radio('q4', '4. How often during the last year have you found that you were not able to stop drinking once you had started?', AUDIT_FREQ),
    radio('q5', '5. How often during the last year have you failed to do what was normally expected from you because of drinking?', AUDIT_FREQ),
    radio('q6', '6. How often during the last year have you needed a first drink in the morning to get yourself going after a heavy drinking session?', AUDIT_FREQ),
    radio('q7', '7. How often during the last year have you had a feeling of guilt or remorse after drinking?', AUDIT_FREQ),
    radio('q8', '8. How often during the last year have you been unable to remember what happened the night before because you had been drinking?', AUDIT_FREQ),
    radio('q9', '9. Have you or someone else been injured as a result of your drinking?', AUDIT_HARM),
    radio('q10', '10. Has a relative or friend or a doctor or another health worker been concerned about your drinking or suggested you cut down?', AUDIT_HARM)
  ];
  defs.push({
    id: 'audit', name: 'AUDIT (alcohol use, 10 items)', category: 'Psychiatry',
    summary: 'WHO Alcohol Use Disorders Identification Test: hazardous drinking, harmful use and possible dependence, with the WHO risk zones.',
    keywords: ['audit', 'alcohol', 'drinking', 'alcohol use disorder', 'hazardous drinking', 'dependence', 'brief intervention', 'who'],
    inputs: AUDIT_INPUTS,
    compute: function (v) {
      var s = 0; for (var i = 1; i <= 10; i++) s += v['q' + i];
      var cons = v.q1 + v.q2 + v.q3, dep = v.q4 + v.q5 + v.q6, harm = v.q7 + v.q8 + v.q9 + v.q10;
      var o = s <= 7 ? { band: 'ok', title: 'Zone I (0–7): low risk', interpretation: 'Alcohol education.' }
        : s <= 15 ? { band: 'warn', title: 'Zone II (8–15): hazardous drinking', interpretation: 'Simple advice focused on reducing hazardous drinking.' }
        : s <= 19 ? { band: 'warn', title: 'Zone III (16–19): harmful drinking', interpretation: 'Simple advice plus brief counselling and continued monitoring.' }
        : { band: 'danger', title: 'Zone IV (20–40): possible dependence', interpretation: 'Referral to a specialist for diagnostic evaluation and treatment of alcohol dependence.' };
      var warnings = [];
      if (dep > 0) warnings.push('Points on questions 4–6 suggest the presence or emergence of alcohol dependence. Assess the risk of withdrawal (seizures, delirium tremens) before advising abrupt cessation.');
      return result(assign({ value: s, unit: '/ 40', label: 'AUDIT score', warnings: warnings, details: [
        { label: 'Consumption (Q1–3)', value: cons + ' / 12' },
        { label: 'Dependence symptoms (Q4–6)', value: dep + ' / 12' },
        { label: 'Alcohol-related harm (Q7–10)', value: harm + ' / 16' }
      ] }, o));
    },
    formula: 'Questions 1–8 scored 0–4; questions 9–10 scored 0, 2 or 4. Total 0–40.\nWHO risk zones: I 0–7 (alcohol education); II 8–15 (simple advice); III 16–19 (simple advice plus brief counselling and continued monitoring); IV 20–40 (referral to specialist).\nA score of 8 or more indicates hazardous or harmful alcohol use.',
    pearls: [
      'Any points on questions 2 or 3 indicate drinking at a hazardous level; points on questions 7–10 indicate that alcohol-related harm is already occurring.',
      'The AUDIT supports a conversation about drinking; it is not a diagnosis of alcohol use disorder.',
      'Source: WHO AUDIT manual (Babor et al., 2001), reproduced with attribution.'
    ],
    references: [
      { label: 'Babor TF, Higgins-Biddle JC, Saunders JB, Monteiro MG. AUDIT: The Alcohol Use Disorders Identification Test. Guidelines for use in primary care, 2nd ed. Geneva: World Health Organization, 2001.', url: 'https://www.who.int/publications/i/item/WHO-MSD-MSB-01.6a' }
    ]
  });

  var AUDITC_INPUTS = [
    note(DRINK_NOTE),
    AUDIT_Q1, AUDIT_Q2, AUDIT_Q3,
    radio('sex', 'Sex (sets the screening cut-off)', [
      { value: 'female', label: 'Female (positive at 3 or more)' },
      { value: 'male', label: 'Male (positive at 4 or more)' },
      { value: 'unstated', label: 'Not stated (uses the more sensitive cut-off of 3)' }
    ])
  ];
  defs.push({
    id: 'audit-c', name: 'AUDIT-C (alcohol consumption screen)', category: 'Psychiatry',
    summary: 'The three consumption questions of the AUDIT as a brief screen for unhealthy alcohol use.',
    keywords: ['audit-c', 'auditc', 'alcohol', 'drinking', 'screening', 'brief screen', 'binge'],
    inputs: AUDITC_INPUTS,
    compute: function (v) {
      var s = v.q1 + v.q2 + v.q3;
      var cut = v.sex === 'male' ? 4 : 3;
      var pos = s >= cut;
      return result({ value: s, unit: '/ 12', label: 'AUDIT-C score', band: pos ? 'warn' : 'ok',
        title: pos ? 'Positive screen (cut-off ' + cut + ')' : 'Negative screen (cut-off ' + cut + ')',
        interpretation: pos ? 'Screen positive for unhealthy alcohol use. Complete the full AUDIT (questions 4–10) or a clinical assessment, and offer brief advice. Higher scores indicate greater risk.'
          : 'Below the screening cut-off. Reinforce lower-risk drinking and rescreen periodically.',
        details: [{ label: 'Cut-off used', value: cut + ' or more (' + optLabel(AUDITC_INPUTS, 'sex', v.sex).split(' (')[0].toLowerCase() + ')' }],
        warnings: v.sex === 'unstated' ? ['Cut-offs were validated by sex (≥4 men, ≥3 women). Without sex recorded, the more sensitive cut-off of 3 is used.'] : [] });
    },
    formula: 'AUDIT questions 1–3, each scored 0–4; total 0–12.\nPositive screen: ≥4 in men, ≥3 in women (Bradley 2007).',
    pearls: [
      'UK services use a different AUDIT-C version (UK units, a sex-specific binge question and a positive cut-off of 5); the scores are not interchangeable.',
      'If question 1 is "Never", the score is 0.'
    ],
    references: [
      { label: 'Bush K, Kivlahan DR, McDonell MB, Fihn SD, Bradley KA. The AUDIT alcohol consumption questions (AUDIT-C): an effective brief screening test for problem drinking. Arch Intern Med 1998;158:1789-95.', url: DOI + '10.1001/archinte.158.16.1789' },
      { label: 'Bradley KA, DeBenedetti AF, Volk RJ, et al. AUDIT-C as a brief screen for alcohol misuse in primary care. Alcohol Clin Exp Res 2007;31:1208-17.', url: DOI + '10.1111/j.1530-0277.2007.00403.x' },
      { label: 'Babor TF, Higgins-Biddle JC, Saunders JB, Monteiro MG. AUDIT, 2nd ed. Geneva: WHO, 2001.', url: 'https://www.who.int/publications/i/item/WHO-MSD-MSB-01.6a' }
    ]
  });

  /* --- EPDS (scorer) -----------------------------------------------------------------------------------------
     Cox JL, Holden JM, Sagovsky R. Br J Psychiatry 1987;150:782-6. Ten items scored 0–3 (items 1, 2 and 4
     scored 0–3 top to bottom; items 3 and 5–10 reverse-scored). Cut-off 12/13 for probable depression; a
     lower cut-off of 9/10 is used for screening. Any positive answer on item 10 needs immediate assessment.
     The questionnaire text is copyright and is not reproduced: the RCPsych requires written permission for
     republication, including online. */
  var EPDS_TOPICS = ['Laughter and humour', 'Anticipating enjoyment', 'Self-blame (reverse-scored)', 'Anxiety or worry', 'Feeling scared or panicky (reverse-scored)', 'Coping (reverse-scored)', 'Unhappiness affecting sleep (reverse-scored)', 'Sadness (reverse-scored)', 'Crying (reverse-scored)', 'Thoughts of self-harm (reverse-scored)'];
  var EPDS_OPTS = [{ value: 0, label: '0', points: 0 }, { value: 1, label: '1', points: 1 }, { value: 2, label: '2', points: 2 }, { value: 3, label: '3', points: 3 }];
  var EPDS_INPUTS = [note('Enter the score (0–3) for each item from a completed EPDS form, which the woman fills in about the past 7 days. Items 1, 2 and 4 score 0 to 3 from the first to the last response; items 3 and 5–10 are reverse-scored (first response = 3). The questionnaire wording is copyright of the Royal College of Psychiatrists and is not reproduced here.')]
    .concat(EPDS_TOPICS.map(function (t, i) { return select('q' + (i + 1), 'Item ' + (i + 1) + ': ' + t, EPDS_OPTS); }));
  defs.push({
    id: 'epds', name: 'EPDS scorer (Edinburgh Postnatal Depression Scale)', category: 'Psychiatry',
    summary: 'Totals item scores from a completed EPDS form, with the item-10 self-harm safety prompt.',
    keywords: ['epds', 'edinburgh', 'postnatal depression', 'postpartum depression', 'perinatal', 'antenatal', 'pregnancy', 'mood', 'suicide'],
    inputs: EPDS_INPUTS, showPoints: false,
    compute: function (v) {
      var s = 0; for (var i = 1; i <= 10; i++) s += v['q' + i];
      var o = s >= 13 ? { band: 'danger', title: 'Probable depression (13 or more)', interpretation: 'Score above the 12/13 threshold: likely depressive illness of varying severity. Arrange a full clinical assessment and treatment plan.' }
        : s >= 10 ? { band: 'warn', title: 'Possible depression (10–12)', interpretation: 'Above the lower screening threshold of 9/10. Assess clinically and repeat the EPDS; local pathways may set different cut-offs.' }
        : { band: 'ok', title: 'Below screening thresholds (0–9)', interpretation: 'Depression less likely. The EPDS is a screening aid: clinical concern overrides a low score; rescreen as per local perinatal pathway.' };
      var warnings = [];
      if (v.q10 >= 1) { o.band = 'danger'; o.title += ' · item 10 positive'; warnings.push('Item 10 (thoughts of self-harm) is positive: assess risk immediately, the same day. ' + SUICIDE_SAFETY); }
      return result(assign({ value: s, unit: '/ 30', label: 'EPDS score', details: [{ label: 'Item 10 (self-harm)', value: v.q10 }], warnings: warnings }, o));
    },
    formula: 'Ten items scored 0–3; total 0–30. Items 1, 2 and 4 score 0–3 top to bottom; items 3 and 5–10 are reverse-scored.\nCox 1987: above 12/13 = probable depression; 9/10 = lower screening threshold. Any score on item 10 needs immediate assessment.',
    pearls: [
      'Validated in pregnancy and after birth; cut-offs differ in some languages and for fathers.',
      'The EPDS does not assess severity on its own and is not a diagnosis.',
      'Source: Cox JL, Holden JM, Sagovsky R (1987). Copyright 1987 The Royal College of Psychiatrists; use the official form.'
    ],
    references: [
      { label: 'Cox JL, Holden JM, Sagovsky R. Detection of postnatal depression: development of the 10-item Edinburgh Postnatal Depression Scale. Br J Psychiatry 1987;150:782-6.', url: DOI + '10.1192/bjp.150.6.782' }
    ]
  });

  /* --- CIWA-Ar ---------------------------------------------------------------------------------------------
     Sullivan JT, Sykora K, Schneiderman J, Naranjo CA, Sellers EM. Br J Addict 1989;84:1353-7. Ten items;
     maximum 67. Instrument note: "Patients scoring less than 10 do not usually need additional medication for
     withdrawal." The scale is not copyrighted and may be reproduced freely. */
  function ciwa(list) { return anchored(list); }
  var CIWA_SEVEN = function (a1, a4, a7) { return ciwa([[0, a1[0]], [1, a1[1]], [2], [3], [4, a4], [5], [6], [7, a7]]); };
  var CIWA_HALLUC = function (z, one, two, three) { return ciwa([[0, z], [1, one], [2, two], [3, three], [4, 'moderately severe hallucinations'], [5, 'severe hallucinations'], [6, 'extremely severe hallucinations'], [7, 'continuous hallucinations']]); };
  var CIWA_INPUTS = [
    note('Clinical Institute Withdrawal Assessment for Alcohol, revised (CIWA-Ar). Ask and observe; rate each item. Not copyrighted; may be reproduced freely.'),
    select('nausea', 'Nausea and vomiting', CIWA_SEVEN(['no nausea and no vomiting', 'mild nausea with no vomiting'], 'intermittent nausea with dry heaves', 'constant nausea, frequent dry heaves and vomiting'), { hint: 'Ask "Do you feel sick to your stomach? Have you vomited?" Observation.' }),
    select('tremor', 'Tremor', CIWA_SEVEN(['no tremor', 'not visible, but can be felt fingertip to fingertip'], 'moderate, with patient\'s arms extended', 'severe, even with arms not extended'), { hint: 'Arms extended and fingers spread apart. Observation.' }),
    select('sweats', 'Paroxysmal sweats', CIWA_SEVEN(['no sweat visible', 'barely perceptible sweating, palms moist'], 'beads of sweat obvious on forehead', 'drenching sweats'), { hint: 'Observation.' }),
    select('anxiety', 'Anxiety', CIWA_SEVEN(['no anxiety, at ease', 'mildly anxious'], 'moderately anxious, or guarded, so anxiety is inferred', 'equivalent to acute panic states as seen in severe delirium or acute schizophrenic reactions'), { hint: 'Ask "Do you feel nervous?" Observation.' }),
    select('agitation', 'Agitation', CIWA_SEVEN(['normal activity', 'somewhat more than normal activity'], 'moderately fidgety and restless', 'paces back and forth during most of the interview, or constantly thrashes about'), { hint: 'Observation.' }),
    select('tactile', 'Tactile disturbances', CIWA_HALLUC('none', 'very mild itching, pins and needles, burning or numbness', 'mild itching, pins and needles, burning or numbness', 'moderate itching, pins and needles, burning or numbness'), { hint: 'Ask "Have you any itching, pins and needles sensations, any burning, any numbness, or do you feel bugs crawling on or under your skin?" Observation.' }),
    select('auditory', 'Auditory disturbances', CIWA_HALLUC('not present', 'very mild harshness or ability to frighten', 'mild harshness or ability to frighten', 'moderate harshness or ability to frighten'), { hint: 'Ask "Are you more aware of sounds around you? Are they harsh? Do they frighten you? Are you hearing anything that is disturbing to you? Are you hearing things you know are not there?" Observation.' }),
    select('visual', 'Visual disturbances', CIWA_HALLUC('not present', 'very mild sensitivity', 'mild sensitivity', 'moderate sensitivity'), { hint: 'Ask "Does the light appear to be too bright? Is its color different? Does it hurt your eyes? Are you seeing anything that is disturbing to you? Are you seeing things you know are not there?" Observation.' }),
    select('headache', 'Headache, fullness in head', ciwa([[0, 'not present'], [1, 'very mild'], [2, 'mild'], [3, 'moderate'], [4, 'moderately severe'], [5, 'severe'], [6, 'very severe'], [7, 'extremely severe']]), { hint: 'Ask "Does your head feel different? Does it feel like there is a band around your head?" Do not rate for dizziness or lightheadedness. Otherwise, rate severity.' }),
    select('orientation', 'Orientation and clouding of sensorium', ciwa([[0, 'oriented and can do serial additions'], [1, 'cannot do serial additions or is uncertain about date'], [2, 'disoriented for date by no more than 2 calendar days'], [3, 'disoriented for date by more than 2 calendar days'], [4, 'disoriented for place and/or person']]), { hint: 'Ask "What day is this? Where are you? Who am I?"' })
  ];
  defs.push({
    id: 'ciwa-ar', name: 'CIWA-Ar (alcohol withdrawal)', category: 'Psychiatry',
    summary: 'Ten-item severity rating of alcohol withdrawal for symptom-triggered treatment and monitoring.',
    keywords: ['ciwa', 'ciwa-ar', 'alcohol withdrawal', 'withdrawal', 'delirium tremens', 'dts', 'benzodiazepine', 'detox'],
    inputs: CIWA_INPUTS, showPoints: false,
    compute: function (v) {
      var ids = ['nausea', 'tremor', 'sweats', 'anxiety', 'agitation', 'tactile', 'auditory', 'visual', 'headache', 'orientation'];
      var s = sumPoints(CIWA_INPUTS, v);
      var halluc = ['tactile', 'auditory', 'visual'].filter(function (id) { return v[id] >= 4; }).map(function (id) { return findInput(CIWA_INPUTS, id).label.toLowerCase(); });
      var warnings = [];
      if (halluc.length) warnings.push('Hallucinations (' + halluc.join(', ') + '): urgent medical review for severe withdrawal, delirium tremens or alcoholic hallucinosis.');
      if (v.orientation >= 2) warnings.push('Disorientation: urgent medical review; consider delirium tremens, Wernicke’s encephalopathy, head injury, hypoglycaemia, sepsis or hepatic encephalopathy.');
      var o = s < 10 ? { band: 'ok', title: 'Below 10: minimal to mild withdrawal', interpretation: 'Patients scoring less than 10 do not usually need additional medication for withdrawal (CIWA-Ar instrument note). Continue monitoring at the interval in your protocol.' }
        : { band: warnings.length ? 'danger' : 'warn', title: '10 or more: withdrawal likely to need treatment', interpretation: 'Treat according to your symptom-triggered protocol and reassess frequently. Higher scores indicate more severe withdrawal and higher risk of seizures and delirium tremens.' };
      return result(assign({ value: s, unit: '/ 67', label: 'CIWA-Ar score', warnings: warnings,
        details: ids.filter(function (id) { return v[id] > 0; }).map(function (id) { return { label: findInput(CIWA_INPUTS, id).label, value: v[id] }; }) }, o));
    },
    formula: 'Nine items scored 0–7 and orientation scored 0–4; maximum 67.\nInstrument note: patients scoring less than 10 do not usually need additional medication for withdrawal.',
    pearls: [
      'Needs a patient who can communicate: it is not valid in delirium, sedation, intubation or severe language barriers.',
      'Vital signs are not part of the score; record them separately, as autonomic instability matters.',
      'Symptoms overlap with sepsis, hypoglycaemia, hepatic encephalopathy, head injury and other drug withdrawal states.',
      'Give thiamine before glucose to anyone at risk of Wernicke’s encephalopathy.'
    ],
    references: [
      { label: 'Sullivan JT, Sykora K, Schneiderman J, Naranjo CA, Sellers EM. Assessment of alcohol withdrawal: the revised Clinical Institute Withdrawal Assessment for Alcohol scale (CIWA-Ar). Br J Addict 1989;84:1353-7.', url: DOI + '10.1111/j.1360-0443.1989.tb00737.x' }
    ]
  });

  /* --- COWS --------------------------------------------------------------------------------------------------
     Wesson DR, Ling W. The Clinical Opiate Withdrawal Scale (COWS). J Psychoactive Drugs 2003;35:253-9.
     Eleven items; total 5–12 mild, 13–24 moderate, 25–36 moderately severe, >36 severe withdrawal. */
  var COWS_INPUTS = [
    note('Clinical Opiate Withdrawal Scale. For each item, select the description that best matches the sign or symptom. Rate on what you observe or what the patient reports, considering only symptoms related to opioid withdrawal.'),
    select('pulse', 'Resting pulse rate', anchored([[0, 'pulse rate 80 or below'], [1, 'pulse rate 81–100'], [2, 'pulse rate 101–120'], [4, 'pulse rate greater than 120']]), { hint: 'Measured after the patient is sitting or lying for one minute.' }),
    select('sweating', 'Sweating', anchored([[0, 'no report of chills or flushing'], [1, 'subjective report of chills or flushing'], [2, 'flushed or observable moistness on face'], [3, 'beads of sweat on brow or face'], [4, 'sweat streaming off face']]), { hint: 'Over the past ½ hour, not accounted for by room temperature or patient activity.' }),
    select('restless', 'Restlessness', anchored([[0, 'able to sit still'], [1, 'reports difficulty sitting still, but is able to do so'], [3, 'frequent shifting or extraneous movements of legs/arms'], [5, 'unable to sit still for more than a few seconds']]), { hint: 'Observation during assessment.' }),
    select('pupils', 'Pupil size', anchored([[0, 'pupils pinned or normal size for room light'], [1, 'pupils possibly larger than normal for room light'], [2, 'pupils moderately dilated'], [5, 'pupils so dilated that only the rim of the iris is visible']])),
    select('aches', 'Bone or joint aches', anchored([[0, 'not present'], [1, 'mild diffuse discomfort'], [2, 'patient reports severe diffuse aching of joints/muscles'], [4, 'patient is rubbing joints or muscles and is unable to sit still because of discomfort']]), { hint: 'If the patient was having pain previously, only the additional component attributed to opiate withdrawal is scored.' }),
    select('nose', 'Runny nose or tearing', anchored([[0, 'not present'], [1, 'nasal stuffiness or unusually moist eyes'], [2, 'nose running or tearing'], [4, 'nose constantly running or tears streaming down cheeks']]), { hint: 'Not accounted for by cold symptoms or allergies.' }),
    select('gi', 'GI upset', anchored([[0, 'no GI symptoms'], [1, 'stomach cramps'], [2, 'nausea or loose stool'], [3, 'vomiting or diarrhea'], [5, 'multiple episodes of diarrhea or vomiting']]), { hint: 'Over the last ½ hour.' }),
    select('tremor', 'Tremor', anchored([[0, 'no tremor'], [1, 'tremor can be felt, but not observed'], [2, 'slight tremor observable'], [4, 'gross tremor or muscle twitching']]), { hint: 'Observation of outstretched hands.' }),
    select('yawning', 'Yawning', anchored([[0, 'no yawning'], [1, 'yawning once or twice during assessment'], [2, 'yawning three or more times during assessment'], [4, 'yawning several times/minute']]), { hint: 'Observation during assessment.' }),
    select('anxiety', 'Anxiety or irritability', anchored([[0, 'none'], [1, 'patient reports increasing irritability or anxiousness'], [2, 'patient obviously irritable or anxious'], [4, 'patient so irritable or anxious that participation in the assessment is difficult']])),
    select('gooseflesh', 'Gooseflesh skin', anchored([[0, 'skin is smooth'], [3, 'piloerection of skin can be felt or hairs standing up on arms'], [5, 'prominent piloerection']]))
  ];
  defs.push({
    id: 'cows', name: 'COWS (opioid withdrawal)', category: 'Psychiatry',
    summary: 'Clinical Opiate Withdrawal Scale: 11 signs and symptoms rating the severity of opioid withdrawal.',
    keywords: ['cows', 'opioid withdrawal', 'opiate withdrawal', 'heroin', 'buprenorphine', 'induction', 'methadone', 'withdrawal'],
    inputs: COWS_INPUTS, showPoints: false,
    compute: function (v) {
      var s = sumPoints(COWS_INPUTS, v);
      var o = s >= 37 ? { band: 'danger', title: 'Severe withdrawal (more than 36)' }
        : s >= 25 ? { band: 'danger', title: 'Moderately severe withdrawal (25–36)' }
        : s >= 13 ? { band: 'warn', title: 'Moderate withdrawal (13–24)' }
        : s >= 5 ? { band: 'info', title: 'Mild withdrawal (5–12)' }
        : { band: 'ok', title: 'Below the mild range (0–4)' };
      return result(assign({ value: s, unit: '/ 48', label: 'COWS score',
        interpretation: 'Use with your local protocol for symptomatic treatment or timing of buprenorphine induction (protocol thresholds vary). Reassess after treatment.',
        details: COWS_INPUTS.filter(function (i) { return i.id && v[i.id] > 0; }).map(function (i) { return { label: i.label, value: v[i.id] }; }) }, o));
    },
    formula: 'Eleven items with item-specific scores; total 0–48.\n5–12 mild; 13–24 moderate; 25–36 moderately severe; more than 36 severe withdrawal.',
    pearls: [
      'Pulse, pupils and piloerection are objective signs; recent exercise, anxiety or other drugs can confound the score.',
      'Consider co-existing withdrawal from alcohol or benzodiazepines, which can be dangerous.'
    ],
    references: [
      { label: 'Wesson DR, Ling W. The Clinical Opiate Withdrawal Scale (COWS). J Psychoactive Drugs 2003;35:253-9.', url: DOI + '10.1080/02791072.2003.10400007' }
    ]
  });

  /* ======================================================================
     GERIATRICS
     ====================================================================== */

  /* --- 4AT ---------------------------------------------------------------------------------------------------
     Bellelli G et al. Age Ageing 2014;43:496-502; Tieges Z et al. Age Ageing 2021;50:733-43 (meta-analysis:
     pooled sensitivity and specificity about 88%). Form text from www.the4at.com (free to use).
     ≥4 possible delirium ± cognitive impairment; 1–3 possible cognitive impairment; 0 delirium or severe
     cognitive impairment unlikely (delirium still possible if [4] information incomplete). */
  var FOURAT_INPUTS = [
    radio('alertness', '1. Alertness', [
      { value: 'normal', label: 'Normal (fully alert, but not agitated, throughout assessment)', points: 0 },
      { value: 'mild', label: 'Mild sleepiness for <10 seconds after waking, then normal', points: 0 },
      { value: 'abnormal', label: 'Clearly abnormal', points: 4 }
    ], { hint: 'This includes patients who may be markedly drowsy (e.g. difficult to rouse and/or obviously sleepy during assessment) or agitated/hyperactive. Observe the patient. If asleep, attempt to wake with speech or gentle touch on shoulder. Ask the patient to state their name and address to assist rating.' }),
    radio('amt4', '2. AMT4', scored([[0, 'No mistakes'], [1, '1 mistake'], [2, '2 or more mistakes/untestable']]), { hint: 'Age, date of birth, place (name of the hospital or building), current year.' }),
    radio('attention', '3. Attention: months of the year backwards', scored([[0, 'Achieves 7 months or more correctly'], [1, 'Starts but scores <7 months / refuses to start'], [2, 'Untestable (cannot start because unwell, drowsy, inattentive)']]), { hint: 'Ask the patient: "Please tell me the months of the year in backwards order, starting at December." To assist initial understanding one prompt of "what is the month before December?" is permitted.' }),
    radio('acute', '4. Acute change or fluctuating course', [
      { value: 0, label: 'No', points: 0 },
      { value: 4, label: 'Yes', points: 4 }
    ], { hint: 'Evidence of significant change or fluctuation in: alertness, cognition, other mental function (e.g. paranoia, hallucinations) arising over the last 2 weeks and still evident in last 24 hrs.' })
  ];
  defs.push({
    id: '4at', name: '4AT (delirium assessment)', category: 'Geriatrics',
    summary: 'Rapid bedside test for delirium and cognitive impairment that includes patients who cannot be tested.',
    keywords: ['4at', 'delirium', 'confusion', 'acute confusion', 'cognitive impairment', 'dementia', 'older people', 'amt4'],
    inputs: FOURAT_INPUTS,
    compute: function (v) {
      var s = sumPoints(FOURAT_INPUTS, v);
      var o = s >= 4 ? { band: 'danger', title: '4 or above: possible delirium +/- cognitive impairment', interpretation: 'Assess clinically for delirium and look for causes (infection, drugs, dehydration, urinary retention, constipation, pain, hypoxia, metabolic disturbance, alcohol withdrawal). A positive 4AT is not a diagnosis.' }
        : s >= 1 ? { band: 'warn', title: '1–3: possible cognitive impairment', interpretation: 'Consider further cognitive assessment and collateral history. Delirium is still possible, so reassess if the clinical picture changes.' }
        : { band: 'ok', title: '0: delirium or severe cognitive impairment unlikely', interpretation: 'Delirium is still possible if the information for item 4 is incomplete. Repeat the 4AT if the clinical picture changes.' };
      return result(assign({ value: s, unit: '/ 12', label: '4AT score', details: itemDetails(FOURAT_INPUTS, v, ['alertness', 'amt4', 'attention', 'acute']) }, o));
    },
    formula: 'Alertness: normal or mild sleepiness <10 s after waking 0; clearly abnormal 4.\nAMT4: no mistakes 0; 1 mistake 1; 2 or more mistakes or untestable 2.\nMonths backwards: 7 or more correct 0; starts but <7 or refuses 1; untestable 2.\nAcute change or fluctuating course: no 0; yes 4.\n≥4 possible delirium ± cognitive impairment; 1–3 possible cognitive impairment; 0 delirium or severe cognitive impairment unlikely.',
    pearls: [
      'Takes under 2 minutes and needs no special training; untestable patients still receive a score.',
      'In a meta-analysis the pooled sensitivity and specificity for delirium were both about 88% (Tieges 2021).',
      'The 4AT is free to use: www.the4at.com.'
    ],
    references: [
      { label: 'Bellelli G, Morandi A, Davis DHJ, et al. Validation of the 4AT, a new instrument for rapid delirium screening: a study in 234 hospitalised older people. Age Ageing 2014;43:496-502.', url: DOI + '10.1093/ageing/afu021' },
      { label: 'Tieges Z, Maclullich AMJ, Anand A, et al. Diagnostic accuracy of the 4AT for delirium detection in older adults: systematic review and meta-analysis. Age Ageing 2021;50:733-43.', url: DOI + '10.1093/ageing/afaa224' },
      { label: '4AT rapid clinical test for delirium: www.the4at.com', url: 'https://www.the4at.com' }
    ]
  });

  /* --- Clinical Frailty Scale 2.0 -----------------------------------------------------------------------------
     Rockwood K et al. CMAJ 2005;173:489-95; version 2.0 level names: Rockwood K, Theou O. Can Geriatr J
     2020;23:210-5. Copyright Rockwood (Dalhousie University), 2005–2020; descriptions here are brief summaries.
     Validated in people aged 65 and over; score the baseline state about 2 weeks before the acute illness. */
  var CFS_INPUTS = [
    note('Rate the person’s usual state about 2 weeks before the current illness. Validated in people aged 65 years and over; not for younger people or people with a stable single disability (e.g. learning disability, cerebral palsy).'),
    radio('level', 'Clinical Frailty Scale level', [
      { value: 1, label: '1 · Very fit', hint: 'Robust, active and energetic; exercises regularly; among the fittest for their age.' },
      { value: 2, label: '2 · Fit', hint: 'No active disease symptoms but less fit than level 1; may exercise or be very active occasionally, e.g. seasonally.' },
      { value: 3, label: '3 · Managing well', hint: 'Medical problems well controlled, even if occasionally symptomatic; often not regularly active beyond routine walking.' },
      { value: 4, label: '4 · Living with very mild frailty', hint: 'Not dependent on others for daily help, but symptoms often limit activities; commonly "slowed up" and/or tired during the day.' },
      { value: 5, label: '5 · Living with mild frailty', hint: 'More evident slowing; needs help with higher-order activities (finances, transport, heavy housework); often progressively impairs shopping, walking outside alone, meal preparation and medicines.' },
      { value: 6, label: '6 · Living with moderate frailty', hint: 'Needs help with all outside activities and with keeping house; often has problems with stairs; needs help with bathing and may need minimal assistance (cueing, standby) with dressing.' },
      { value: 7, label: '7 · Living with severe frailty', hint: 'Completely dependent for personal care, from whatever cause (physical or cognitive), yet seems stable and not at high risk of dying within about 6 months.' },
      { value: 8, label: '8 · Living with very severe frailty', hint: 'Completely dependent for personal care and approaching end of life; typically could not recover even from a minor illness.' },
      { value: 9, label: '9 · Terminally ill', hint: 'Approaching end of life with a life expectancy under 6 months, but not otherwise living with severe frailty.' }
    ]),
    note('With dementia, the degree of frailty generally corresponds to the degree of dementia.')
  ];
  defs.push({
    id: 'clinical-frailty-scale', name: 'Clinical Frailty Scale (CFS 2.0)', category: 'Geriatrics',
    summary: 'Nine-level judgement-based frailty scale (version 2.0 level names) for people aged 65 and over.',
    keywords: ['cfs', 'clinical frailty scale', 'frailty', 'rockwood', 'older people', 'elderly', 'geriatric', 'functional status'],
    inputs: CFS_INPUTS,
    compute: function (v) {
      var n = Number(v.level);
      var o = n <= 3 ? { band: 'ok', title: 'Not living with frailty' } : n === 4 ? { band: 'info', title: 'Very mild frailty' } : n <= 6 ? { band: 'warn', title: 'Living with frailty' } : { band: 'danger', title: n === 9 ? 'Terminally ill' : 'Living with severe frailty' };
      return result(assign({ value: n, unit: '/ 9', label: 'CFS level',
        interpretation: optLabel(CFS_INPUTS, 'level', n).replace(/^\d · /, '') + '. Higher levels are associated with higher risks of death, institutional care and adverse outcomes from acute illness and procedures. Use the CFS to prompt a holistic (comprehensive geriatric) assessment and shared decisions, not as the sole basis for limiting treatment.',
        details: [{ label: 'Description (summary)', value: findOption(CFS_INPUTS, 'level', n).hint }] }, o));
    },
    formula: 'Choose the single level (1–9) that best describes the person’s baseline function. Level names follow CFS version 2.0.',
    pearls: [
      'Base the rating on a history from the person and those who know them, describing function about 2 weeks before the acute illness.',
      'Descriptions here are summaries; use the official CFS 2.0 chart and classification tree for scoring.',
      'Clinical Frailty Scale © 2005–2020 Rockwood, version 2.0 (EN). All rights reserved. Free for non-commercial clinical, educational and research use; permission and the official chart: Geriatric Medicine Research, Dalhousie University.'
    ],
    references: [
      { label: 'Rockwood K, Song X, MacKnight C, et al. A global clinical measure of fitness and frailty in elderly people. CMAJ 2005;173:489-95.', url: DOI + '10.1503/cmaj.050051' },
      { label: 'Rockwood K, Theou O. Using the Clinical Frailty Scale in allocating scarce health care resources. Can Geriatr J 2020;23:210-5.', url: DOI + '10.5770/cgj.23.463' }
    ]
  });

  /* ======================================================================
     OBSTETRICS & NEONATAL
     ====================================================================== */

  /* --- Bishop score -----------------------------------------------------------------------------------------
     Bishop EH. Obstet Gynecol 1964;24:266-8: dilation (closed 0; 1–2 cm 1; 3–4 cm 2; ≥5 cm 3), effacement
     (0–30% 0; 40–50% 1; 60–70% 2; ≥80% 3), station (−3 0; −2 1; −1/0 2; +1/+2 3), consistency (firm 0; medium 1;
     soft 2), position (posterior 0; mid 1; anterior 2); range 0–13; >8 favourable. ACOG Practice Bulletin 107
     (2009): >8 = probability of vaginal delivery after induction similar to spontaneous labour; ≤6 = unfavourable.
     Simplified Bishop score (dilation, effacement, station; 0–9): >5 performs like the original >8
     (Laughon SK et al. Obstet Gynecol 2011;117:805-11). */
  var BISHOP_INPUTS = [
    radio('version', 'Score version', [
      { value: 'original', label: 'Original Bishop score (5 components, 0–13)' },
      { value: 'simplified', label: 'Simplified Bishop score (dilation, effacement and station, 0–9)', hint: 'Laughon 2011' }
    ], { default: 'original' }),
    radio('dilation', 'Cervical dilation', scored([[0, 'Closed (0 cm)'], [1, '1–2 cm'], [2, '3–4 cm'], [3, '5 cm or more']])),
    radio('effacement', 'Effacement', scored([[0, '0–30%'], [1, '40–50%'], [2, '60–70%'], [3, '80% or more']])),
    radio('station', 'Station of the presenting part (relative to the ischial spines)', scored([[0, '−3'], [1, '−2'], [2, '−1 or 0'], [3, '+1 or +2']])),
    note('Consistency and position are needed for the original score only.'),
    radio('consistency', 'Cervical consistency', scored([[0, 'Firm'], [1, 'Medium'], [2, 'Soft']]), { required: false }),
    radio('position', 'Cervical position', scored([[0, 'Posterior'], [1, 'Mid-position'], [2, 'Anterior']]), { required: false })
  ];
  defs.push({
    id: 'bishop', name: 'Bishop score (cervical favourability)', category: 'Obstetrics & neonatal',
    summary: 'Pre-induction cervical assessment: original 5-component Bishop score or the simplified 3-component score.',
    keywords: ['bishop', 'induction of labour', 'induction of labor', 'cervix', 'cervical ripening', 'iol', 'obstetrics', 'simplified bishop', 'modified bishop'],
    inputs: BISHOP_INPUTS,
    compute: function (v) {
      var core = Number(v.dilation) + Number(v.effacement) + Number(v.station);
      if (v.version === 'simplified') {
        var fav = core > 5;
        return result({ value: core, unit: '/ 9', label: 'Simplified Bishop score', band: fav ? 'ok' : 'warn',
          title: fav ? 'Favourable (more than 5)' : 'Not favourable (5 or less)',
          interpretation: fav ? 'A simplified score above 5 predicted vaginal delivery after induction as well as an original Bishop score above 8.'
            : 'Below the favourable threshold of the simplified score: cervical ripening is likely to be needed before amniotomy and oxytocin. Follow your local induction protocol.',
          details: itemDetails(BISHOP_INPUTS, v, ['dilation', 'effacement', 'station']) });
      }
      if (v.consistency == null || v.position == null) return null;
      var s = core + Number(v.consistency) + Number(v.position);
      var o = s > 8 ? { band: 'ok', title: 'Favourable cervix (9 or more)', interpretation: 'The probability of vaginal delivery after induction is similar to that after spontaneous labour (ACOG).' }
        : s > 6 ? { band: 'info', title: 'Intermediate (7–8)', interpretation: 'Above the usual threshold for an unfavourable cervix (6 or less): amniotomy and oxytocin may be appropriate (NICE uses more than 6). Follow your local induction protocol.' }
        : { band: 'warn', title: 'Unfavourable cervix (6 or less)', interpretation: 'Cervical ripening (prostaglandins or a mechanical method such as a balloon catheter) is generally recommended before amniotomy and oxytocin.' };
      return result(assign({ value: s, unit: '/ 13', label: 'Bishop score', details: itemDetails(BISHOP_INPUTS, v, ['dilation', 'effacement', 'station', 'consistency', 'position']) }, o));
    },
    formula: 'Dilation: closed 0; 1–2 cm 1; 3–4 cm 2; ≥5 cm 3.\nEffacement: 0–30% 0; 40–50% 1; 60–70% 2; ≥80% 3.\nStation: −3 0; −2 1; −1/0 2; +1/+2 3.\nConsistency: firm 0; medium 1; soft 2.\nPosition: posterior 0; mid 1; anterior 2.\nOriginal score 0–13: >8 favourable; ≤6 unfavourable.\nSimplified score (dilation + effacement + station, 0–9): >5 favourable.',
    pearls: [
      'Assess immediately before induction; findings vary between examiners.',
      'Some units use a modified score with cervical length in place of effacement: use your local chart if so.',
      'Bishop derived the score in multiparous women at term; nulliparity lowers the chance of vaginal birth at any score.'
    ],
    references: [
      { label: 'Bishop EH. Pelvic scoring for elective induction. Obstet Gynecol 1964;24:266-8.' },
      { label: 'ACOG Practice Bulletin No. 107: Induction of labor. Obstet Gynecol 2009;114:386-97.', url: DOI + '10.1097/AOG.0b013e3181b48ef5' },
      { label: 'Laughon SK, Zhang J, Troendle J, Sun L, Reddy UM. Using a simplified Bishop score to predict vaginal delivery. Obstet Gynecol 2011;117:805-11.', url: DOI + '10.1097/AOG.0b013e3182114ad2' }
    ]
  });

  /* --- Apgar ------------------------------------------------------------------------------------------------
     Apgar V. Curr Res Anesth Analg 1953;32:260-7. AAP Committee on Fetus and Newborn and ACOG Committee on
     Obstetric Practice. The Apgar score. Committee Opinion 644 (2015; Pediatrics 2015;136:819-22): 7–10
     reassuring, 4–6 moderately abnormal, 0–3 low (term and late-preterm infants); if the 5-minute score is
     <7, assign additional scores every 5 minutes up to 20 minutes; do not use to decide on resuscitation. */
  var APGAR_INPUTS = [
    radio('minute', 'Time after birth', [{ value: 1, label: '1 minute' }, { value: 5, label: '5 minutes' }, { value: 10, label: '10 minutes' }, { value: 15, label: '15 minutes' }, { value: 20, label: '20 minutes' }], { default: 1 }),
    radio('appearance', 'Appearance (colour)', scored([[0, 'Blue or pale all over'], [1, 'Body pink, extremities blue (acrocyanosis)'], [2, 'Completely pink']])),
    radio('pulse', 'Pulse (heart rate)', scored([[0, 'Absent'], [1, 'Below 100/min'], [2, '100/min or more']])),
    radio('grimace', 'Grimace (reflex irritability)', scored([[0, 'No response'], [1, 'Grimace'], [2, 'Cry or active withdrawal']])),
    radio('activity', 'Activity (muscle tone)', scored([[0, 'Limp'], [1, 'Some flexion'], [2, 'Active motion']])),
    radio('respiration', 'Respiration', scored([[0, 'Absent'], [1, 'Weak cry; slow or irregular breathing'], [2, 'Good, crying']]))
  ];
  defs.push({
    id: 'apgar', name: 'Apgar score', category: 'Obstetrics & neonatal',
    summary: 'Newborn condition at 1, 5 and later minutes after birth (appearance, pulse, grimace, activity, respiration).',
    keywords: ['apgar', 'newborn', 'neonate', 'neonatal', 'birth', 'resuscitation', 'delivery'],
    inputs: APGAR_INPUTS,
    compute: function (v) {
      var s = sumPoints(APGAR_INPUTS, v);
      var o = s >= 7 ? { band: 'ok', title: 'Reassuring (7–10)' } : s >= 4 ? { band: 'warn', title: 'Moderately abnormal (4–6)' } : { band: 'danger', title: 'Low (0–3)' };
      var warnings = [];
      if (Number(v.minute) >= 5 && s < 7 && Number(v.minute) < 20) warnings.push('5-minute (or later) score below 7: assign further scores every 5 minutes up to 20 minutes (AAP/ACOG).');
      return result(assign({ value: s, unit: '/ 10', label: 'Apgar at ' + Number(v.minute) + ' min',
        interpretation: 'The Apgar score describes the newborn’s condition; it must not be used to decide whether to start resuscitation, which begins before the 1-minute score. A low score alone does not establish asphyxia or predict an individual infant’s neurological outcome. Scores are affected by gestational age, maternal medicines, resuscitation and congenital conditions.',
        details: itemDetails(APGAR_INPUTS, v, ['appearance', 'pulse', 'grimace', 'activity', 'respiration']), warnings: warnings }, o));
    },
    formula: 'Five signs scored 0–2: appearance, pulse, grimace, activity, respiration. Total 0–10.\nAAP/ACOG: 7–10 reassuring; 4–6 moderately abnormal; 0–3 low (term and late-preterm infants).',
    pearls: [
      'During resuscitation, the AAP recommends an expanded Apgar form that records the interventions in progress.',
      'Colour is the least reliable component, especially in infants with darker skin; use pulse oximetry when available.'
    ],
    references: [
      { label: 'Apgar V. A proposal for a new method of evaluation of the newborn infant. Curr Res Anesth Analg 1953;32:260-7.' },
      { label: 'American Academy of Pediatrics Committee on Fetus and Newborn; ACOG Committee on Obstetric Practice. The Apgar score. Pediatrics 2015;136:819-22 (ACOG Committee Opinion No. 644).', url: DOI + '10.1542/peds.2015-2651' }
    ]
  });

  /* ======================================================================
     SLEEP
     ====================================================================== */

  /* --- STOP-Bang ---------------------------------------------------------------------------------------------
     Chung F et al. Anesthesiology 2008;108:812-21; Chung F, Abdullah HR, Liao P. Chest 2016;149:631-8:
     0–2 low, 3–4 intermediate, 5–8 high risk of moderate-to-severe OSA; with 3–4, STOP ≥2 plus male sex,
     BMI >35 kg/m² or a large neck (≥43 cm male, ≥41 cm female) = high risk. Score ≥3: sensitivity 93% for
     AHI >15 and 100% for AHI >30. Questionnaire © University Health Network (www.stopbang.ca): paraphrased. */
  var SB_INPUTS = [
    bool('snore', 'Snoring: loud snoring (louder than talking, or heard through a closed door)', 1),
    bool('tired', 'Tiredness: often tired, fatigued or sleepy during the daytime', 1),
    bool('observed', 'Observed apnoea: someone has seen breathing stop, or choking or gasping, during sleep', 1),
    bool('pressure', 'Pressure: has, or is treated for, high blood pressure', 1),
    bool('bmi', 'BMI more than 35 kg/m²', 1),
    bool('age', 'Age over 50 years', 1),
    bool('neck', 'Neck circumference large: 43 cm (17 in) or more in males, 41 cm (16 in) or more in females', 1, 'Measured around the Adam’s apple; shirt collar size can be used. The original 2008 version used more than 40 cm for everyone.'),
    bool('male', 'Male sex', 1)
  ];
  defs.push({
    id: 'stop-bang', name: 'STOP-Bang (obstructive sleep apnoea)', category: 'Sleep',
    summary: 'Eight yes/no items screening for moderate-to-severe obstructive sleep apnoea, including before surgery.',
    keywords: ['stop-bang', 'stop bang', 'stopbang', 'osa', 'obstructive sleep apnoea', 'sleep apnea', 'snoring', 'preoperative', 'anaesthesia'],
    inputs: SB_INPUTS,
    compute: function (v) {
      var s = sumPoints(SB_INPUTS, v);
      var stop = (v.snore ? 1 : 0) + (v.tired ? 1 : 0) + (v.observed ? 1 : 0) + (v.pressure ? 1 : 0);
      var combo = stop >= 2 && (v.male || v.bmi || v.neck);
      var o;
      if (s >= 5) o = { band: 'danger', title: 'High risk of moderate-to-severe OSA (5–8)' };
      else if (s >= 3 && combo) o = { band: 'danger', title: 'High risk of moderate-to-severe OSA (STOP ≥2 plus ' + [v.male ? 'male sex' : '', v.bmi ? 'BMI >35' : '', v.neck ? 'large neck' : ''].filter(Boolean).join(', ') + ')' };
      else if (s >= 3) o = { band: 'warn', title: 'Intermediate risk (3–4)' };
      else o = { band: 'ok', title: 'Low risk of moderate-to-severe OSA (0–2)' };
      var interp = o.band === 'ok' ? 'Moderate-to-severe OSA is unlikely (a score of 3 or more was 93% sensitive for moderate-to-severe OSA). Reassess if symptoms such as witnessed apnoeas or sleepiness develop.'
        : o.band === 'warn' ? 'Possible OSA. Consider referral for sleep testing if symptomatic, and flag the result to the anaesthetic team before surgery.'
        : 'Refer for sleep testing (polysomnography or home sleep apnoea testing). Before surgery, inform the anaesthetic team so perioperative OSA precautions can be planned. Advise caution with driving if sleepy.';
      return result(assign({ value: s, unit: '/ 8', label: 'STOP-Bang score', interpretation: interp,
        details: [{ label: 'STOP items (snoring, tiredness, observed apnoea, pressure)', value: stop + ' / 4' }].concat(tickedLabels(SB_INPUTS, v)) }, o));
    },
    formula: 'One point each: Snoring, Tiredness, Observed apnoea, high blood Pressure, BMI >35, Age >50, Neck circumference large, male Gender.\n0–2 low; 3–4 intermediate; 5–8 high risk. With 3–4 points, STOP ≥2 plus male sex, BMI >35 or a large neck = high risk.',
    pearls: [
      'The probability of moderate-to-severe OSA rose from about 18% (score 0–2) to 60% (score 7–8), and of severe OSA from 4% to 38% (Chung 2016).',
      'STOP-Bang is a screening tool; a sleep study confirms the diagnosis.',
      'Questionnaire © University Health Network (www.stopbang.ca); items are paraphrased here.'
    ],
    references: [
      { label: 'Chung F, Yegneswaran B, Liao P, et al. STOP questionnaire: a tool to screen patients for obstructive sleep apnea. Anesthesiology 2008;108:812-21.', url: DOI + '10.1097/ALN.0b013e31816d83e4' },
      { label: 'Chung F, Abdullah HR, Liao P. STOP-Bang questionnaire: a practical approach to screen for obstructive sleep apnea. Chest 2016;149:631-8.', url: DOI + '10.1378/chest.15-0903' }
    ]
  });

  return defs;
});
