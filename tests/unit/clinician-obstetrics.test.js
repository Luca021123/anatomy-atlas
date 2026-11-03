const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../../clinician/tools/obstetrics.js');

test('Naegele, 28-day cycle: LMP 2026-01-01 → 2026-10-08', () => {
  assert.equal(O.eddFromLMP('2026-01-01', 28), '2026-10-08');
  assert.equal(O.eddFromLMP('2025-03-15', 28), '2025-12-20');
  assert.equal(O.eddFromLMP('2024-03-01', 28), '2024-12-06');   // leap year spanning
});
test('Naegele cycle adjustment: 35-day cycle adds 7 days; 21-day subtracts 7', () => {
  assert.equal(O.eddFromLMP('2026-01-01', 35), '2026-10-15');
  assert.equal(O.eddFromLMP('2026-01-01', 21), '2026-10-01');
  assert.equal(O.eddFromLMP('2026-01-01'), '2026-10-08');
  assert.equal(O.eddFromLMP('2026-01-01', 10), null);
  assert.equal(O.eddFromLMP('not-a-date', 28), null);
  assert.equal(O.eddFromLMP('2026-02-30', 28), null);
});
test('conception +266 and IVF transfer', () => {
  assert.equal(O.eddFromConception('2026-01-15'), '2026-10-08');
  assert.equal(O.eddFromIVF('2026-01-20', 5), '2026-10-08');   // +261
  assert.equal(O.eddFromIVF('2026-01-18', 3), '2026-10-08');   // +263
  assert.equal(O.eddFromIVF('2026-01-20', 4), null);
});
test('Robinson & Fleming CRL', () => {
  const near = (a, b, e) => assert.ok(Math.abs(a - b) < e, a + ' vs ' + b);
  near(O.gaDaysFromCRL(20), 59.74, 0.01);                 // 8w4d
  near(O.gaDaysFromCRL(50), 80.67, 0.01);                 // 11w4d
  near(O.gaDaysFromCRL(84), 8.052 * Math.sqrt(84) + 23.73, 1e-9);
  assert.equal(O.gaFromDays(Math.round(O.gaDaysFromCRL(20))).text, '8+4');
  assert.equal(O.gaFromDays(Math.round(O.gaDaysFromCRL(50))).text, '11+4');
  assert.equal(O.gaDaysFromCRL(0), null);
  // scan on 2026-03-01 with CRL 50 mm (GA 81 d) → EDD = scan + 199 d
  assert.equal(O.eddFromCRL(50, '2026-03-01'), O.addDays('2026-03-01', 280 - 81));
});
test('gestational age on a date', () => {
  const edd = '2026-10-08';
  assert.equal(O.gaOn(edd, '2026-01-01').text, '0+0');
  assert.equal(O.gaOn(edd, '2026-10-08').text, '40+0');
  assert.equal(O.gaOn(edd, '2026-07-02').days, 182);
  assert.equal(O.gaOn(edd, '2026-07-02').text, '26+0');
  assert.equal(O.gaOn(edd, '2026-10-15').text, '41+0');
  assert.equal(O.trimester(97), 1); assert.equal(O.trimester(98), 2); assert.equal(O.trimester(195), 2); assert.equal(O.trimester(196), 3);
});
test('ACOG redating bands', () => {
  const b = d => O.redateBand(d).thresholdDays;
  assert.equal(b(50), 5); assert.equal(b(62), 5); assert.equal(b(63), 7); assert.equal(b(97), 7);
  assert.equal(b(98), 7); assert.equal(b(111), 7); assert.equal(b(112), 10); assert.equal(b(153), 10);
  assert.equal(b(154), 14); assert.equal(b(195), 14); assert.equal(b(196), 21); assert.equal(b(250), 21);
});
test('redating: within threshold keeps LMP, beyond changes to US', () => {
  const scan = '2026-03-01';
  const us = O.eddFromCRL(20, scan);             // US GA 60 d (8+4)
  // LMP GA at scan = 60 + 5 → within 5 d (not >5)
  const lmpWithin = O.addDays(us, -5);
  let r = O.redating({ lmpEdd: lmpWithin, usEdd: us, scanDate: scan, lmpCertain: true });
  assert.equal(r.discrepancyDays, 5); assert.equal(r.redate, false); assert.equal(r.finalEdd, lmpWithin);
  // 6 days → redate
  const lmpOut = O.addDays(us, -6);
  r = O.redating({ lmpEdd: lmpOut, usEdd: us, scanDate: scan, lmpCertain: true });
  assert.equal(r.discrepancyDays, 6); assert.equal(r.redate, true); assert.equal(r.finalEdd, us);
  // 9-13w6d: 7 days threshold. CRL 50 mm → 81 d (11+4)
  const us2 = O.eddFromCRL(50, scan);
  assert.equal(O.redating({ lmpEdd: O.addDays(us2, 7), usEdd: us2, scanDate: scan }).redate, false);
  assert.equal(O.redating({ lmpEdd: O.addDays(us2, 8), usEdd: us2, scanDate: scan }).redate, true);
  // uncertain LMP → ultrasound
  r = O.redating({ lmpEdd: O.addDays(us2, 1), usEdd: us2, scanDate: scan, lmpCertain: false });
  assert.equal(r.redate, true); assert.equal(r.source, 'ultrasound');
  r = O.redating({ lmpEdd: null, usEdd: us2, scanDate: scan });
  assert.equal(r.finalEdd, us2);
});
test('ANC timeline: WHO eight contacts at 20,26,30,34,36,38,40 weeks after the first', () => {
  const edd = '2026-10-08', start = '2026-01-01';
  const tl = O.timeline(edd, { rhNegative: false });
  const anc = tl.filter(i => i.kind === 'anc');
  assert.equal(anc.length, 8);
  assert.deepEqual(anc.map(a => a.toWeeks), [12, 20, 26, 30, 34, 36, 38, 40]);
  assert.equal(anc[1].to, O.addDays(start, 140));
  assert.equal(anc[7].to, edd);
  assert.equal(tl.find(i => i.id === 'antid'), undefined);
});
test('timeline key dates', () => {
  const edd = '2026-10-08', start = '2026-01-01';
  const tl = O.timeline(edd, { rhNegative: true });
  const by = id => tl.find(i => i.id === id);
  assert.equal(by('anomaly').from, O.addDays(start, 126)); assert.equal(by('anomaly').to, O.addDays(start, 22 * 7 + 6));
  assert.equal(by('ogtt').from, O.addDays(start, 168)); assert.equal(by('ogtt').to, O.addDays(start, 28 * 7 + 6));
  assert.equal(by('antid').from, O.addDays(start, 196));
  assert.equal(by('term').from, O.addDays(start, 259));
  assert.equal(by('postdates').from, O.addDays(start, 287)); assert.equal(by('postdates').from, '2026-10-15');
  // chronological order
  for (let i = 1; i < tl.length; i++) assert.ok(O.toDay(tl[i].from) >= O.toDay(tl[i - 1].from));
});
test('summary', () => {
  const s = O.summary('2026-10-08', '2026-07-02', { rhNegative: true });
  assert.equal(s.ga.text, '26+0'); assert.equal(s.trimester, 2); assert.equal(s.daysToEdd, 98);
  assert.equal(s.lmpEquivalent, '2026-01-01'); assert.ok(Math.abs(s.progress - 182 / 280) < 1e-9);
});
