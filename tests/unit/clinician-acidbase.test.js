// Unit tests for clinician/lib/acidbase.js (package C2): blood-gas interpretation and electrolyte formulas.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ab = require(path.join(__dirname, '../../clinician/lib/acidbase.js'));

const near = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg || ''} expected ${expected} ± ${tol}, got ${actual}`);
const sameSet = (a, b) => assert.deepEqual([...a].sort(), [...b].sort());

test('kPa ↔ mmHg uses 7.50062', () => {
  near(ab.conv.kpaToMmHg(1), 7.50062, 1e-9);
  near(ab.conv.kpaToMmHg(5.33), 39.98, 0.01);
  near(ab.conv.mmHgToKpa(40), 5.333, 0.001);
  near(ab.conv.mmHgToKpa(ab.conv.kpaToMmHg(12.3)), 12.3, 1e-9);
});

test('other interpreter unit conversions', () => {
  near(ab.conv.glucoseMgdlToMmol(180.16), 10, 1e-3);
  near(ab.conv.bunMgdlToUreaMmol(28.01), 10, 1e-3);
  near(ab.conv.lactateMgdlToMmol(18.016), 2, 1e-3);
  near(ab.conv.albuminGdlToGl(3.5), 35, 1e-9);
  near(ab.conv.ethanolMgdlToMmol(46.07), 10, 1e-3);
});

test('step 1: Henderson equation consistency check', () => {
  near(ab.hFromPh(7.4), 39.81, 0.01);
  near(ab.hendersonH(40, 24), 40, 1e-9);
  const ok = ab.consistencyCheck(7.4, 40, 24);
  assert.equal(ok.consistent, true);
  near(ok.phCalculated, 7.398, 0.001);
  const bad = ab.consistencyCheck(7.4, 40, 15); // [H+] 64 vs 40 nmol/L
  assert.equal(bad.consistent, false);
  near(bad.diffPct, 60.8, 0.5);
  assert.equal(ab.consistencyCheck(7.4, 0, 24), null);
});

test('step 2: pH classification and primary disorder', () => {
  assert.equal(ab.classifyPh(7.34), 'acidaemia');
  assert.equal(ab.classifyPh(7.35), 'normal');
  assert.equal(ab.classifyPh(7.45), 'normal');
  assert.equal(ab.classifyPh(7.46), 'alkalaemia');
  assert.deepEqual(ab.primaryDisorders(7.2, 30, 11).ids, ['met-acid']);
  assert.deepEqual(ab.primaryDisorders(7.25, 60, 26).ids, ['resp-acid']);
  assert.deepEqual(ab.primaryDisorders(7.1, 50, 15).ids, ['resp-acid', 'met-acid']);
  assert.deepEqual(ab.primaryDisorders(7.52, 48, 38).ids, ['met-alk']);
  assert.deepEqual(ab.primaryDisorders(7.54, 26, 21.5).ids, ['resp-alk']);
  assert.deepEqual(ab.primaryDisorders(7.62, 30, 30).ids, ['resp-alk', 'met-alk']);
  // normal pH: side of 7.40 decides
  assert.deepEqual(ab.primaryDisorders(7.36, 60, 33).ids, ['resp-acid']);
  assert.deepEqual(ab.primaryDisorders(7.43, 50, 33).ids, ['met-alk']);
  assert.deepEqual(ab.primaryDisorders(7.36, 22, 12).ids, ['met-acid']);
  assert.deepEqual(ab.primaryDisorders(7.44, 28, 18.5).ids, ['resp-alk']);
  assert.deepEqual(ab.primaryDisorders(7.4, 40, 24).ids, []);
});

test("step 3: Winter's formula (Albert, Dell & Winters 1967)", () => {
  const e = ab.expectedPaco2MetAcid(12);
  assert.deepEqual([e.point, e.lo, e.hi], [26, 24, 28]);
  const e2 = ab.expectedPaco2MetAcid(6);
  assert.deepEqual([e2.point, e2.lo, e2.hi], [17, 15, 19]);
  assert.equal(ab.assessCompensation('met-acid', 26, 12).verdict, 'appropriate');
  assert.equal(ab.assessCompensation('met-acid', 24, 12).verdict, 'appropriate'); // boundary inclusive
  assert.equal(ab.assessCompensation('met-acid', 30, 12).verdict, 'resp-acid');
  assert.equal(ab.assessCompensation('met-acid', 20, 12).verdict, 'resp-alk');
});

test('step 3: metabolic alkalosis rule PaCO2 = 0.7 × HCO3 + 20 ± 5', () => {
  const e = ab.expectedPaco2MetAlk(38);
  near(e.point, 46.6, 1e-9); near(e.lo, 41.6, 1e-9); near(e.hi, 51.6, 1e-9);
  assert.equal(ab.assessCompensation('met-alk', 48, 38).verdict, 'appropriate');
  assert.equal(ab.assessCompensation('met-alk', 55, 38).verdict, 'resp-acid');
  assert.equal(ab.assessCompensation('met-alk', 38, 38).verdict, 'resp-alk');
});

test('step 3: acute and chronic respiratory acidosis rules (+1 and +4 per 10 mmHg)', () => {
  const e = ab.expectedHco3RespAcid(60);
  assert.equal(e.acute.point, 26); assert.equal(e.chronic.point, 32);
  const e80 = ab.expectedHco3RespAcid(80);
  assert.equal(e80.acute.point, 28); assert.equal(e80.chronic.point, 40);
  const c = (paco2, hco3) => ab.assessCompensation('resp-acid', paco2, hco3);
  assert.equal(c(60, 26).chronicity, 'acute');
  assert.equal(c(60, 32).chronicity, 'chronic');
  assert.equal(c(75, 34).chronicity, 'acute-on-chronic');
  assert.equal(c(60, 21).verdict, 'met-acid');
  assert.equal(c(60, 37).verdict, 'met-alk');
  assert.equal(c(46, 25).chronicity, 'either'); // bands overlap near 40 mmHg
});

test('step 3: acute and chronic respiratory alkalosis rules (−2 and −5 per 10 mmHg)', () => {
  const e = ab.expectedHco3RespAlk(30);
  assert.equal(e.acute.point, 22); assert.equal(e.chronic.point, 19);
  const e20 = ab.expectedHco3RespAlk(20);
  assert.equal(e20.acute.point, 20); assert.equal(e20.chronic.point, 14);
  const c = (paco2, hco3) => ab.assessCompensation('resp-alk', paco2, hco3);
  assert.equal(c(20, 20).chronicity, 'acute');
  assert.equal(c(20, 14).chronicity, 'chronic');
  assert.equal(c(20, 17).chronicity, 'acute-on-chronic');
  assert.equal(c(20, 25).verdict, 'met-alk');
  assert.equal(c(20, 10).verdict, 'met-acid');
});

test('step 4: anion gap and albumin correction (Figge 1998)', () => {
  assert.equal(ab.anionGap(140, 104, 24), 12);
  assert.equal(ab.correctedAnionGap(10, 20), 15);
  assert.equal(ab.correctedAnionGap(10, 40), 10);
  assert.equal(ab.correctedAnionGap(12, 44), 11);
});

test('step 5: delta ratio and its bands', () => {
  const d = ab.deltaRatio(24, 12); near(d.ratio, 1, 1e-9); assert.equal(d.band, 'pure');
  assert.equal(ab.deltaRatio(15, 10).band, 'nagma');   // 0.21
  assert.equal(ab.deltaRatio(20, 12).band, 'mixed');   // 0.67
  assert.equal(ab.deltaRatio(31.2, 12).band, 'pure');  // 1.6 (lactic acidosis)
  assert.equal(ab.deltaRatio(30, 20).band, 'alk');     // 4.5
  assert.equal(ab.deltaRatio(30, 24), null);           // HCO3 not reduced
});

test('step 6: osmolar gap, including ethanol (Purssell 2001)', () => {
  assert.equal(ab.calculatedOsmolality(140, 5, 5), 290);
  assert.equal(ab.calculatedOsmolality(140, 5, 5, 20), 315);
  // 100 mg/dL ethanol contributes about 100/3.7 = 27 mOsm/kg
  near(1.25 * ab.conv.ethanolMgdlToMmol(100), 100 / 3.7, 0.2);
  assert.equal(ab.calculatedOsmolality(140, null, 5), null);
});

test('step 7: alveolar gas equation and A–a gradient at sea level', () => {
  near(ab.alveolarO2(0.21, 760, 40), 99.73, 0.01);
  const ox = ab.oxygenation({ pao2: 90, fio2: 0.21, paco2: 40, age: 40 });
  near(ox.aa, 9.73, 0.01);
  assert.equal(ox.expectedAa, 12.5);
  assert.equal(ox.aaRaised, false);
  assert.equal(ab.oxygenation({ pao2: 60, fio2: 0.21, paco2: 40, age: 40 }).aaRaised, true);
  assert.equal(ab.expectedAaGradient(80), 22.5);
  assert.equal(ab.oxygenation({ pao2: 200, fio2: 0.5, paco2: 40, age: 40 }).aaRaised, null); // not on room air
});

test('step 7: barometric pressure and A–a gradient at altitude', () => {
  near(ab.baroFromAltitude(0), 760, 1e-9);
  near(ab.baroFromAltitude(1600), 626.5, 1);
  near(ab.baroFromAltitude(3000), 525.8, 1);
  near(ab.baroFromAltitude(5500), 379.6, 2); // about half an atmosphere
  const pb = ab.baroFromAltitude(1600);
  near(ab.alveolarO2(0.21, pb, 40), 71.7, 0.3);
  const ox = ab.oxygenation({ pao2: 65, fio2: 0.21, paco2: 40, pb: pb, age: 30 });
  near(ox.aa, 6.7, 0.3);
  assert.equal(ox.aaRaised, false);
  assert.equal(ox.highAltitude, true); // 1600 m is above the 1000 m Berlin altitude threshold
  assert.equal(ab.oxygenation({ pao2: 90, fio2: 0.21, paco2: 40, pb: ab.baroFromAltitude(500) }).highAltitude, false);
  assert.equal(ab.oxygenation({ pao2: 60, fio2: 0.21, paco2: 28, pb: ab.baroFromAltitude(3000), age: 25 }).highAltitude, true);
});

test('step 7: PaO2/FiO2 and Berlin categories (JAMA 2012)', () => {
  assert.equal(ab.berlinCategory(350), 'none');
  assert.equal(ab.berlinCategory(301), 'none');
  assert.equal(ab.berlinCategory(300), 'mild');
  assert.equal(ab.berlinCategory(201), 'mild');
  assert.equal(ab.berlinCategory(200), 'moderate');
  assert.equal(ab.berlinCategory(101), 'moderate');
  assert.equal(ab.berlinCategory(100), 'severe');
  assert.equal(ab.berlinCategory(60), 'severe');
  near(ab.oxygenation({ pao2: 75, fio2: 0.6, paco2: 48 }).pf, 125, 1e-9);
  assert.equal(ab.oxygenation({ pao2: 75, fio2: 0.6, paco2: 48 }).berlin, 'moderate');
});

test('interpret(): FiO2 given as a percentage is accepted', () => {
  const r = ab.interpret({ ph: 7.4, paco2: 40, hco3: 24, pao2: 90, fio2: 21, age: 40 });
  near(r.steps.oxygenation.aa, 9.73, 0.01);
});

test('interpret(): incomplete input reports what is missing', () => {
  const r = ab.interpret({ ph: 7.3 });
  assert.equal(r.complete, false);
  assert.deepEqual(r.missing, ['PaCO₂', 'HCO₃⁻']);
});

test('interpret(): mixed-disorder patterns from standard texts', () => {
  // Combined respiratory and metabolic acidosis (Berend et al. NEJM 2014 pattern)
  sameSet(ab.interpret({ ph: 7.1, paco2: 50, hco3: 15, na: 140, cl: 113 }).ids, ['resp-acid', 'nagma']);
  // "Normal" blood gas hiding HAGMA + metabolic alkalosis (raised AG, Gabow 1980)
  sameSet(ab.interpret({ ph: 7.4, paco2: 40, hco3: 24, na: 140, cl: 95, albumin: 40 }).ids, ['hagma', 'met-alk']);
  // Salicylate: respiratory alkalosis + HAGMA with near-normal pH
  sameSet(ab.interpret({ ph: 7.36, paco2: 22, hco3: 12, na: 140, cl: 104, albumin: 40 }).ids, ['hagma', 'resp-alk']);
  // Chronic respiratory acidosis + metabolic alkalosis (COPD on diuretics)
  sameSet(ab.interpret({ ph: 7.4, paco2: 60, hco3: 36, na: 140, cl: 92, albumin: 40 }).ids, ['resp-acid', 'met-alk']);
  // Metabolic acidosis with respiratory acidosis (inadequate compensation)
  sameSet(ab.interpret({ ph: 7.22, paco2: 30, hco3: 12, na: 138, cl: 100, albumin: 25 }).ids, ['hagma', 'resp-acid']);
  // HAGMA + NAGMA (delta ratio < 0.8)
  sameSet(ab.interpret({ ph: 7.2, paco2: 22, hco3: 8, na: 140, cl: 115, albumin: 40 }).ids, ['hagma', 'nagma']);
  // Metabolic alkalosis + respiratory alkalosis
  sameSet(ab.interpret({ ph: 7.62, paco2: 30, hco3: 30, na: 135, cl: 95, albumin: 35 }).ids, ['resp-alk', 'met-alk']);
});

test('interpret(): single disorders and headline wording', () => {
  const r = ab.interpret({ ph: 7.17, paco2: 17, hco3: 6, na: 132, cl: 96, albumin: 40 });
  assert.deepEqual(r.ids, ['hagma']);
  assert.match(r.headline, /High anion gap metabolic acidosis with appropriate respiratory compensation/);
  const n = ab.interpret({ ph: 7.4, paco2: 40, hco3: 24, na: 140, cl: 104, albumin: 40 });
  assert.deepEqual(n.ids, []);
  assert.equal(n.headline, 'No acid–base disorder detected');
  const unclassified = ab.interpret({ ph: 7.26, paco2: 23, hco3: 10 });
  assert.deepEqual(unclassified.ids, ['met-acid']);
  assert.ok(unclassified.differentials.some(d => d.id === 'nagma') && unclassified.differentials.some(d => d.id === 'hagma'));
  const inc = ab.interpret({ ph: 7.4, paco2: 40, hco3: 15 });
  assert.ok(inc.flags.includes('inconsistent'));
  assert.match(inc.headline, /^Check values/);
});

test('interpret(): hypoalbuminaemia unmasks a HAGMA and hints are produced', () => {
  const r = ab.interpret({ ph: 7.33, paco2: 33, hco3: 17, na: 136, cl: 107, albumin: 15, lactate: 5.2, glucose: 14, urea: 6, osm: 320 });
  assert.deepEqual(r.ids, ['hagma']);
  assert.ok(r.hints.some(h => /masking/.test(h)));
  assert.ok(r.hints.some(h => /ketones/.test(h)));
  assert.ok(r.steps.osmolar.high);
  assert.ok(r.hints.some(h => /methanol or ethylene glycol/.test(h)));
});

test('interpret(): text uses the chosen gas unit and the summary is complete', () => {
  const k = ab.interpret({ ph: 7.22, paco2: 30, hco3: 12, pao2: 70, fio2: 0.4, age: 67 }, { gasUnit: 'kPa' });
  assert.match(k.steps.compensation.lines[0], /3\.20–3\.73 kPa \(24–28 mmHg\)/);
  assert.match(k.summary, /PaCO₂ 4\.0 kPa \(30 mmHg\)/);
  const m = ab.interpret({ ph: 7.22, paco2: 30, hco3: 12 }, { gasUnit: 'mmHg' });
  assert.match(m.steps.compensation.lines[0], /24–28 mmHg \(3\.20–3\.73 kPa\)/);
  assert.match(m.summary, /Interpretation:/);
});

test('practice library: at least 12 internally consistent cases that the interpreter answers correctly', () => {
  assert.ok(ab.CASES.length >= 12);
  const ids = new Set();
  for (const c of ab.CASES) {
    assert.ok(!ids.has(c.id), 'unique id ' + c.id); ids.add(c.id);
    assert.ok(c.title && c.vignette && c.explanation, c.id + ' has text');
    assert.ok(Array.isArray(c.options) && c.options.length >= 3 && c.answer >= 0 && c.answer < c.options.length, c.id + ' has a valid answer');
    const r = ab.interpret(ab.caseInput(c.values));
    assert.ok(r.complete, c.id);
    if (c.expect) {
      sameSet(r.ids, c.expect);
      assert.ok(Math.abs(r.steps.consistency.diffPct) < 2, c.id + ' internally consistent');
    }
    (c.expectFlags || []).forEach(f => assert.ok(r.flags.includes(f), c.id + ' flag ' + f));
  }
});

test('electrolytes: sodium corrected for hyperglycaemia (Katz 1.6, Hillier 2.4)', () => {
  const g600 = 600 / 18.016; // mmol/L
  near(ab.correctedSodium(130, g600, 1.6), 138, 1e-6);
  near(ab.correctedSodium(130, g600, 2.4), 142, 1e-6);
  assert.equal(ab.correctedSodium(130, 5, 1.6), 130); // below 100 mg/dL: no correction
});

test('electrolytes: adjusted calcium (Payne 1973: Ca − albumin + 4.0 in mg/dL and g/dL)', () => {
  // 8.0 mg/dL with albumin 3.0 g/dL -> 9.0 mg/dL
  near(ab.adjustedCalcium(8.0 / 4.008, 30) * 4.008, 9.0, 1e-9);
  near(ab.adjustedCalcium(2.0, 30), 2.2495, 1e-4); // ≈ +0.025 mmol/L per g/L
  near(ab.adjustedCalcium(2.4, 40), 2.4, 1e-9);
  near(ab.adjustedCalcium(2.6, 50), 2.35, 1e-3);
});

test('electrolytes: total body water fractions (Adrogué & Madias 2000)', () => {
  assert.equal(ab.tbwFraction(10, 'male'), 0.6);
  assert.equal(ab.tbwFraction(40, 'male'), 0.6);
  assert.equal(ab.tbwFraction(40, 'female'), 0.5);
  assert.equal(ab.tbwFraction(70, 'male'), 0.5);
  assert.equal(ab.tbwFraction(70, 'female'), 0.45);
});

test('electrolytes: Adrogué–Madias change per litre — worked examples', () => {
  // 60 kg woman aged 40, Na 110, 3% NaCl: TBW 30 L -> (513 − 110) / 31 = 13.0 mmol/L per litre
  near(ab.adrogueMadias(110, 513, 0, 30), 13.0, 0.01);
  // 70 kg man aged 40, Na 120, 0.9% NaCl: TBW 42 -> (154 − 120) / 43 = 0.79
  near(ab.adrogueMadias(120, 154, 0, 42), 0.791, 0.001);
  // with potassium in the infusate (Na 154 + K 40)
  near(ab.adrogueMadias(120, 154, 40, 42), 1.72, 0.01);
  // 5% glucose in hypernatraemia, 68 kg elderly man (TBW 34): (0 − 168) / 35 = −4.8
  near(ab.adrogueMadias(168, 0, 0, 34), -4.8, 1e-9);
});

test('electrolytes: hyponatraemia plan enforces 10 (or 8 if high ODS risk) mmol/L per 24 h', () => {
  const p = ab.hyponatraemiaPlan({ na: 120, weight: 70, age: 40, sex: 'male', infusateNa: 513, infusateK: 0, target: 6, hours: 24 });
  near(p.perLitre, 9.14, 0.01);
  near(p.volumeL, 0.656, 0.001);
  near(p.rateMlH, 27.35, 0.05);
  assert.equal(p.limit, 10); assert.equal(p.exceeds, false); assert.equal(p.projectedNa, 126);
  const over = ab.hyponatraemiaPlan({ na: 120, weight: 70, age: 40, sex: 'male', infusateNa: 513, target: 12, hours: 24 });
  assert.equal(over.exceeds, true); assert.equal(over.target, 10);
  const risk = ab.hyponatraemiaPlan({ na: 120, weight: 70, age: 40, sex: 'male', infusateNa: 513, target: 9, hours: 24, highRisk: true });
  assert.equal(risk.limit, 8); assert.equal(risk.exceeds, true); assert.equal(risk.target, 8);
  const auto = ab.hyponatraemiaPlan({ na: 104, weight: 70, age: 40, sex: 'male', infusateNa: 513, target: 6, hours: 24 });
  assert.equal(auto.highRisk, true); // Na ≤ 105 is itself a high-risk feature
  const noRise = ab.hyponatraemiaPlan({ na: 125, weight: 70, age: 40, sex: 'male', infusateNa: 77, target: 4, hours: 24 });
  assert.equal(noRise.error, 'not-raising');
  assert.equal(ab.hyponatraemiaPlan({ na: 120, weight: 70, age: 40, sex: 'male', infusateNa: 513, target: 4, hours: 48 }), null);
});

test('electrolytes: free-water deficit and hypernatraemia plan', () => {
  near(ab.freeWaterDeficit(160, 70, 0.6), 6.0, 1e-9);
  near(ab.freeWaterDeficit(150, 60, 0.45), 1.93, 0.01);
  const p = ab.hypernatraemiaPlan({ na: 160, weight: 70, age: 40, sex: 'male', infusateNa: 0, fall: 10, hours: 24 });
  near(p.perLitre, -3.72, 0.01);
  near(p.volumeL, 2.69, 0.01);
  near(p.rateMlH, 112, 0.5);
  const over = ab.hypernatraemiaPlan({ na: 160, weight: 70, age: 40, sex: 'male', infusateNa: 0, fall: 14, hours: 24 });
  assert.equal(over.exceeds, true); assert.equal(over.fall, 10);
  assert.equal(ab.hypernatraemiaPlan({ na: 150, weight: 70, age: 40, sex: 'male', infusateNa: 154, fall: 5, hours: 24 }).error, 'not-lowering');
});
