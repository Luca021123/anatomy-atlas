// Resuscitation session logic (ERC/AHA 2025 ALS) and note formatting.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../clinician/tools/resus.js');
const N = require('../../clinician/tools/notes.js');

const T0 = 1_700_000_000_000;
const min = m => m * 60000;

test('mm:ss formatting and parsing', () => {
  assert.equal(R.mmss(0), '0:00'); assert.equal(R.mmss(125000), '2:05'); assert.equal(R.mmss(3725000), '1:02:05');
  assert.equal(R.parseMmss('12:30'), 750000); assert.equal(R.parseMmss('3'), 180000); assert.equal(R.parseMmss('x'), null);
});
test('adult doses', () => {
  const d = R.doses('adult');
  assert.match(d.adrenaline, /^1 mg/); assert.match(d.amio1, /^300 mg/); assert.match(d.amio2, /^150 mg/);
});
test('paediatric doses scale with weight and respect caps', () => {
  const d = R.doses('paeds', 20);
  assert.equal(d.shockJ, 80); assert.match(d.adrenaline, /^200 microgram/); assert.match(d.adrenaline, /2 mL of 1:10 000/);
  assert.match(d.amio1, /^100 mg/);
  const big = R.doses('paeds', 80);
  assert.match(big.adrenaline, /^800 microgram/);
  const huge = R.doses('paeds', 120);
  assert.match(huge.adrenaline, /^1000 microgram/); assert.match(huge.amio1, /^300 mg/);
  assert.equal(R.doses('paeds', 0).ok, false);
  assert.equal(R.doses('paeds', 3.5).shockJ, 14);
});
test('APLS weight estimate', () => {
  assert.equal(R.estimateWeight(1), 10); assert.equal(R.estimateWeight(5), 18); assert.equal(R.estimateWeight(6), 25); assert.equal(R.estimateWeight(10), 37);
  assert.equal(R.estimateWeight(0), null); assert.equal(R.estimateWeight(13), null);
});
test('new session logs start and has a 2 minute cycle', () => {
  const s = R.newSession('adult', null, T0);
  assert.equal(s.log.length, 1); assert.equal(s.log[0].kind, 'start');
  assert.equal(R.cycle(s, T0 + 119000).overdue, false); assert.equal(R.cycle(s, T0 + 120000).overdue, true);
  assert.equal(R.cycle(s, T0 + 30000).remainingMs, 90000);
});
test('adrenaline: non-shockable → immediately; then every 3–5 min', () => {
  const s = R.newSession('adult', null, T0);
  assert.equal(R.adrenalineStatus(s, T0).state, 'wait');           // rhythm not yet chosen
  R.setRhythm(s, 'nonshockable', T0 + 1000);
  assert.equal(R.adrenalineStatus(s, T0 + 2000).state, 'due');
  R.giveAdrenaline(s, T0 + 30000);
  assert.equal(R.adrenalineStatus(s, T0 + 30000 + min(2)).state, 'wait');
  assert.equal(R.adrenalineStatus(s, T0 + 30000 + min(3)).state, 'due');
  assert.equal(R.adrenalineStatus(s, T0 + 30000 + min(5)).state, 'due');
  assert.equal(R.adrenalineStatus(s, T0 + 30000 + min(5) + 1000).state, 'overdue');
});
test('adrenaline: shockable → only after the 3rd shock', () => {
  const s = R.newSession('adult', null, T0);
  R.setRhythm(s, 'shockable', T0);
  R.giveShock(s, T0 + 1000); R.giveShock(s, T0 + min(2));
  assert.equal(R.adrenalineStatus(s, T0 + min(2)).state, 'wait');
  R.giveShock(s, T0 + min(4));
  assert.equal(R.adrenalineStatus(s, T0 + min(4)).state, 'due');
  assert.equal(s.shocks, 3);
});
test('amiodarone: 300 mg after 3rd shock, 150 mg after 5th, shockable only', () => {
  const s = R.newSession('adult', null, T0);
  R.setRhythm(s, 'shockable', T0);
  for (let i = 0; i < 2; i++) R.giveShock(s, T0 + min(i * 2));
  assert.equal(R.amiodaroneStatus(s).state, 'wait');
  R.giveShock(s, T0 + min(4));
  let a = R.amiodaroneStatus(s); assert.equal(a.state, 'due'); assert.match(a.dose, /300 mg/);
  R.giveAmiodarone(s, T0 + min(4) + 5000);
  assert.equal(R.amiodaroneStatus(s).state, 'wait');
  R.giveShock(s, T0 + min(6)); R.giveShock(s, T0 + min(8));
  a = R.amiodaroneStatus(s); assert.equal(a.state, 'due'); assert.match(a.dose, /150 mg/);
  R.giveAmiodarone(s, T0 + min(8) + 1000);
  assert.equal(R.amiodaroneStatus(s).state, 'done');
  // rhythm no longer shockable → no first-dose prompt
  const t = R.newSession('adult', null, T0); R.setRhythm(t, 'shockable'); for (let i = 0; i < 3; i++) R.giveShock(t); R.setRhythm(t, 'nonshockable');
  assert.equal(R.amiodaroneStatus(t).state, 'wait');
});
test('paediatric prompts use weight-based doses; shock logs joules', () => {
  const s = R.newSession('paeds', 10, T0);
  R.setRhythm(s, 'shockable', T0);
  R.giveShock(s, T0 + 1000);
  assert.match(s.log[s.log.length - 1].text, /40 J/);
  for (let i = 0; i < 2; i++) R.giveShock(s, T0 + min(2 + i * 2));
  assert.match(R.adrenalineStatus(s, T0 + min(6)).dose, /100 microgram/);
  assert.match(R.amiodaroneStatus(s).dose, /50 mg/);
});
test('ROSC and end silence prompts; shock restarts the cycle', () => {
  const s = R.newSession('adult', null, T0);
  R.setRhythm(s, 'nonshockable', T0);
  R.giveShock(s, T0 + min(1)); assert.equal(s.cycleStartedAt, T0 + min(1)); assert.equal(s.cycleNo, 2);
  R.setRosc(s, T0 + min(5));
  assert.equal(R.adrenalineStatus(s, T0 + min(6)).state, 'none'); assert.equal(R.amiodaroneStatus(s).state, 'none');
  R.reArrest(s, T0 + min(7)); assert.equal(s.rosc, null); assert.equal(R.adrenalineStatus(s, T0 + min(7)).state, 'due');
  R.endSession(s, T0 + min(9)); assert.equal(R.adrenalineStatus(s, T0 + min(10)).state, 'none');
});
test('log is kept in time order after editing', () => {
  const s = R.newSession('adult', null, T0);
  R.addEvent(s, 'note', 'late', T0 + 5000); R.addEvent(s, 'note', 'early', T0 + 1000);
  assert.deepEqual(s.log.map(e => e.text).slice(1), ['early', 'late']);
});
test('export text contains summary, timeline and causes', () => {
  const s = R.newSession('adult', null, T0);
  R.setRhythm(s, 'shockable', T0); R.giveShock(s, T0 + 5000); R.giveAdrenaline(s, T0 + 60000); R.setRosc(s, T0 + min(6)); s.hs.hypoxia = true;
  const t = R.exportText(s, T0 + min(7));
  assert.match(t, /1 shock;/); assert.match(t, /adrenaline 1 dose;/); assert.match(t, /ROSC: yes at 6:00/); assert.match(t, /Hypoxia/); assert.match(t, /Shock 1 delivered/);
});
test('4Hs and 4Ts lists are complete', () => {
  assert.equal(R.HS.length, 4); assert.equal(R.TS.length, 4);
});

test('notes: SOAP formatting', () => {
  const tpl = N.tplById('soap');
  const t = N.format(tpl, { pid: 'JK, 54 M', s: 'Less breathless', v_hr: '88', a: 'Improving CAP', p: '1. Step down to oral antibiotics' });
  assert.match(t, /^SOAP PROGRESS NOTE/); assert.match(t, /S — SUBJECTIVE\nLess breathless/); assert.match(t, /HR \(\/min\): 88/); assert.match(t, /P — PLAN\n1\. Step down/);
  assert.equal(/Temp/.test(t), false);                      // empty fields omitted
});
test('notes: empty and checklist output', () => {
  const tpl = N.tplById('wardround');
  assert.match(N.format(tpl, {}), /nothing entered yet/);
  const t = N.format(tpl, { c1: true });
  assert.match(t, /\[x\] Overnight events/); assert.match(t, /\[ \] Observations/);
});
test('notes: multiline fields are indented and templates have unique field ids', () => {
  const t = N.format(N.tplById('clerking'), { hpc: 'a\nb', pmh: 'x\ny' });
  assert.match(t, /Past medical history:\n  x\n  y/);
  N.TEMPLATES.forEach(tpl => { const ids = tpl.sections.flatMap(s => s.fields.map(f => f.id)); assert.equal(new Set(ids).size, ids.length, tpl.id); });
  assert.equal(N.TEMPLATES.length, 6);
});
test('notes: de-identification heuristic', () => {
  assert.equal(N.looksLikeFullName('John Smith'), true); assert.equal(N.looksLikeFullName('JK, 54 M'), false); assert.equal(N.looksLikeFullName('MRN 12345'), false); assert.equal(N.looksLikeFullName(''), false);
});
test('notes: drafts expire', () => {
  const now = 10 * 864e5;
  const st = { v: 1, expiryDays: 7, items: { soap: { data: { s: 'a' }, saved: now - 8 * 864e5 }, isbar: { data: { s: 'b' }, saved: now - 2 * 864e5 } } };
  const p = N.pruneDrafts(st, now);
  assert.deepEqual(Object.keys(p.items), ['isbar']);
  assert.equal(N.pruneDrafts(null, now).expiryDays, 7);
});
