// C1a — calculator library contract tests + cardiology and thrombosis calculators.
// Worked examples use values from the original publications where available, otherwise
// hand-computed reference values (documented next to each test).
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const defs = require('../../clinician/lib/calcs-cardio-renal.js');
const byId = (id) => { const d = defs.find((x) => x.id === id); assert.ok(d, 'missing calculator ' + id); return d; };
const run = (id, v) => byId(id).compute(v);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} not within ${tol} of ${b}`);

function loadCore() {
  const sandbox = { console, setTimeout, clearTimeout, Promise, Date, Math, JSON, Number, String, Array, Object, RegExp, Error, isFinite };
  sandbox.globalThis = sandbox; sandbox.window = undefined;
  sandbox.document = { documentElement: { setAttribute() {}, removeAttribute() {}, lang: 'en', dir: 'ltr' }, addEventListener() {}, getElementById() { return null; } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../assets/js/core.js'), 'utf8'), sandbox);
  return sandbox.MT;
}

// Deterministic PRNG for fuzzing (mulberry32)
function prng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function randomValues(def, rnd) {
  const v = {};
  def.inputs.forEach((inp) => {
    if (!inp.id) return;
    if (inp.type === 'number') {
      const optional = inp.required === false;
      if (optional && rnd() < 0.3) return;
      v[inp.id] = inp.min + (inp.max - inp.min) * rnd();
    } else if (inp.type === 'bool') v[inp.id] = rnd() < 0.5;
    else if (inp.type === 'radio' || inp.type === 'select') v[inp.id] = inp.options[Math.floor(rnd() * inp.options.length)].value;
  });
  return v;
}

/* ---------------------------------------------------------------------------
   Contract
   --------------------------------------------------------------------------- */
const CATEGORIES = ['Cardiology', 'Thrombosis', 'Renal', 'Hepatology', 'Anthropometrics'];

test('module exports an array of 30 definitions with unique ids', () => {
  assert.ok(Array.isArray(defs));
  assert.equal(defs.length, 30);
  const ids = defs.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((id) => assert.match(id, /^[a-z0-9-]+$/));
});

test('browser branch appends to self.MTCalcs without clobbering other packages', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../clinician/lib/calcs-cardio-renal.js'), 'utf8');
  const sandbox = { MTCalcs: [{ id: 'other-package', name: 'Other' }], Math, Number, String, Array, Object, isFinite };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  assert.equal(sandbox.MTCalcs.length, 31);
  assert.equal(sandbox.MTCalcs[0].id, 'other-package');
});

test('every definition follows the calculator schema', () => {
  for (const d of defs) {
    const where = d.id + ': ';
    assert.ok(typeof d.name === 'string' && d.name.length > 3, where + 'name');
    assert.ok(CATEGORIES.includes(d.category), where + 'category ' + d.category);
    assert.ok(typeof d.summary === 'string' && d.summary.length > 10, where + 'summary');
    assert.ok(Array.isArray(d.keywords) && d.keywords.length >= 3, where + 'keywords');
    assert.equal(typeof d.compute, 'function', where + 'compute');
    assert.ok(typeof d.formula === 'string' && d.formula.length > 20, where + 'formula');
    assert.ok(Array.isArray(d.pearls) && d.pearls.length >= 1, where + 'pearls');
    assert.ok(Array.isArray(d.references) && d.references.length >= 1, where + 'references');
    d.references.forEach((r) => {
      assert.ok(typeof r.label === 'string' && r.label.length > 15, where + 'reference label');
      if (r.url) assert.match(r.url, /^https:\/\//, where + 'reference url');
    });
    const seen = new Set();
    d.inputs.forEach((inp) => {
      if (inp.type === 'note') { assert.ok(inp.text); return; }
      if (inp.type === 'heading') { assert.ok(inp.label); return; }
      assert.ok(inp.id && !seen.has(inp.id), where + 'input id ' + inp.id); seen.add(inp.id);
      assert.ok(typeof inp.label === 'string' && inp.label.length > 1, where + 'label for ' + inp.id);
      assert.ok(['number', 'bool', 'radio', 'select'].includes(inp.type), where + 'type ' + inp.type);
      if (inp.type === 'number') {
        assert.ok(typeof inp.min === 'number' && typeof inp.max === 'number' && inp.min < inp.max, where + 'min/max for ' + inp.id);
        if (inp.units) {
          assert.equal(inp.units[0].factor, 1, where + 'base unit of ' + inp.id + ' must have factor 1');
          const uids = new Set();
          inp.units.forEach((u) => {
            assert.ok(u.id && u.label && !uids.has(u.id), where + 'unit ids'); uids.add(u.id);
            assert.ok(u.system === 'si' || u.system === 'conv', where + 'unit system for ' + inp.id + '/' + u.id);
            assert.ok(typeof u.factor === 'number' && u.factor > 0, where + 'unit factor');
          });
          if (inp.units.length > 1) {
            assert.ok(inp.units.some((u) => u.system === 'si') && inp.units.some((u) => u.system === 'conv'), where + 'SI and conventional units for ' + inp.id);
          }
        } else assert.ok(typeof inp.unit === 'string' || inp.id === 'inr', where + 'unit for ' + inp.id);
      }
      if (inp.type === 'radio' || inp.type === 'select') {
        assert.ok(Array.isArray(inp.options) && inp.options.length >= 2, where + 'options');
        const vals = inp.options.map((o) => String(o.value));
        assert.equal(new Set(vals).size, vals.length, where + 'unique option values');
      }
    });
  }
});

test('compute() is pure: no MT, DOM or global references in its source', () => {
  for (const d of defs) {
    const src = d.compute.toString();
    assert.ok(!/\bMT\b|document|window|localStorage|fetch\(/.test(src), d.id + ' compute references the runtime');
  }
});

test('fuzz: every calculator returns null or a complete result for random valid inputs', () => {
  const rnd = prng(20261103);
  const BANDS = ['ok', 'warn', 'danger', 'info'];
  for (const d of defs) {
    for (let i = 0; i < 300; i++) {
      const v = randomValues(d, rnd);
      const r = d.compute(v);
      if (r === null) continue;
      assert.equal(typeof r, 'object', d.id);
      assert.ok(BANDS.includes(r.band), d.id + ' band ' + r.band);
      assert.ok(typeof r.title === 'string' && r.title.length > 2, d.id + ' title');
      assert.ok(typeof r.interpretation === 'string' && r.interpretation.length > 20, d.id + ' interpretation');
      assert.ok(typeof r.label === 'string', d.id + ' label');
      assert.ok(r.value === null || typeof r.value === 'string', d.id + ' value should be preformatted text');
      if (typeof r.value === 'string') assert.ok(!/NaN|Infinity|undefined/.test(r.value), d.id + ' value ' + r.value);
      assert.ok(Array.isArray(r.details) && Array.isArray(r.warnings), d.id + ' details/warnings arrays');
      r.details.forEach((x) => { if (typeof x !== 'string') assert.ok(x.label && x.value != null && !/NaN|undefined/.test(String(x.value)), d.id + ' detail ' + JSON.stringify(x)); });
    }
  }
});

test('score calculators agree with the runtime engine MT.calc.sumPoints', () => {
  const MT = loadCore();
  const rnd = prng(7);
  for (const id of ['cha2ds2va', 'cha2ds2vasc', 'has-bled', 'heart-score', 'timi-ua-nstemi', 'wells-dvt', 'wells-pe', 'geneva-simplified']) {
    const d = byId(id);
    for (let i = 0; i < 200; i++) {
      const v = randomValues(d, rnd);
      assert.equal(parseFloat(d.compute(v).value), MT.calc.sumPoints(d, v), id);
    }
  }
});

test('MT.calc.summary produces copyable text for every calculator', () => {
  const MT = loadCore();
  const rnd = prng(99);
  for (const d of defs) {
    const v = randomValues(d, rnd);
    const res = d.compute(v);
    const text = MT.calc.summary(d, v, res);
    assert.ok(text.startsWith(d.name), d.id);
  }
});

/* ---------------------------------------------------------------------------
   CHA2DS2-VA (2024 ESC) and CHA2DS2-VASc
   --------------------------------------------------------------------------- */
test('CHA2DS2-VA: worked examples and 2024 ESC thresholds', () => {
  // 70-year-old with hypertension and diabetes: A(65–74) 1 + H 1 + D 1 = 3 -> OAC recommended
  let r = run('cha2ds2va', { age: '65to74', htn: true, dm: true });
  assert.equal(r.value, '3'); assert.equal(r.band, 'danger'); assert.match(r.title, /recommended/);
  // Every item: C1 + H1 + A2 2 + D1 + S2 2 + V1 = 8 (maximum)
  r = run('cha2ds2va', { age: 'ge75', chf: true, htn: true, dm: true, stroke: true, vasc: true });
  assert.equal(r.value, '8');
  // Thresholds: 0 -> no OAC; 1 -> consider (IIa); 2 -> recommend (I)
  assert.equal(run('cha2ds2va', { age: 'lt65' }).band, 'ok');
  r = run('cha2ds2va', { age: 'lt65', htn: true });
  assert.equal(r.value, '1'); assert.equal(r.band, 'warn'); assert.match(r.interpretation, /class IIa/);
  r = run('cha2ds2va', { age: 'ge75' });
  assert.equal(r.value, '2'); assert.equal(r.band, 'danger'); assert.match(r.interpretation, /class I\b/);
  assert.equal(run('cha2ds2va', { age: 'lt65', stroke: true }).value, '2');
});

test('CHA2DS2-VASc: female sex is a risk modifier; Friberg 2012 untreated stroke rates', () => {
  // Woman <65 with no other factor: VASc 1, CHA2DS2-VA 0 -> low risk
  let r = run('cha2ds2vasc', { age: 'lt65', sex: 'female' });
  assert.equal(r.value, '1'); assert.equal(r.band, 'ok'); assert.match(r.interpretation, /Female sex is the only risk factor/);
  assert.deepEqual(r.details[0], { label: 'CHA₂DS₂-VA equivalent (2024 ESC)', value: '0' });
  assert.equal(r.details[1].value, '≈ 0.6% per year');
  // Man 65–74: VASc 1 -> consider OAC; woman 65–74: VASc 2 (VA 1) -> consider OAC
  assert.equal(run('cha2ds2vasc', { age: '65to74', sex: 'male' }).band, 'warn');
  r = run('cha2ds2vasc', { age: '65to74', sex: 'female' });
  assert.equal(r.value, '2'); assert.equal(r.band, 'warn'); assert.equal(r.details[1].value, '≈ 2.2% per year');
  // Maximum 9 (all factors, female): 12.2%/year in Friberg 2012
  r = run('cha2ds2vasc', { age: 'ge75', sex: 'female', chf: true, htn: true, dm: true, stroke: true, vasc: true });
  assert.equal(r.value, '9'); assert.equal(r.details[1].value, '≈ 12.2% per year');
  assert.equal(run('cha2ds2vasc', { age: 'lt65', sex: 'male' }).details[1].value, '≈ 0.2% per year');
});

test('CHA2DS2-VASc bands equal the 2020 ESC sex-specific thresholds for every combination', () => {
  const ages = ['lt65', '65to74', 'ge75'];
  for (let mask = 0; mask < 32; mask++) {
    for (const age of ages) for (const sex of ['male', 'female']) {
      const v = { age, sex, chf: !!(mask & 1), htn: !!(mask & 2), dm: !!(mask & 4), stroke: !!(mask & 8), vasc: !!(mask & 16) };
      const r = run('cha2ds2vasc', v);
      const s = Number(r.value);
      const expected = sex === 'male' ? (s >= 2 ? 'danger' : s === 1 ? 'warn' : 'ok') : (s >= 3 ? 'danger' : s === 2 ? 'warn' : 'ok');
      assert.equal(r.band, expected, JSON.stringify(v));
      // CHA2DS2-VA from the same factors must give the same recommendation
      assert.equal(run('cha2ds2va', v).band, expected);
    }
  }
});

/* ---------------------------------------------------------------------------
   HAS-BLED
   --------------------------------------------------------------------------- */
test('HAS-BLED: Pisters 2010 bleeding rates and the ≥3 threshold', () => {
  const rate = (r) => r.details[0].value;
  let r = run('has-bled', {});
  assert.equal(r.value, '0'); assert.equal(rate(r), '1.13 per 100 patient-years'); assert.equal(r.band, 'ok');
  assert.equal(rate(run('has-bled', { elderly: true })), '1.02 per 100 patient-years');
  r = run('has-bled', { elderly: true, drugs: true });
  assert.equal(r.value, '2'); assert.equal(rate(r), '1.88 per 100 patient-years'); assert.equal(r.band, 'ok');
  // 75-year-old with uncontrolled BP on aspirin: H + E + D = 3 -> high risk, modifiable factors listed
  r = run('has-bled', { h: true, elderly: true, drugs: true });
  assert.equal(r.value, '3'); assert.equal(r.band, 'warn'); assert.match(r.title, /High bleeding risk/);
  assert.equal(rate(r), '3.74 per 100 patient-years');
  assert.match(r.details[1].value, /uncontrolled blood pressure/);
  assert.match(r.interpretation, /not a reason to withhold/);
  assert.equal(rate(run('has-bled', { h: true, elderly: true, drugs: true, alcohol: true })), '8.7 per 100 patient-years');
  assert.match(rate(run('has-bled', { h: true, renal: true, liver: true, stroke: true, bleed: true })), /too few patients/);
  assert.equal(run('has-bled', { h: true, renal: true, liver: true, stroke: true, bleed: true, inr: true, elderly: true, drugs: true, alcohol: true }).value, '9');
});

/* ---------------------------------------------------------------------------
   HEART and TIMI
   --------------------------------------------------------------------------- */
test('HEART: Backus 2013 risk groups at every threshold', () => {
  const v = (h, e, a, rf, t) => ({ history: h, ecg: e, agecat: a, risk: rf, trop: t });
  let r = run('heart-score', v(1, 0, 1, 1, 0));            // 3
  assert.equal(r.value, '3'); assert.equal(r.band, 'ok'); assert.equal(r.details[0].value, '1.7%');
  r = run('heart-score', v(1, 1, 1, 1, 0));                // 4
  assert.equal(r.band, 'warn'); assert.equal(r.details[0].value, '16.6%');
  r = run('heart-score', v(2, 1, 2, 1, 0));                // 6 (highly suspicious, LBBB, age ≥65, 1–2 RFs)
  assert.equal(r.value, '6'); assert.equal(r.band, 'warn');
  r = run('heart-score', v(2, 2, 2, 1, 0));                // 7
  assert.equal(r.band, 'danger'); assert.equal(r.details[0].value, '50.1%');
  assert.equal(run('heart-score', v(0, 0, 0, 0, 0)).value, '0');
  assert.equal(run('heart-score', v(2, 2, 2, 2, 2)).value, '10');
});

test('TIMI UA/NSTEMI: Antman 2000 14-day event rates by score', () => {
  const items = ['age65', 'rf3', 'cad', 'asa', 'angina', 'st', 'marker'];
  const expected = ['4.7', '4.7', '8.3', '13.2', '19.9', '26.2', '40.9', '40.9'];
  const bands = ['ok', 'ok', 'ok', 'warn', 'warn', 'danger', 'danger', 'danger'];
  for (let n = 0; n <= 7; n++) {
    const v = {}; items.slice(0, n).forEach((k) => { v[k] = true; });
    const r = run('timi-ua-nstemi', v);
    assert.equal(r.value, String(n));
    assert.equal(r.title, expected[n] + '% risk at 14 days');
    assert.equal(r.band, bands[n]);
  }
});

/* ---------------------------------------------------------------------------
   Wells DVT, Wells PE, PERC, simplified Geneva
   --------------------------------------------------------------------------- */
test('Wells DVT: two-level (NICE) and three-level (Wells 1997) interpretation', () => {
  // Active cancer + whole leg swollen + calf swelling ≥3 cm = 3 -> likely; three-level high (75%)
  let r = run('wells-dvt', { cancer: true, swollen: true, calf: true });
  assert.equal(r.value, '3'); assert.match(r.title, /DVT likely/); assert.equal(r.band, 'danger');
  assert.match(r.details[0].value, /high \(75%\)/);
  assert.match(r.interpretation, /ultrasound within 4 hours/);
  // Boundary 1 vs 2
  r = run('wells-dvt', { tender: true });
  assert.equal(r.value, '1'); assert.match(r.title, /unlikely/); assert.equal(r.band, 'ok'); assert.match(r.details[0].value, /moderate \(17%\)/);
  r = run('wells-dvt', { tender: true, pitting: true });
  assert.equal(r.value, '2'); assert.match(r.title, /likely \(score ≥2\)/); assert.equal(r.band, 'warn');
  assert.match(r.details[0].value, /moderate/);
  // Alternative diagnosis subtracts 2
  r = run('wells-dvt', { alt: true });
  assert.equal(r.value, '-2'); assert.match(r.details[0].value, /low \(DVT in 3%/);
  assert.equal(run('wells-dvt', { prevdvt: true, tender: true, alt: true }).value, '0');
  assert.equal(run('wells-dvt', { cancer: true, paralysis: true, bedridden: true, tender: true, swollen: true, calf: true, pitting: true, collateral: true, prevdvt: true }).value, '9');
});

test('Wells PE: half points, ≤4/>4 split and three-level cut-offs (Wells 2000)', () => {
  // HR >100 1.5 + immobilisation 1.5 + haemoptysis 1 = 4.0 -> PE unlikely
  let r = run('wells-pe', { hr: true, immob: true, haemoptysis: true });
  assert.equal(r.value, '4'); assert.match(r.title, /unlikely/); assert.equal(r.band, 'ok');
  assert.match(r.details[0].value, /moderate \(20.5%\)/);
  assert.match(r.details[1].value, /7.8%/);
  // HR 1.5 + previous VTE 1.5 + immobilisation 1.5 = 4.5 -> PE likely
  r = run('wells-pe', { hr: true, prev: true, immob: true });
  assert.equal(r.value, '4.5'); assert.match(r.title, /PE likely/); assert.equal(r.band, 'warn');
  assert.match(r.details[1].value, /37.1%/);
  // DVT signs 3 + PE most likely 3 = 6 -> moderate; + haemoptysis = 7 -> high
  r = run('wells-pe', { dvtsigns: true, altless: true });
  assert.equal(r.value, '6'); assert.match(r.details[0].value, /moderate/); assert.equal(r.band, 'warn');
  r = run('wells-pe', { dvtsigns: true, altless: true, haemoptysis: true });
  assert.equal(r.value, '7'); assert.match(r.details[0].value, /high \(66.7%\)/); assert.equal(r.band, 'danger');
  // <2 low, 2 moderate
  assert.match(run('wells-pe', { hr: true }).details[0].value, /low \(PE in 3.6%/);
  assert.match(run('wells-pe', { haemoptysis: true, cancer: true }).details[0].value, /moderate/);
  assert.equal(run('wells-pe', { dvtsigns: true, altless: true, hr: true, immob: true, prev: true, haemoptysis: true, cancer: true }).value, '12.5');
});

test('PERC: only valid with low gestalt; negative only when all 8 criteria are absent', () => {
  let r = run('perc', { lowgestalt: true });
  assert.equal(r.value, 'Negative'); assert.equal(r.band, 'ok'); assert.match(r.interpretation, /1.0%/);
  r = run('perc', { lowgestalt: true, age50: true });
  assert.equal(r.value, 'Positive'); assert.equal(r.band, 'warn'); assert.match(r.interpretation, /^1 criterion is present/);
  r = run('perc', { lowgestalt: true, sat: true, oestrogen: true });
  assert.match(r.interpretation, /^2 criteria are present/);
  r = run('perc', { lowgestalt: false });
  assert.equal(r.value, null); assert.equal(r.band, 'info'); assert.match(r.title, /not applicable/);
  const all = { lowgestalt: true }; ['age50', 'hr100', 'sat', 'haemoptysis', 'oestrogen', 'priorvte', 'legswelling', 'surgery'].forEach((k) => { all[k] = true; });
  assert.equal(run('perc', all).details[0].value, '8 of 8');
});

test('Simplified revised Geneva: heart-rate tiers and two-/three-level cut-offs (Klok 2008, ESC 2019)', () => {
  let r = run('geneva-simplified', { hr: 'lt75', age65: true, legpain: true });
  assert.equal(r.value, '2'); assert.match(r.title, /unlikely/); assert.equal(r.band, 'ok'); assert.equal(r.details[0].value, 'intermediate (2–4)');
  r = run('geneva-simplified', { hr: '75to94', age65: true, legpain: true });
  assert.equal(r.value, '3'); assert.match(r.title, /PE likely/); assert.equal(r.band, 'warn');
  r = run('geneva-simplified', { hr: 'ge95', age65: true, legpain: true, haemoptysis: true });
  assert.equal(r.value, '5'); assert.equal(r.details[0].value, 'high (≥5)'); assert.equal(r.band, 'danger');
  assert.equal(run('geneva-simplified', { hr: 'lt75', cancer: true }).details[0].value, 'low (0–1)');
  assert.equal(run('geneva-simplified', { hr: 'ge95', age65: true, prev: true, surgery: true, cancer: true, legpain: true, haemoptysis: true, palpation: true }).value, '9');
});

/* ---------------------------------------------------------------------------
   QTc and MAP
   --------------------------------------------------------------------------- */
test('QTc: the four formulas (identical at 60/min) and published worked values', () => {
  let r = run('qtc', { qt: 400, hr: 60, sex: 'male', formula: 'bazett' });
  const val = (res, name) => res.details.find((d) => d.label.startsWith(name)).value;
  ['Bazett', 'Fridericia', 'Framingham', 'Hodges'].forEach((n) => assert.equal(val(r, n), '400 ms'));
  // QT 400 ms at 75/min (RR 0.8 s): Bazett 400/√0.8 = 447.2; Fridericia 400/0.8^(1/3) = 430.9;
  // Framingham 400 + 154 × 0.2 = 430.8; Hodges 400 + 1.75 × 15 = 426.25
  r = run('qtc', { qt: 400, hr: 75, sex: 'male', formula: 'bazett' });
  assert.equal(r.value, '447'); assert.equal(val(r, 'Fridericia'), '431 ms'); assert.equal(val(r, 'Framingham'), '431 ms'); assert.equal(val(r, 'Hodges'), '426 ms');
  assert.equal(val(r, 'RR interval'), '800 ms');
  assert.equal(run('qtc', { qt: 400, hr: 75, sex: 'male', formula: 'fridericia' }).value, '431');
  assert.equal(run('qtc', { qt: 400, hr: 75, sex: 'male', formula: 'hodges' }).value, '426');
});

test('QTc: sex-specific thresholds (AHA/ACCF/HRS 2009) and >500 ms (AHA/ACCF 2010)', () => {
  const at60 = (qt, sex) => run('qtc', { qt, hr: 60, sex, formula: 'fridericia' });
  assert.equal(at60(449, 'male').band, 'ok');
  assert.equal(at60(450, 'male').band, 'warn');
  assert.match(at60(450, 'male').title, /≥450 ms in men/);
  assert.equal(at60(459, 'female').band, 'ok');
  assert.equal(at60(460, 'female').band, 'warn');
  assert.equal(at60(500, 'female').band, 'warn');
  assert.equal(at60(501, 'female').band, 'danger');
  assert.equal(at60(390, 'male').title, 'Short QTc (≤390 ms)');
  assert.equal(at60(391, 'male').band, 'ok');
});

test('QTc: heart-rate caveat, formula disagreement, wide QRS and ΔQTc ≥60 ms warnings', () => {
  assert.equal(run('qtc', { qt: 400, hr: 70, sex: 'male', formula: 'fridericia' }).warnings.length, 0);
  let r = run('qtc', { qt: 340, hr: 110, sex: 'male', formula: 'fridericia' });
  assert.ok(r.warnings.some((w) => /Bazett over-corrects/.test(w)));
  // QT 410 at 75/min, man: Bazett 458 (prolonged) vs Fridericia 442 (normal)
  r = run('qtc', { qt: 410, hr: 75, sex: 'male', formula: 'fridericia' });
  assert.ok(r.warnings.some((w) => /disagree/.test(w)));
  r = run('qtc', { qt: 460, hr: 60, sex: 'male', formula: 'fridericia', qrs: 140 });
  assert.ok(r.warnings.some((w) => /QRS ≥120/.test(w)));
  r = run('qtc', { qt: 480, hr: 60, sex: 'male', formula: 'fridericia', baseline: 420 });
  assert.ok(r.warnings.some((w) => /risen by 60 ms/.test(w)));
  r = run('qtc', { qt: 470, hr: 60, sex: 'male', formula: 'fridericia', baseline: 420 });
  assert.ok(!r.warnings.some((w) => /risen/.test(w)));
});

test('Mean arterial pressure: DBP + (SBP − DBP)/3 with the 65 mmHg threshold', () => {
  let r = run('mean-arterial-pressure', { sbp: 120, dbp: 80 });
  assert.equal(r.value, '93'); assert.equal(r.band, 'ok'); assert.equal(r.details[0].value, '40 mmHg');
  r = run('mean-arterial-pressure', { sbp: 95, dbp: 50 });              // exactly 65
  assert.equal(r.value, '65'); assert.equal(r.band, 'ok');
  r = run('mean-arterial-pressure', { sbp: 90, dbp: 50 });              // 63.3
  assert.equal(r.value, '63'); assert.equal(r.band, 'danger');
  r = run('mean-arterial-pressure', { sbp: 80, dbp: 80 });
  assert.equal(r.value, null); assert.match(r.interpretation, /lower than systolic/);
});

/* ---------------------------------------------------------------------------
   Framingham 2008 (D'Agostino) — coefficients re-typed here independently
   --------------------------------------------------------------------------- */
const F = {
  lipid: { female: [2.32888, 1.20904, -0.70833, 2.76157, 2.82263, 0.52873, 0.69154, 0.95012, 26.1931], male: [3.06117, 1.12370, -0.93263, 1.93303, 1.99881, 0.65451, 0.57367, 0.88936, 23.9802] },
  bmi: { female: [2.72107, 0.51125, 2.81291, 2.88267, 0.61868, 0.77763, 0.94833, 26.0145], male: [3.11296, 0.79277, 1.85508, 1.92672, 0.70953, 0.53160, 0.88431, 23.9388] }
};
function framRef(v) {
  const c = F.lipid[v.sex];
  const lp = c[0] * Math.log(v.age) + c[1] * Math.log(v.tc) + c[2] * Math.log(v.hdl) + (v.treated ? c[4] : c[3]) * Math.log(v.sbp) + (v.smoker ? c[5] : 0) + (v.diabetes ? c[6] : 0);
  return 100 * (1 - Math.pow(c[7], Math.exp(lp - c[8])));
}
function framBmiRef(v) {
  const c = F.bmi[v.sex]; const bmi = v.weight / Math.pow(v.height / 100, 2);
  const lp = c[0] * Math.log(v.age) + c[1] * Math.log(bmi) + (v.treated ? c[3] : c[2]) * Math.log(v.sbp) + (v.smoker ? c[4] : 0) + (v.diabetes ? c[5] : 0);
  return 100 * (1 - Math.pow(c[6], Math.exp(lp - c[7])));
}

test('Framingham 2008 (lipids): hand-computed reference values', () => {
  // 61-year-old woman, TC 180, HDL 47 mg/dL, untreated SBP 124, smoker, no diabetes -> 10.48%
  let v = { sex: 'female', age: 61, tc: 180, hdl: 47, sbp: 124, treated: false, smoker: true, diabetes: false };
  near(framRef(v), 10.48, 0.01);
  assert.equal(run('framingham-2008', v).value, '10.5');
  assert.equal(run('framingham-2008', v).band, 'warn');
  // 55-year-old man, TC 213, HDL 50, untreated SBP 120, non-smoker, no diabetes -> 10.23%
  v = { sex: 'male', age: 55, tc: 213, hdl: 50, sbp: 120, treated: false, smoker: false, diabetes: false };
  near(framRef(v), 10.23, 0.01);
  assert.equal(run('framingham-2008', v).value, '10.2');
  // High-risk man: 70, TC 240, HDL 35, treated SBP 160, smoker, diabetes
  v = { sex: 'male', age: 70, tc: 240, hdl: 35, sbp: 160, treated: true, smoker: true, diabetes: true };
  assert.equal(run('framingham-2008', v).band, 'danger');
  assert.equal(run('framingham-2008', v).value, (Math.round(framRef(v) * 10) / 10).toFixed(1));
  // Very low risk shows <1
  assert.equal(run('framingham-2008', { sex: 'female', age: 30, tc: 160, hdl: 70, sbp: 105, treated: false, smoker: false, diabetes: false }).value, '<1');
});

test('Framingham 2008: SI cholesterol conversion (mmol/L × 38.67) and treated-BP coefficient', () => {
  const d = byId('framingham-2008');
  const tcUnit = d.inputs.find((i) => i.id === 'tc').units.find((u) => u.id === 'mmol');
  near(5.5 * tcUnit.factor, 212.685, 1e-9);
  const base = { sex: 'male', age: 55, tc: 5.5 * 38.67, hdl: 1.3 * 38.67, sbp: 140, treated: false, smoker: false, diabetes: false };
  const treated = Object.assign({}, base, { treated: true });
  assert.ok(Number(run('framingham-2008', treated).value) > Number(run('framingham-2008', base).value));
  near(Number(run('framingham-2008', base).value), framRef(base), 0.051);
});

test('Framingham 2008: band changes exactly where the displayed value crosses 10.0 and 20.0', () => {
  for (let sbp = 100; sbp <= 200; sbp += 0.25) {
    const r = run('framingham-2008', { sex: 'male', age: 60, tc: 220, hdl: 45, sbp, treated: false, smoker: false, diabetes: false });
    const p = Number(r.value);
    assert.equal(r.band, p >= 20 ? 'danger' : p >= 10 ? 'warn' : 'ok', 'SBP ' + sbp + ' -> ' + r.value);
  }
});

test('Framingham 2008 (BMI): matches the published BMI-model coefficients', () => {
  let v = { sex: 'female', age: 61, weight: 64, height: 160, sbp: 124, treated: false, smoker: true, diabetes: false }; // BMI 25.0
  near(framBmiRef(v), 13.4, 0.05);
  assert.equal(run('framingham-2008-bmi', v).value, (Math.round(framBmiRef(v) * 10) / 10).toFixed(1));
  v = { sex: 'male', age: 50, weight: 90, height: 180, sbp: 135, treated: true, smoker: false, diabetes: true };
  assert.equal(run('framingham-2008-bmi', v).value, (Math.round(framBmiRef(v) * 10) / 10).toFixed(1));
  assert.equal(run('framingham-2008-bmi', v).details[0].value, '27.8 kg/m²');
});
