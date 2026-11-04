// C1a — anthropometric calculators: BMI (WHO and lower Asian/NICE cut-offs), BSA (Mosteller, DuBois),
// ideal body weight (Devine), adjusted body weight, lean body weight (Janmahasatian) and
// waist-to-height ratio (NICE 2022).
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

test('weight and length units: 1 lb = 0.45359237 kg, 1 in = 2.54 cm (SI default)', () => {
  near(toBase('bmi', 'weight', 'lb', 154.3236), 70, 1e-4);
  near(toBase('bmi', 'height', 'in', 70), 177.8, 1e-9);
  near(toBase('waist-to-height', 'waist', 'in', 34), 86.36, 1e-9);
  const w = byId('bmi').inputs.find((i) => i.id === 'weight');
  assert.equal(w.units[0].system, 'si'); assert.equal(w.units[1].system, 'conv');
});

/* ---------------------------------------------------------------------------
   BMI
   --------------------------------------------------------------------------- */
test('BMI: worked examples in metric and imperial units', () => {
  let r = run('bmi', { weight: 70, height: 175, scale: 'standard' });
  assert.equal(r.value, '22.9'); assert.equal(r.title, 'Normal weight'); assert.equal(r.band, 'ok');
  assert.equal(detail(r, 'Healthy-weight range'), '56.7–76.3 kg (BMI 18.5–24.9)');
  // 154.3 lb, 68.9 in -> same person
  r = run('bmi', { weight: toBase('bmi', 'weight', 'lb', 154.3236), height: toBase('bmi', 'height', 'in', 68.8976), scale: 'standard' });
  assert.equal(r.value, '22.9');
  // 95 kg, 170 cm -> 32.9 obesity class I
  r = run('bmi', { weight: 95, height: 170, scale: 'standard' });
  assert.equal(r.value, '32.9'); assert.equal(r.title, 'Obesity class I');
});

test('BMI: WHO class boundaries', () => {
  // height 200 cm -> BMI = weight / 4
  const cls = (bmi) => run('bmi', { weight: bmi * 4, height: 200, scale: 'standard' });
  const table = [[15.9, 'Underweight — severe thinness', 'danger'], [16.0, 'Underweight — moderate thinness', 'warn'], [16.9, 'Underweight — moderate thinness', 'warn'],
    [17.0, 'Underweight — mild thinness', 'warn'], [18.4, 'Underweight — mild thinness', 'warn'], [18.5, 'Normal weight', 'ok'], [24.9, 'Normal weight', 'ok'],
    [25.0, 'Overweight (pre-obese)', 'warn'], [29.9, 'Overweight (pre-obese)', 'warn'], [30.0, 'Obesity class I', 'warn'], [34.9, 'Obesity class I', 'warn'],
    [35.0, 'Obesity class II', 'danger'], [39.9, 'Obesity class II', 'danger'], [40.0, 'Obesity class III', 'danger']];
  for (const [b, title, band] of table) {
    const r = cls(b);
    assert.equal(r.value, b.toFixed(1)); assert.equal(r.title, title, 'BMI ' + b); assert.equal(r.band, band, 'BMI ' + b);
  }
});

test('BMI: lower cut-offs (WHO 2004 Asian action points; NICE 2022)', () => {
  const cls = (bmi) => run('bmi', { weight: bmi * 4, height: 200, scale: 'lower' });
  assert.equal(cls(22.9).title, 'Healthy weight');
  assert.equal(cls(23.0).title, 'Overweight — increased risk (23–27.4)');
  assert.equal(cls(27.4).title, 'Overweight — increased risk (23–27.4)');
  assert.equal(cls(27.5).title, 'Obesity — high risk (≥27.5)');
  assert.equal(cls(32.4).title, 'Obesity — high risk (≥27.5)');
  assert.equal(cls(32.5).title, 'Obesity — high risk (≥32.5 action point)');
  assert.equal(cls(37.5).title, 'Obesity — high risk (≥37.5 action point)');
  assert.equal(cls(18.4).title, 'Underweight — mild thinness');
  const r = run('bmi', { weight: 70, height: 175, scale: 'lower' });
  assert.equal(detail(r, 'Healthy-weight range'), '56.7–70.1 kg (BMI 18.5–22.9)');
  assert.equal(detail(r, 'Cut-offs used'), '18.5 · 23 · 27.5 · 32.5 · 37.5');
});

/* ---------------------------------------------------------------------------
   Body surface area
   --------------------------------------------------------------------------- */
const mosteller = (w, h) => Math.sqrt(w * h / 3600);
const dubois = (w, h) => 0.007184 * w ** 0.425 * h ** 0.725;

test('BSA: Mosteller and DuBois worked examples', () => {
  // 80 kg, 180 cm: Mosteller √(14 400/3600) = 2.00 exactly; DuBois 1.997
  let r = run('bsa', { weight: 80, height: 180 });
  assert.equal(r.value, '2.00'); assert.equal(detail(r, 'Mosteller'), '2.000 m²');
  near(dubois(80, 180), 1.9967, 0.0005);
  assert.equal(detail(r, 'DuBois'), dubois(80, 180).toFixed(3) + ' m²');
  // 70 kg, 170 cm: Mosteller 1.818, DuBois 1.810
  r = run('bsa', { weight: 70, height: 170 });
  near(mosteller(70, 170), 1.8181, 0.0001); near(dubois(70, 170), 1.8100, 0.0005);
  assert.equal(r.value, '1.82'); assert.equal(r.title, 'DuBois: 1.81 m²');
  // Child 20 kg, 115 cm: Mosteller 0.80
  assert.equal(run('bsa', { weight: 20, height: 115 }).value, '0.80');
  // Imperial entry: 176.37 lb, 70.866 in = 80 kg, 180 cm
  r = run('bsa', { weight: toBase('bsa', 'weight', 'lb', 176.3698), height: toBase('bsa', 'height', 'in', 70.8661) });
  assert.equal(r.value, '2.00');
  assert.equal(detail(run('bsa', { weight: 80, height: 180 }), 'Absolute GFR factor'), '1.16');
});

/* ---------------------------------------------------------------------------
   Ideal, adjusted and lean body weight
   --------------------------------------------------------------------------- */
test('Ideal body weight (Devine): textbook examples', () => {
  // 5 ft 10 in man: 50 + 2.3 × 10 = 73.0 kg; 5 ft 5 in woman: 45.5 + 2.3 × 5 = 57.0 kg
  let r = run('ideal-body-weight', { sex: 'male', height: 177.8 });
  assert.equal(r.value, '73.0'); assert.equal(detail(r, '6–8 mL/kg tidal volume'), '438–584 mL');
  assert.equal(run('ideal-body-weight', { sex: 'female', height: 165.1 }).value, '57.0');
  assert.equal(run('ideal-body-weight', { sex: 'male', height: toBase('ideal-body-weight', 'height', 'in', 70) }).value, '73.0');
  // Base height 5 ft (152.4 cm)
  assert.equal(run('ideal-body-weight', { sex: 'male', height: 152.4 }).value, '50.0');
  r = run('ideal-body-weight', { sex: 'female', height: 152.4 });
  assert.equal(r.value, '45.5'); assert.equal(r.warnings.length, 0);
  // Below 5 ft: extrapolated with a warning (150 cm woman -> 43.3 kg)
  r = run('ideal-body-weight', { sex: 'female', height: 150 });
  assert.equal(r.value, '43.3'); assert.equal(r.warnings.length, 1);
});

test('Ideal body weight equals ARDSNet predicted body weight (0.91 kg/cm) within 0.5 kg', () => {
  for (let h = 150; h <= 200; h += 5) {
    const pbw = 50 + 0.91 * (h - 152.4);
    near(Number(run('ideal-body-weight', { sex: 'male', height: h }).value), pbw, 0.5, 'height ' + h);
  }
});

test('Adjusted body weight: IBW + 0.4 × (actual − IBW)', () => {
  // Man 5 ft 10 in, 120 kg: 73 + 0.4 × 47 = 91.8 kg; 164% of IBW
  let r = run('adjusted-body-weight', { sex: 'male', height: 177.8, weight: 120 });
  assert.equal(r.value, '91.8'); assert.equal(r.title, 'Actual weight 164% of ideal');
  assert.equal(detail(r, 'Ideal body weight'), '73.0 kg');
  // Woman 5 ft 5 in, 90 kg: 57 + 0.4 × 33 = 70.2 kg
  assert.equal(run('adjusted-body-weight', { sex: 'female', height: 165.1, weight: 90 }).value, '70.2');
  // At or below IBW -> actual weight
  r = run('adjusted-body-weight', { sex: 'male', height: 177.8, weight: 70 });
  assert.equal(r.value, '70.0'); assert.match(r.title, /use actual weight/);
});

test('Lean body weight (Janmahasatian 2005): worked examples and behaviour in obesity', () => {
  const ref = (sex, w, h) => { const bmi = w / (h / 100) ** 2; return 9270 * w / (sex === 'male' ? 6680 + 216 * bmi : 8780 + 244 * bmi); };
  // Man 80 kg, 180 cm (BMI 24.7): 9270 × 80 / (6680 + 216 × 24.69) = 61.7 kg
  near(ref('male', 80, 180), 61.73, 0.01);
  assert.equal(run('lean-body-weight', { sex: 'male', weight: 80, height: 180 }).value, '61.7');
  // Woman 70 kg, 165 cm (BMI 25.7): 9270 × 70 / (8780 + 244 × 25.71) = 43.1 kg
  near(ref('female', 70, 165), 43.11, 0.01);
  assert.equal(run('lean-body-weight', { sex: 'female', weight: 70, height: 165 }).value, '43.1');
  // Keeps rising with weight even at very high BMI
  let prev = 0;
  for (let w = 60; w <= 250; w += 10) {
    const lbw = Number(run('lean-body-weight', { sex: 'male', weight: w, height: 175 }).value);
    assert.ok(lbw > prev); prev = lbw;
  }
});

/* ---------------------------------------------------------------------------
   Waist-to-height ratio
   --------------------------------------------------------------------------- */
test('Waist-to-height ratio: NICE 2022 bands at each boundary', () => {
  const w = (waist) => run('waist-to-height', { waist, height: 100 });
  assert.equal(w(39).band, 'info');
  assert.equal(w(40).band, 'ok'); assert.equal(w(40).value, '0.40');
  assert.equal(w(49).band, 'ok');
  assert.equal(w(50).band, 'warn'); assert.match(w(50).title, /Increased central adiposity/);
  assert.equal(w(59).band, 'warn');
  assert.equal(w(60).band, 'danger'); assert.match(w(60).title, /High central adiposity/);
});

test('Waist-to-height ratio: worked examples and imperial entry', () => {
  let r = run('waist-to-height', { waist: 80, height: 175 });
  assert.equal(r.value, '0.46'); assert.equal(r.band, 'ok');
  assert.equal(detail(r, 'Waist for a ratio below 0.5'), 'under 87.5 cm (34.4 in)');
  r = run('waist-to-height', { waist: toBase('waist-to-height', 'waist', 'in', 34), height: toBase('waist-to-height', 'height', 'in', 68) });
  assert.equal(r.value, '0.50'); assert.equal(r.band, 'warn');
  r = run('waist-to-height', { waist: 105, height: 170 });
  assert.equal(r.value, '0.62'); assert.equal(r.band, 'danger');
});
