// C1b respiratory/infection and emergency decision rules: CURB-65, CRB-65, PSI, Centor, McIsaac,
// Ottawa ankle and knee, Canadian CT Head, NEXUS, Canadian C-Spine, PECARN.
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
const allTrue = (id, except = []) => { const o = {}; for (const i of byId(id).inputs) if (i.type === 'bool' && !except.includes(i.id)) o[i.id] = true; return o; };

/* ---------------- CURB-65 / CRB-65 ---------------- */
test('CURB-65: NICE risk groups 0–1 low, 2 intermediate, 3–5 high', () => {
  const c = vals => run('curb-65', vals);
  assert.equal(c({}).value, 0); assert.equal(c({}).band, 'ok'); assert.match(c({}).title, /below 3%/);
  assert.equal(c({ age: true }).band, 'ok');
  const two = c({ age: true, urea: true }); assert.equal(two.value, 2); assert.equal(two.band, 'warn'); assert.match(two.title, /3–15%/);
  const three = c({ age: true, urea: true, rr: true }); assert.equal(three.value, 3); assert.equal(three.band, 'danger'); assert.match(three.title, /above 15%/);
  const five = c(allTrue('curb-65')); assert.equal(five.value, 5); assert.equal(five.band, 'danger');
});

test('CRB-65: 0 low (<1%), 1–2 intermediate (1–10%), 3–4 high (>10%)', () => {
  const c = vals => run('crb-65', vals);
  assert.ok(!byId('crb-65').inputs.some(i => i.id === 'urea'));
  assert.equal(c({}).band, 'ok'); assert.match(c({}).title, /below 1%/);
  assert.equal(c({ confusion: true }).band, 'warn');
  assert.equal(c({ confusion: true, bp: true }).value, 2); assert.equal(c({ confusion: true, bp: true }).band, 'warn');
  const three = c({ confusion: true, bp: true, rr: true }); assert.equal(three.band, 'danger'); assert.match(three.title, /above 10%/);
  assert.equal(c(allTrue('crb-65')).value, 4);
});

/* ---------------- PSI / PORT ---------------- */
test('PSI: class I requires age ≤50 and no comorbidity or examination abnormality', () => {
  const a = run('psi-port', { age: 45, sex: 'male' }); assert.equal(a.value, 'I'); assert.equal(a.band, 'ok');
  assert.equal(run('psi-port', { age: 50, sex: 'female' }).value, 'I');
  assert.equal(run('psi-port', { age: 51, sex: 'male' }).value, 'II');
  const ams = run('psi-port', { age: 30, sex: 'male', ams: true }); assert.equal(ams.value, 'II'); assert.match(ams.title, /50 points/);
  const labs = run('psi-port', { age: 40, sex: 'male', ph: true }); assert.equal(labs.value, 'I');
  assert.ok(labs.warnings.some(w => /laboratory/.test(w)));
});

test('PSI: female age −10 and point boundaries 70/71, 90/91, 130/131', () => {
  const f = run('psi-port', { age: 45, sex: 'female', neoplastic: true }); // 35 + 30
  assert.equal(f.value, 'II'); assert.match(f.title, /65 points/);
  assert.equal(run('psi-port', { age: 70, sex: 'male' }).value, 'II');
  const iii = run('psi-port', { age: 71, sex: 'male' }); assert.equal(iii.value, 'III'); assert.equal(iii.band, 'warn');
  assert.equal(run('psi-port', { age: 90, sex: 'male' }).value, 'III');
  const iv = run('psi-port', { age: 91, sex: 'male' }); assert.equal(iv.value, 'IV'); assert.equal(iv.band, 'danger');
  assert.equal(run('psi-port', { age: 80, sex: 'male', ams: true, rr: true, pulse: true }).value, 'IV');   // 130
  const v = run('psi-port', { age: 81, sex: 'male', ams: true, rr: true, pulse: true });                    // 131
  assert.equal(v.value, 'V'); assert.match(v.interpretation, /27/);
  assert.equal(run('psi-port', { age: 81, sex: 'female', nursing: true, ams: true, rr: true, pulse: true }).value, 'V'); // 71+10+50 = 131
});

test('PSI: every item carries its published weight (worked example)', () => {
  // 70-year-old woman from a nursing home with CHF, RR 32, pH 7.30, urea 12 mmol/L, pleural effusion:
  // 60 + 10 + 10 + 20 + 30 + 20 + 10 = 160 -> class V.
  const r = run('psi-port', { age: 70, sex: 'female', nursing: true, chf: true, rr: true, ph: true, bun: true, effusion: true });
  assert.equal(r.value, 'V'); assert.match(r.title, /160 points/);
  // Every item ticked adds 295 points to age: 100 + 295 = 395.
  const max = run('psi-port', Object.assign({ age: 100, sex: 'male' }, allTrue('psi-port')));
  assert.equal(max.value, 'V'); assert.match(max.title, /395 points/);
});

/* ---------------- Centor / McIsaac ---------------- */
test('Centor: 0–2 no antibiotic (NICE), 3–4 consider antibiotic', () => {
  assert.equal(run('centor', {}).value, 0);
  const two = run('centor', { fever: true, nocough: true }); assert.equal(two.band, 'ok'); assert.match(two.interpretation, /do not offer an antibiotic/);
  const three = run('centor', { fever: true, nocough: true, exudate: true }); assert.equal(three.band, 'warn'); assert.match(three.interpretation, /32–56%/);
  assert.equal(run('centor', allTrue('centor')).value, 4);
});

test('McIsaac: age adjustment and probability bands from −1 to 5', () => {
  const m = vals => run('mcisaac', vals);
  const neg = m({ age: 'older' }); assert.equal(neg.value, -1); assert.match(neg.title, /0 or less/);
  assert.match(m({ age: 'adult' }).title, /0 or less/);
  const one = m({ age: 'adult', temp: true }); assert.equal(one.value, 1); assert.equal(one.band, 'ok'); assert.match(one.title, /5–10%/);
  const two = m({ age: 'child', temp: true }); assert.equal(two.value, 2); assert.equal(two.band, 'warn'); assert.match(two.title, /11–17%/);
  assert.match(m({ age: 'adult', temp: true, nocough: true, nodes: true }).title, /28–35%/);
  const four = m({ age: 'adult', temp: true, nocough: true, nodes: true, tonsils: true }); assert.equal(four.value, 4); assert.equal(four.band, 'danger');
  const five = m({ age: 'child', temp: true, nocough: true, nodes: true, tonsils: true }); assert.equal(five.value, 5); assert.match(five.title, /51–53%/);
  assert.equal(m({ age: 'older', temp: true, nocough: true, nodes: true, tonsils: true }).value, 3);
});

/* ---------------- Ottawa ankle and knee ---------------- */
test('Ottawa ankle and foot rules: zone pain plus a criterion triggers the matching series', () => {
  const o = vals => run('ottawa-ankle', vals);
  assert.equal(o({}).band, 'ok');
  assert.match(o({ anklePain: true }).title, /No X-ray/);
  assert.match(o({ anklePain: true, lateral: true }).title, /^Ankle X-ray/);
  assert.match(o({ anklePain: true, medial: true }).title, /^Ankle X-ray/);
  assert.match(o({ anklePain: true, nwb: true }).title, /^Ankle X-ray/);
  assert.match(o({ footPain: true, mt5: true }).title, /^Foot X-ray/);
  assert.match(o({ footPain: true, navicular: true }).title, /^Foot X-ray/);
  assert.match(o({ anklePain: true, footPain: true, nwb: true }).title, /Ankle and foot/);
  const odd = o({ lateral: true }); assert.equal(odd.band, 'ok'); assert.ok(odd.warnings.length);
});

test('Ottawa knee rule: any one criterion indicates an X-ray', () => {
  assert.equal(run('ottawa-knee', {}).band, 'ok');
  for (const id of ['age55', 'patella', 'fibula', 'flex', 'nwb']) {
    const r = run('ottawa-knee', { [id]: true }); assert.equal(r.band, 'warn', id); assert.match(r.title, /X-ray indicated/);
  }
});

/* ---------------- Canadian CT Head Rule ---------------- */
test('Canadian CT Head Rule: exclusions, high-risk and medium-risk factors', () => {
  const c = vals => run('canadian-ct-head', vals);
  assert.match(c({}).title, /CT not required/); assert.equal(c({}).band, 'ok');
  const ex = c({ xAnticoag: true, vomit: true }); assert.equal(ex.band, 'info'); assert.match(ex.title, /does not apply/);
  for (const id of ['gcs2h', 'skull', 'basal', 'vomit', 'age65']) { const r = c({ [id]: true }); assert.equal(r.band, 'danger', id); assert.match(r.title, /high risk/); }
  for (const id of ['amnesia', 'mechanism']) { const r = c({ [id]: true }); assert.equal(r.band, 'warn', id); assert.match(r.title, /medium risk/); }
  assert.equal(c({ amnesia: true, age65: true }).band, 'danger');
});

/* ---------------- NEXUS ---------------- */
test('NEXUS: all five criteria absent = low risk; any present = imaging', () => {
  assert.equal(run('nexus-c-spine', {}).band, 'ok');
  for (const id of ['tender', 'intox', 'alert', 'focal', 'distract']) assert.equal(run('nexus-c-spine', { [id]: true }).band, 'warn', id);
});

/* ---------------- Canadian C-Spine Rule ---------------- */
test('Canadian C-Spine Rule: three-step algorithm', () => {
  const c = vals => run('canadian-c-spine', vals);
  assert.match(c({ xGcs: true, age65: true }).title, /does not apply/);
  for (const id of ['age65', 'mechanism', 'paraesthesia']) assert.match(c({ [id]: true, sitting: true, rotate: 'yes' }).title, /high-risk/, id);
  assert.match(c({}).title, /no low-risk factor/);
  for (const id of ['rearEnd', 'sitting', 'ambulatory', 'delayed', 'noMidline']) {
    const ok = c({ [id]: true, rotate: 'yes' }); assert.equal(ok.band, 'ok', id); assert.match(ok.title, /No imaging/);
  }
  assert.match(c({ sitting: true, rotate: 'no' }).title, /unable to rotate/);
  const pending = c({ sitting: true }); assert.equal(pending.band, 'info'); assert.match(pending.title, /rotation/);
});

/* ---------------- PECARN ---------------- */
test('PECARN under 2 years: high risk, intermediate and very low risk', () => {
  const p = vals => run('pecarn-head', Object.assign({ age: 'under2' }, vals));
  const none = p({}); assert.equal(none.band, 'ok'); assert.match(none.interpretation, /0\.02%/);
  for (const id of ['ams', 'skullFx']) { const r = p({ [id]: true }); assert.equal(r.band, 'danger'); assert.match(r.interpretation, /4\.4%/); }
  for (const id of ['haematoma', 'loc5', 'mechanism', 'notNormal']) { const r = p({ [id]: true }); assert.equal(r.band, 'warn', id); assert.match(r.interpretation, /0\.9%.*3 months/); }
  const misplaced = p({ vomiting: true }); assert.equal(misplaced.band, 'ok'); assert.ok(misplaced.warnings.some(w => /History of vomiting/.test(w)));
});

test('PECARN 2 years and older: high risk, intermediate and very low risk', () => {
  const p = vals => run('pecarn-head', Object.assign({ age: 'over2' }, vals));
  const none = p({}); assert.equal(none.band, 'ok'); assert.match(none.interpretation, /0\.05%/);
  for (const id of ['ams', 'basilar']) { const r = p({ [id]: true }); assert.equal(r.band, 'danger'); assert.match(r.interpretation, /4\.3%/); }
  for (const id of ['loc', 'vomiting', 'mechanism', 'headache']) { const r = p({ [id]: true }); assert.equal(r.band, 'warn', id); assert.doesNotMatch(r.interpretation, /3 months/); }
  const misplaced = p({ skullFx: true }); assert.equal(misplaced.band, 'ok'); assert.ok(misplaced.warnings.some(w => /Palpable skull fracture/.test(w)));
});
