// C1a — hepatology calculators: Child–Pugh, MELD (original), MELD-Na (OPTN 2016), MELD 3.0 (Kim 2021),
// FIB-4 and APRI.
const test = require('node:test');
const assert = require('node:assert/strict');

const defs = require('../../clinician/lib/calcs-cardio-renal.js');
const byId = (id) => { const d = defs.find((x) => x.id === id); assert.ok(d, 'missing ' + id); return d; };
const run = (id, v) => byId(id).compute(v);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} not within ${tol} of ${b}`);
function toBase(id, inputId, unitId, x) {
  const u = byId(id).inputs.find((i) => i.id === inputId).units.find((y) => y.id === unitId);
  return u.toBase ? u.toBase(x) : x * u.factor;
}
const detail = (r, label) => { const d = r.details.find((x) => typeof x !== 'string' && x.label.startsWith(label)); assert.ok(d, 'detail ' + label); return d.value; };

/* ---------------------------------------------------------------------------
   Unit conversions
   --------------------------------------------------------------------------- */
test('bilirubin 17.1 µmol/L = 1 mg/dL; albumin 10 g/L = 1 g/dL; creatinine 88.42 µmol/L = 1 mg/dL', () => {
  near(toBase('child-pugh', 'bili', 'umol', 17.1), 1, 1e-12);
  near(toBase('child-pugh', 'bili', 'umol', 34.2), 2, 1e-12);
  near(toBase('meld-3', 'bili', 'umol', 51.3), 3, 1e-12);
  near(toBase('child-pugh', 'alb', 'gl', 35), 3.5, 1e-12);
  near(toBase('meld-3', 'creat', 'umol', 265.26), 3, 1e-12);
  const u = byId('meld').inputs.find((i) => i.id === 'bili').units.find((x) => x.id === 'umol');
  assert.equal(u.system, 'si');
  near(2 / u.factor, 34.2, 1e-9);
});

/* ---------------------------------------------------------------------------
   Child–Pugh
   --------------------------------------------------------------------------- */
const cp = (bili, alb, inr, ascites = 1, enceph = 1) => run('child-pugh', { bili, alb, inr, ascites, enceph });

test('Child–Pugh: worked examples and classes', () => {
  let r = cp(1.0, 4.0, 1.1);
  assert.equal(r.value, '5'); assert.match(r.title, /^Class A/); assert.equal(r.band, 'ok');
  // Bilirubin 2.5 (2) + albumin 3.0 (2) + INR 1.5 (1) + slight ascites (2) + no HE (1) = 8 -> B
  r = cp(2.5, 3.0, 1.5, 2, 1);
  assert.equal(r.value, '8'); assert.match(r.title, /^Class B/); assert.equal(r.band, 'warn');
  // Bilirubin 4 (3) + albumin 2.5 (3) + INR 2.5 (3) + moderate ascites (3) + grade 2 HE (2) = 14 -> C
  r = cp(4, 2.5, 2.5, 3, 2);
  assert.equal(r.value, '14'); assert.match(r.title, /^Class C/); assert.equal(r.band, 'danger');
  assert.equal(cp(10, 2, 3, 3, 3).value, '15');
});

test('Child–Pugh: class boundaries 6/7 and 9/10', () => {
  assert.match(cp(1.0, 4.0, 1.1, 2, 1).title, /^Class A \(5–6/);   // 6
  assert.match(cp(1.0, 4.0, 1.1, 2, 2).title, /^Class B/);         // 7
  assert.match(cp(2.5, 3.0, 1.1, 2, 2).title, /^Class B/);         // 9
  assert.match(cp(2.5, 3.0, 1.8, 2, 2).title, /^Class C/);         // 10
});

test('Child–Pugh: bilirubin, albumin and INR thresholds (including SI entry)', () => {
  const pts = (r, label) => Number(detail(r, label).split('→ ')[1]);
  assert.equal(pts(cp(1.99, 4, 1), 'Bilirubin'), 1);
  assert.equal(pts(cp(2.0, 4, 1), 'Bilirubin'), 2);
  assert.equal(pts(cp(3.0, 4, 1), 'Bilirubin'), 2);
  assert.equal(pts(cp(3.01, 4, 1), 'Bilirubin'), 3);
  assert.equal(pts(cp(toBase('child-pugh', 'bili', 'umol', 34.2), 4, 1), 'Bilirubin'), 2);
  assert.equal(pts(cp(toBase('child-pugh', 'bili', 'umol', 51.3), 4, 1), 'Bilirubin'), 2);
  assert.equal(pts(cp(toBase('child-pugh', 'bili', 'umol', 51.4), 4, 1), 'Bilirubin'), 3);
  assert.equal(pts(cp(3.51, 3.51, 1), 'Albumin'), 1);
  assert.equal(pts(cp(1, 3.5, 1), 'Albumin'), 2);
  assert.equal(pts(cp(1, toBase('child-pugh', 'alb', 'gl', 35), 1), 'Albumin'), 2);
  assert.equal(pts(cp(1, toBase('child-pugh', 'alb', 'gl', 28), 1), 'Albumin'), 2);
  assert.equal(pts(cp(1, 2.79, 1), 'Albumin'), 3);
  assert.equal(pts(cp(1, 4, 1.69), 'INR'), 1);
  assert.equal(pts(cp(1, 4, 1.7), 'INR'), 2);
  assert.equal(pts(cp(1, 4, 2.3), 'INR'), 2);
  assert.equal(pts(cp(1, 4, 2.31), 'INR'), 3);
  // Grey zone between rounded (34/50) and exact (34.2/51.3) SI cut-offs is flagged
  assert.equal(cp(toBase('child-pugh', 'bili', 'umol', 34.1), 4, 1).warnings.length, 1);
  assert.equal(cp(toBase('child-pugh', 'bili', 'umol', 51), 4, 1).warnings.length, 1);
  assert.equal(cp(toBase('child-pugh', 'bili', 'umol', 40), 4, 1).warnings.length, 0);
});

/* ---------------------------------------------------------------------------
   MELD (original, UNOS conventions)
   --------------------------------------------------------------------------- */
const WIESNER = (m) => (m <= 9 ? '1.9%' : m <= 19 ? '6.0%' : m <= 29 ? '19.6%' : m <= 39 ? '52.6%' : '71.3%');

test('MELD: worked examples', () => {
  // All values at the floor of 1.0: 10 × 0.643 -> 6
  assert.equal(run('meld', { bili: 0.5, inr: 0.9, creat: 0.6, dialysis: false }).value, '6');
  // Bilirubin 2.0, INR 1.5, creatinine 1.2: 0.957 ln1.2 + 0.378 ln2 + 1.12 ln1.5 + 0.643 = 1.534 -> 15
  let r = run('meld', { bili: 2, inr: 1.5, creat: 1.2, dialysis: false });
  assert.equal(r.value, '15'); assert.equal(r.title, 'Three-month mortality ≈ 6.0%'); assert.match(r.interpretation, /AASLD threshold/);
  // Same values entered in SI: bilirubin 34.2 µmol/L, creatinine 106.1 µmol/L
  r = run('meld', { bili: toBase('meld', 'bili', 'umol', 34.2), inr: 1.5, creat: toBase('meld', 'creat', 'umol', 106.104), dialysis: false });
  assert.equal(r.value, '15');
  // Dialysis sets creatinine to 4.0: 0.957 ln4 + 0.643 = 1.970 -> 20
  r = run('meld', { bili: 1, inr: 1, creat: 1.0, dialysis: true });
  assert.equal(r.value, '20');
  assert.equal(run('meld', { bili: 1, inr: 1, creat: 6.5, dialysis: false }).value, '20'); // creatinine capped at 4
});

test('MELD: cap at 40 and Wiesner 2003 mortality bands at each boundary', () => {
  const r = run('meld', { bili: 30, inr: 5, creat: 4, dialysis: false });
  assert.equal(r.value, '40'); assert.ok(r.warnings.some((w) => /Uncapped MELD 51/.test(w)));
  // Boundaries using creatinine alone (bilirubin and INR at 1.0): MELD = round(10 × (0.957 ln Cr + 0.643))
  const crFor = (m) => Math.exp((m / 10 - 0.643) / 0.957) * 1.0001;
  for (const m of [9, 10, 19]) {
    const res = run('meld', { bili: 1, inr: 1, creat: crFor(m), dialysis: false });
    assert.equal(res.value, String(m));
    assert.equal(res.title, 'Three-month mortality ≈ ' + WIESNER(m));
  }
  assert.equal(run('meld', { bili: 1, inr: 1, creat: crFor(9), dialysis: false }).band, 'ok');
  assert.equal(run('meld', { bili: 1, inr: 1, creat: crFor(10), dialysis: false }).band, 'warn');
  // grid over realistic values: title always matches the band of the displayed score
  for (const bili of [0.8, 1.5, 3, 6, 12, 25]) for (const inr of [1, 1.4, 2, 3]) for (const creat of [0.7, 1.2, 2, 3.5]) {
    const res = run('meld', { bili, inr, creat, dialysis: false });
    assert.equal(res.title, 'Three-month mortality ≈ ' + WIESNER(Number(res.value)));
    const m = Number(res.value);
    assert.equal(res.band, m <= 9 ? 'ok' : m <= 19 ? 'warn' : 'danger');
  }
});

/* ---------------------------------------------------------------------------
   MELD-Na (OPTN 2016)
   --------------------------------------------------------------------------- */
test('MELD-Na: worked examples and the MELD(i) > 11 rule', () => {
  // MELD(i) 15, Na 130: 15 + 1.32 × 7 − 0.033 × 15 × 7 = 20.775 -> 21
  let r = run('meld-na', { bili: 2, inr: 1.5, creat: 1.2, na: 130, dialysis: false });
  assert.equal(r.value, '21'); assert.equal(detail(r, 'MELD(i)'), '15');
  // MELD(i) 12, Na 125: 12 + 15.84 − 4.752 = 23.088 -> 23
  const cr12 = Math.exp((1.2 - 0.643) / 0.957) * 1.0001;
  r = run('meld-na', { bili: 1, inr: 1, creat: cr12, na: 125, dialysis: false });
  assert.equal(r.value, '23');
  // MELD(i) 11: sodium term not applied
  const cr11 = Math.exp((1.1 - 0.643) / 0.957) * 1.0001;
  r = run('meld-na', { bili: 1, inr: 1, creat: cr11, na: 125, dialysis: false });
  assert.equal(r.value, '11'); assert.match(r.title, /not applied/);
});

test('MELD-Na: sodium bounded to 125–137 mmol/L', () => {
  const v = { bili: 2, inr: 1.5, creat: 1.2, dialysis: false };
  assert.equal(run('meld-na', Object.assign({ na: 118 }, v)).value, run('meld-na', Object.assign({ na: 125 }, v)).value);
  assert.equal(run('meld-na', Object.assign({ na: 142 }, v)).value, '15');
  assert.equal(run('meld-na', Object.assign({ na: 137 }, v)).value, '15');
  assert.equal(detail(run('meld-na', Object.assign({ na: 118 }, v)), 'Sodium used'), '125 mmol/L (bounded 125–137)');
});

/* ---------------------------------------------------------------------------
   MELD 3.0 (Kim 2021) — formula re-typed independently
   --------------------------------------------------------------------------- */
function meld3Ref(v) {
  const b = Math.max(v.bili, 1), i = Math.max(v.inr, 1), c = v.dialysis ? 3 : Math.min(Math.max(v.creat, 1), 3);
  const n = Math.min(Math.max(v.na, 125), 137), a = Math.min(Math.max(v.alb, 1.5), 3.5);
  return (v.sex === 'female' ? 1.33 : 0) + 4.56 * Math.log(b) + 0.82 * (137 - n) - 0.24 * (137 - n) * Math.log(b) + 9.09 * Math.log(i) + 11.14 * Math.log(c) + 1.85 * (3.5 - a) - 1.83 * (3.5 - a) * Math.log(c) + 6;
}
const raw3 = (r) => Number(detail(r, 'Unrounded score'));

test('MELD 3.0: lowest score is 6 and female sex adds 1.33 (Kim 2021)', () => {
  const normal = { bili: 0.6, na: 140, inr: 1.0, creat: 0.8, alb: 4.2, dialysis: false };
  let r = run('meld-3', Object.assign({ sex: 'male' }, normal));
  assert.equal(r.value, '6'); assert.equal(raw3(r), 6);
  r = run('meld-3', Object.assign({ sex: 'female' }, normal));
  assert.equal(raw3(r), 7.33); assert.equal(r.value, '7');
});

test('MELD 3.0: hand-computed worked example', () => {
  // Woman, bilirubin 2.5 mg/dL, Na 130, INR 1.8, creatinine 1.5 mg/dL, albumin 2.5 g/dL:
  // 1.33 + 4.178 + 5.74 − 1.539 + 5.343 + 4.517 + 1.85 − 0.742 + 6 = 26.68 -> 27
  const v = { sex: 'female', bili: 2.5, na: 130, inr: 1.8, creat: 1.5, alb: 2.5, dialysis: false };
  near(meld3Ref(v), 26.68, 0.005);
  let r = run('meld-3', v);
  assert.equal(r.value, '27'); assert.equal(raw3(r), 26.68);
  // Same patient entered in SI units (42.75 µmol/L, 132.63 µmol/L, 25 g/L)
  r = run('meld-3', { sex: 'female', bili: toBase('meld-3', 'bili', 'umol', 42.75), na: 130, inr: 1.8, creat: toBase('meld-3', 'creat', 'umol', 132.63), alb: toBase('meld-3', 'alb', 'gl', 25), dialysis: false });
  assert.equal(r.value, '27');
  // Same labs in a man: exactly 1.33 lower
  near(raw3(run('meld-3', Object.assign({}, v, { sex: 'male' }))), 26.68 - 1.33, 0.011);
});

test('MELD 3.0: bounds — creatinine ≤3.0 (dialysis = 3.0), Na 125–137, albumin 1.5–3.5', () => {
  const base = { sex: 'male', bili: 4, na: 130, inr: 2, creat: 3, alb: 2.5, dialysis: false };
  const r3 = raw3(run('meld-3', base));
  near(raw3(run('meld-3', Object.assign({}, base, { creat: 4.5 }))), r3, 1e-9);
  near(raw3(run('meld-3', Object.assign({}, base, { creat: 1.1, dialysis: true }))), r3, 1e-9);
  near(raw3(run('meld-3', Object.assign({}, base, { na: 119 }))), raw3(run('meld-3', Object.assign({}, base, { na: 125 }))), 1e-9);
  near(raw3(run('meld-3', Object.assign({}, base, { na: 141 }))), raw3(run('meld-3', Object.assign({}, base, { na: 137 }))), 1e-9);
  near(raw3(run('meld-3', Object.assign({}, base, { alb: 1.0 }))), raw3(run('meld-3', Object.assign({}, base, { alb: 1.5 }))), 1e-9);
  near(raw3(run('meld-3', Object.assign({}, base, { alb: 4.4 }))), raw3(run('meld-3', Object.assign({}, base, { alb: 3.5 }))), 1e-9);
  // Kim 2021: the 3.0 mg/dL creatinine cap limits the creatinine component to ≈12 points (11.14 × ln 3)
  near(11.14 * Math.log(3), 12.24, 0.01);
});

test('MELD 3.0: albumin–creatinine interaction reverses at creatinine ≈2.7 mg/dL (Kim 2021)', () => {
  const s = (creat, alb) => raw3(run('meld-3', { sex: 'male', bili: 2, na: 135, inr: 1.5, creat, alb, dialysis: false }));
  assert.ok(s(2.6, 2.0) > s(2.6, 3.5), 'below 2.7 mg/dL, low albumin raises the score');
  assert.ok(s(2.8, 2.0) < s(2.8, 3.5), 'above ≈2.75 mg/dL, low albumin lowers the score');
  near(Math.exp(1.85 / 1.83), 2.75, 0.01);
});

test('MELD 3.0: survival function reproduces Kim 2021 (score 20 -> ≈1.9% at 30 days, ≈5.4% at 90 days)', () => {
  // Man, bilirubin 3.5, Na 137, INR 2.0, creatinine 1.2, albumin 3.5 -> 20.04
  const v = { sex: 'male', bili: 3.5, na: 137, inr: 2.0, creat: 1.2, alb: 3.5, dialysis: false };
  near(meld3Ref(v), 20.04, 0.01);
  const r = run('meld-3', v);
  assert.equal(r.value, '20');
  const m30 = 100 * (1 - Math.pow(0.981, Math.exp(0.17698 * 20 - 3.56)));
  const m90 = 100 * (1 - Math.pow(0.946, Math.exp(0.17698 * 20 - 3.56)));
  near(m30, 1.9, 0.05); near(m90, 5.4, 0.15);
  assert.match(r.interpretation, /1\.9% at 30 days and 5\.3% at 90 days/);
  assert.equal(r.title, 'Predicted 90-day survival 94.7%');
  assert.equal(r.band, 'danger');
});

test('MELD 3.0: cap at 40 for display with uncapped value noted', () => {
  const r = run('meld-3', { sex: 'female', bili: 30, na: 120, inr: 4, creat: 3, alb: 1.5, dialysis: true });
  assert.equal(r.value, '40');
  assert.ok(r.warnings.some((w) => /exceeds 40/.test(w)));
});

/* ---------------------------------------------------------------------------
   FIB-4
   --------------------------------------------------------------------------- */
// With ALT 100 (√ = 10), age 50 and platelets 100: FIB-4 = AST / 20
const fib = (ast, context = 'masld', age = 50, plt = 100) => run('fib-4', { age, ast, alt: 100, plt, context });

test('FIB-4: formula worked examples', () => {
  // (50 × 40) / (200 × √30) = 1.83
  let r = run('fib-4', { age: 50, ast: 40, alt: 30, plt: 200, context: 'masld' });
  assert.equal(r.value, '1.83'); assert.match(r.title, /Indeterminate/);
  // (65 × 60) / (150 × √25) = 5.20
  r = run('fib-4', { age: 65, ast: 60, alt: 25, plt: 150, context: 'viral' });
  assert.equal(r.value, '5.20'); assert.match(r.title, /Advanced fibrosis likely/);
});

test('FIB-4: MASLD cut-offs 1.30 / 2.67 and the age ≥65 cut-off 2.0', () => {
  assert.equal(fib(25.8).value, '1.29'); assert.equal(fib(25.8).band, 'ok');
  assert.equal(fib(26).value, '1.30'); assert.equal(fib(26).band, 'warn');
  assert.equal(fib(53.4).value, '2.67'); assert.equal(fib(53.4).band, 'warn');
  assert.equal(fib(53.6).value, '2.68'); assert.equal(fib(53.6).band, 'danger');
  // Age 65, platelets 130: FIB-4 = 65 × AST / 1300 = AST / 20
  let r = fib(39.8, 'masld', 65, 130);
  assert.equal(r.value, '1.99'); assert.equal(r.band, 'ok'); assert.ok(r.warnings.some((w) => /65 or over/.test(w)));
  r = fib(40, 'masld', 65, 130);
  assert.equal(r.value, '2.00'); assert.equal(r.band, 'warn');
  // Under 35: unreliable
  assert.ok(run('fib-4', { age: 30, ast: 30, alt: 30, plt: 250, context: 'masld' }).warnings.some((w) => /Under 35/.test(w)));
});

test('FIB-4: HCV/HIV cut-offs 1.45 / 3.25 (Sterling 2006)', () => {
  assert.equal(fib(28.8, 'viral').band, 'ok');
  assert.equal(fib(29, 'viral').value, '1.45'); assert.equal(fib(29, 'viral').band, 'warn');
  assert.equal(fib(65, 'viral').value, '3.25'); assert.equal(fib(65, 'viral').band, 'warn');
  assert.equal(fib(65.2, 'viral').value, '3.26'); assert.equal(fib(65.2, 'viral').band, 'danger');
});

/* ---------------------------------------------------------------------------
   APRI
   --------------------------------------------------------------------------- */
const apri = (ast, uln = 40, plt = 100) => run('apri', { ast, astuln: uln, plt });

test('APRI: worked examples', () => {
  // (80/40) × 100 / 100 = 2.00 -> not above 2.0
  let r = apri(80);
  assert.equal(r.value, '2.00'); assert.match(r.title, /Significant fibrosis likely/);
  // (120/35) × 100 / 85 = 4.03 -> cirrhosis likely
  r = apri(120, 35, 85);
  assert.equal(r.value, '4.03'); assert.equal(r.band, 'danger');
});

test('APRI: cut-offs 0.5 / 1.0 / 1.5 / 2.0 (Wai 2003; WHO)', () => {
  assert.equal(apri(20).value, '0.50'); assert.equal(apri(20).band, 'ok');
  assert.equal(apri(20.4).band, 'info');
  assert.equal(apri(39.6).value, '0.99'); assert.match(apri(39.6).title, /Cirrhosis unlikely/);
  assert.match(apri(40).title, /Indeterminate \(1.0–1.5\)/);
  assert.match(apri(60).title, /Indeterminate/);
  assert.match(apri(60.4).title, /Significant fibrosis likely/);
  assert.match(apri(80.4).title, /Cirrhosis likely/);
  assert.equal(detail(apri(80.4), 'Cirrhosis'), 'likely (>2.0)');
  assert.equal(detail(apri(20), 'Significant fibrosis'), 'unlikely (≤0.5)');
});
