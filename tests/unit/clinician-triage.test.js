// SATS adult TEWS and priority decisions. Bands per Gottschalk 2006 / EMSSA SATS manual 2012.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../../clinician/lib/triage.js');

test('respiratory rate bands', () => {
  const m = [[0, 2], [8, 2], [9, 0], [14, 0], [15, 1], [20, 1], [21, 2], [29, 2], [30, 3], [45, 3]];
  m.forEach(([v, s]) => assert.equal(T.scoreRR(v), s, 'RR ' + v));
});
test('heart rate bands', () => {
  const m = [[30, 2], [40, 2], [41, 1], [50, 1], [51, 0], [100, 0], [101, 1], [110, 1], [111, 2], [129, 2], [130, 3], [180, 3]];
  m.forEach(([v, s]) => assert.equal(T.scoreHR(v), s, 'HR ' + v));
});
test('systolic BP bands', () => {
  const m = [[60, 3], [70, 3], [71, 2], [80, 2], [81, 1], [100, 1], [101, 0], [199, 0], [200, 2], [240, 2]];
  m.forEach(([v, s]) => assert.equal(T.scoreSBP(v), s, 'SBP ' + v));
});
test('temperature, AVPU, mobility, trauma', () => {
  assert.equal(T.scoreTemp(34.9), 2); assert.equal(T.scoreTemp(35), 0); assert.equal(T.scoreTemp(38.4), 0); assert.equal(T.scoreTemp(38.5), 2);
  assert.deepEqual(['A', 'V', 'P', 'U'].map(T.scoreAVPU), [0, 1, 2, 3]);
  assert.deepEqual(['walking', 'help', 'stretcher'].map(T.scoreMobility), [0, 1, 2]);
  assert.equal(T.scoreTrauma(true), 1); assert.equal(T.scoreTrauma(false), 0);
});
test('invalid inputs give null, not 0', () => {
  assert.equal(T.scoreRR(NaN), null); assert.equal(T.scoreHR(undefined), null); assert.equal(T.scoreAVPU('X'), null);
  assert.equal(T.scoreSBP(-5), null); assert.equal(T.scoreTemp(3), null);
});
test('TEWS total and completeness', () => {
  const normal = { mobility: 'walking', rr: 16, hr: 80, sbp: 120, temp: 36.8, avpu: 'A', trauma: false };
  const t = T.tews(normal);
  assert.equal(t.total, 1); assert.equal(t.complete, true);   // RR 16 = 1
  const partial = T.tews({ rr: 35, hr: 140 });
  assert.equal(partial.total, 6); assert.equal(partial.complete, false);
  assert.ok(partial.missing.includes('sbp'));
});
test('TEWS total to colour', () => {
  const m = [[0, 'green'], [2, 'green'], [3, 'yellow'], [4, 'yellow'], [5, 'orange'], [6, 'orange'], [7, 'red'], [14, 'red']];
  m.forEach(([v, c]) => assert.equal(T.colourFromTews(v), c, 'TEWS ' + v));
});
test('priority: TEWS only', () => {
  const sick = T.tews({ mobility: 'stretcher', rr: 32, hr: 135, sbp: 75, temp: 39, avpu: 'V', trauma: false });
  assert.equal(sick.total, 2 + 3 + 3 + 2 + 2 + 1 + 0);
  const p = T.priority({ tews: sick });
  assert.equal(p.colour, 'red'); assert.equal(p.targetMin, 0);
  const well = T.priority({ tews: T.tews({ mobility: 'walking', rr: 12, hr: 70, sbp: 120, temp: 36.5, avpu: 'A', trauma: false }) });
  assert.equal(well.colour, 'green'); assert.equal(well.targetMin, 240);
});
test('priority: discriminators override a low TEWS upwards only', () => {
  const low = T.tews({ mobility: 'walking', rr: 12, hr: 70, sbp: 120, temp: 36.5, avpu: 'A', trauma: false });
  assert.equal(T.priority({ tews: low, urgent: ['abd-pain'] }).colour, 'yellow');
  assert.equal(T.priority({ tews: low, urgent: ['abd-pain'] }).targetMin, 60);
  assert.equal(T.priority({ tews: low, urgent: ['abd-pain'], veryUrgent: ['chest-pain'] }).colour, 'orange');
  assert.equal(T.priority({ tews: low, veryUrgent: ['chest-pain'] }).targetMin, 10);
  assert.equal(T.priority({ tews: low, emergency: ['airway'], urgent: ['abd-pain'] }).colour, 'red');
  // a yellow discriminator never lowers a red TEWS
  const high = T.tews({ mobility: 'stretcher', rr: 35, hr: 140, sbp: 65, temp: 35, avpu: 'P', trauma: true });
  assert.equal(T.priority({ tews: high, urgent: ['abd-pain'] }).colour, 'red');
});
test('priority: emergency sign needs no TEWS', () => {
  const p = T.priority({ emergency: ['seizure-now'] });
  assert.equal(p.colour, 'red'); assert.equal(p.targetText, 'Immediately');
});
test('priority: unknown ids are ignored', () => {
  assert.equal(T.priority({ emergency: ['nonsense'] }).colour, 'green');
});
test('priority: senior override needs a reason', () => {
  const low = T.tews({ mobility: 'walking', rr: 12, hr: 70, sbp: 120, temp: 36.5, avpu: 'A', trauma: false });
  assert.equal(T.priority({ tews: low, override: { colour: 'orange', reason: '' } }).colour, 'green');
  const p = T.priority({ tews: low, override: { colour: 'orange', reason: 'Looks unwell, sepsis concern' } });
  assert.equal(p.colour, 'orange'); assert.equal(p.overridden, true); assert.equal(p.computed, 'green');
  assert.ok(p.basis.some(b => /override/i.test(b)));
});
test('dead patient is blue', () => { assert.equal(T.priority({ dead: true }).colour, 'blue'); });
test('age group', () => {
  assert.equal(T.ageGroup(13), 'adult'); assert.equal(T.ageGroup(12), 'child'); assert.equal(T.ageGroup(undefined, 160), 'adult'); assert.equal(T.ageGroup(undefined, 140), 'child');
  assert.equal(T.ageGroup(), 'unknown');
});
test('discriminator ids are unique', () => {
  const ids = [].concat(T.EMERGENCY, T.VERY_URGENT, T.URGENT).map(x => x.id);
  assert.equal(new Set(ids).size, ids.length);
});
