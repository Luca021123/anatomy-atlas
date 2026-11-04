// C1b calculator library: schema, registration and robustness checks for clinician/lib/calcs-acute-care.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FILE = path.join(__dirname, '../../clinician/lib/calcs-acute-care.js');
const defs = require(FILE);
const CATEGORIES = ['Critical care', 'Emergency', 'Respiratory & infection', 'Neurology', 'Gastroenterology', 'Psychiatry', 'Geriatrics', 'Obstetrics & neonatal', 'Sleep'];
const EXPECTED_IDS = ['gcs', 'gcs-paediatric', 'news2', 'qsofa', 'sofa', 'sirs', 'shock-index', 'padua', 'curb-65', 'crb-65', 'psi-port', 'centor', 'mcisaac',
  'ottawa-ankle', 'ottawa-knee', 'canadian-ct-head', 'nexus-c-spine', 'canadian-c-spine', 'pecarn-head', 'abcd2', 'nihss', 'glasgow-blatchford', 'alvarado',
  'phq-9', 'gad-7', 'audit', 'audit-c', 'epds', 'ciwa-ar', 'cows', '4at', 'clinical-frailty-scale', 'bishop', 'apgar', 'stop-bang'];

// Small deterministic PRNG so the fuzz test is reproducible.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function isRequired(inp) { return inp.required != null ? inp.required : ['number', 'radio', 'select'].includes(inp.type); }

test('exports every expected calculator exactly once', () => {
  assert.ok(Array.isArray(defs));
  const ids = defs.map(d => d.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
  assert.deepEqual([...ids].sort(), [...EXPECTED_IDS].sort());
});

test('every definition has the documented schema', () => {
  for (const d of defs) {
    assert.match(d.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, d.id);
    assert.ok(CATEGORIES.includes(d.category), `${d.id}: category ${d.category}`);
    for (const k of ['name', 'summary', 'formula']) assert.ok(typeof d[k] === 'string' && d[k].trim().length > 3, `${d.id}.${k}`);
    assert.ok(Array.isArray(d.keywords) && d.keywords.length >= 3, `${d.id}.keywords`);
    assert.ok(Array.isArray(d.pearls) && d.pearls.length >= 1, `${d.id}.pearls`);
    assert.ok(Array.isArray(d.references) && d.references.length >= 1, `${d.id}.references`);
    for (const r of d.references) {
      assert.ok(typeof r.label === 'string' && r.label.length > 10, `${d.id}: reference label`);
      if (r.url) assert.match(r.url, /^https:\/\//, `${d.id}: reference url`);
    }
    assert.equal(typeof d.compute, 'function');
    assert.doesNotMatch(d.compute.toString(), /\bMT\b|document|window/, `${d.id}: compute must be pure`);
  }
});

test('inputs are well formed (unique ids, labelled options, sane ranges)', () => {
  const TYPES = ['number', 'bool', 'radio', 'select', 'heading', 'note', 'text', 'date', 'time'];
  for (const d of defs) {
    const seen = new Set();
    assert.ok(d.inputs.some(i => i.id), `${d.id}: has inputs`);
    for (const inp of d.inputs) {
      assert.ok(TYPES.includes(inp.type), `${d.id}: type ${inp.type}`);
      if (inp.type === 'heading') { assert.ok(inp.label); continue; }
      if (inp.type === 'note') { assert.ok(inp.text); continue; }
      assert.ok(inp.id && !seen.has(inp.id), `${d.id}: input id ${inp.id}`); seen.add(inp.id);
      assert.ok(typeof inp.label === 'string' && inp.label.length > 1, `${d.id}.${inp.id}: label`);
      if (inp.type === 'radio' || inp.type === 'select') {
        assert.ok(inp.options.length >= 2, `${d.id}.${inp.id}: options`);
        const vals = inp.options.map(o => String(o.value));
        assert.equal(new Set(vals).size, vals.length, `${d.id}.${inp.id}: duplicate option values`);
        for (const o of inp.options) assert.ok(o.label !== undefined && String(o.label).length > 0, `${d.id}.${inp.id}: option label`);
        if (inp.default !== undefined) assert.ok(vals.includes(String(inp.default)), `${d.id}.${inp.id}: default`);
      }
      if (inp.type === 'number') {
        assert.ok(inp.min < inp.max, `${d.id}.${inp.id}: min < max`);
        if (inp.units) {
          const base = inp.units[0];
          assert.ok(base.factor === 1 && !base.toBase, `${d.id}.${inp.id}: first unit is the base unit`);
          for (const u of inp.units) {
            const to = x => u.toBase ? u.toBase(x) : x * u.factor;
            const from = x => u.fromBase ? u.fromBase(x) : x / u.factor;
            for (const x of [inp.min, (inp.min + inp.max) / 2, inp.max]) assert.ok(Math.abs(to(from(x)) - x) < 1e-9, `${d.id}.${inp.id}.${u.id}: round trip`);
          }
        }
      }
    }
  }
});

test('fuzz: random valid inputs always give a complete, well-formed result', () => {
  const rand = rng(20261103);
  for (const d of defs) {
    for (let k = 0; k < 300; k++) {
      const v = {};
      for (const inp of d.inputs) {
        if (!inp.id) continue;
        if (inp.type === 'bool') v[inp.id] = rand() < 0.4;
        else if (inp.type === 'radio' || inp.type === 'select') { if (isRequired(inp) || rand() < 0.7) v[inp.id] = inp.options[Math.floor(rand() * inp.options.length)].value; }
        else if (inp.type === 'number') { if (isRequired(inp) || rand() < 0.5) v[inp.id] = inp.min + rand() * (inp.max - inp.min); }
      }
      const r = d.compute(v);
      if (r === null) continue;
      for (const f of ['value', 'unit', 'label', 'band', 'title', 'interpretation', 'details', 'warnings']) assert.ok(f in r, `${d.id}: field ${f}`);
      assert.ok(['ok', 'warn', 'danger', 'info'].includes(r.band), `${d.id}: band ${r.band}`);
      assert.ok(r.title.length > 3 && r.interpretation.length > 10, `${d.id}: title/interpretation`);
      assert.ok(Array.isArray(r.details) && Array.isArray(r.warnings));
      assert.doesNotMatch(JSON.stringify(r), /undefined|NaN|Infinity/, `${d.id}: ${JSON.stringify(v)}`);
    }
  }
});

test('only the Bishop score returns null, and only when the original score lacks consistency or position', () => {
  const d = defs.find(x => x.id === 'bishop');
  assert.equal(d.compute({ version: 'original', dilation: 1, effacement: 1, station: 1 }), null);
  assert.notEqual(d.compute({ version: 'simplified', dilation: 1, effacement: 1, station: 1 }), null);
});

test('browser registration appends to self.MTCalcs without replacing other packages', () => {
  const src = fs.readFileSync(FILE, 'utf8');
  const ctx = { self: { MTCalcs: [{ id: 'other-package-calc', name: 'Other' }] } };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  assert.equal(ctx.self.MTCalcs.length, EXPECTED_IDS.length + 1);
  assert.equal(ctx.self.MTCalcs[0].id, 'other-package-calc');
  const fresh = { self: {} };
  vm.createContext(fresh);
  vm.runInContext(src, fresh);
  assert.equal(fresh.self.MTCalcs.length, EXPECTED_IDS.length);
});

test('copyright-restricted instruments are not reproduced verbatim', () => {
  const src = fs.readFileSync(FILE, 'utf8');
  // EPDS item stems (Cox 1987) must not appear: the RCPsych requires permission for republication.
  for (const phrase of ['able to laugh and see the funny side', 'looked forward with enjoyment', 'blamed myself unnecessarily', 'The thought of harming myself']) {
    assert.ok(!src.includes(phrase), `EPDS text found: ${phrase}`);
  }
});
