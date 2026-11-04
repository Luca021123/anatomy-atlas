// C1b psychiatry/substance use, geriatrics, obstetrics/neonatal and sleep calculators:
// PHQ-9, GAD-7, AUDIT, AUDIT-C, EPDS, CIWA-Ar, COWS, 4AT, Clinical Frailty Scale, Bishop, Apgar, STOP-Bang.
const test = require('node:test');
const assert = require('node:assert/strict');
const defs = require('../../clinician/lib/calcs-acute-care.js');

function byId(id) { const d = defs.find(x => x.id === id); assert.ok(d, 'missing calculator ' + id); return d; }
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
const detail = (r, label) => { const d = r.details.find(x => typeof x === 'object' && x.label.startsWith(label)); return d && d.value; };
// Build answers q1..qn from an array of item scores.
const items = (scores, extra) => Object.assign(Object.fromEntries(scores.map((s, i) => ['q' + (i + 1), s])), extra || {});
// Spread a total over n items scored 0..max (fills from item 1), keeping a chosen item at 0 when asked.
function spread(total, n, max, keepZero) {
  const out = Array(n).fill(0);
  for (let i = 0; i < n && total > 0; i++) { if (i === keepZero) continue; const s = Math.min(max, total); out[i] = s; total -= s; }
  assert.equal(total, 0, 'cannot spread'); return out;
}

/* ---------------- PHQ-9 ---------------- */
test('PHQ-9: official item wording, minimum 0 and maximum 27', () => {
  const d = byId('phq-9');
  assert.match(d.inputs.find(i => i.id === 'q1').label, /Little interest or pleasure in doing things/);
  assert.match(d.inputs.find(i => i.id === 'q9').label, /better off dead or of hurting yourself/);
  assert.deepEqual(d.inputs.find(i => i.id === 'q1').options.map(o => o.label), ['Not at all', 'Several days', 'More than half the days', 'Nearly every day']);
  const zero = run('phq-9', items(Array(9).fill(0))); assert.equal(zero.value, 0); assert.equal(zero.band, 'ok'); assert.equal(zero.warnings.length, 0);
  const max = run('phq-9', items(Array(9).fill(3))); assert.equal(max.value, 27); assert.match(max.title, /Severe/); assert.match(detail(max, 'Diagnostic'), /major depressive/);
});

test('PHQ-9: severity boundaries 4/5, 9/10, 14/15, 19/20 (item 9 kept at 0)', () => {
  const cases = [[4, /Minimal/, 'ok'], [5, /Mild/, 'info'], [9, /Mild/, 'info'], [10, /Moderate \(10–14\)/, 'warn'], [14, /Moderate \(10–14\)/, 'warn'],
    [15, /Moderately severe/, 'danger'], [19, /Moderately severe/, 'danger'], [20, /Severe \(20–27\)/, 'danger'], [24, /Severe/, 'danger']];
  for (const [t, title, band] of cases) {
    const r = run('phq-9', items(spread(t, 9, 3, 8)));
    assert.equal(r.value, t); assert.match(r.title, title, 'total ' + t); assert.equal(r.band, band, 'total ' + t);
  }
});

test('PHQ-9: any positive item 9 raises a safety prompt regardless of the total', () => {
  const r = run('phq-9', items([0, 0, 0, 0, 0, 0, 0, 0, 1]));
  assert.equal(r.value, 1); assert.equal(r.band, 'danger'); assert.match(r.title, /item 9 positive/);
  assert.ok(r.warnings.some(w => /emergency services/.test(w)));
});

test('PHQ-9: diagnostic algorithm (≥5 items ≥2 incl. item 1 or 2; item 9 counts if present)', () => {
  assert.match(detail(run('phq-9', items([2, 2, 2, 2, 2, 0, 0, 0, 0])), 'Diagnostic'), /major depressive/);
  assert.match(detail(run('phq-9', items([2, 0, 2, 2, 2, 0, 0, 0, 1])), 'Diagnostic'), /major depressive/);
  assert.match(detail(run('phq-9', items([2, 0, 2, 0, 0, 0, 0, 0, 0])), 'Diagnostic'), /another depressive/);
  assert.match(detail(run('phq-9', items([1, 1, 2, 2, 2, 2, 2, 0, 0])), 'Diagnostic'), /Does not meet/);
  assert.equal(detail(run('phq-9', items(Array(9).fill(1), { difficulty: 'very' })), 'Functional'), 'Very difficult');
});

/* ---------------- GAD-7 ---------------- */
test('GAD-7: 0, 21 and boundaries 4/5, 9/10, 14/15', () => {
  assert.match(byId('gad-7').inputs.find(i => i.id === 'q2').label, /Not being able to stop or control worrying/);
  const cases = [[0, /Minimal/, 'ok'], [4, /Minimal/, 'ok'], [5, /Mild/, 'info'], [9, /Mild/, 'info'], [10, /Moderate/, 'warn'], [14, /Moderate/, 'warn'], [15, /Severe/, 'danger'], [21, /Severe/, 'danger']];
  for (const [t, title, band] of cases) {
    const r = run('gad-7', items(spread(t, 7, 3)));
    assert.equal(r.value, t); assert.match(r.title, title); assert.equal(r.band, band);
  }
});

/* ---------------- AUDIT / AUDIT-C ---------------- */
// AUDIT items 1–8 take 0–4; items 9–10 take 0, 2 or 4.
function audit(total) {
  const s = Array(10).fill(0); let t = total;
  for (let i = 9; i >= 8 && t >= 2; i--) { const x = t >= 4 ? 4 : 2; s[i] = x; t -= x; }
  for (let i = 0; i < 8 && t > 0; i++) { const x = Math.min(4, t); s[i] = x; t -= x; }
  assert.equal(t, 0); return items(s);
}
test('AUDIT: WHO zones at 7/8, 15/16, 19/20 and the 0–40 range', () => {
  const d = byId('audit');
  assert.match(d.inputs.find(i => i.id === 'q3').label, /six or more drinks on one occasion/);
  assert.deepEqual(d.inputs.find(i => i.id === 'q9').options.map(o => o.value), [0, 2, 4]);
  const cases = [[0, /Zone I /, 'ok'], [7, /Zone I /, 'ok'], [8, /Zone II/, 'warn'], [15, /Zone II/, 'warn'], [16, /Zone III/, 'warn'], [19, /Zone III/, 'warn'], [20, /Zone IV/, 'danger'], [40, /Zone IV/, 'danger']];
  for (const [t, title, band] of cases) { const r = run('audit', audit(t)); assert.equal(r.value, t); assert.match(r.title, title, 'total ' + t); assert.equal(r.band, band); }
});

test('AUDIT: domain subtotals and dependence warning', () => {
  const r = run('audit', items([4, 2, 3, 1, 0, 2, 1, 0, 2, 4]));
  assert.equal(r.value, 19);
  assert.equal(detail(r, 'Consumption'), '9 / 12');
  assert.equal(detail(r, 'Dependence'), '3 / 12');
  assert.equal(detail(r, 'Alcohol-related harm'), '7 / 16');
  assert.ok(r.warnings.some(w => /withdrawal/.test(w)));
  assert.equal(run('audit', items([2, 1, 1, 0, 0, 0, 0, 0, 0, 0])).warnings.length, 0);
});

test('AUDIT-C: cut-offs ≥3 women, ≥4 men, sensitive cut-off when sex not stated', () => {
  const c = (q, sex) => run('audit-c', { q1: q[0], q2: q[1], q3: q[2], sex });
  assert.equal(c([0, 0, 0], 'female').value, 0);
  assert.equal(c([2, 0, 0], 'female').band, 'ok');
  assert.match(c([2, 1, 0], 'female').title, /Positive/);
  assert.equal(c([2, 1, 0], 'male').band, 'ok');
  assert.match(c([2, 1, 1], 'male').title, /Positive/);
  const u = c([2, 1, 0], 'unstated'); assert.match(u.title, /Positive/); assert.ok(u.warnings.length);
  assert.equal(c([4, 4, 4], 'male').value, 12);
});

/* ---------------- EPDS ---------------- */
test('EPDS scorer: 0–9, 10–12, ≥13 and the item-10 safety prompt', () => {
  const e = (scores) => run('epds', items(scores));
  const zero = e(Array(10).fill(0)); assert.equal(zero.value, 0); assert.equal(zero.band, 'ok');
  assert.equal(e(spread(9, 10, 3, 9)).band, 'ok');
  assert.match(e(spread(10, 10, 3, 9)).title, /Possible depression/);
  assert.match(e(spread(12, 10, 3, 9)).title, /Possible depression/);
  const thirteen = e(spread(13, 10, 3, 9)); assert.match(thirteen.title, /Probable depression/); assert.equal(thirteen.band, 'danger');
  assert.equal(e(Array(10).fill(3)).value, 30);
  const sh = e([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]); assert.equal(sh.band, 'danger'); assert.match(sh.title, /item 10 positive/);
  assert.ok(sh.warnings.some(w => /same day/.test(w)));
  assert.equal(byId('epds').showPoints, false);
});

/* ---------------- CIWA-Ar ---------------- */
const CIWA = ['nausea', 'tremor', 'sweats', 'anxiety', 'agitation', 'tactile', 'auditory', 'visual', 'headache', 'orientation'];
test('CIWA-Ar: official anchors, maximum 67 and the <10 threshold', () => {
  const d = byId('ciwa-ar');
  assert.equal(d.inputs.find(i => i.id === 'nausea').options.find(o => o.value === 4).label, '4 — intermittent nausea with dry heaves');
  assert.equal(d.inputs.find(i => i.id === 'orientation').options.length, 5);
  const zero = run('ciwa-ar', Object.fromEntries(CIWA.map(k => [k, 0]))); assert.equal(zero.value, 0); assert.equal(zero.band, 'ok');
  const nine = run('ciwa-ar', Object.fromEntries(CIWA.map((k, i) => [k, i < 3 ? 3 : 0]))); assert.equal(nine.value, 9); assert.match(nine.title, /Below 10/);
  const ten = run('ciwa-ar', Object.fromEntries(CIWA.map((k, i) => [k, i < 2 ? 5 : 0]))); assert.equal(ten.value, 10); assert.equal(ten.band, 'warn');
  const max = run('ciwa-ar', Object.fromEntries(CIWA.map(k => [k, k === 'orientation' ? 4 : 7]))); assert.equal(max.value, 67); assert.equal(max.band, 'danger');
  assert.ok(max.warnings.some(w => /Hallucinations/.test(w)) && max.warnings.some(w => /Disorientation/.test(w)));
});

/* ---------------- COWS ---------------- */
const COWS = ['pulse', 'sweating', 'restless', 'pupils', 'aches', 'nose', 'gi', 'tremor', 'yawning', 'anxiety', 'gooseflesh'];
test('COWS: item maxima, total 48 and bands 5–12, 13–24, 25–36, >36', () => {
  const d = byId('cows');
  const maxima = COWS.map(k => Math.max(...d.inputs.find(i => i.id === k).options.map(o => o.value)));
  assert.deepEqual(maxima, [4, 4, 5, 5, 4, 4, 5, 4, 4, 4, 5]);
  const zero = Object.fromEntries(COWS.map(k => [k, 0]));
  const c = over => run('cows', Object.assign({}, zero, over));
  assert.equal(c({}).value, 0); assert.match(c({}).title, /Below the mild range/);
  assert.match(c({ pulse: 4 }).title, /Below/);                                              // 4
  assert.match(c({ pulse: 4, sweating: 1 }).title, /Mild/);                                   // 5
  assert.match(c({ pulse: 4, sweating: 4, restless: 3, pupils: 1 }).title, /Mild/);           // 12
  assert.match(c({ pulse: 4, sweating: 4, restless: 5 }).title, /Moderate withdrawal/);       // 13
  const t24 = c({ pulse: 4, sweating: 4, restless: 5, pupils: 5, aches: 4, nose: 2 }); assert.equal(t24.value, 24); assert.match(t24.title, /Moderate withdrawal/);
  assert.match(c({ pulse: 4, sweating: 4, restless: 5, pupils: 5, aches: 4, nose: 2, gi: 1 }).title, /Moderately severe/); // 25
  const t36 = c({ pulse: 4, sweating: 4, restless: 5, pupils: 5, aches: 4, nose: 4, gi: 5, tremor: 4, yawning: 1 }); assert.equal(t36.value, 36); assert.match(t36.title, /Moderately severe/);
  assert.match(c({ pulse: 4, sweating: 4, restless: 5, pupils: 5, aches: 4, nose: 4, gi: 5, tremor: 4, yawning: 2 }).title, /^Severe/); // 37
  const max = run('cows', Object.fromEntries(COWS.map((k, i) => [k, maxima[i]]))); assert.equal(max.value, 48);
});

/* ---------------- 4AT ---------------- */
test('4AT: 0, 1–3, ≥4 and maximum 12', () => {
  const f = vals => run('4at', Object.assign({ alertness: 'normal', amt4: 0, attention: 0, acute: 0 }, vals));
  const zero = f({}); assert.equal(zero.value, 0); assert.equal(zero.band, 'ok'); assert.match(zero.interpretation, /item 4/);
  assert.equal(f({ alertness: 'mild' }).value, 0);
  assert.equal(f({ amt4: 1 }).band, 'warn');
  const three = f({ amt4: 2, attention: 1 }); assert.equal(three.value, 3); assert.match(three.title, /possible cognitive impairment/);
  const four = f({ acute: 4 }); assert.equal(four.value, 4); assert.equal(four.band, 'danger'); assert.match(four.title, /possible delirium/);
  assert.equal(f({ alertness: 'abnormal' }).value, 4);
  assert.equal(f({ alertness: 'abnormal', amt4: 2, attention: 2, acute: 4 }).value, 12);
});

/* ---------------- Clinical Frailty Scale ---------------- */
test('Clinical Frailty Scale 2.0: level names and bands', () => {
  const names = byId('clinical-frailty-scale').inputs.find(i => i.id === 'level').options.map(o => o.label.replace(/^\d · /, ''));
  assert.deepEqual(names, ['Very fit', 'Fit', 'Managing well', 'Living with very mild frailty', 'Living with mild frailty', 'Living with moderate frailty', 'Living with severe frailty', 'Living with very severe frailty', 'Terminally ill']);
  const bands = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => run('clinical-frailty-scale', { level }).band);
  assert.deepEqual(bands, ['ok', 'ok', 'ok', 'info', 'warn', 'warn', 'danger', 'danger', 'danger']);
  assert.match(run('clinical-frailty-scale', { level: 9 }).title, /Terminally ill/);
  assert.equal(run('clinical-frailty-scale', { level: 5 }).value, 5);
});

/* ---------------- Bishop ---------------- */
test('Bishop (original): 0–13 with ≤6 unfavourable, 7–8 intermediate, ≥9 favourable', () => {
  const b = (d, e, s, c, p) => run('bishop', { version: 'original', dilation: d, effacement: e, station: s, consistency: c, position: p });
  const zero = b(0, 0, 0, 0, 0); assert.equal(zero.value, 0); assert.match(zero.title, /Unfavourable/);
  assert.match(b(2, 2, 2, 0, 0).title, /Unfavourable/);     // 6
  assert.match(b(2, 2, 2, 1, 0).title, /Intermediate/);     // 7
  assert.match(b(2, 2, 2, 1, 1).title, /Intermediate/);     // 8
  const nine = b(3, 2, 2, 1, 1); assert.equal(nine.value, 9); assert.match(nine.title, /Favourable/); assert.equal(nine.band, 'ok');
  assert.equal(b(3, 3, 3, 2, 2).value, 13);
  assert.equal(run('bishop', { dilation: 1, effacement: 1, station: 1 }), null); // original needs consistency and position
});

test('Bishop (simplified, Laughon 2011): >5 favourable, range 0–9', () => {
  const s = (d, e, st) => run('bishop', { version: 'simplified', dilation: d, effacement: e, station: st });
  assert.equal(s(0, 0, 0).value, 0);
  const five = s(2, 2, 1); assert.equal(five.value, 5); assert.equal(five.band, 'warn');
  const six = s(2, 2, 2); assert.equal(six.value, 6); assert.equal(six.band, 'ok'); assert.match(six.title, /Favourable/);
  assert.equal(s(3, 3, 3).value, 9);
  assert.equal(run('bishop', { version: 'simplified', dilation: 3, effacement: 3, station: 3, consistency: 2, position: 2 }).value, 9);
});

/* ---------------- Apgar ---------------- */
test('Apgar: 7–10 reassuring, 4–6 moderately abnormal, 0–3 low; repeat prompt after 5 min', () => {
  const a = (s, minute) => run('apgar', { minute: minute || 1, appearance: s[0], pulse: s[1], grimace: s[2], activity: s[3], respiration: s[4] });
  const ten = a([2, 2, 2, 2, 2]); assert.equal(ten.value, 10); assert.equal(ten.band, 'ok');
  assert.equal(a([1, 2, 2, 1, 1]).band, 'ok');              // 7
  const six = a([1, 2, 1, 1, 1]); assert.equal(six.value, 6); assert.equal(six.band, 'warn');
  assert.equal(a([0, 1, 1, 1, 1]).band, 'warn');            // 4
  const three = a([0, 1, 1, 1, 0]); assert.equal(three.value, 3); assert.equal(three.band, 'danger');
  assert.equal(a([0, 0, 0, 0, 0]).value, 0);
  assert.equal(six.warnings.length, 0);
  assert.ok(a([1, 2, 1, 1, 1], 5).warnings.some(w => /every 5 minutes/.test(w)));
  assert.equal(a([1, 2, 1, 1, 1], 20).warnings.length, 0);
  assert.equal(a([2, 2, 2, 2, 2], 5).label, 'Apgar at 5 min');
});

/* ---------------- STOP-Bang ---------------- */
test('STOP-Bang: 0–2 low, 3–4 intermediate, 5–8 high, and the STOP ≥2 combinations', () => {
  const s = vals => run('stop-bang', vals);
  assert.equal(s({}).value, 0); assert.equal(s({}).band, 'ok');
  assert.equal(s({ snore: true, age: true }).band, 'ok');
  const three = s({ snore: true, age: true, bmi: true }); assert.equal(three.value, 3); assert.equal(three.band, 'warn');
  const comboMale = s({ snore: true, tired: true, male: true }); assert.equal(comboMale.value, 3); assert.equal(comboMale.band, 'danger'); assert.match(comboMale.title, /male sex/);
  assert.match(s({ observed: true, pressure: true, bmi: true, age: true }).title, /BMI >35/);
  assert.match(s({ observed: true, pressure: true, neck: true }).title, /large neck/);
  assert.equal(s({ snore: true, age: true, bmi: true, male: true }).band, 'warn'); // 4 but STOP = 1
  assert.equal(s({ snore: true, age: true, bmi: true, male: true, neck: true }).band, 'danger'); // 5
  const all = {}; for (const i of byId('stop-bang').inputs) all[i.id] = true;
  assert.equal(s(all).value, 8);
});
