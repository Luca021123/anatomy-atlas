// Unit tests for the Salus H1 health-check engine (health/lib/health-engine.js).
// Every LE8 boundary, the treated and second-hand-smoke adjustments, the composite with missing metrics,
// FINDRISC items/bands, PHQ/GAD/AUDIT-C/STOP-BANG thresholds, the salt-substitute gate and plan ranking.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../health/lib/health-engine.js');

/* ---------------------------------------------------------------- LE8: physical activity */
test('LE8 activity points at every boundary (minutes/week)', () => {
  const cases = [[0, 0], [0.5, 20], [1, 20], [29, 20], [30, 40], [59, 40], [60, 60], [89, 60], [90, 80], [119, 80], [120, 90], [149, 90], [150, 100], [600, 100]];
  for (const [min, pts] of cases) assert.equal(E.le8Activity(min), pts, `${min} min`);
  assert.equal(E.le8Activity(undefined), null);
  assert.equal(E.le8Activity(-5), null);
});
test('moderate-equivalent minutes count vigorous minutes double', () => {
  assert.equal(E.paMinutes(5, 30, 0, 0), 150);
  assert.equal(E.paMinutes(0, undefined, 3, 25), 150);
  assert.equal(E.paMinutes(2, 20, 1, 20), 80);
  assert.equal(E.paMinutes(undefined, undefined, undefined, undefined), undefined);
  assert.equal(E.le8Activity(E.paMinutes(2, 30, 1, 30)), 90); // 60 + 60 = 120
});

/* ---------------------------------------------------------------- LE8: nicotine */
test('LE8 nicotine ladder and the household smoke −20 adjustment', () => {
  assert.equal(E.le8Nicotine({ smoking: 'never' }), 100);
  assert.equal(E.le8Nicotine({ smoking: 'former', quit: '5plus' }), 75);
  assert.equal(E.le8Nicotine({ smoking: 'former', quit: '1to5' }), 50);
  assert.equal(E.le8Nicotine({ smoking: 'former', quit: 'lt1' }), 25);
  assert.equal(E.le8Nicotine({ smoking: 'never', vaping: true }), 25);
  assert.equal(E.le8Nicotine({ smoking: 'former', quit: '5plus', vaping: true }), 25);
  assert.equal(E.le8Nicotine({ smoking: 'current' }), 0);
  assert.equal(E.le8Nicotine({ smoking: 'current', vaping: true }), 0);
  // living with an active indoor smoker: −20, floor 0
  assert.equal(E.le8Nicotine({ smoking: 'never', homeSmoke: true }), 80);
  assert.equal(E.le8Nicotine({ smoking: 'former', quit: '5plus', homeSmoke: true }), 55);
  assert.equal(E.le8Nicotine({ smoking: 'former', quit: 'lt1', homeSmoke: true }), 5);
  assert.equal(E.le8Nicotine({ smoking: 'current', homeSmoke: true }), 0);
  // unknown
  assert.equal(E.le8Nicotine({}), null);
  assert.equal(E.le8Nicotine({ smoking: 'former' }), null);
});

/* ---------------------------------------------------------------- LE8: sleep */
test('LE8 sleep points at every boundary (≥10 h scores 40, not 0)', () => {
  const cases = [[3, 0], [3.99, 0], [4, 20], [4.5, 20], [4.99, 20], [5, 40], [5.99, 40], [6, 70], [6.99, 70], [7, 100], [8.99, 100], [9, 90], [9.99, 90], [10, 40], [12, 40]];
  for (const [h, pts] of cases) assert.equal(E.le8Sleep(h), pts, `${h} h`);
  assert.equal(E.le8Sleep(undefined), null);
  assert.equal(E.le8Sleep(25), null);
});

/* ---------------------------------------------------------------- LE8: BMI */
test('LE8 BMI points at every boundary (Lloyd-Jones 2022: 25–29.9 = 70)', () => {
  const cases = [[17, 100], [24.9, 100], [24.99, 100], [25, 70], [29.9, 70], [30, 30], [34.9, 30], [35, 15], [39.9, 15], [40, 0], [55, 0]];
  for (const [b, pts] of cases) assert.equal(E.le8Bmi(b), pts, `BMI ${b}`);
  assert.equal(E.le8Bmi(0), null);
});
test('BMI, WHO and Asian categories, waist and waist-to-height bands', () => {
  assert.equal(Math.round(E.bmi(170, 72.25) * 10) / 10, 25);
  assert.equal(E.bmiCategory(18.4), 'under');
  assert.equal(E.bmiCategory(24.9), 'healthy');
  assert.equal(E.bmiCategory(25), 'over');
  assert.equal(E.bmiCategory(30), 'obese');
  assert.equal(E.bmiCategory(22.9, true), 'healthy');
  assert.equal(E.bmiCategory(23, true), 'over');
  assert.equal(E.bmiCategory(27.5, true), 'obese');
  assert.equal(E.waistCategory(93, 'male'), 'ok');
  assert.equal(E.waistCategory(94, 'male'), 'high');
  assert.equal(E.waistCategory(102, 'male'), 'veryhigh');
  assert.equal(E.waistCategory(79, 'female'), 'ok');
  assert.equal(E.waistCategory(80, 'female'), 'high');
  assert.equal(E.waistCategory(88, 'female'), 'veryhigh');
  assert.equal(E.waistCategory(90, 'male', true), 'high');
  assert.equal(E.waistCategory(89, 'male', true), 'ok');
  assert.equal(E.waistCategory(90, undefined), null);
  assert.deepEqual(E.whtr(84, 170), { ratio: 0.49, band: 'ok' });
  assert.equal(E.whtr(85, 170).band, 'high');
  assert.equal(E.whtr(102, 170).band, 'veryhigh');
});

/* ---------------------------------------------------------------- LE8: lipids */
test('LE8 non-HDL cholesterol points and the treated −20 adjustment', () => {
  const cases = [[100, 100], [129, 100], [130, 60], [159, 60], [160, 40], [189, 40], [190, 20], [219, 20], [220, 0], [300, 0]];
  for (const [x, pts] of cases) assert.equal(E.le8Lipids(x, false), pts, `${x} mg/dL`);
  assert.equal(E.le8Lipids(129, true), 80);
  assert.equal(E.le8Lipids(150, true), 40);
  assert.equal(E.le8Lipids(200, true), 0);
  assert.equal(E.le8Lipids(230, true), 0); // floor 0
  assert.equal(E.le8Lipids(undefined), null);
});
test('unit conversions used before LE8 cut-offs', () => {
  assert.equal(E.units.cholToMgdl(3.36), 130); // rounds like a lab report
  assert.equal(E.units.cholToMgdl(3.35), 130);
  assert.equal(E.units.cholToMgdl(3.3), 128);
  assert.equal(E.units.gluToMgdl(5.6), 101);
  assert.equal(E.units.gluToMgdl(7.0), 126);
  assert.equal(E.units.gluToMgdl(5.5), 99);
  assert.equal(E.units.a1cToPct(48), 6.5);
  assert.equal(E.units.a1cToPct(39), 5.7);
  assert.equal(E.units.a1cToPct(53), 7.0);
  assert.equal(E.units.a1cToMmolMol(6.5), 48);
  assert.equal(Math.round(E.units.lbToKg(154.3)), 70);
  assert.equal(Math.round(E.units.ftInToCm(5, 10)), 178);
  assert.deepEqual(E.units.cmToFtIn(178), { ft: 5, inch: 10 });
});

/* ---------------------------------------------------------------- LE8: glucose */
test('LE8 glucose: no diabetes, prediabetes and diabetes HbA1c ladder', () => {
  assert.equal(E.le8Glucose({ fbg: 99 }), 100);
  assert.equal(E.le8Glucose({ fbg: 100 }), 60);
  assert.equal(E.le8Glucose({ fbg: 125 }), 60);
  assert.equal(E.le8Glucose({ hba1c: 5.6 }), 100);
  assert.equal(E.le8Glucose({ hba1c: 5.7 }), 60);
  assert.equal(E.le8Glucose({ hba1c: 6.4 }), 60);
  const dm = [[5.9, 40], [6.9, 40], [7.0, 30], [7.9, 30], [8.0, 20], [8.9, 20], [9.0, 10], [9.9, 10], [10.0, 0], [12, 0]];
  for (const [a, pts] of dm) assert.equal(E.le8Glucose({ diabetes: true, hba1c: a }), pts, `HbA1c ${a}`);
  assert.equal(E.le8Glucose({ diabetes: true }), null); // LE8 needs HbA1c with diabetes
  assert.equal(E.le8Glucose({}), null);
});
test('LE8 glucose: worse category wins, diabetes-range without diagnosis is flagged', () => {
  assert.equal(E.le8Glucose({ fbg: 95, hba1c: 5.9 }), 60);
  const d1 = E.le8GlucoseDetail({ hba1c: 6.8 });
  assert.deepEqual([d1.points, d1.range, d1.approx], [40, 'diabetes-range', true]);
  const d2 = E.le8GlucoseDetail({ fbg: 140 });
  assert.deepEqual([d2.points, d2.range, d2.approx], [40, 'diabetes-range', true]);
  const d3 = E.le8GlucoseDetail({ hba1c: 8.2 });
  assert.equal(d3.points, 20);
  const told = E.le8GlucoseDetail({ prediabetes: true });
  assert.deepEqual([told.points, told.range, told.approx], [60, 'prediabetes', true]);
  // a recent normal number outranks an old "borderline" label
  assert.equal(E.le8Glucose({ prediabetes: true, hba1c: 5.4 }), 100);
});

/* ---------------------------------------------------------------- LE8: blood pressure */
test('LE8 blood pressure ladder uses the lower of the systolic and diastolic rows', () => {
  const cases = [
    [119, 79, 100], [120, 79, 75], [129, 79, 75], [119, 80, 50], [120, 80, 50], [130, 70, 50], [139, 89, 50],
    [140, 70, 25], [118, 90, 25], [159, 99, 25], [160, 70, 0], [110, 100, 0], [118, 85, 50], [125, 95, 25]
  ];
  for (const [s, d, pts] of cases) assert.equal(E.le8Bp(s, d, false), pts, `${s}/${d}`);
});
test('LE8 treated blood pressure subtracts 20 (floor 0)', () => {
  assert.equal(E.le8Bp(118, 76, true), 80);
  assert.equal(E.le8Bp(125, 76, true), 55);
  assert.equal(E.le8Bp(135, 85, true), 30);
  assert.equal(E.le8Bp(150, 92, true), 5);
  assert.equal(E.le8Bp(165, 105, true), 0);
  assert.equal(E.le8Bp(undefined, 80), null);
});

/* ---------------------------------------------------------------- LE8: composite */
test('LE8 composite: mean of available metrics, bands and partial flag', () => {
  const all = { diet: 50, activity: 100, nicotine: 100, sleep: 70, bmi: 70, lipids: 60, glucose: 100, bp: 75 };
  const c = E.le8Composite(all);
  assert.equal(c.mean, 78.13);
  assert.equal(c.score, 78);
  assert.equal(c.band, 'moderate');
  assert.equal(c.partial, false);
  assert.equal(c.count, 8);
  const missing = E.le8Composite({ activity: 100, nicotine: 100, sleep: 100, bmi: 70, bp: 50 });
  assert.equal(missing.count, 5);
  assert.equal(missing.partial, true);
  assert.deepEqual(missing.missing, ['diet', 'lipids', 'glucose']);
  assert.equal(missing.score, 84);
  assert.equal(missing.band, 'high');
  assert.equal(missing.reliable, true);
  assert.equal(E.le8Composite({ nicotine: 100 }).reliable, false);
  assert.equal(E.le8Composite({}), null);
});
test('LE8 composite band boundaries agree with the shown (floored) score', () => {
  // 7 metrics summing to 559 → 79.857: shown 79, moderate (never shown as 80)
  const m = { diet: 80, activity: 80, nicotine: 80, sleep: 80, bmi: 80, lipids: 80, glucose: 79 };
  const c = E.le8Composite(m);
  assert.equal(c.score, 79); assert.equal(c.band, 'moderate');
  assert.equal(E.le8Composite({ diet: 80, activity: 80, nicotine: 80, sleep: 80 }).band, 'high');
  assert.equal(E.le8Composite({ diet: 50, activity: 50, nicotine: 50, sleep: 50 }).band, 'moderate');
  assert.equal(E.le8Composite({ diet: 49, activity: 50, nicotine: 50, sleep: 50 }).band, 'low');
  assert.equal(E.le8Band(80), 'high'); assert.equal(E.le8Band(79.99), 'moderate'); assert.equal(E.le8Band(50), 'moderate'); assert.equal(E.le8Band(49.99), 'low');
});

/* ---------------------------------------------------------------- diet quick check */
test('diet quick check maps the share of healthy answers onto LE8/MEPA bands', () => {
  const expected = { 0: 0, 3: 0, 4: 25, 6: 25, 7: 50, 10: 50, 11: 80, 13: 80, 14: 100 };
  for (const [met, pts] of Object.entries(expected)) assert.equal(E.dietPoints(Number(met), 14), pts, `${met}/14`);
  assert.equal(E.dietPoints(15, 16), 100); assert.equal(E.dietPoints(12, 16), 80); assert.equal(E.dietPoints(8, 16), 50); assert.equal(E.dietPoints(4, 16), 25); assert.equal(E.dietPoints(3, 16), 0);
});
test('diet quick check items: thresholds, completeness and conservative scoring', () => {
  const healthy = { veg: 3, fruit: 2, legumes: 3, grains: 'most', nuts: 3, fish: 2, oil: 'plant', solidFat: 5, redMeat: 3, processedMeat: 0, sugaryDrinks: 5, sweets: 2, snacks: 2, salt: 'rarely' };
  const all = E.dietScore(healthy);
  assert.equal(all.met, 14); assert.equal(all.points, 100); assert.equal(all.complete, true);
  const worse = Object.assign({}, healthy, { veg: 2, fruit: 1, fish: 1, oil: 'tropical', redMeat: 5, sugaryDrinks: 7, salt: 'some' });
  const w = E.dietScore(worse);
  assert.equal(w.met, 7); assert.equal(w.points, 50);
  const partial = Object.assign({}, healthy); delete partial.salt; delete partial.oil;
  assert.equal(E.dietScore(partial).points, 80); // 12 answered, unanswered count as not met → 12/14
  delete partial.fish;
  assert.equal(E.dietScore(partial).points, null);
});
test('le8FromInputs builds metrics and raw values from module answers', () => {
  const r = E.le8FromInputs({ modDays: 5, modMin: 30, smoking: 'never', homeSmoke: true, sleepHours: 7.5, heightCm: 170, weightKg: 80,
    sys: 132, dia: 84, bpTreated: false, tc: 220, hdl: 50, lipidTreated: true, hba1c: 5.8 });
  assert.deepEqual(r.metrics, { diet: null, activity: 100, nicotine: 80, sleep: 100, bmi: 70, lipids: 20, glucose: 60, bp: 50 });
  assert.equal(r.raw.nonHdl, 170);
  assert.equal(r.composite.count, 7);
  assert.equal(r.composite.partial, true);
  assert.equal(E.le8FromInputs({ heightCm: 160, weightKg: 90, pregnant: true }).metrics.bmi, null); // BMI not scored in pregnancy
});

/* ---------------------------------------------------------------- home BP average */
test('home blood pressure average uses the last 30 days and needs 2 days for "enough"', () => {
  const now = Date.parse('2026-11-03T12:00:00Z');
  const readings = [
    { t: '2026-11-02T07:00:00Z', sys: 140, dia: 90 }, { t: '2026-11-02T19:00:00Z', sys: 136, dia: 86 },
    { t: '2026-11-01T07:00:00Z', sys: 132, dia: 82 }, { t: '2026-09-01T07:00:00Z', sys: 190, dia: 110 }, // too old
    { t: '2026-11-01T08:00:00Z', sys: 80, dia: 90 }, { t: 'bad', sys: 120, dia: 80 }, null // invalid
  ];
  const a = E.bpAverage(readings, now);
  assert.deepEqual([a.sys, a.dia, a.n, a.days, a.enough], [136, 86, 3, 2, true]);
  const one = E.bpAverage([{ t: '2026-11-02T07:00:00Z', sys: 128, dia: 78 }], now);
  assert.equal(one.enough, false);
  assert.equal(E.bpAverage([], now), null);
  assert.equal(E.bpLevel(181, 90), 'crisis'); assert.equal(E.bpLevel(150, 121), 'crisis');
  assert.equal(E.bpLevel(160, 80), 'stage2high'); assert.equal(E.bpLevel(140, 80), 'stage2'); assert.equal(E.bpLevel(125, 80), 'stage1');
  assert.equal(E.bpLevel(125, 79), 'elevated'); assert.equal(E.bpLevel(119, 79), 'normal');
});

/* ---------------------------------------------------------------- FINDRISC */
test('FINDRISC item points at their boundaries', () => {
  const base = { sex: 'male', bmi: 22, waist: 80, active: true, vegDaily: true, bpMeds: false, highGlucose: false, family: 'none' };
  const age = a => E.findrisc(Object.assign({}, base, { age: a })).items.age;
  assert.deepEqual([44, 45, 54, 55, 64, 65].map(age), [0, 2, 2, 3, 3, 4]);
  const bmiPts = b => E.findrisc(Object.assign({}, base, { age: 30, bmi: b })).items.bmi;
  assert.deepEqual([24.9, 25, 30, 30.1].map(bmiPts), [0, 1, 1, 3]);
  const waist = (sex, w, asian) => E.findrisc(Object.assign({}, base, { age: 30, sex, waist: w, asian })).items.waist;
  assert.deepEqual([93, 94, 102, 103].map(w => waist('male', w)), [0, 3, 3, 4]);
  assert.deepEqual([79, 80, 88, 89].map(w => waist('female', w)), [0, 3, 3, 4]);
  assert.deepEqual([89, 90, 102, 103].map(w => waist('male', w, true)), [0, 3, 3, 4]); // IDF Asian men ≥90
  assert.deepEqual([79, 80].map(w => waist('female', w, true)), [0, 3]);
  const f = E.findrisc({ age: 50, sex: 'male', bmi: 27, waist: 95, active: false, vegDaily: false, bpMeds: true, highGlucose: true, family: 'first' });
  assert.deepEqual(f.items, { age: 2, bmi: 1, waist: 3, activity: 2, veg: 1, bpMeds: 2, glucose: 5, family: 5 });
  assert.equal(f.score, 21); assert.equal(f.band, 'veryhigh'); assert.equal(f.complete, true);
  assert.equal(E.findrisc(Object.assign({}, base, { age: 30, family: 'second' })).items.family, 3);
  assert.equal(E.findrisc({ age: 50, sex: 'male', asian: true }).adapted, true);
  assert.equal(E.findrisc({ age: 50, sex: 'female', asian: true }).adapted, false);
});
test('FINDRISC bands with 10-year risk and the missing-waist range', () => {
  const bands = [[0, 'low'], [6, 'low'], [7, 'slight'], [11, 'slight'], [12, 'moderate'], [14, 'moderate'], [15, 'high'], [20, 'high'], [21, 'veryhigh'], [26, 'veryhigh']];
  for (const [s, b] of bands) assert.equal(E.findriscBand(s), b, `score ${s}`);
  assert.deepEqual(E.FINDRISC_BANDS.map(b => b.pct), [1, 4, 17, 33, 50]);
  assert.equal(E.findriscBandInfo('moderate').oneIn, 6);
  const noWaist = E.findrisc({ age: 58, sex: 'female', bmi: 31, active: false, vegDaily: true, bpMeds: true, highGlucose: false, family: 'none' });
  assert.equal(noWaist.complete, false);
  assert.deepEqual(noWaist.missing, ['waist']);
  assert.equal(noWaist.min, 10); assert.equal(noWaist.max, 14);
  assert.equal(noWaist.band, null); assert.equal(noWaist.bandMin, 'slight'); assert.equal(noWaist.bandMax, 'moderate');
});

/* ---------------------------------------------------------------- mood */
test('PHQ-2 and PHQ-9 thresholds, bands and item 9', () => {
  assert.equal(E.phq2([1, 1]).positive, false);
  assert.equal(E.phq2([2, 1]).positive, true);
  assert.equal(E.phq2([1]), null);
  const p = items => E.phq9(items);
  assert.equal(p([1, 1, 1, 1, 0, 0, 0, 0, 0]).band, 'minimal');   // 4
  assert.equal(p([1, 1, 1, 1, 1, 0, 0, 0, 0]).band, 'mild');      // 5
  assert.equal(p([1, 1, 1, 1, 1, 1, 1, 1, 1]).band, 'mild');      // 9
  assert.equal(p([2, 1, 1, 1, 1, 1, 1, 1, 1]).band, 'moderate');  // 10
  assert.equal(p([2, 2, 2, 2, 2, 2, 1, 1, 0]).band, 'moderate');  // 14
  assert.equal(p([2, 2, 2, 2, 2, 2, 2, 1, 0]).band, 'modsevere'); // 15
  assert.equal(p([3, 3, 3, 2, 2, 2, 2, 2, 0]).band, 'modsevere'); // 19
  assert.equal(p([3, 3, 3, 3, 2, 2, 2, 2, 0]).band, 'severe');    // 20
  assert.equal(p([3, 3, 3, 3, 3, 3, 3, 3, 3]).score, 27);
  assert.equal(p([2, 1, 1, 1, 1, 1, 1, 1, 1]).positive, true);
  assert.equal(p([0, 0, 0, 0, 0, 0, 0, 0, 1]).item9Positive, true);
  assert.equal(p([0, 0, 0, 0, 0, 0, 0, 0, 0]).item9Positive, false);
  assert.equal(p([0, 0, 0, 0, 0, 0, 0, 0, 4]), null);
});
test('GAD-2 and GAD-7 thresholds and bands', () => {
  assert.equal(E.gad2([1, 1]).positive, false);
  assert.equal(E.gad2([3, 0]).positive, true);
  const g = items => E.gad7(items);
  assert.equal(g([1, 1, 1, 1, 0, 0, 0]).band, 'minimal'); // 4
  assert.equal(g([1, 1, 1, 1, 1, 0, 0]).band, 'mild');    // 5
  assert.equal(g([2, 2, 2, 1, 1, 1, 0]).band, 'mild');    // 9
  assert.equal(g([2, 2, 2, 1, 1, 1, 1]).band, 'moderate'); // 10
  assert.equal(g([2, 2, 2, 2, 2, 2, 2]).band, 'moderate'); // 14
  assert.equal(g([3, 2, 2, 2, 2, 2, 2]).band, 'severe');  // 15
  assert.equal(g([2, 2, 2, 1, 1, 1, 1]).positive, true);
  assert.equal(g([2, 2, 2, 1, 1, 1, 0]).positive, false);
});

/* ---------------------------------------------------------------- AUDIT-C */
test('AUDIT-C sex-specific thresholds (≥4 men, ≥3 women; unknown sex uses 3)', () => {
  assert.equal(E.auditc(1, 1, 1, 'male').positive, false);  // 3
  assert.equal(E.auditc(2, 1, 1, 'male').positive, true);   // 4
  assert.equal(E.auditc(1, 1, 0, 'female').positive, false); // 2
  assert.equal(E.auditc(1, 1, 1, 'female').positive, true); // 3
  assert.equal(E.auditc(1, 1, 1).positive, true);
  assert.equal(E.auditc(1, 1, 1).threshold, 3);
  assert.equal(E.auditc(1, 1, 1).sexKnown, false);
  const never = E.auditc(0, undefined, undefined, 'male');
  assert.equal(never.score, 0); assert.equal(never.drinks, false);
  assert.equal(E.auditc(4, 4, 4, 'male').score, 12);
  assert.equal(E.auditc(2, undefined, 1, 'male'), null);
  assert.equal(E.auditc(5, 0, 0), null);
});

/* ---------------------------------------------------------------- STOP-BANG */
test('STOP-BANG scores, bands and the STOP ≥2 rule', () => {
  const sb = o => E.stopbang(o);
  assert.equal(sb({ snore: true, tired: true, sex: 'female', age: 40, bmi: 25, neck: false, observed: false, pressure: false }).band, 'low');
  // score 3 with STOP 2 + male → high
  assert.equal(sb({ snore: true, tired: true, observed: false, pressure: false, sex: 'male', age: 40, bmi: 25, neck: false }).band, 'high');
  // score 3 with STOP 1 → intermediate
  assert.equal(sb({ snore: true, tired: false, observed: false, pressure: false, sex: 'male', age: 55, bmi: 25, neck: false }).band, 'intermediate');
  // score 4 with STOP 2 but female, BMI ≤35, neck not large → intermediate
  assert.equal(sb({ snore: true, tired: true, observed: false, pressure: false, sex: 'female', age: 60, bmi: 35, neck: false }).score, 3);
  assert.equal(sb({ snore: true, tired: true, observed: false, pressure: true, sex: 'female', age: 60, bmi: 30, neck: false }).band, 'intermediate');
  // BMI must be >35 and age >50
  assert.equal(sb({ bmi: 35, age: 50 }).items.B, false);
  assert.equal(sb({ bmi: 35.1, age: 51 }).items.B, true);
  assert.equal(sb({ bmi: 35.1, age: 51 }).items.A, true);
  assert.equal(sb({ snore: true, tired: true, observed: true, pressure: true, sex: 'male' }).band, 'high');
  assert.equal(sb({ snore: true, tired: true, observed: true, pressure: true, sex: 'male', bmi: 36, age: 60, neck: true }).score, 8);
  assert.deepEqual(sb({ snore: true }).unknown, ['tired', 'observed', 'pressure', 'neck', 'bmi', 'age', 'sex']);
});

/* ---------------------------------------------------------------- TB, falls, infections */
test('WHO four-symptom TB screen, STEADI falls and infection nudges', () => {
  assert.equal(E.tbScreen({ cough: false, fever: false, sweats: false, weightLoss: false }).positive, false);
  assert.equal(E.tbScreen({ cough: true, fever: false, sweats: false, weightLoss: false }).positive, true);
  assert.equal(E.tbScreen({ cough: false, fever: false, sweats: true, weightLoss: true }).count, 2);
  assert.equal(E.tbScreen({}), null);
  assert.equal(E.fallsScreen({ fell: false, unsteady: false, worried: false }).positive, false);
  assert.equal(E.fallsScreen({ fell: false, unsteady: false, worried: true }).positive, true);
  assert.equal(E.infectionNeeds({ hivLast: 'past1y', hepB: 'yes', hepC: 'yes', exposure: 'no', sti: 'no' }).hivTest, false);
  assert.equal(E.infectionNeeds({ hivLast: 'never' }).hivTest, true);
  const exp = E.infectionNeeds({ hivLast: 'past1y', exposure: 'yes', exposure72h: 'yes' });
  assert.equal(exp.pep, true); assert.equal(exp.hivSoon, true); assert.equal(exp.stiCheck, true);
  assert.equal(E.infectionNeeds({ exposure: 'yes', exposure72h: 'no' }).pep, false);
  assert.equal(E.infectionNeeds({ exposure: 'yes', exposure72h: 'unsure' }).pep, true);
  assert.equal(E.infectionNeeds({ hepC: 'unsure' }).hepTest, true);
});

/* ---------------------------------------------------------------- salt-substitute gate */
test('salt substitute: never for children, pregnancy or kidney disease (WHO 2025)', () => {
  assert.equal(E.saltSubstituteGate({ age: 45 }).status, 'ok');
  assert.equal(E.saltSubstituteGate({ age: 15 }).status, 'no');
  assert.deepEqual(E.saltSubstituteGate({ age: 30, pregnant: true }).no, ['pregnant']);
  assert.equal(E.saltSubstituteGate({ age: 60, conditions: ['kidney-disease'] }).status, 'no');
  assert.equal(E.saltSubstituteGate({ age: 60, conditions: ['kidney-disease'], medNames: ['Ramipril'] }).status, 'no');
});
test('salt substitute: ask a health worker first with potassium-raising medicines or unknown BP medicine', () => {
  const ask = meds => E.saltSubstituteGate({ age: 60, medNames: meds });
  for (const m of ['Ramipril 5 mg', 'lisinopril', 'Enalapril', 'losartan', 'Valsartan', 'Entresto', 'spironolactone', 'Amiloride', 'eplerenone', 'Slow-K', 'potassium chloride', 'aliskiren']) {
    assert.equal(ask([m]).status, 'ask', m);
  }
  assert.equal(ask(['amlodipine', 'metformin']).status, 'ok');
  assert.deepEqual(E.saltSubstituteGate({ age: 60, bpMeds: true }).ask, ['bp-meds']);
  assert.deepEqual(E.saltSubstituteGate({ age: 60, bpMeds: true, medNames: ['losartan'] }).ask, ['med-arb']);
  assert.equal(E.saltSubstituteGate({ age: 60, conditions: ['heart-disease'] }).status, 'ask');
  assert.equal(E.saltSubstituteGate({ age: 60, conditions: ['diabetes'] }).status, 'ask');
  assert.equal(E.saltSubstituteGate({ age: 30, breastfeeding: true }).status, 'ask');
  const f = E.medFlags(['Captopril', 'Candesartan']);
  assert.equal(f.acei && f.arb, true);
});

/* ---------------------------------------------------------------- ranking personas */
function rank(profile, results, opts) {
  return E.rankActions(E.buildContext(profile, results, Object.assign({ year: 2026, today: '2026-11-03' }, opts || {})));
}
const ids = list => list.map(a => a.id);

test('persona: 55-year-old male smoker with unknown blood pressure', () => {
  const plan = rank({ birthYear: 1971, sex: 'male', heightCm: 175, weightKg: 83, smoking: 'current' }, {});
  assert.equal(plan[0].id, 'stop-smoking');
  assert.equal(plan[1].id, 'check-bp');
  assert.ok(ids(plan).slice(0, 5).includes('check-glucose'));
  assert.ok(ids(plan).includes('check-cholesterol'));
  assert.ok(plan.every(a => a.priority === 'normal'));
  const top = plan[0];
  assert.equal(top.benefit, 60); assert.equal(top.relevance, 1); assert.equal(top.feasibility, 0.7); assert.equal(top.score, 42);
  assert.deepEqual(top.why.map(w => w.code), ['smoker']);
  assert.ok(top.sources.includes('jha'));
});
test('persona: 30-year-old active non-smoker', () => {
  const results = { le8: { metrics: { activity: 100, nicotine: 100, sleep: 100, bmi: 100 }, raw: { paMin: 240, sleepHours: 7.5, sleepRegular: 'yes', smoking: 'never' } } };
  const plan = rank({ birthYear: 1996, sex: 'female', heightCm: 165, weightKg: 60, smoking: 'never' }, results);
  assert.ok(!ids(plan).includes('stop-smoking'));
  assert.ok(!ids(plan).includes('steps'));
  assert.ok(!ids(plan).includes('vilpa'));
  assert.ok(!ids(plan).includes('weight'));
  assert.ok(!ids(plan).includes('sleep-regularity'));
  assert.equal(plan[0].id, 'check-bp');
  // the smoker's top action scores far higher than anything for the active non-smoker
  const smoker = rank({ birthYear: 1971, sex: 'male', heightCm: 175, weightKg: 83, smoking: 'current' }, {});
  assert.ok(smoker[0].score > plan[0].score * 2);
});
test('persona: kidney disease with high home BP gets BP control, never a salt substitute', () => {
  const results = { le8: { metrics: { bp: 25 }, raw: { sys: 152, dia: 94, bpTreated: true, bpSource: 'home', bpN: 12 } } };
  const plan = rank({ birthYear: 1964, sex: 'male', conditions: ['kidney-disease', 'hypertension'], heightCm: 170, weightKg: 90 }, results);
  assert.equal(plan[0].id, 'control-bp');
  assert.equal(plan[0].benefit, 51); // 1 − 0.8^(32/10) = 0.510
  assert.ok(!ids(plan).includes('salt-substitute'));
  const less = plan.find(a => a.id === 'less-salt');
  assert.ok(less);
  assert.equal(less.why[0].code, 'salt-sub-not-for-you');
  assert.ok(plan[0].why.some(w => w.code === 'bp-home'));
});
test('persona: pregnant woman — no salt substitute, no weight-loss action, alcohol advice is "soon"', () => {
  const results = { le8: { raw: { sys: 134, dia: 86 } }, auditc: { score: 2, positive: false, threshold: 3 } };
  const plan = rank({ birthYear: 1994, sex: 'female', pregnant: true, heightCm: 160, weightKg: 82 }, results);
  assert.ok(!ids(plan).includes('salt-substitute'));
  assert.ok(!ids(plan).includes('weight'));
  const alc = plan.find(a => a.id === 'cut-alcohol');
  assert.equal(alc.priority, 'soon');
  assert.equal(alc.why[0].code, 'pregnant-alcohol');
  const vilpa = plan.find(a => a.id === 'vilpa');
  assert.equal(vilpa.gate.status, 'ask');
});
test('persona: on ramipril — salt substitute is "ask first" and ranked lower', () => {
  const results = { le8: { raw: { sys: 138, dia: 84, bpTreated: true } } };
  const plan = rank({ birthYear: 1960, sex: 'female', conditions: ['hypertension'] }, results, { medNames: ['Ramipril'] });
  const salt = plan.find(a => a.id === 'salt-substitute');
  assert.equal(salt.gate.status, 'ask');
  assert.deepEqual(salt.gate.ask, ['med-acei']);
  assert.equal(salt.feasibility, 0.51);
  assert.equal(plan.find(a => a.id === 'less-salt').why[0].code, 'salt-sub-ask');
});
test('urgent items always come first: PHQ-9 item 9, PEP, BP crisis, TB with blood', () => {
  const results = {
    phq9: { score: 6, item9: 1, band: 'mild' },
    infections: { hivLast: 'never', exposure: 'yes', exposure72h: 'yes' },
    le8: { raw: { sys: 186, dia: 100 } },
    tb: { positive: true, count: 2, blood: false }
  };
  const plan = rank({ birthYear: 1980, sex: 'male', smoking: 'current' }, results);
  assert.deepEqual(plan.filter(a => a.priority === 'urgent').map(a => a.id).sort(), ['bp-urgent', 'crisis-support', 'pep']);
  assert.ok(plan.slice(0, 3).every(a => a.priority === 'urgent'));
  const firstSoon = plan.findIndex(a => a.priority === 'soon');
  assert.equal(firstSoon, 3);
  assert.ok(plan.filter(a => a.priority === 'soon').map(a => a.id).includes('tb-test'));
  assert.ok(plan.filter(a => a.priority === 'soon').map(a => a.id).includes('hiv-test'));
  const crisis = plan.find(a => a.id === 'crisis-support');
  assert.equal(crisis.kind, 'urgent');
});
test('mental health support relevance follows PHQ-9 and GAD-7 scores', () => {
  const r = (phq9, gad7) => rank({ birthYear: 1990 }, { phq9, gad7 }).find(a => a.id === 'mental-health-support');
  assert.equal(r({ score: 3, item9: 0 }, { score: 2 }), undefined);
  assert.equal(r({ score: 12, item9: 0 }).relevance, 0.75);
  assert.equal(r({ score: 22, item9: 0 }).priority, 'soon');
  assert.equal(r(null, { score: 16 }).relevance, 0.9);
  assert.equal(rank({ birthYear: 1990 }, { phq2: { score: 4, positive: true } }).find(a => a.id === 'mental-health-support').relevance, 0.6);
});
test('high FINDRISC lifts the glucose test and weight actions', () => {
  const p = { birthYear: 1970, sex: 'male', heightCm: 170, weightKg: 92 };
  const low = rank(p, { findrisc: { score: 5, band: 'low', complete: true } });
  const high = rank(p, { findrisc: { score: 17, band: 'high', complete: true } });
  const g = list => list.find(a => a.id === 'check-glucose');
  assert.ok(g(high).score > g(low).score * 3);
  assert.equal(high.find(a => a.id === 'weight').relevance, 0.8);
  assert.equal(rank(Object.assign({ conditions: ['diabetes'] }, p), {}).find(a => a.id === 'check-glucose'), undefined);
  assert.equal(rank(Object.assign({ conditions: ['diabetes'] }, p), {}).find(a => a.id === 'diabetes-care').why[0].code, 'hba1c-unknown');
  const range = rank(p, { le8: { raw: { glucoseRange: 'diabetes-range', hba1c: 6.9 } } });
  assert.equal(g(range).priority, 'soon');
});
test('Asian ancestry uses lower BMI cut-offs for the weight action', () => {
  const p = { birthYear: 1980, sex: 'female', heightCm: 160, weightKg: 62 }; // BMI 24.2
  assert.equal(rank(p, {}).find(a => a.id === 'weight'), undefined);
  const asian = rank(Object.assign({ ancestry: 'asian' }, p), {}).find(a => a.id === 'weight');
  assert.equal(asian.relevance, 0.4);
  assert.equal(asian.why[0].code, 'bmi-asian');
});
test('ranking output is well formed and sorted', () => {
  const plan = rank({ birthYear: 1950, sex: 'female', heightCm: 158, weightKg: 70, smoking: 'former', smokingQuit: 'lt1' },
    { falls: { positive: true }, stopbang: { score: 5, band: 'high' }, auditc: { score: 5, positive: true, threshold: 3 } });
  const pr = { urgent: 0, soon: 1, normal: 2 };
  for (let i = 1; i < plan.length; i++) {
    const a = plan[i - 1], b = plan[i];
    assert.ok(pr[a.priority] < pr[b.priority] || (pr[a.priority] === pr[b.priority] && a.score >= b.score), `${a.id} before ${b.id}`);
  }
  for (const a of plan) {
    assert.ok(typeof a.id === 'string' && E.ACTION_IDS.includes(a.id));
    assert.ok(a.relevance > 0 && a.relevance <= 1);
    assert.ok(a.feasibility > 0 && a.feasibility <= 1);
    assert.ok(Array.isArray(a.why) && a.why.length > 0, a.id + ' has reasons');
    assert.ok(a.sources.every(s => E.SOURCES[s]), a.id + ' sources exist');
  }
  assert.ok(ids(plan).includes('strength-balance'));
  assert.ok(ids(plan).includes('sleep-apnoea-check'));
  assert.ok(ids(plan).includes('cut-alcohol'));
  assert.equal(plan.find(a => a.id === 'stop-smoking').why[0].code, 'recent-quit');
});

/* ---------------------------------------------------------------- re-check scheduling */
test('re-check suggestion and month arithmetic', () => {
  assert.equal(E.suggestRecheckMonths({}), 12);
  assert.equal(E.suggestRecheckMonths({ le8: { band: 'moderate' } }), 6);
  assert.equal(E.suggestRecheckMonths({ le8: { band: 'high' }, findrisc: { score: 16 } }), 3);
  assert.equal(E.suggestRecheckMonths({ phq9: { score: 11 } }), 3);
  assert.equal(E.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(E.addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(E.addMonths('2026-11-03', 3), '2027-02-03');
  assert.equal(E.addMonths('2026-11-03', 12), '2027-11-03');
  assert.equal(E.addMonths('bad', 3), null);
});
test('every cited source id and action id is defined', () => {
  for (const id of E.ACTION_IDS) assert.ok(E.ACTION_SOURCES[id] && E.ACTION_SOURCES[id].length, id);
  for (const list of Object.values(E.ACTION_SOURCES)) for (const s of list) assert.ok(E.SOURCES[s], s);
  assert.ok(E.CONDITIONS.includes('raised-sugar') && !E.CONDITIONS.includes('prediabetes'));
});
