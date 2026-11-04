// C1a — renal calculators: CKD-EPI 2021 (creatinine; creatinine–cystatin C), Cockcroft–Gault,
// KDIGO G/A staging with the heat map, and urine ACR/PCR unit conversion.
const test = require('node:test');
const assert = require('node:assert/strict');

const defs = require('../../clinician/lib/calcs-cardio-renal.js');
const byId = (id) => { const d = defs.find((x) => x.id === id); assert.ok(d, 'missing ' + id); return d; };
const run = (id, v) => byId(id).compute(v);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} not within ${tol} of ${b}`);
/** Convert a value typed in a given unit to the calculator's base unit, exactly as MT.calc does. */
function toBase(id, inputId, unitId, x) {
  const inp = byId(id).inputs.find((i) => i.id === inputId);
  const u = inp.units.find((y) => y.id === unitId);
  return u.toBase ? u.toBase(x) : x * u.factor;
}
const detail = (r, label) => { const d = r.details.find((x) => typeof x !== 'string' && x.label.startsWith(label)); assert.ok(d, 'detail ' + label); return d.value; };

// Independent re-implementations (coefficients from Inker 2021, typed separately from the library)
function egfrCr(scr, age, female) {
  const k = female ? 0.7 : 0.9, a = female ? -0.241 : -0.302;
  return 142 * Math.min(scr / k, 1) ** a * Math.max(scr / k, 1) ** -1.2 * 0.9938 ** age * (female ? 1.012 : 1);
}
function egfrCrCys(scr, scys, age, female) {
  const k = female ? 0.7 : 0.9, a = female ? -0.219 : -0.144;
  return 135 * Math.min(scr / k, 1) ** a * Math.max(scr / k, 1) ** -0.544 * Math.min(scys / 0.8, 1) ** -0.323 * Math.max(scys / 0.8, 1) ** -0.778 * 0.9961 ** age * (female ? 0.963 : 1);
}

/* ---------------------------------------------------------------------------
   Unit conversions
   --------------------------------------------------------------------------- */
test('creatinine units: 88.42 µmol/L = 1 mg/dL (both directions)', () => {
  near(toBase('ckd-epi-2021', 'creat', 'umol', 88.42), 1, 1e-12);
  near(toBase('ckd-epi-2021', 'creat', 'umol', 176.84), 2, 1e-12);
  near(toBase('cockcroft-gault', 'creat', 'umol', 61.894), 0.7, 1e-12);
  const u = byId('ckd-epi-2021').inputs.find((i) => i.id === 'creat').units.find((x) => x.id === 'umol');
  near(1.13 / u.factor, 99.9146, 1e-9);   // mg/dL -> µmol/L
  // SI user default: the SI unit is marked 'si' and mg/dL 'conv'
  assert.equal(u.system, 'si');
});

test('urine ratio units: 1 mg/mmol = 8.84 mg/g; 1 mg/mg = 113.12 mg/mmol', () => {
  near(toBase('kdigo-ckd', 'acr', 'mgg', 30), 30 / 8.84, 1e-12);
  near(toBase('urine-acr-pcr', 'ratio', 'mgg', 300), 33.9367, 1e-4);
  near(toBase('urine-acr-pcr', 'ratio', 'mgmg', 1), 113.122, 1e-3);
  near(toBase('urine-acr-pcr', 'ratio', 'mgmg', 0.03), 3.3937, 1e-4);
});

/* ---------------------------------------------------------------------------
   CKD-EPI 2021 creatinine
   --------------------------------------------------------------------------- */
test('CKD-EPI 2021: 50-year-old woman, creatinine 1.0 mg/dL ≈ 68–69 mL/min/1.73 m²', () => {
  // 142 × (1/0.7)^−1.2 × 0.9938^50 × 1.012 = 68.6
  near(egfrCr(1.0, 50, true), 68.64, 0.01);
  const r = run('ckd-epi-2021', { age: 50, sex: 'female', creat: 1.0 });
  assert.equal(r.value, '69');
  assert.equal(r.title, 'G2 — Mildly decreased');
  assert.equal(r.band, 'ok');
  assert.equal(detail(r, 'Creatinine'), '1 mg/dL = 88 µmol/L');
});

test('CKD-EPI 2021: man and SI-unit worked examples', () => {
  // 50-year-old man, 1.0 mg/dL: 142 × (1/0.9)^−1.2 × 0.9938^50 = 91.7
  near(egfrCr(1.0, 50, false), 91.69, 0.01);
  assert.equal(run('ckd-epi-2021', { age: 50, sex: 'male', creat: 1.0 }).value, '92');
  // 70-year-old man, creatinine 150 µmol/L (1.696 mg/dL): 142 × 1.885^−1.2 × 0.9938^70 = 42.9 -> G3b
  const scr = toBase('ckd-epi-2021', 'creat', 'umol', 150);
  near(egfrCr(scr, 70, false), 42.94, 0.02);
  const r = run('ckd-epi-2021', { age: 70, sex: 'male', creat: scr });
  assert.equal(r.value, '43');
  assert.equal(r.title.slice(0, 3), 'G3b');
  assert.equal(r.band, 'warn');
  // 80-year-old woman, 120 µmol/L
  const scr2 = toBase('ckd-epi-2021', 'creat', 'umol', 120);
  assert.equal(run('ckd-epi-2021', { age: 80, sex: 'female', creat: scr2 }).value, String(Math.round(egfrCr(scr2, 80, true))));
});

test('CKD-EPI 2021: continuous at the knot (Scr = κ) and monotonic in creatinine and age', () => {
  near(egfrCr(0.7, 40, true), 142 * 0.9938 ** 40 * 1.012, 1e-9);
  near(Number(run('ckd-epi-2021', { age: 40, sex: 'female', creat: 0.7 }).value), 142 * 0.9938 ** 40 * 1.012, 0.5);
  let prev = Infinity;
  for (let c = 0.3; c <= 10; c += 0.05) {
    const e = Number(run('ckd-epi-2021', { age: 60, sex: 'male', creat: c }).value);
    assert.ok(e <= prev, 'non-increasing with creatinine'); prev = e;
  }
  assert.ok(Number(run('ckd-epi-2021', { age: 30, sex: 'male', creat: 1.2 }).value) > Number(run('ckd-epi-2021', { age: 80, sex: 'male', creat: 1.2 }).value));
});

test('CKD-EPI 2021: KDIGO category follows the reported (rounded) eGFR at every threshold', () => {
  const cases = [[90, 'G1'], [89, 'G2'], [60, 'G2'], [59, 'G3a'], [45, 'G3a'], [44, 'G3b'], [30, 'G3b'], [29, 'G4'], [15, 'G4'], [14, 'G5']];
  for (const [target, cat] of cases) {
    // find creatinine giving eGFR just above target − 0.5 (rounds to target) for a 60-year-old man
    let lo = 0.2, hi = 20;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (egfrCr(mid, 60, false) > target - 0.4) lo = mid; else hi = mid; }
    const r = run('ckd-epi-2021', { age: 60, sex: 'male', creat: lo });
    assert.equal(r.value, String(target), 'eGFR ' + target);
    assert.equal(r.title.split(' ')[0], cat, 'category at ' + target);
    assert.equal(r.band, ['G1', 'G2'].includes(cat) ? 'ok' : ['G3a', 'G3b'].includes(cat) ? 'warn' : 'danger');
  }
});

/* ---------------------------------------------------------------------------
   CKD-EPI 2021 creatinine–cystatin C
   --------------------------------------------------------------------------- */
test('CKD-EPI 2021 Cr–Cys: worked examples', () => {
  // 60-year-old man, Scr 1.0 mg/dL, cystatin C 1.0 mg/L:
  // 135 × (1/0.9)^−0.544 × (1.25)^−0.778 × 0.9961^60 = 84.8
  near(egfrCrCys(1.0, 1.0, 60, false), 84.77, 0.02);
  let r = run('ckd-epi-2021-cys', { age: 60, sex: 'male', creat: 1.0, cys: 1.0 });
  assert.equal(r.value, '85'); assert.equal(r.title, 'G2 — Mildly decreased');
  // creatinine-only for the same man: 142 × (1/0.9)^−1.2 × 0.9938^60 = 86.2
  near(egfrCr(1.0, 60, false), 86.16, 0.01);
  assert.equal(detail(r, 'eGFR from creatinine alone'), '86 mL/min/1.73 m²');
  // 50-year-old woman at both knots (Scr 0.7, Scys 0.8): 135 × 0.9961^50 × 0.963 = 106.9
  near(egfrCrCys(0.7, 0.8, 50, true), 135 * 0.9961 ** 50 * 0.963, 1e-9);
  r = run('ckd-epi-2021-cys', { age: 50, sex: 'female', creat: 0.7, cys: 0.8 });
  assert.equal(r.value, '107');
  // Woman 75, creatinine 1.4 mg/dL, cystatin 1.9 mg/L -> G3b
  r = run('ckd-epi-2021-cys', { age: 75, sex: 'female', creat: 1.4, cys: 1.9 });
  assert.equal(r.value, String(Math.round(egfrCrCys(1.4, 1.9, 75, true))));
  assert.match(r.title, /^G3b|^G4/);
});

test('CKD-EPI 2021 Cr–Cys: warns when creatinine and combined estimates differ by >30%', () => {
  // Low muscle mass pattern: creatinine 0.6 mg/dL but cystatin C 2.0 mg/L
  const r = run('ckd-epi-2021-cys', { age: 70, sex: 'female', creat: 0.6, cys: 2.0 });
  assert.ok(r.warnings.some((w) => /differ by more than 30%/.test(w)));
  assert.equal(run('ckd-epi-2021-cys', { age: 60, sex: 'male', creat: 1.0, cys: 1.0 }).warnings.length, 0);
});

/* ---------------------------------------------------------------------------
   Cockcroft–Gault
   --------------------------------------------------------------------------- */
test('Cockcroft–Gault: textbook examples with actual body weight', () => {
  // (140 − 60) × 72 / (72 × 1.0) = 80 mL/min; × 0.85 for women = 68
  let r = run('cockcroft-gault', { age: 60, sex: 'male', weight: 72, height: 175, creat: 1.0, basis: 'actual' });
  assert.equal(r.value, '80'); assert.match(r.title, /actual body weight \(72.0 kg\)/);
  r = run('cockcroft-gault', { age: 60, sex: 'female', weight: 72, height: 175, creat: 1.0, basis: 'actual' });
  assert.equal(r.value, '68');
  // Same patient with creatinine entered as 88.42 µmol/L
  const scr = toBase('cockcroft-gault', 'creat', 'umol', 88.42);
  assert.equal(run('cockcroft-gault', { age: 60, sex: 'male', weight: 72, height: 175, creat: scr, basis: 'actual' }).value, '80');
  // 85-year-old woman, 50 kg, 1.3 mg/dL: (55 × 50)/(72 × 1.3) × 0.85 = 24.97
  r = run('cockcroft-gault', { age: 85, sex: 'female', weight: 50, height: 160, creat: 1.3, basis: 'actual' });
  assert.equal(r.value, '25'); assert.equal(r.band, 'danger');
});

test('Cockcroft–Gault: ideal (Devine) and adjusted weights, automatic choice per Winter 2012', () => {
  // Man 175 cm: IBW = 50 + 2.3 × (68.898 − 60) = 70.46 kg
  let r = run('cockcroft-gault', { age: 60, sex: 'male', weight: 72, height: 175, creat: 1.0, basis: 'auto' });
  assert.match(r.title, /ideal body weight \(70.5 kg\)/);              // BMI 23.5 -> IBW
  assert.equal(r.value, String(Math.round(80 * 70.4646 / 72)));
  // BMI 32.7 -> adjusted = 70.46 + 0.4 × (100 − 70.46) = 82.28 kg
  r = run('cockcroft-gault', { age: 60, sex: 'male', weight: 100, height: 175, creat: 1.0, basis: 'auto' });
  assert.match(r.title, /adjusted body weight \(82.3 kg\)/);
  assert.equal(r.value, '91');
  // BMI 17 (underweight) -> actual
  r = run('cockcroft-gault', { age: 60, sex: 'female', weight: 45, height: 163, creat: 0.8, basis: 'auto' });
  assert.match(r.title, /actual/); assert.match(r.interpretation, /underweight/);
  // Normal BMI but below Devine IBW -> actual
  r = run('cockcroft-gault', { age: 40, sex: 'male', weight: 62, height: 180, creat: 0.9, basis: 'auto' });
  assert.match(r.title, /actual/);
  // Forcing IBW when actual < IBW warns about overestimation
  r = run('cockcroft-gault', { age: 40, sex: 'male', weight: 62, height: 180, creat: 0.9, basis: 'ideal' });
  assert.ok(r.warnings.some((w) => /overestimates/.test(w)));
  // All three are listed
  assert.equal(r.details.filter((d) => /^CrCl with/.test(d.label)).length, 3);
  // Short stature warning (<152.4 cm)
  assert.ok(run('cockcroft-gault', { age: 70, sex: 'female', weight: 50, height: 148, creat: 1, basis: 'actual' }).warnings.some((w) => /152 cm/.test(w)));
});

test('Cockcroft–Gault: band thresholds at 60 and 30 mL/min', () => {
  // 80-year-old man, 72 kg, actual weight: CrCl = 60 / Scr
  const cl = (scr) => run('cockcroft-gault', { age: 80, sex: 'male', weight: 72, height: 170, creat: scr, basis: 'actual' });
  assert.equal(cl(1.0).value, '60'); assert.equal(cl(1.0).band, 'ok');
  assert.equal(cl(60 / 59).value, '59'); assert.equal(cl(60 / 59).band, 'warn');
  assert.equal(cl(2.0).value, '30'); assert.equal(cl(2.0).band, 'warn');
  assert.equal(cl(60 / 29).value, '29'); assert.equal(cl(60 / 29).band, 'danger');
});

/* ---------------------------------------------------------------------------
   KDIGO staging and heat map
   --------------------------------------------------------------------------- */
// KDIGO 2012/2024 prognosis heat map, typed independently: rows G1..G5, columns A1..A3
const HEAT = {
  G1: ['low', 'mod', 'high'], G2: ['low', 'mod', 'high'], G3a: ['mod', 'high', 'vhigh'],
  G3b: ['high', 'vhigh', 'vhigh'], G4: ['vhigh', 'vhigh', 'vhigh'], G5: ['vhigh', 'vhigh', 'vhigh']
};
const TITLE = { low: /^Low risk/, mod: /^Moderately increased risk/, high: /^High risk/, vhigh: /^Very high risk/ };
const BAND = { low: 'ok', mod: 'warn', high: 'danger', vhigh: 'danger' };

test('KDIGO: every cell of the heat map', () => {
  const egfrFor = { G1: 95, G2: 75, G3a: 50, G3b: 35, G4: 20, G5: 10 };
  const acrFor = [1, 10, 50]; // mg/mmol -> A1, A2, A3
  for (const g of Object.keys(HEAT)) {
    for (let a = 0; a < 3; a++) {
      const r = run('kdigo-ckd', { egfr: egfrFor[g], acr: acrFor[a], chronic: true });
      assert.equal(r.value, g + ' A' + (a + 1));
      assert.match(r.title, TITLE[HEAT[g][a]], g + 'A' + (a + 1));
      assert.equal(r.band, BAND[HEAT[g][a]]);
    }
  }
});

test('KDIGO: GFR and albuminuria thresholds (mg/mmol and mg/g)', () => {
  const k = (egfr, acr) => run('kdigo-ckd', { egfr, acr, chronic: true });
  [[90, 'G1'], [89, 'G2'], [60, 'G2'], [59, 'G3a'], [45, 'G3a'], [44, 'G3b'], [30, 'G3b'], [29, 'G4'], [15, 'G4'], [14, 'G5']]
    .forEach(([e, g]) => assert.equal(k(e, 1).value.split(' ')[0], g, 'eGFR ' + e));
  assert.equal(k(80, 2.9).value, 'G2 A1');
  assert.equal(k(80, 3).value, 'G2 A2');
  assert.equal(k(80, 30).value, 'G2 A2');
  assert.equal(k(80, 30.1).value, 'G2 A3');
  // mg/g: 29 mg/g (3.28 mg/mmol) sits between the rounded cut-offs -> A2 with a warning
  let r = k(80, toBase('kdigo-ckd', 'acr', 'mgg', 29));
  assert.equal(r.value, 'G2 A2'); assert.ok(r.warnings.some((w) => /rounded KDIGO cut-offs/.test(w)));
  r = k(80, toBase('kdigo-ckd', 'acr', 'mgg', 30));
  assert.equal(r.value, 'G2 A2'); assert.ok(!r.warnings.some((w) => /rounded/.test(w)));
  r = k(80, toBase('kdigo-ckd', 'acr', 'mgg', 300));
  assert.equal(r.value, 'G2 A3'); assert.ok(r.warnings.some((w) => /rounded/.test(w)));  // 33.9 mg/mmol > 30
  r = k(80, toBase('kdigo-ckd', 'acr', 'mgg', 25));
  assert.equal(r.value, 'G2 A1');
  assert.equal(detail(k(80, 10), 'ACR'), '10 mg/mmol = 88 mg/g');
});

test('KDIGO: G-only result, no-CKD wording, chronicity and referral prompts', () => {
  let r = run('kdigo-ckd', { egfr: 50, chronic: true });
  assert.equal(r.value, 'G3a'); assert.equal(r.band, 'warn'); assert.match(r.interpretation, /Add a urine ACR/);
  r = run('kdigo-ckd', { egfr: 95, acr: 1, chronic: false });
  assert.match(r.title, /no CKD without other markers/); assert.equal(r.band, 'ok');
  assert.ok(r.warnings.some((w) => /more than 3 months/.test(w)));
  assert.match(run('kdigo-ckd', { egfr: 25, acr: 1, chronic: true }).interpretation, /Referral criterion met: eGFR <30/);
  assert.match(run('kdigo-ckd', { egfr: 70, acr: 30, chronic: true }).interpretation, /ACR ≥30 mg\/mmol/);
  assert.doesNotMatch(run('kdigo-ckd', { egfr: 70, acr: 29.9, chronic: true }).interpretation, /Referral/);
  assert.equal(typeof byId('kdigo-ckd').render, 'function'); // heat-map UI wrapper
});

/* ---------------------------------------------------------------------------
   Urine ACR / PCR converter
   --------------------------------------------------------------------------- */
test('Urine ACR/PCR: conversions shown in all units', () => {
  let r = run('urine-acr-pcr', { test: 'acr', ratio: 3 });
  assert.equal(detail(r, 'mg/g'), '26.5');
  assert.equal(detail(r, 'mg/mmol'), '3');
  assert.equal(detail(r, 'mg/mg'), '0.027');
  assert.equal(r.title, 'A2 — moderately increased albuminuria');
  r = run('urine-acr-pcr', { test: 'acr', ratio: toBase('urine-acr-pcr', 'ratio', 'mgg', 30) });
  assert.equal(r.value, '3.4'); assert.equal(detail(r, 'mg/g'), '30');
  r = run('urine-acr-pcr', { test: 'pcr', ratio: toBase('urine-acr-pcr', 'ratio', 'mgmg', 0.5) });
  assert.equal(detail(r, 'mg/g'), '500'); assert.equal(r.value, '56.6');
  assert.match(detail(r, 'Approximate protein excretion'), /500 mg\/day/);
});

test('Urine ACR/PCR: KDIGO categories (ACR 3/30 mg/mmol; PCR 15/50 mg/mmol) with grey zones', () => {
  const c = (test, x) => run('urine-acr-pcr', { test, ratio: x });
  assert.equal(c('acr', 2.9).band, 'ok');
  assert.equal(c('acr', 30).band, 'warn');
  assert.equal(c('acr', 31).band, 'danger');
  assert.equal(c('pcr', 14.9).band, 'ok');
  assert.equal(c('pcr', 15).band, 'warn');
  assert.equal(c('pcr', 50).band, 'warn');
  assert.equal(c('pcr', 51).title, 'Equivalent to A3 (severely increased)');
  // PCR 140 mg/g = 15.8 mg/mmol: category 2 by mg/mmol, 1 by mg/g -> flagged
  const r = c('pcr', toBase('urine-acr-pcr', 'ratio', 'mgg', 140));
  assert.equal(r.band, 'warn'); assert.ok(r.warnings.length === 1);
  assert.equal(c('pcr', toBase('urine-acr-pcr', 'ratio', 'mgg', 150)).warnings.length, 0);
});
