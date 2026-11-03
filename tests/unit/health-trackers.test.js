const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../../health/lib/trackers.js');

const at = (date, hm) => { const [y, m, d] = date.split('-').map(Number); const [h, mi] = hm.split(':').map(Number); return new Date(y, m - 1, d, h, mi).toISOString(); };
const R = (date, hm, sys, dia, session) => ({ id: date + hm, t: at(date, hm), sys, dia, session });

/* ---------- BP ---------- */
test('validateBP: plausibility', () => {
  assert.equal(T.validateBP(120, 80, 70).ok, true);
  assert.deepEqual(T.validateBP(40, 80).errors, ['sys-range']);
  assert.ok(T.validateBP(120, 130).errors.includes('dia-ge-sys'));
  assert.ok(T.validateBP(120, 20).errors.includes('dia-range'));
  assert.ok(T.validateBP(120, 80, 400).errors.includes('pulse-range'));
  assert.deepEqual(T.validateBP(120, 110).warnings, ['narrow-pp']);
  assert.ok(T.validateBP(250, 100).warnings.includes('wide-pp'));
  assert.equal(T.validateBP(NaN, 80).ok, false);
});
test('crisis threshold 180/120 (either value)', () => {
  assert.equal(T.isCrisis(179, 119), false);
  assert.equal(T.isCrisis(180, 90), true);
  assert.equal(T.isCrisis(150, 120), true);
  assert.equal(T.assessReading(185, 100).crisis, true);
  assert.equal(T.assessReading(179, 119).crisis, false);
});
test('crisis advice: recheck, emergency with symptoms, same-day without', () => {
  assert.equal(T.crisisAdvice(false, true, false), 'recheck');
  assert.equal(T.crisisAdvice(true, true, true), 'emergency');
  assert.equal(T.crisisAdvice(true, true, false), 'same-day');
  assert.equal(T.crisisAdvice(true, false, false), 'normal');
  assert.equal(T.crisisAdvice(false, true, true), 'emergency');
});
test('home classification boundaries (135/85 = high)', () => {
  assert.equal(T.classifyHome(119, 79), 'normal');
  assert.equal(T.classifyHome(120, 79), 'elevated');
  assert.equal(T.classifyHome(119, 80), 'elevated');
  assert.equal(T.classifyHome(134, 84), 'elevated');
  assert.equal(T.classifyHome(135, 84), 'high');
  assert.equal(T.classifyHome(134, 85), 'high');
  assert.equal(T.classifyHome(179, 119), 'high');
  assert.equal(T.classifyHome(180, 80), 'crisis');
  assert.equal(T.classifyHome(89, 70), 'low');
  assert.equal(T.classifyHome(110, 59), 'low');
});
test('pregnancy thresholds', () => {
  assert.equal(T.assessReading(139, 89, { pregnant: true }).pregnancyHigh, false);
  assert.equal(T.assessReading(140, 80, { pregnant: true }).pregnancyHigh, true);
  assert.equal(T.assessReading(160, 100, { pregnant: true }).pregnancyUrgent, true);
  assert.equal(T.assessReading(150, 111, { pregnant: true }).pregnancyUrgent, true);
  assert.equal(T.assessReading(150, 100).pregnancyHigh, false);
});
function week(start, fn) {
  const rs = [];
  for (let i = 0; i < 7; i++) {
    const d = T.util.addDays(start, i);
    ['am', 'pm'].forEach((s) => [0, 1].forEach((k) => { const r = fn(i, s, k); if (r) rs.push(R(d, (s === 'am' ? '07:' : '19:') + (30 + k), r[0], r[1], s)); }));
  }
  return rs;
}
test('protocol: discards day 1 and averages days 2-7, both sessions', () => {
  // day 1 deliberately high (160/100), the rest 130/80 am and 140/90 pm
  const rs = week('2026-10-05', (i, s) => i === 0 ? [160, 100] : s === 'am' ? [130, 80] : [140, 90]);
  const p = T.bpProtocol(rs, { startDate: '2026-10-05' });
  assert.equal(p.status, 'valid');
  assert.equal(p.complete, true);
  assert.equal(p.usableDays, 6);
  assert.deepEqual([p.avg.sys, p.avg.dia, p.avg.n], [135, 85, 24]);
  assert.deepEqual([p.am.sys, p.pm.sys], [130, 140]);
  assert.equal(p.classification, 'high');
  assert.equal(p.total, 28);
  assert.equal(p.completeness, 1);
  assert.equal(p.sessionsDone, 14);
  assert.equal(p.dayList[0].discarded, true);
});
test('protocol: minimum-days rule and provisional status', () => {
  const rs = week('2026-10-05', (i, s) => i <= 2 ? [128, 78] : null); // days 1-3 only: 2 usable days
  let p = T.bpProtocol(rs, { startDate: '2026-10-05' });
  assert.equal(p.status, 'provisional');
  assert.equal(p.usableDays, 2);
  assert.equal(p.neededDays, 1);
  const rs2 = week('2026-10-05', (i, s) => i <= 3 ? [128, 78] : null); // 3 usable days
  p = T.bpProtocol(rs2, { startDate: '2026-10-05' });
  assert.equal(p.status, 'valid');
  assert.equal(p.complete, false);
  assert.equal(p.classification, 'elevated');
});
test('protocol: only day-1 readings gives none; no readings gives none', () => {
  const p = T.bpProtocol(week('2026-10-05', (i) => i === 0 ? [120, 80] : null), { startDate: '2026-10-05' });
  assert.equal(p.status, 'none');
  assert.equal(p.avg, null);
  assert.equal(T.bpProtocol([], {}).status, 'none');
});
test('protocol: inferred window and readings outside it are ignored', () => {
  const old = [R('2026-09-01', '07:30', 190, 110, 'am')];
  const rs = old.concat(week('2026-10-05', () => [120, 78]));
  const p = T.bpProtocol(rs);
  assert.equal(p.startDate, '2026-10-05');
  assert.equal(p.avg.sys, 120);
});
test('bpDueToday and reminders', () => {
  const rs = [R('2026-10-06', '07:30', 120, 80, 'am')];
  const d = T.bpDueToday(rs, '2026-10-05', '2026-10-06');
  assert.deepEqual([d.active, d.dayIndex, d.amDone, d.pmDone], [true, 1, true, false]);
  assert.equal(T.bpDueToday(rs, '2026-10-05', '2026-10-12').active, false);
  const ev = T.bpReminderEvents('2026-10-05');
  assert.equal(ev.length, 14);
  assert.equal(ev[0].start.getHours(), 7);
  assert.equal(ev[1].start.getHours(), 19);
  assert.equal(new Set(ev.map((e) => e.uid)).size, 14);
  assert.match(ev[0].title, /day 1/);
});
test('dailyAverages groups by local date', () => {
  const a = T.dailyAverages([R('2026-10-05', '07:30', 120, 80, 'am'), R('2026-10-05', '07:31', 130, 90, 'am'), R('2026-10-06', '07:30', 100, 70, 'am')]);
  assert.equal(a.length, 2);
  assert.deepEqual([a[0].sys, a[0].dia, a[0].n], [125, 85, 2]);
});

/* ---------- Sleep ---------- */
test('sleep duration across midnight', () => {
  assert.equal(T.sleepMinutes('23:00', '07:00'), 480);
  assert.equal(T.sleepMinutes('00:30', '06:15'), 345);
  assert.equal(T.sleepMinutes('22:00', '22:00'), null);
  assert.equal(T.sleepMinutes('25:00', '07:00'), null);
  assert.equal(T.sleepMinutes('21:30', '05:45'), 495);
});
test('mid-sleep time', () => {
  assert.equal(T.midSleep('23:00', '07:00'), 3 * 60);
  assert.equal(T.midSleep('22:00', '06:00'), 2 * 60);
  assert.equal(T.midSleep('01:00', '09:00'), 5 * 60);
});
test('circular statistics wrap midnight', () => {
  assert.equal(T.util.circMean([23 * 60 + 30, 30]), 0);
  assert.equal(T.util.circSD([23 * 60 + 30, 30]), 30);
  assert.equal(T.util.circSD([420, 420, 420]), 0);
});
function diary(start, n, fn) { const out = []; for (let i = 0; i < n; i++) { const d = T.util.addDays(start, i); out.push(Object.assign({ date: d }, fn(i, d))); } return out; }
test('regularity: identical schedule scores 100', () => {
  const e = diary('2026-10-05', 7, () => ({ bed: '23:00', wake: '07:00' }));
  const r = T.sleepRegularity(e);
  assert.equal(r.score, 100);
  assert.equal(r.pairs, 6);
  assert.equal(r.band, 'regular');
});
test('regularity: alternating 2 h shift gives 67 (80/96 bins agree)', () => {
  const e = diary('2026-10-05', 7, (i) => i % 2 ? { bed: '01:00', wake: '09:00' } : { bed: '23:00', wake: '07:00' });
  const r = T.sleepRegularity(e);
  assert.equal(r.score, 67);
  assert.equal(r.band, 'somewhat');
});
test('regularity: too few entries or gaps give null', () => {
  assert.equal(T.sleepRegularity(diary('2026-10-05', 4, () => ({ bed: '23:00', wake: '07:00' }))).score, null);
  const gappy = diary('2026-10-05', 9, () => ({ bed: '23:00', wake: '07:00' })).filter((e, i) => i % 2 === 0);
  assert.equal(T.sleepRegularity(gappy).score, null);
});
test('social jetlag: later mid-sleep on free days', () => {
  // 2026-10-05 is a Monday. Sat 10 and Sun 11 are free days.
  const e = diary('2026-10-05', 7, (i, d) => (i >= 5 ? { bed: '01:00', wake: '09:00' } : { bed: '23:00', wake: '07:00' }));
  const s = T.socialJetlag(e);
  assert.equal(s.minutes, 120);
  assert.equal(s.direction, 'later');
  assert.deepEqual([s.nFree, s.nWork], [2, 5]);
  assert.equal(T.socialJetlag(e.slice(0, 5)).minutes, null);
});
test('sleep summary and flags', () => {
  const e = diary('2026-10-05', 7, () => ({ bed: '23:00', wake: '06:00', quality: 3, lastCaffeine: '19:00' }));
  const s = T.sleepSummary(e, '2026-10-11', 7);
  assert.equal(s.nights, 7);
  assert.equal(s.avgMinutes, 420);
  assert.equal(s.avgBedtime, 23 * 60);
  assert.equal(s.lateCaffeineDays, 7); // 4 h before bed
  assert.deepEqual(T.sleepFlags({ snoring: true, sleepy: true }).map((f) => f.id), ['osa']);
  assert.deepEqual(T.sleepFlags({ snoring: true }).map((f) => f.id), []);
  assert.ok(T.sleepFlags({ troubleMonths: 3 }).some((f) => f.id === 'insomnia-3mo'));
  assert.ok(!T.sleepFlags({ troubleMonths: 2 }).some((f) => f.id === 'insomnia-3mo'));
});

/* ---------- Mood ---------- */
test('mood trend and low-mood flag', () => {
  const today = '2026-10-20';
  const e = [];
  for (let i = 0; i < 14; i++) e.push({ date: T.util.addDays(today, -i), score: i < 7 ? 4 : 3 });
  assert.equal(T.moodTrend(e, today).trend, 'better');
  assert.equal(T.lowMoodFlag(e, today).flag, false);
  const low = []; for (let i = 0; i < 14; i++) low.push({ date: T.util.addDays(today, -i), score: i < 8 ? 2 : 3 });
  assert.equal(T.lowMoodFlag(low, today).flag, true);
});
test('activation summary', () => {
  const s = T.activationSummary([{ done: true, before: 2, after: 4 }, { done: true, before: 3, after: 3 }, { done: false }]);
  assert.deepEqual([s.planned, s.done, s.rated, s.avgChange], [3, 2, 2, 1]);
});

/* ---------- Breathing ---------- */
test('breath patterns', () => {
  const sigh = T.breathPattern('sigh');
  assert.equal(T.cycleSeconds(sigh), 9);
  assert.equal(T.breathsPerMinute(sigh), 6.7);
  assert.equal(T.cyclesIn(sigh, 5), 33);
  const res = T.breathPattern('resonance');
  assert.ok(T.breathsPerMinute(res) >= 5.5 && T.breathsPerMinute(res) <= 6);
  assert.equal(T.cycleSeconds(T.breathPattern('box')), 16);
});
test('phaseAt tracks phases and size', () => {
  const sigh = T.breathPattern('sigh');
  let s = T.phaseAt(sigh, 0); assert.deepEqual([s.kind, s.remaining, s.scale], ['in', 2, 0]);
  s = T.phaseAt(sigh, 2); assert.equal(s.kind, 'in2'); assert.equal(s.scale, 0.75);
  s = T.phaseAt(sigh, 3); assert.equal(s.kind, 'out'); assert.equal(s.scale, 1); assert.equal(s.remaining, 6);
  s = T.phaseAt(sigh, 6); assert.equal(s.scale, 0.5); assert.equal(s.remaining, 3);
  s = T.phaseAt(sigh, 9); assert.equal(s.cycle, 1); assert.equal(s.kind, 'in');
  const box = T.breathPattern('box');
  assert.equal(T.phaseAt(box, 5).kind, 'hold'); assert.equal(T.phaseAt(box, 5).scale, 1);
  assert.equal(T.phaseAt(box, 13).kind, 'hold'); assert.equal(T.phaseAt(box, 13).scale, 0);
});

/* ---------- Movement ---------- */
test('step ladder progression', () => {
  assert.deepEqual(T.nextStepTarget(3420), { target: 4400, reached: false, stage: 1 });
  assert.equal(T.nextStepTarget(6500).target, 7000);
  assert.equal(T.nextStepTarget(6100).target, 7000);
  assert.equal(T.nextStepTarget(7200, false).reached, true);
  const o = T.nextStepTarget(7200, true); assert.deepEqual([o.target, o.reached, o.stage], [8200, false, 2]);
  assert.equal(T.nextStepTarget(9500, true).target, 10000);
  assert.equal(T.nextStepTarget(10500, true).reached, true);
  assert.equal(T.nextStepTarget(null).target, 2000);
  assert.equal(T.nextStepTarget(0).target, 1000);
});
test('steps average needs 3 days', () => {
  const log = { '2026-10-20': 3000, '2026-10-19': 4000 };
  assert.equal(T.stepsAverage(log, '2026-10-20'), null);
  log['2026-10-18'] = 5000;
  assert.equal(T.stepsAverage(log, '2026-10-20'), 4000);
});
test('weekly minutes: vigorous counts double, Monday start', () => {
  assert.equal(T.util.weekStart('2026-10-11'), '2026-10-05'); // Sunday -> Monday before
  assert.equal(T.util.weekStart('2026-10-05'), '2026-10-05');
  const w = T.weeklyMinutes([
    { date: '2026-10-05', minutes: 30, intensity: 'moderate' },
    { date: '2026-10-08', minutes: 30, intensity: 'vigorous' },
    { date: '2026-10-12', minutes: 100, intensity: 'moderate' }
  ], '2026-10-09');
  assert.deepEqual([w.moderate, w.vigorous, w.equivalent, w.reached150], [30, 30, 90, false]);
  assert.equal(w.pct150, 0.6);
  assert.equal(T.weeklyMinutes([{ date: '2026-10-05', minutes: 75, intensity: 'vigorous' }], '2026-10-06').reached150, true);
  assert.equal(T.weeklyStrength(['2026-10-05', '2026-10-05', '2026-10-07'], '2026-10-08').reached, true);
});
test('readiness screen', () => {
  assert.equal(T.readiness({}).level, 'clear');
  assert.equal(T.readiness({ chest: true }).level, 'check');
  assert.equal(T.readiness({ pain: true }).level, 'care');
  assert.equal(T.readiness({ pain: true, faint: true }).level, 'check');
});

/* ---------- Medicines ---------- */
const med = (o) => Object.assign({ id: 'm1', name: 'Metformin', dose: '500 mg', times: ['08:00', '20:00'], purpose: 'Sugar', active: true, startDate: '2026-10-01' }, o);
test('refill planner: run-out date and reminder', () => {
  const m = med({ pillsLeft: 60, pillsPerDay: 2, pillsAsOf: '2026-10-10' });
  const r = T.refillInfo(m, '2026-10-10', 7);
  assert.deepEqual([r.daysLeft, r.runOutDate, r.remindDate], [30, '2026-11-09', '2026-11-02']);
  const r2 = T.refillInfo(m, '2026-10-20', 7); // 20 pills used
  assert.deepEqual([r2.left, r2.daysLeft, r2.runOutDate], [40, 20, '2026-11-09']);
  const r3 = T.refillInfo(m, '2026-11-05', 7);
  assert.equal(r3.soon, true); assert.equal(r3.remindDate, '2026-11-05'); assert.equal(r3.daysLeft, 4);
  assert.equal(T.refillInfo(m, '2026-12-01').out, true);
  assert.equal(T.refillInfo(med({ pillsLeft: 5 }), '2026-10-10'), null);
  assert.equal(T.refillInfo(med({ pillsLeft: 5, pillsPerDay: 2 }), '2026-10-10').daysLeft, 2); // 2.5 pills/day-lots -> 2 full days
});
test('doses due and adherence', () => {
  const items = [med(), med({ id: 'm2', name: 'Aspirin', times: ['09:00'], startDate: '2026-10-05' }), med({ id: 'm3', name: 'Old', active: false })];
  const due = T.dosesDue(items, '2026-10-04');
  assert.deepEqual(due.map((d) => d.key), ['m1@08:00', 'm1@20:00']);
  assert.equal(T.dosesDue(items, '2026-10-05').length, 3);
  const log = { '2026-10-05': { 'm1@08:00': true, 'm2@09:00': true }, '2026-10-06': { 'm1@08:00': true, 'm1@20:00': true, 'm2@09:00': true } };
  const a = T.adherence(items, log, '2026-10-05', '2026-10-06');
  assert.deepEqual([a.due, a.taken], [6, 5]);
  assert.equal(Math.round(a.pct * 100), 83);
});
test('ics events for a medicine schedule', () => {
  const ev = T.medEvents([med({ pillsLeft: 14, pillsPerDay: 2, pillsAsOf: '2026-10-10' })], { startDate: '2026-10-10', today: '2026-10-10', leadDays: 3 });
  const daily = ev.filter((e) => e.rrule === 'FREQ=DAILY');
  assert.equal(daily.length, 2);
  assert.deepEqual(daily.map((e) => e.start.getHours()), [8, 20]);
  assert.equal(daily[0].title, 'Take Metformin');
  assert.equal(daily[0].uid, 'salus-med-m1-0800');
  const refill = ev.find((e) => e.uid === 'salus-refill-m1');
  assert.equal(T.util.ymd(refill.start), '2026-10-14'); // runs out 10-17, remind 3 days before
  assert.equal(refill.start.getHours(), 9);
  assert.equal(T.medEvents([med({ active: false })], { startDate: '2026-10-10' }).length, 0);
});
test('ics events build with the core MT.ics shape', () => {
  const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
  const sandbox = { console, setTimeout, clearTimeout, Promise, Date, Math, JSON, Number, String, Array, Object, RegExp, Error, isFinite };
  sandbox.globalThis = sandbox; sandbox.window = undefined;
  sandbox.document = { documentElement: { setAttribute() {}, removeAttribute() {}, lang: 'en', dir: 'ltr' }, addEventListener() {}, getElementById() { return null; } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../assets/js/core.js'), 'utf8'), sandbox);
  const ics = sandbox.MT.ics.build({ name: 'Medicines', events: T.medEvents([med()], { startDate: '2026-10-10', today: '2026-10-10' }) });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /RRULE:FREQ=DAILY/);
  assert.match(ics, /DTSTART:20261010T080000/);
});

/* ---------- Habits ---------- */
test('streak counting across missing days', () => {
  const log = { '2026-10-20': true, '2026-10-19': true, '2026-10-18': true, '2026-10-16': true, '2026-10-15': true };
  assert.equal(T.streak(log, '2026-10-20'), 3);
  assert.equal(T.streak(log, '2026-10-21'), 3);   // today not ticked yet: yesterday keeps the streak alive
  assert.equal(T.streak(log, '2026-10-22'), 0);   // two days missed
  assert.equal(T.streak({}, '2026-10-20'), 0);
  assert.equal(T.bestStreak(log), 3);
  assert.equal(T.bestStreak({ '2026-10-01': true, '2026-10-02': true, '2026-10-04': true, '2026-10-05': true, '2026-10-06': true, '2026-10-07': false }), 3);
});
test('week grid, missed nudge and plan sentence', () => {
  const g = T.weekGrid({ '2026-10-20': true, '2026-10-18': true }, '2026-10-20', 7);
  assert.equal(g.length, 7);
  assert.deepEqual(g.map((x) => x.done), [false, false, false, false, true, false, true]);
  assert.equal(g[6].date, '2026-10-20');
  assert.equal(T.missedYesterday({ '2026-10-18': true }, '2026-10-20'), true);
  assert.equal(T.missedYesterday({ '2026-10-19': true }, '2026-10-20'), false);
  assert.equal(T.fullPlan('I brush my teeth', 'do 10 chair stands'), 'When I brush my teeth, I will do 10 chair stands.');
  assert.ok(T.HABIT_IDEAS.length >= 8);
});
