// C1b neurology and gastroenterology calculators: ABCD², NIHSS, Glasgow–Blatchford, Alvarado.
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
function toBase(id, inputId, unitId, x) {
  const u = byId(id).inputs.find(i => i.id === inputId).units.find(u => u.id === unitId);
  return u.toBase ? u.toBase(x) : x * u.factor;
}
const detail = (r, label) => { const d = r.details.find(x => typeof x === 'object' && x.label.startsWith(label)); return d && d.value; };

/* ---------------- ABCD² ---------------- */
test('ABCD²: 0–3 low (1.0%), 4–5 moderate (4.1%), 6–7 high (8.1%)', () => {
  const a = vals => run('abcd2', Object.assign({ clinical: 'other', duration: 'short' }, vals));
  const zero = a({}); assert.equal(zero.value, 0); assert.match(zero.title, /1\.0%/); assert.match(zero.interpretation, /NG128/);
  assert.equal(a({ age: true, bp: true, diabetes: true }).value, 3);
  assert.match(a({ age: true, bp: true, diabetes: true }).title, /Low/);
  const four = a({ clinical: 'weakness', age: true, bp: true }); assert.equal(four.value, 4); assert.equal(four.band, 'warn'); assert.match(four.title, /4\.1%/);
  assert.equal(a({ clinical: 'speech', duration: 'mid', age: true, bp: true, diabetes: true }).value, 5);
  const six = a({ clinical: 'weakness', duration: 'long', age: true, bp: true }); assert.equal(six.value, 6); assert.equal(six.band, 'danger'); assert.match(six.title, /8\.1%/);
  assert.equal(a({ clinical: 'weakness', duration: 'long', age: true, bp: true, diabetes: true }).value, 7);
  assert.ok(zero.warnings.some(w => /acute stroke/.test(w)));
});

/* ---------------- NIHSS ---------------- */
const NIH_ITEMS = ['loc', 'locQ', 'locC', 'gaze', 'visual', 'face', 'armL', 'armR', 'legL', 'legR', 'ataxia', 'sensory', 'language', 'dysarthria', 'neglect'];
const nihZero = () => Object.fromEntries(NIH_ITEMS.map(k => [k, 0]));
test('NIHSS: 15 items with official maxima; 0 and 42', () => {
  const d = byId('nihss');
  assert.equal(d.inputs.filter(i => i.type === 'radio').length, 15);
  const max = {};
  for (const k of NIH_ITEMS) max[k] = Math.max(...d.inputs.find(i => i.id === k).options.filter(o => typeof o.value === 'number').map(o => o.value));
  assert.deepEqual(Object.values(max), [3, 2, 2, 2, 3, 3, 4, 4, 4, 4, 2, 2, 3, 2, 2]);
  const zero = run('nihss', nihZero()); assert.equal(zero.value, 0); assert.equal(zero.band, 'ok');
  const top = run('nihss', max); assert.equal(top.value, 42); assert.match(top.title, /Severe stroke \(21–42\)/);
  assert.match(d.inputs.find(i => i.id === 'loc').options[0].label, /Alert; keenly responsive/);
});

test('NIHSS: severity boundaries 4/5, 15/16, 20/21', () => {
  const s = over => run('nihss', Object.assign(nihZero(), over));
  assert.match(s({ armL: 4 }).title, /Minor/);                                  // 4
  assert.match(s({ armL: 4, face: 1 }).title, /Moderate stroke \(5–15\)/);        // 5
  assert.match(s({ armL: 4, legL: 4, face: 3, language: 3, gaze: 1 }).title, /Moderate stroke/); // 15
  assert.match(s({ armL: 4, legL: 4, face: 3, language: 3, gaze: 2 }).title, /Moderate to severe/); // 16
  assert.match(s({ armL: 4, legL: 4, face: 3, language: 3, gaze: 2, visual: 2, sensory: 2 }).title, /Moderate to severe/); // 20
  const sev = s({ armL: 4, legL: 4, face: 3, language: 3, gaze: 2, visual: 2, sensory: 2, neglect: 1 }); // 21
  assert.equal(sev.value, 21); assert.match(sev.title, /Severe stroke/);
});

test('NIHSS: untestable (UN) items count 0 and trigger a warning', () => {
  const r = run('nihss', Object.assign(nihZero(), { armR: 'UN', dysarthria: 'UN', legL: 2 }));
  assert.equal(r.value, 2);
  assert.ok(r.warnings.some(w => /5b, 10/.test(w)));
});

/* ---------------- Glasgow–Blatchford ---------------- */
const GBS_BASE = { urea: 5, hb: 140, sex: 'male', sbp: 120 };
const gbs = over => run('glasgow-blatchford', Object.assign({}, GBS_BASE, over));
test('Glasgow–Blatchford: 0 and 1 very low risk; 2 or more not low risk; maximum 23', () => {
  const zero = gbs({}); assert.equal(zero.value, 0); assert.equal(zero.band, 'ok'); assert.match(zero.interpretation, /CG141/);
  const one = gbs({ melaena: true }); assert.equal(one.value, 1); assert.equal(one.band, 'ok'); assert.match(one.interpretation, /ESGE/);
  const two = gbs({ syncope: true }); assert.equal(two.value, 2); assert.equal(two.band, 'warn');
  const max = gbs({ urea: 30, hb: 90, sbp: 80, pulse: true, melaena: true, syncope: true, hepatic: true, cardiac: true });
  assert.equal(max.value, 23); assert.equal(max.band, 'danger'); assert.ok(max.warnings.length);
});

test('Glasgow–Blatchford: urea bands (and BUN conversion)', () => {
  for (const [urea, s] of [[6.4, 0], [6.5, 2], [7.9, 2], [8.0, 3], [9.9, 3], [10.0, 4], [24.9, 4], [25, 6]]) assert.equal(gbs({ urea }).value, s, 'urea ' + urea);
  assert.equal(gbs({ urea: toBase('glasgow-blatchford', 'urea', 'bun', 18.2) }).value, 2); // = 6.5 mmol/L
  assert.equal(gbs({ urea: toBase('glasgow-blatchford', 'urea', 'bun', 18.1) }).value, 0);
  assert.equal(gbs({ urea: toBase('glasgow-blatchford', 'urea', 'bun', 28) }).value, 4);   // = 10 mmol/L
  assert.equal(gbs({ urea: toBase('glasgow-blatchford', 'urea', 'bun', 70) }).value, 6);   // = 25 mmol/L
});

test('Glasgow–Blatchford: haemoglobin bands by sex (g/L and g/dL)', () => {
  for (const [hb, s] of [[130, 0], [129, 1], [120, 1], [119, 3], [100, 3], [99, 6]]) assert.equal(gbs({ hb }).value, s, 'male Hb ' + hb);
  for (const [hb, s] of [[120, 0], [119, 1], [100, 1], [99, 6]]) assert.equal(gbs({ hb, sex: 'female' }).value, s, 'female Hb ' + hb);
  assert.equal(gbs({ hb: toBase('glasgow-blatchford', 'hb', 'gdl', 11.9), sex: 'female' }).value, 1);
  assert.equal(gbs({ hb: toBase('glasgow-blatchford', 'hb', 'gdl', 12.0) }).value, 1);
});

test('Glasgow–Blatchford: systolic BP bands and other markers', () => {
  for (const [sbp, s] of [[110, 0], [109, 1], [100, 1], [99, 2], [90, 2], [89, 3]]) assert.equal(gbs({ sbp }).value, s, 'SBP ' + sbp);
  assert.equal(gbs({ pulse: true }).value, 1);
  assert.equal(gbs({ hepatic: true }).value, 2);
  assert.equal(gbs({ cardiac: true }).value, 2);
});

/* ---------------- Alvarado ---------------- */
test('Alvarado: 0–4 low, 5–6 compatible, 7–8 probable, 9–10 very probable', () => {
  const a = vals => run('alvarado', vals);
  assert.equal(a({}).value, 0);
  const four = a({ tenderness: true, wbc: true }); assert.equal(four.value, 4); assert.equal(four.band, 'ok');
  const five = a({ tenderness: true, wbc: true, fever: true }); assert.equal(five.value, 5); assert.equal(five.band, 'warn');
  assert.equal(a({ tenderness: true, wbc: true, fever: true, rebound: true }).band, 'warn'); // 6
  const seven = a({ tenderness: true, wbc: true, fever: true, rebound: true, shift: true }); assert.equal(seven.value, 7); assert.match(seven.title, /probable/);
  const nine = a({ tenderness: true, wbc: true, fever: true, rebound: true, shift: true, migration: true, anorexia: true }); assert.equal(nine.value, 9); assert.match(nine.title, /Very high/);
  const ten = a({ tenderness: true, wbc: true, fever: true, rebound: true, shift: true, migration: true, anorexia: true, nausea: true }); assert.equal(ten.value, 10);
});
