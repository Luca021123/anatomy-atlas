'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../../student/data/clinical-skills.js');

test('OSCE stations: at least 24, complete, unique ids', () => {
  assert.ok(D.stations.length >= 24);
  const ids = new Set();
  const types = {};
  for (const s of D.stations) {
    assert.ok(!ids.has(s.id), 'duplicate id ' + s.id); ids.add(s.id);
    types[s.type] = (types[s.type] || 0) + 1;
    assert.ok(['history', 'exam', 'comms', 'skills'].includes(s.type), s.id);
    for (const k of ['title', 'candidate', 'setting']) assert.ok(typeof s[k] === 'string' && s[k].length > 5, s.id + ' ' + k);
    assert.ok([5, 6, 8, 10].includes(s.mins), s.id + ' mins');
    assert.ok(s.groups.length >= 2);
    const n = s.groups.reduce((a, g) => a + g.items.length, 0);
    assert.ok(n >= 10 && n <= 30, s.id + ' checklist length ' + n);
    s.groups.forEach(g => { assert.ok(g.title); g.items.forEach(i => assert.ok(typeof i === 'string' && i.length > 8)); });
    assert.ok(s.patient && s.patient.who && s.patient.opening, s.id + ' patient');
    assert.ok(s.approach.length >= 3 && s.pitfalls.length >= 3, s.id + ' approach/pitfalls');
  }
  assert.ok(types.history >= 11 && types.exam >= 11 && types.comms >= 5 && types.skills >= 3, JSON.stringify(types));
});

test('required stations from the brief exist', () => {
  const need = ['chest', 'breath', 'abdo', 'headache', 'syncope', 'cough', 'diarrhoea', 'back', 'joint', 'mood', 'febrile', 'cvs', 'resp', 'cranial', 'upper', 'lower', 'thyroid', 'knee', 'hip', 'shoulder', 'spine', 'spikes', 'consent', 'medication', 'smoking', 'angry', 'hand', 'bp', 'bls'];
  for (const n of need) assert.ok(D.stations.some(s => s.id.includes(n)), 'missing station ' + n);
  const suicide = D.stations.find(s => s.id === 'hx-low-mood');
  assert.ok(suicide.groups.some(g => /suicide/i.test(g.title)));
});

test('presenting complaints: at least 30 with can’t-miss, common and investigations', () => {
  assert.ok(D.complaints.length >= 30);
  const ids = new Set();
  for (const c of D.complaints) {
    assert.ok(!ids.has(c.id)); ids.add(c.id);
    assert.ok(c.ask.length >= 3 && c.redFlags.length >= 2 && c.firstLine.length > 20, c.id);
    assert.ok(c.dx.length >= 5, c.id + ' dx count');
    assert.ok(c.dx.some(d => d.type === 'm'), c.id + ' needs can’t-miss');
    assert.ok(c.dx.some(d => d.type === 'c'), c.id + ' needs common');
    for (const d of c.dx) {
      assert.ok(['m', 'c', 'u'].includes(d.type), c.id + ' ' + d.name);
      assert.ok(d.name && d.features && d.ix, c.id + ' ' + d.name);
    }
    assert.equal(new Set(c.dx.map(d => d.name)).size, c.dx.length, c.id + ' duplicate dx names');
  }
});

test('illness scripts have three parts and belong to a listed diagnosis', () => {
  const names = new Set();
  D.complaints.forEach(c => c.dx.forEach(d => names.add(d.name)));
  const keys = Object.keys(D.scripts);
  assert.ok(keys.length >= 40);
  for (const k of keys) {
    assert.equal(D.scripts[k].length, 3, k);
    D.scripts[k].forEach(p => assert.ok(p.length > 20, k));
    assert.ok(names.has(k), 'script without diagnosis: ' + k);
  }
});

test('frameworks include SOCRATES, systems review, PMH/DH/FH/SH and ICE', () => {
  const ids = D.frameworks.map(f => f.id);
  for (const id of ['socrates', 'systems', 'pmh', 'ice']) assert.ok(ids.includes(id), id);
  assert.equal(D.frameworks.find(f => f.id === 'socrates').items.length, 8);
});

test('lab reference values: unique ids, sane ranges, conversions', () => {
  const ids = new Set();
  const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, a + ' vs ' + b);
  for (const t of D.labs) {
    assert.ok(!ids.has(t.id), 'dup ' + t.id); ids.add(t.id);
    assert.ok(t.name && t.group && 'unit' in t && t.convUnit !== undefined, t.id);
    if (!t.up && !t.lowOnly) assert.ok(t.lo < t.hi, t.id);
    if (t.sex) for (const k of ['M', 'F']) assert.ok(t.sex[k], t.id);
    assert.ok(t.k > 0, t.id);
  }
  const g = id => D.labs.find(t => t.id.includes(id));
  near(g('glucose').lo * g('glucose').k, 70, 1); near(g('glucose').hi * g('glucose').k, 99, 1);        // fasting 3.9–5.5 mmol/L = 70–99 mg/dL
  near(g('calcium').lo * g('calcium').k, 8.8, 0.05); near(g('calcium').hi * g('calcium').k, 10.4, 0.05);
  near(g('creatinine').sex.M[1] * g('creatinine').k, 1.24, 0.02);
  near(g('urea').hi * g('urea').k, 21.8, 0.2);                                                      // BUN 21.8 mg/dL
  near(1 * g('lactate-venous').k, 9.01, 0.01);
  near(5.0 * g('total-cholesterol').k, 193.4, 0.2);
  near(1.7 * g('triglycerides').k, 150.6, 0.2);
  assert.ok(D.labs.length >= 60);
  for (const grp of ['Chemistry', 'Haematology', 'Arterial blood gas', 'Liver and pancreas', 'Thyroid and endocrine', 'Lipids and cardiac', 'Coagulation', 'Urine']) assert.ok(D.labs.some(t => t.group === grp), grp);
});
