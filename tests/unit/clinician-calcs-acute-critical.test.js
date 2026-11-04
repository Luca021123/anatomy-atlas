// C1b critical-care calculators: GCS, paediatric GCS, NEWS2, qSOFA, SOFA, SIRS, shock index, Padua.
// Worked examples cover the minimum, maximum and every published threshold boundary.
const test = require('node:test');
const assert = require('node:assert/strict');
const defs = require('../../clinician/lib/calcs-acute-care.js');

function byId(id) { const d = defs.find(x => x.id === id); assert.ok(d, 'missing calculator ' + id); return d; }
// Mirrors MT.calc.render: required inputs present, radio defaults applied, option values and ranges valid, bools false unless set.
function run(id, vals) {
  const d = byId(id), v = {};
  for (const k of Object.keys(vals)) assert.ok(d.inputs.some(i => i.id === k), `${id}: unknown input ${k}`);
  for (const inp of d.inputs) {
    if (!inp.id) continue;
    let x = vals[inp.id];
    if (inp.type === 'bool') { v[inp.id] = !!x; continue; }
    if (x === undefined && inp.default !== undefined) x = inp.default;
    const req = inp.required != null ? inp.required : ['number', 'radio', 'select'].includes(inp.type);
    if (x === undefined) { assert.ok(!req, `${id}: required input ${inp.id} missing`); continue; }
    if (inp.type === 'radio' || inp.type === 'select') assert.ok(inp.options.some(o => String(o.value) === String(x)), `${id}.${inp.id}: invalid option ${x}`);
    if (inp.type === 'number') assert.ok(x >= inp.min && x <= inp.max, `${id}.${inp.id}: ${x} out of range`);
    v[inp.id] = x;
  }
  return d.compute(v);
}
function toBase(id, inputId, unitId, x) {
  const u = byId(id).inputs.find(i => i.id === inputId).units.find(u => u.id === unitId);
  return u.toBase ? u.toBase(x) : x * u.factor;
}
const detail = (r, label) => { const d = r.details.find(x => typeof x === 'object' && x.label.startsWith(label)); return d && d.value; };

/* ---------------- GCS ---------------- */
test('GCS: maximum 15 and minimum 3', () => {
  const max = run('gcs', { eye: 4, verbal: 5, motor: 6 });
  assert.equal(max.value, 15); assert.equal(max.band, 'ok'); assert.match(max.title, /GCS 15/);
  assert.equal(detail(max, 'Notation'), 'E4 V5 M6');
  const min = run('gcs', { eye: 1, verbal: 1, motor: 1 });
  assert.equal(min.value, 3); assert.equal(min.band, 'danger'); assert.match(min.title, /Severe/);
  assert.ok(min.warnings.some(w => /GCS ≤8/.test(w)));
});

test('GCS: severity boundaries 14/13 (mild), 12/9 (moderate), 8 (severe)', () => {
  const cases = [[{ eye: 4, verbal: 4, motor: 6 }, 14, 'warn', /Mild/], [{ eye: 3, verbal: 4, motor: 6 }, 13, 'warn', /Mild/],
    [{ eye: 3, verbal: 3, motor: 6 }, 12, 'danger', /Moderate/], [{ eye: 2, verbal: 2, motor: 5 }, 9, 'danger', /Moderate/],
    [{ eye: 2, verbal: 2, motor: 4 }, 8, 'danger', /Severe/]];
  for (const [vals, total, band, title] of cases) {
    const r = run('gcs', vals);
    assert.equal(r.value, total); assert.equal(r.band, band); assert.match(r.title, title);
    assert.equal(r.warnings.some(w => /GCS ≤8/.test(w)), total <= 8);
  }
});

test('GCS: non-testable component suppresses the total and reports components', () => {
  const r = run('gcs', { eye: 2, verbal: 'NT', motor: 4 });
  assert.equal(r.value, 'E2 VNT M4'); assert.equal(r.band, 'info'); assert.match(r.title, /V non-testable/);
  const two = run('gcs', { eye: 'NT', verbal: 'NT', motor: 5 });
  assert.match(two.title, /E and V non-testable/);
  const withPupils = run('gcs', { eye: 2, verbal: 'NT', motor: 4, pupils: 0 });
  assert.ok(withPupils.warnings.some(w => /GCS-P/.test(w)));
});

test('GCS-P subtracts the pupil reactivity score (range 1–15)', () => {
  assert.match(detail(run('gcs', { eye: 1, verbal: 1, motor: 1, pupils: 2 }), 'GCS-P'), /^1 /);
  assert.match(detail(run('gcs', { eye: 4, verbal: 5, motor: 6, pupils: 1 }), 'GCS-P'), /^14 /);
  assert.match(detail(run('gcs', { eye: 4, verbal: 5, motor: 6, pupils: 0 }), 'GCS-P'), /^15 /);
  assert.equal(detail(run('gcs', { eye: 4, verbal: 5, motor: 6, pupils: 'NT' }), 'GCS-P'), undefined);
  assert.equal(detail(run('gcs', { eye: 4, verbal: 5, motor: 6 }), 'GCS-P'), undefined);
});

test('Paediatric GCS: 15, 3, boundary 8 and NT handling', () => {
  assert.equal(run('gcs-paediatric', { eye: 4, verbal: 5, motor: 6 }).value, 15);
  const low = run('gcs-paediatric', { eye: 1, verbal: 1, motor: 1 });
  assert.equal(low.value, 3); assert.equal(low.band, 'danger');
  assert.match(run('gcs-paediatric', { eye: 3, verbal: 3, motor: 3 }).title, /Moderate/);
  assert.match(run('gcs-paediatric', { eye: 2, verbal: 2, motor: 4 }).title, /Severe/);
  const nt = run('gcs-paediatric', { eye: 4, verbal: 'NT', motor: 6 });
  assert.equal(nt.value, 'E4 VNT M6');
  assert.ok(!byId('gcs-paediatric').inputs.some(i => i.id === 'pupils'));
});

/* ---------------- NEWS2 ---------------- */
const NORMAL = { rr: 16, spo2: 97, scale: 1, o2: 'air', sbp: 120, hr: 70, acvpu: 'A', temp: 37 };
const news = over => run('news2', Object.assign({}, NORMAL, over));

test('NEWS2: all-normal observations score 0 (low risk, 12-hourly)', () => {
  const r = news({});
  assert.equal(r.value, 0); assert.equal(r.band, 'ok'); assert.match(r.title, /Low clinical risk \(0\)/);
  assert.equal(detail(r, 'Monitoring frequency'), 'Minimum every 12 hours');
});

test('NEWS2: respiration-rate sub-scores at every boundary', () => {
  for (const [rr, s] of [[8, 3], [9, 1], [11, 1], [12, 0], [20, 0], [21, 2], [24, 2], [25, 3]]) assert.equal(news({ rr }).value, s, 'RR ' + rr);
});

test('NEWS2: SpO2 scale 1 sub-scores', () => {
  for (const [spo2, s] of [[91, 3], [92, 2], [93, 2], [94, 1], [95, 1], [96, 0], [100, 0]]) assert.equal(news({ spo2 }).value, s, 'SpO2 ' + spo2);
});

test('NEWS2: SpO2 scale 2 sub-scores on air (≥93 on air scores 0)', () => {
  for (const [spo2, s] of [[83, 3], [84, 2], [85, 2], [86, 1], [87, 1], [88, 0], [92, 0], [93, 0], [97, 0], [100, 0]]) assert.equal(news({ scale: 2, spo2 }).value, s, 'SpO2 ' + spo2);
});

test('NEWS2: SpO2 scale 2 on oxygen penalises high saturations (plus 2 for oxygen)', () => {
  for (const [spo2, s] of [[83, 3], [86, 1], [88, 0], [92, 0], [93, 1], [94, 1], [95, 2], [96, 2], [97, 3], [100, 3]]) assert.equal(news({ scale: 2, o2: 'o2', spo2 }).value, s + 2, 'SpO2 ' + spo2);
  assert.ok(news({ scale: 2 }).warnings.some(w => /Scale 2/.test(w)));
  assert.equal(news({ scale: 1 }).warnings.length, 0);
});

test('NEWS2: supplemental oxygen scores 2', () => { assert.equal(news({ o2: 'o2' }).value, 2); });

test('NEWS2: systolic BP sub-scores', () => {
  for (const [sbp, s] of [[90, 3], [91, 2], [100, 2], [101, 1], [110, 1], [111, 0], [219, 0], [220, 3]]) assert.equal(news({ sbp }).value, s, 'SBP ' + sbp);
});

test('NEWS2: pulse sub-scores', () => {
  for (const [hr, s] of [[40, 3], [41, 1], [50, 1], [51, 0], [90, 0], [91, 1], [110, 1], [111, 2], [130, 2], [131, 3]]) assert.equal(news({ hr }).value, s, 'HR ' + hr);
});

test('NEWS2: consciousness (ACVPU) — any new confusion, V, P or U scores 3', () => {
  for (const acvpu of ['C', 'V', 'P', 'U']) assert.equal(news({ acvpu }).value, 3);
  assert.equal(news({ acvpu: 'A' }).value, 0);
});

test('NEWS2: temperature sub-scores, including °F conversion', () => {
  for (const [temp, s] of [[35.0, 3], [35.1, 1], [36.0, 1], [36.1, 0], [38.0, 0], [38.1, 1], [39.0, 1], [39.1, 2]]) assert.equal(news({ temp }).value, s, 'T ' + temp);
  assert.equal(news({ temp: toBase('news2', 'temp', 'f', 100.4) }).value, 0); // 38.0 °C
  assert.equal(news({ temp: toBase('news2', 'temp', 'f', 95) }).value, 3);    // 35.0 °C
});

test('NEWS2: aggregate thresholds and the single-parameter rule', () => {
  const low4 = news({ rr: 21, hr: 111 });
  assert.equal(low4.value, 4); assert.equal(low4.band, 'ok'); assert.match(low4.title, /Low clinical risk \(1–4\)/);
  assert.equal(detail(low4, 'Monitoring frequency'), 'Minimum every 4–6 hours');
  const red = news({ acvpu: 'C' });
  assert.equal(red.value, 3); assert.equal(red.band, 'warn'); assert.match(red.title, /single parameter/);
  assert.equal(detail(red, 'Monitoring frequency'), 'Minimum every hour');
  const five = news({ rr: 21, hr: 111, temp: 38.5 });
  assert.equal(five.value, 5); assert.equal(five.band, 'warn'); assert.match(five.title, /Medium/);
  assert.equal(news({ rr: 21, hr: 111, temp: 39.5 }).value, 6);
  assert.match(news({ rr: 21, hr: 111, temp: 39.5 }).title, /Medium/);
  const seven = news({ rr: 25, hr: 131, temp: 38.5 });
  assert.equal(seven.value, 7); assert.equal(seven.band, 'danger'); assert.match(seven.title, /High/);
  assert.equal(detail(seven, 'Monitoring frequency'), 'Continuous monitoring of vital signs');
});

test('NEWS2: maximum score 20', () => {
  const r = news({ rr: 30, spo2: 85, o2: 'o2', sbp: 80, hr: 140, acvpu: 'U', temp: 34 });
  assert.equal(r.value, 20); assert.equal(r.band, 'danger');
});

/* ---------------- qSOFA ---------------- */
test('qSOFA: 0–1 negative, 2–3 positive', () => {
  assert.equal(run('qsofa', {}).value, 0); assert.equal(run('qsofa', {}).band, 'ok');
  const one = run('qsofa', { rr: true }); assert.equal(one.value, 1); assert.match(one.title, /Negative/);
  const two = run('qsofa', { rr: true, sbp: true }); assert.equal(two.value, 2); assert.equal(two.band, 'danger'); assert.match(two.title, /Positive/);
  assert.equal(run('qsofa', { rr: true, sbp: true, mentation: true }).value, 3);
});

/* ---------------- SOFA ---------------- */
const SOFA_NORMAL = { pao2: 100, fio2: 21, vent: false, plt: 200, bili: 0, map: 80, gcs: 15, creat: 0, uo: 'ok' };
const sofa = over => run('sofa', Object.assign({}, SOFA_NORMAL, over));

test('SOFA: normal physiology scores 0; maximum 24', () => {
  const r = sofa({}); assert.equal(r.value, 0); assert.equal(r.band, 'ok');
  const max = sofa({ pao2: 45, fio2: 100, vent: true, plt: 10, bili: 4, map: 50, noradrenaline: 0.5, gcs: 3, creat: 4, uo: 'lt200' });
  assert.equal(max.value, 24); assert.equal(max.band, 'danger'); assert.match(max.title, /Organ failure/);
});

test('SOFA respiration: PaO2/FiO2 cut-offs and the respiratory-support requirement', () => {
  const resp = (pao2, vent) => detail(sofa({ pao2, fio2: 50, vent }), 'Respiration');
  assert.equal(resp(200, false), 0);   // P/F 400
  assert.equal(resp(199.5, false), 1); // 399
  assert.equal(resp(150, false), 1);   // 300
  assert.equal(resp(149.5, false), 2); // 299
  assert.equal(resp(100, false), 2);   // 200
  assert.equal(resp(99.5, false), 2);  // 199 without support caps at 2
  assert.equal(resp(99.5, true), 3);   // 199 with support
  assert.equal(resp(50, true), 3);     // 100
  assert.equal(resp(49.5, true), 4);   // 99
  assert.equal(resp(49.5, false), 2);
  assert.ok(sofa({ pao2: 49.5, fio2: 50 }).warnings.some(w => /respiratory support/.test(w)));
  // Unit conversions: 8 kPa ≈ 60 mmHg; FiO2 entered as a fraction.
  assert.equal(detail(sofa({ pao2: toBase('sofa', 'pao2', 'kpa', 8), fio2: toBase('sofa', 'fio2', 'frac', 0.3) }), 'Respiration'), 2); // P/F ≈ 200
  assert.equal(detail(sofa({ pao2: toBase('sofa', 'pao2', 'kpa', 7.9), fio2: toBase('sofa', 'fio2', 'frac', 0.3), vent: true }), 'Respiration'), 3);
});

test('SOFA coagulation: platelet cut-offs', () => {
  for (const [plt, s] of [[150, 0], [149, 1], [100, 1], [99, 2], [50, 2], [49, 3], [20, 3], [19, 4]]) assert.equal(detail(sofa({ plt }), 'Coagulation'), s, 'plt ' + plt);
});

test('SOFA liver: bilirubin bands 0–4', () => {
  for (const b of [0, 1, 2, 3, 4]) assert.equal(detail(sofa({ bili: b }), 'Liver'), b);
});

test('SOFA cardiovascular: MAP and vasopressor dose cut-offs', () => {
  const cv = over => detail(sofa(over), 'Cardiovascular');
  assert.equal(cv({ map: 70 }), 0);
  assert.equal(cv({ map: 69 }), 1);
  assert.equal(cv({ dopamine: 5 }), 2);
  assert.equal(cv({ dobutamine: true }), 2);
  assert.equal(cv({ dopamine: 5.1 }), 3);
  assert.equal(cv({ dopamine: 15 }), 3);
  assert.equal(cv({ dopamine: 15.1 }), 4);
  assert.equal(cv({ adrenaline: 0.1 }), 3);
  assert.equal(cv({ adrenaline: 0.11 }), 4);
  assert.equal(cv({ noradrenaline: 0.01 }), 3);
  assert.equal(cv({ noradrenaline: 0.1 }), 3);
  assert.equal(cv({ noradrenaline: 0.2 }), 4);
  assert.equal(cv({ map: 60, noradrenaline: 0.05 }), 3);
  assert.equal(cv({ map: 60, dopamine: 0, adrenaline: 0, noradrenaline: 0 }), 1);
});

test('SOFA CNS: GCS cut-offs', () => {
  for (const [gcs, s] of [[15, 0], [14, 1], [13, 1], [12, 2], [10, 2], [9, 3], [6, 3], [5, 4], [3, 4]]) assert.equal(detail(sofa({ gcs }), 'CNS'), s, 'GCS ' + gcs);
});

test('SOFA renal: worse of creatinine band and urine output', () => {
  assert.equal(detail(sofa({ creat: 2 }), 'Renal'), 2);
  assert.equal(detail(sofa({ creat: 1, uo: 'lt500' }), 'Renal'), 3);
  assert.equal(detail(sofa({ creat: 0, uo: 'lt200' }), 'Renal'), 4);
  assert.equal(detail(sofa({ creat: 4, uo: 'ok' }), 'Renal'), 4);
});

test('SOFA bands: 1 minimal, 2 dysfunction, any organ ≥3 = failure', () => {
  assert.equal(sofa({ plt: 140 }).band, 'info');
  const two = sofa({ plt: 99 }); assert.equal(two.value, 2); assert.equal(two.band, 'warn');
  const fail = sofa({ plt: 40 }); assert.equal(fail.value, 3); assert.equal(fail.band, 'danger'); assert.match(fail.title, /Coagulation/);
});

/* ---------------- SIRS ---------------- */
test('SIRS: fewer than 2 criteria negative; 2–4 positive; infection changes the message', () => {
  assert.equal(run('sirs', {}).value, 0); assert.equal(run('sirs', {}).band, 'ok');
  assert.equal(run('sirs', { hr: true }).band, 'ok');
  const two = run('sirs', { hr: true, rr: true }); assert.equal(two.value, 2); assert.equal(two.band, 'warn');
  const all = run('sirs', { temp: true, hr: true, rr: true, wbc: true, infection: true });
  assert.equal(all.value, 4); assert.match(all.title, /infection/); assert.match(all.interpretation, /1992/);
});

/* ---------------- Shock index ---------------- */
test('Shock index: normal range, >0.9, ≥1.0 and ≥1.4 boundaries with trauma classes', () => {
  const si = (hr, sbp) => run('shock-index', { hr, sbp });
  const n = si(60, 120); assert.equal(n.value, 0.5); assert.equal(n.band, 'ok'); assert.match(n.title, /Normal/);
  assert.equal(si(84, 120).band, 'ok');                       // 0.70
  assert.equal(si(85, 120).band, 'info');                     // 0.71
  assert.equal(si(90, 100).band, 'info');                     // 0.90 is not >0.9
  const w = si(91, 100); assert.equal(w.value, 0.91); assert.equal(w.band, 'warn');
  const d = si(100, 100); assert.equal(d.value, 1); assert.equal(d.band, 'danger'); assert.match(d.title, /1\.0 or more/);
  const s = si(140, 100); assert.equal(s.value, 1.4); assert.match(s.title, /Markedly/);
  assert.match(si(50, 120).title, /Below 0.5/);
  assert.match(detail(si(59, 100), 'Trauma class'), /^I /);
  assert.match(detail(si(60, 100), 'Trauma class'), /^II /);
  assert.match(detail(si(100, 100), 'Trauma class'), /^III /);
  assert.match(detail(si(139, 100), 'Trauma class'), /^III /);
  assert.match(detail(si(140, 100), 'Trauma class'), /^IV /);
});

/* ---------------- Padua ---------------- */
test('Padua: <4 low risk, ≥4 high risk, maximum 20', () => {
  assert.equal(run('padua', {}).value, 0);
  const three = run('padua', { cancer: true }); assert.equal(three.value, 3); assert.equal(three.band, 'ok');
  const four = run('padua', { cancer: true, age: true }); assert.equal(four.value, 4); assert.equal(four.band, 'warn'); assert.match(four.title, /High risk/);
  assert.equal(run('padua', { trauma: true, obesity: true, hormonal: true }).value, 4);
  const all = {}; for (const i of byId('padua').inputs) if (i.id) all[i.id] = true;
  assert.equal(run('padua', all).value, 20);
});
