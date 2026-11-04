// Unit tests for clinician/lib/fluids-drugs.js (package C2): maintenance fluids, burns, TBSA,
// paediatric emergency doses, the infusion converter and laboratory unit conversions.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fd = require(path.join(__dirname, '../../clinician/lib/fluids-drugs.js'));

const near = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg || ''} expected ${expected} ± ${tol}, got ${actual}`);
const row = (rows, id) => rows.find(r => r.id === id);

test('Holliday–Segar daily volumes (100/50/20 mL/kg/day)', () => {
  assert.equal(fd.hollidaySegarDaily(5), 500);
  assert.equal(fd.hollidaySegarDaily(10), 1000);
  assert.equal(fd.hollidaySegarDaily(15), 1250);
  assert.equal(fd.hollidaySegarDaily(20), 1500);
  assert.equal(fd.hollidaySegarDaily(25), 1600);
  assert.equal(fd.hollidaySegarDaily(70), 2500);
  assert.equal(fd.hollidaySegarDaily(0), null);
});

test('4-2-1 hourly rule', () => {
  assert.equal(fd.rule421(5), 20);
  assert.equal(fd.rule421(10), 40);
  assert.equal(fd.rule421(15), 50);
  assert.equal(fd.rule421(20), 60);
  assert.equal(fd.rule421(25), 65);
  assert.equal(fd.rule421(70), 110);
});

test('adult maintenance 25–30 mL/kg/day (NICE CG174)', () => {
  const a = fd.adultMaintenance(70);
  assert.equal(a.lowDay, 1750); assert.equal(a.highDay, 2100);
  near(a.lowHour, 72.9, 0.05); near(a.highHour, 87.5, 1e-9);
});

test('Parkland formula: 4 mL/kg/%TBSA, half in the first 8 h from the time of burn', () => {
  const r = fd.burnsResuscitation({ weight: 70, tbsa: 40, mlPerKgPct: 4 });
  assert.equal(r.total, 11200); assert.equal(r.first8, 5600); assert.equal(r.next16, 5600);
  assert.equal(r.rateNow, 700); assert.equal(r.rateNext16, 350);
  // started 2 h after the burn with 1000 mL already given: 4600 mL over the remaining 6 h
  const late = fd.burnsResuscitation({ weight: 70, tbsa: 40, mlPerKgPct: 4, hoursSinceBurn: 2, givenMl: 1000 });
  near(late.rateNow, 766.67, 0.01);
  assert.equal(late.hoursLeftFirst, 6);
  // more than 8 h: the remaining 24-h volume over the remaining hours
  const after = fd.burnsResuscitation({ weight: 70, tbsa: 40, mlPerKgPct: 4, hoursSinceBurn: 10, givenMl: 3000 });
  assert.equal(after.phase, 'second'); assert.equal(after.behind, true);
  near(after.rateNow, 8200 / 14, 1e-9);
  assert.equal(fd.burnsResuscitation({ weight: 70, tbsa: 40, mlPerKgPct: 4, hoursSinceBurn: 30 }).phase, 'beyond');
  const done = fd.burnsResuscitation({ weight: 20, tbsa: 20, mlPerKgPct: 4, hoursSinceBurn: 4, givenMl: 900 });
  assert.equal(done.firstHalfComplete, true); assert.equal(done.rateNow, 0);
});

test('modified Brooke formula: 2 mL/kg/%TBSA', () => {
  const r = fd.burnsResuscitation({ weight: 70, tbsa: 40, mlPerKgPct: 2 });
  assert.equal(r.total, 5600); assert.equal(r.rateNow, 350); assert.equal(r.rateNext16, 175);
  assert.equal(fd.BURN_FORMULAS.find(f => f.id === 'brooke').mlPerKgPct, 2);
  assert.equal(fd.BURN_FORMULAS.find(f => f.id === 'parkland').mlPerKgPct, 4);
  assert.equal(fd.burnsResuscitation({ weight: 70, tbsa: 120, mlPerKgPct: 4 }), null);
});

test('TBSA charts each total 100%', () => {
  const sum = list => list.reduce((s, a) => s + a.pct, 0);
  assert.equal(sum(fd.tbsaAreas('nines-adult')), 100);
  assert.equal(sum(fd.tbsaAreas('nines-child')), 100);
  for (const b of fd.LB_BANDS) near(sum(fd.tbsaAreas('lund-browder', b.id)), 100, 1e-9, 'Lund–Browder ' + b.id);
});

test('Lund–Browder age bands and region values', () => {
  assert.equal(fd.lundBrowderBand(0.5), '0');
  assert.equal(fd.lundBrowderBand(3), '1');
  assert.equal(fd.lundBrowderBand(7), '5');
  assert.equal(fd.lundBrowderBand(12), '10');
  assert.equal(fd.lundBrowderBand(15), '15');
  assert.equal(fd.lundBrowderBand(40), 'adult');
  const infantHead = fd.tbsaAreas('lund-browder', '0').filter(a => a.regionId === 'head').reduce((s, a) => s + a.pct, 0);
  const adultHead = fd.tbsaAreas('lund-browder', 'adult').filter(a => a.regionId === 'head').reduce((s, a) => s + a.pct, 0);
  assert.equal(infantHead, 19); assert.equal(adultHead, 7);
});

test('TBSA total from fractions burned', () => {
  assert.equal(fd.tbsaTotal('nines-adult', null, { 'trunk-ant': 1, 'arm-r': 0.5 }), 22.5);
  assert.equal(fd.tbsaTotal('nines-child', null, { head: 1, 'leg-l': 0.25 }), 21.5);
  assert.equal(fd.tbsaTotal('lund-browder', 'adult', { 'head:ant': 1, 'trunk:ant': 0.5, 'hand-r:ant': 1 }), 11.25);
  assert.equal(fd.tbsaTotal('nines-adult', null, {}), 0);
});

test('APLS weight formulas', () => {
  assert.equal(fd.aplsWeight(0, 0).kg, 4);
  assert.equal(fd.aplsWeight(0, 6).kg, 7);
  assert.equal(fd.aplsWeight(0, 11).kg, 9.5);
  assert.equal(fd.aplsWeight(1, 0).kg, 10);
  assert.equal(fd.aplsWeight(0, 12).kg, 10);
  assert.equal(fd.aplsWeight(3, 0).kg, 14);
  assert.equal(fd.aplsWeight(5, 11).kg, 18);
  assert.equal(fd.aplsWeight(6, 0).kg, 25);
  assert.equal(fd.aplsWeight(10, 0).kg, 37);
  assert.equal(fd.aplsWeight(12, 6).kg, 43);
  assert.equal(fd.aplsWeight(13, 0), null);
  assert.equal(fd.aplsWeight(4, 0).formula, '(2 × age in years) + 8');
});

test('tracheal tube estimates (age/4 + 4 uncuffed, age/4 + 3.5 cuffed, age/2 + 12 cm oral)', () => {
  const t1 = fd.ettSizes(1);
  assert.equal(t1.uncuffed, 4.25); assert.deepEqual(t1.uncuffedSizes, [4, 4.5]);
  assert.equal(t1.cuffed, 3.75); assert.deepEqual(t1.cuffedSizes, [3.5, 4]);
  assert.equal(t1.oralCm, 12.5); assert.equal(t1.nasalCm, 15.5);
  const t4 = fd.ettSizes(4);
  assert.deepEqual(t4.uncuffedSizes, [5]); assert.deepEqual(t4.cuffedSizes, [4.5]); assert.equal(t4.oralCm, 14);
  const t8 = fd.ettSizes(8.9);
  assert.equal(t8.age, 8); assert.deepEqual(t8.uncuffedSizes, [6]); assert.deepEqual(t8.cuffedSizes, [5.5]); assert.equal(t8.oralCm, 16);
  assert.equal(fd.ettSizes(0.5), null);
  assert.equal(fd.ettSizes(13), null);
});

test('paediatric doses for a 10 kg child', () => {
  const r = fd.paedsDoses({ weight: 10, ageMonths: 12 });
  assert.equal(row(r, 'defib').dose, 40);
  assert.equal(row(r, 'defib-refractory').dose, 80);
  assert.equal(row(r, 'adrenaline').dose, 100);
  assert.equal(row(r, 'adrenaline').volumeText, '1 mL of 1:10,000');
  assert.equal(row(r, 'amiodarone-1').dose, 50);
  assert.equal(row(r, 'amiodarone-2').dose, 50);
  assert.equal(row(r, 'adenosine-1').dose, 1);
  assert.equal(row(r, 'adenosine-2').dose, 2);
  assert.equal(row(r, 'atropine').dose, 200);
  assert.equal(row(r, 'glucose').dose, 20);
  assert.equal(row(r, 'bolus').dose, 100);
  assert.equal(row(r, 'lorazepam').dose, 1);
  assert.equal(row(r, 'txa').dose, 150);
  assert.equal(row(r, 'im-adrenaline').mcg, 150);
  assert.ok(r.every(x => x.source && x.maxText), 'every row has a source and a maximum');
  assert.ok(r.every(x => !x.capped));
});

test('paediatric doses are clamped at their maxima', () => {
  const r = fd.paedsDoses({ weight: 110, ageMonths: 120 }); // heavy adolescent: every capped row hits its maximum
  const capped = (id, max) => { const x = row(r, id); assert.equal(x.dose, max, id); assert.equal(x.capped, true, id); };
  capped('adrenaline', 1000);
  capped('amiodarone-1', 300);
  capped('amiodarone-2', 150);
  capped('adenosine-1', 6);
  capped('adenosine-2', 12);
  capped('atropine', 500);
  capped('lorazepam', 4);
  capped('txa', 1000);
  capped('defib', 200);
  capped('defib-refractory', 360);
  assert.equal(row(r, 'glucose').capped, false); // no maximum stated
  assert.equal(row(r, 'adrenaline').volumeText, '10 mL of 1:10,000');
  // exactly at the maximum is not "capped"
  const r30 = fd.paedsDoses({ weight: 30, ageMonths: 96 });
  assert.equal(row(r30, 'amiodarone-2').dose, 150); assert.equal(row(r30, 'amiodarone-2').capped, false);
  assert.equal(row(r30, 'amiodarone-1').dose, 150); assert.equal(row(r30, 'amiodarone-1').capped, false);
});

test('weightDose helper', () => {
  assert.deepEqual(fd.weightDose(5, 70, 300), { raw: 350, dose: 300, capped: true });
  assert.deepEqual(fd.weightDose(5, 20, 300), { raw: 100, dose: 100, capped: false });
  assert.equal(fd.weightDose(5, 0, 300), null);
});

test('IM adrenaline for anaphylaxis by age band (RCUK 2021)', () => {
  assert.deepEqual([fd.imAdrenaline(3).mcgLo, fd.imAdrenaline(3).mcgHi], [100, 150]);
  assert.equal(fd.imAdrenaline(6).mcg, 150);
  assert.equal(fd.imAdrenaline(24).mcg, 150);
  assert.equal(fd.imAdrenaline(71).mcg, 150);
  assert.equal(fd.imAdrenaline(72).mcg, 300);
  assert.equal(fd.imAdrenaline(100).mcg, 300);
  assert.equal(fd.imAdrenaline(149).mcg, 300); assert.equal(fd.imAdrenaline(149).boundary, true);
  assert.equal(fd.imAdrenaline(160).mcg, 500);
  const noAge = row(fd.paedsDoses({ weight: 20 }), 'im-adrenaline');
  assert.equal(noAge.bands.length, 4);
});

test('atropine: adolescents get the 300–600 microgram range', () => {
  const r = row(fd.paedsDoses({ weight: 50, ageMonths: 150 }), 'atropine');
  assert.equal(r.doseText, '300–600 micrograms');
  const young = row(fd.paedsDoses({ weight: 20, ageMonths: 60 }), 'atropine');
  assert.equal(young.dose, 400);
});

test('infusion converter: dose ↔ mL/h', () => {
  const base = { amount: 4, amountUnit: 'mg', volume: 50, weight: 70 }; // 80 micrograms/mL
  assert.equal(fd.concentration(4, 'mg', 50).perMl, 80);
  near(fd.doseToRate({ ...base, dose: 0.1, doseUnit: 'mcg/kg/min' }), 5.25, 1e-9);
  near(fd.rateToDose({ ...base, rate: 5.25, doseUnit: 'mcg/kg/min' }), 0.1, 1e-9);
  near(fd.doseToRate({ ...base, dose: 10, doseUnit: 'mcg/min' }), 7.5, 1e-9);
  near(fd.doseToRate({ amount: 500, amountUnit: 'mg', volume: 500, dose: 30, doseUnit: 'mg/h' }), 30, 1e-9);
  near(fd.doseToRate({ amount: 1, amountUnit: 'g', volume: 100, weight: 50, dose: 2, doseUnit: 'mg/kg/h' }), 10, 1e-9);
  near(fd.doseToRate({ amount: 50, amountUnit: 'units', volume: 50, dose: 2, doseUnit: 'units/h' }), 2, 1e-9);
  near(fd.doseToRate({ amount: 50, amountUnit: 'units', volume: 50, weight: 80, dose: 0.1, doseUnit: 'units/kg/h' }), 8, 1e-9);
  near(fd.rateToDose({ amount: 40, amountUnit: 'units', volume: 40, rate: 1.8, doseUnit: 'units/min' }), 0.03, 1e-9);
  near(fd.doseToRate({ amount: 10, amountUnit: 'mmol', volume: 100, dose: 2, doseUnit: 'mmol/h' }), 20, 1e-9);
  near(fd.doseToRate({ amount: 250, amountUnit: 'mcg', volume: 50, weight: 20, dose: 1, doseUnit: 'mcg/kg/h' }), 4, 1e-9);
  // incompatible kinds and missing weight
  assert.equal(fd.doseToRate({ amount: 50, amountUnit: 'units', volume: 50, dose: 2, doseUnit: 'mg/h' }), null);
  assert.equal(fd.doseToRate({ amount: 4, amountUnit: 'mg', volume: 50, dose: 0.1, doseUnit: 'mcg/kg/min' }), null);
  assert.equal(fd.compatible('mg/h', 'g'), true);
  assert.equal(fd.compatible('units/h', 'mg'), false);
});

test('drops per minute for drop factors 10/15/20/60', () => {
  near(fd.dropsPerMin(125, 20), 41.67, 0.01);
  near(fd.dropsPerMin(125, 15), 31.25, 1e-9);
  near(fd.dropsPerMin(125, 10), 20.83, 0.01);
  assert.equal(fd.dropsPerMin(125, 60), 125); // microdrop: drops/min = mL/h
  assert.deepEqual(fd.DROP_FACTORS, [10, 15, 20, 60]);
});

test('saved infusion presets are validated', () => {
  const ok = fd.cleanPreset({ name: '  My syringe  ', amount: 4, amountUnit: 'mg', volume: 50, doseUnit: 'mcg/kg/min', note: 'x' });
  assert.equal(ok.name, 'My syringe'); assert.equal(ok.amount, 4);
  assert.equal(fd.cleanPreset({ name: 'A', amount: 4, amountUnit: 'mg', volume: 50, doseUnit: 'units/h' }), null);
  assert.equal(fd.cleanPreset({ name: '', amount: 4, amountUnit: 'mg', volume: 50, doseUnit: 'mg/h' }), null);
  assert.equal(fd.cleanPreset({ name: 'A', amount: -1, amountUnit: 'mg', volume: 50, doseUnit: 'mg/h' }), null);
  assert.equal(fd.cleanPreset({ name: 'A', amount: 1, amountUnit: 'kg', volume: 50, doseUnit: 'mg/h' }), null);
  assert.equal(fd.cleanPreset(null), null);
  assert.equal(fd.cleanPreset({ name: 'x'.repeat(100), amount: 1, amountUnit: 'mg', volume: 5, doseUnit: 'mg/h' }).name.length, 60);
});

test('laboratory conversion factors', () => {
  const si = (id, v) => fd.toSi(id, v), cv = (id, v) => fd.toConv(id, v);
  near(si('glucose', 180.16), 10, 1e-3);
  near(si('glucose', 100), 5.55, 0.01);
  near(si('creatinine', 1), 88.4, 1e-9);
  near(si('urea', 28.01), 10, 0.001);
  near(si('urea-mass', 60.06), 10, 1e-3);
  near(si('cholesterol', 200), 5.17, 0.01);
  near(si('triglycerides', 150), 1.69, 0.01);
  near(si('calcium', 10), 2.495, 0.001);
  near(si('magnesium', 2.431), 1, 1e-3);
  near(si('phosphate', 3.097), 1, 1e-3);
  near(si('bilirubin', 1), 17.1, 1e-9);
  near(si('albumin', 4), 40, 1e-9);
  near(si('haemoglobin', 13.5), 135, 1e-9);
  near(si('urate', 6), 356.9, 0.1);
  near(si('lactate', 18.016), 2, 1e-3);
  near(si('vitamin-d', 20), 49.92, 0.01);
  near(cv('pressure', 5.33), 39.98, 0.01);
  near(si('pressure', 7.50062), 1, 1e-9);
  near(cv('temperature', 37), 98.6, 1e-9);
  near(cv('temperature', 0), 32, 1e-9);
  near(si('temperature', 212), 100, 1e-9);
  near(si('weight', 1), 0.45359237, 1e-12);
  near(si('weight', 154), 69.85, 0.01);
  near(si('height', 70), 177.8, 1e-9);
});

test('HbA1c: IFCC mmol/mol = (DCCT % − 2.15) × 10.929', () => {
  near(fd.toSi('hba1c', 6.5), 47.5, 0.05);
  near(fd.toSi('hba1c', 7), 53.0, 0.05);
  near(fd.toSi('hba1c', 5.0), 31.1, 0.05);
  near(fd.toConv('hba1c', 48), 6.54, 0.01);
  near(fd.toConv('hba1c', 42), 5.99, 0.01);
});

test('every lab conversion round-trips', () => {
  for (const u of fd.LAB_UNITS) {
    for (const v of [0.5, 7, 123.4]) near(fd.toSi(u.id, fd.toConv(u.id, v)), v, 1e-9, u.id);
    assert.ok(u.name && u.si && u.conv && u.note, u.id + ' documented');
  }
  assert.equal(fd.toSi('nope', 1), null);
});

test('feet/inches and stones/pounds helpers', () => {
  const fi = fd.feetInches(177.8);
  assert.equal(fi.ft, 5); near(fi.inch, 10, 1e-9);
  const sp = fd.stonesPounds(70);
  assert.equal(sp.st, 11); near(sp.lb, 0.32, 0.01);
});
