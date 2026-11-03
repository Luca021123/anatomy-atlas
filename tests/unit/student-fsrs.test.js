// Unit tests for student/lib/fsrs.js (Recall Lab FSRS-6 scheduler).
// Expected values are computed independently in this file from the published FSRS-6
// formulas (docs/research/emergency-prevention-fsrs.md §8.2, open-spaced-repetition wiki
// "The Algorithm", py-fsrs scheduler.py, ts-fsrs 5.2.3 algorithm.ts).
process.env.TZ = 'UTC'; // deterministic study-day arithmetic
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../../student/lib/fsrs.js');

/* ---------- Independent reference implementation (not using the library) ---------- */
const W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
const ref = (w = W) => {
  const DECAY = -w[20];
  const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
  const R = (t, S) => Math.pow(1 + FACTOR * t / S, DECAY);
  const I = (S, r) => S / FACTOR * (Math.pow(r, 1 / DECAY) - 1);
  const D0 = (G) => w[4] - Math.exp(w[5] * (G - 1)) + 1;
  const clampD = (d) => Math.min(10, Math.max(1, d));
  const nextD = (D, G) => clampD(w[7] * D0(4) + (1 - w[7]) * (D + (-w[6] * (G - 3)) * (10 - D) / 9));
  const sRecall = (D, S, r, G) => S * (1 + Math.exp(w[8]) * (11 - D) * Math.pow(S, -w[9]) *
    (Math.exp(w[10] * (1 - r)) - 1) * (G === 2 ? w[15] : 1) * (G === 4 ? w[16] : 1));
  const sForget = (D, S, r) => Math.min(w[11] * Math.pow(D, -w[12]) * (Math.pow(S + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r)),
    S / Math.exp(w[17] * w[18]));
  const sShort = (S, G) => { let inc = Math.exp(w[17] * (G - 3 + w[18])) * Math.pow(S, -w[19]); if (G >= 3) inc = Math.max(inc, 1); return S * inc; };
  return { DECAY, FACTOR, R, I, D0, clampD, nextD, sRecall, sForget, sShort };
};
const X = ref();
const MIN = 60e3, DAY = 864e5;
const close = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg || ''} expected ${b}, got ${a}`);
const T0 = Date.UTC(2026, 0, 5, 10, 0); // Monday 5 Jan 2026, 10:00 (after the 4 am rollover)

test('default parameters are the 21 FSRS-6 values', () => {
  assert.deepEqual(Array.from(F.DEFAULT_W), W);
  assert.equal(F.DEFAULTS.retention, 0.9);
  assert.deepEqual(F.DEFAULTS.learningSteps, [1, 10]);
  assert.deepEqual(F.DEFAULTS.relearningSteps, [10]);
  assert.equal(F.DEFAULTS.maxInterval, 36500);
});

test('initial stability per rating equals w[0..3]', () => {
  for (let g = 1; g <= 4; g++) {
    assert.equal(F.initStability(g), W[g - 1]);
    const { card } = F.schedule(F.createCard(T0), g, T0);
    assert.equal(card.s, W[g - 1], 'first review with rating ' + g);
    close(card.d, X.clampD(X.D0(g)), 1e-7, 'D0(' + g + ')');
  }
  // research-notes test vector: D0(Good) ≈ 2.118
  close(F.initDifficulty(3), 2.118104, 1e-6);
});

test('R(t = S) = 0.9 within 1e-6, including other (trainable) decay values', () => {
  for (const decay of [0.1542, 0.1, 0.3, 0.5, 0.8]) {
    const w = W.slice(); w[20] = decay;
    for (const S of [0.5, 1, 2.3065, 10, 365.25, 5000]) close(F.forgettingCurve(S, S, w), 0.9, 1e-6, `decay ${decay}, S ${S}`);
    close(F.forgettingCurve(0, 7, w), 1, 1e-9);
  }
  // FSRS-5's fixed decay 0.5 gives the classic FACTOR 19/81.
  const w5 = W.slice(); w5[20] = 0.5;
  close(F.decayFactor(w5).factor, 19 / 81, 1e-8);
  // R falls with time and matches the reference formula
  close(F.forgettingCurve(30, 10), X.R(30, 10), 1e-7);
  assert.ok(F.forgettingCurve(30, 10) < F.forgettingCurve(10, 10));
});

test('interval at retention 0.9 equals S before rounding/fuzz; retention moves it the right way', () => {
  for (const S of [0.3, 2.3065, 3.7, 47.9, 1234.5]) {
    close(F.rawInterval(S, 0.9), S, 1e-7, 'I(0.9, S)');
    close(F.rawInterval(S, 0.85), X.I(S, 0.85), 1e-7, 'I(0.85, S)');
  }
  assert.ok(F.rawInterval(10, 0.8) > F.rawInterval(10, 0.9));
  assert.ok(F.rawInterval(10, 0.97) < F.rawInterval(10, 0.9));
  assert.equal(F.nextInterval(0.2), 1, 'minimum one day');
  assert.equal(F.nextInterval(2.6), 3, 'rounded to whole days');
  assert.equal(F.nextInterval(1e6, 0.9, W, 36500), 36500, 'capped at the maximum interval');
  close(F.retentionIntervalFactor(0.9), 1, 1e-9);
  assert.throws(() => F.intervalModifier(0));
});

test('Again on a new card stays in learning with a 1-minute step', () => {
  const { card, log } = F.schedule(F.createCard(T0), 1, T0);
  assert.equal(card.st, F.State.Learning);
  assert.equal(card.stp, 0);
  assert.equal(card.due - T0, 1 * MIN);
  assert.equal(log.ivl, 1 * MIN);
  assert.equal(card.n, 1);
  assert.equal(card.l, 0, 'a first-time Again is not a lapse');
  assert.equal(F.formatInterval(log.ivl), '1m');
});

test('new-card button previews: 1m · 6m · 10m · 8d', () => {
  const p = F.previewIntervals(F.createCard(T0), T0);
  assert.equal(p[1], 1 * MIN);
  assert.equal(p[2], 6 * MIN, 'Hard = average of 1 and 10 min, rounded (ts-fsrs)');
  assert.equal(p[3], 10 * MIN);
  assert.equal(p[4], Math.round(W[3]) * DAY, 'Easy graduates with round(w3) days');
  assert.deepEqual(['1m', '6m', '10m', '8d'], [1, 2, 3, 4].map((g) => F.formatInterval(p[g])));
});

test('learning steps follow Anki/py-fsrs rules (Again → first step, Good → next step, Hard repeats)', () => {
  let c = F.schedule(F.createCard(T0), 1, T0).card;                 // failed first answer → 1 min, step 0
  let r = F.schedule(c, 3, T0 + MIN);                               // Good → next step (10 min)
  assert.equal(r.card.st, F.State.Learning);
  assert.equal(r.card.stp, 1);
  assert.equal(r.log.ivl, 10 * MIN);
  const hard = F.schedule(r.card, 2, T0 + 11 * MIN);                // Hard on step 1 repeats the 10-min step
  assert.equal(hard.log.ivl, 10 * MIN);
  assert.equal(hard.card.stp, 1);
  const good = F.schedule(r.card, 3, T0 + 11 * MIN);                // Good on the last step graduates
  assert.equal(good.card.st, F.State.Review);
  assert.ok(good.log.days >= 1);
  // Relearning: single 10-min step → Hard waits 1.5 × 10 = 15 min
  assert.deepEqual(F.stepOutcome([10], 0, 2), { minutes: 15, step: 0 });
  assert.equal(F.stepOutcome([], 0, 1), null, 'no steps: straight to review');
});

test('full sequence Good, Good, Again, Good matches the published formulas', () => {
  const opts = { retention: 0.9 };
  // 1) New → Good at T0: S = w2, D = D0(3); learning step 2 (10 min)
  let t = T0;
  let res = F.schedule(F.createCard(T0), 3, t, opts);
  let S = W[2], D = X.clampD(X.D0(3));
  assert.equal(res.card.st, F.State.Learning);
  assert.equal(res.card.stp, 1);
  close(res.card.s, S); close(res.card.d, D);
  assert.equal(res.card.due, t + 10 * MIN);

  // 2) Good 10 minutes later (same day → short-term formula), last step → graduates to Review
  t += 10 * MIN;
  const preview2 = F.previewIntervals(res.card, t, opts);
  res = F.schedule(res.card, 3, t, opts);
  S = X.sShort(S, 3); D = X.nextD(D, 3);
  close(res.card.s, S, 1e-6, 'S after same-day Good'); close(res.card.d, D, 1e-6, 'D after Good');
  const ivl2 = Math.max(1, Math.round(X.I(S, 0.9)));
  assert.equal(res.card.st, F.State.Review);
  assert.equal(res.log.days, ivl2);
  assert.equal(ivl2, 2);
  assert.equal(res.card.due, t + ivl2 * DAY);
  assert.equal(preview2[3], ivl2 * DAY, 'preview agrees with the schedule');

  // 3) Again when due (t = 2 days): lapse → relearning (10 min), stability falls, lapses + 1
  t = res.card.due;
  const prevS = res.card.s;
  res = F.schedule(res.card, 1, t, opts);
  const r3 = X.R(ivl2, S);
  S = X.sForget(D, S, r3); D = X.nextD(D, 1);
  assert.equal(res.card.st, F.State.Relearning);
  assert.equal(res.card.stp, 0);
  assert.equal(res.card.l, 1);
  assert.equal(res.log.e, 2, 'elapsed whole days');
  close(res.log.R, r3, 1e-6, 'retrievability at review');
  close(res.card.s, S, 1e-6, 'S after lapse'); close(res.card.d, D, 1e-6, 'D after Again');
  assert.ok(res.card.s < prevS, 'a lapse reduces stability');
  assert.equal(res.card.due, t + 10 * MIN);

  // 4) Good 10 minutes later (same day): relearning step done → Review
  t += 10 * MIN;
  res = F.schedule(res.card, 3, t, opts);
  S = X.sShort(S, 3); D = X.nextD(D, 3);
  const ivl4 = Math.max(1, Math.round(X.I(S, 0.9)));
  close(res.card.s, S, 1e-6, 'S after relearning Good'); close(res.card.d, D, 1e-6);
  assert.equal(res.card.st, F.State.Review);
  assert.equal(res.log.days, ivl4);
  assert.equal(res.card.due, t + ivl4 * DAY);
  assert.equal(res.card.n, 4);
  assert.equal(res.card.l, 1);
});

test('review on time: recall-stability formula and ts-fsrs ordering Hard ≤ Good < Easy', () => {
  const card = { st: 2, s: 12, d: 5.5, lr: T0, due: T0 + 12 * DAY, stp: 0, n: 3, l: 0 };
  const now = T0 + 12 * DAY;
  const all = F.repeat(card, now);
  const r = X.R(12, 12);
  close(r, 0.9, 1e-6);
  for (const g of [2, 3, 4]) close(all[g].card.s, X.sRecall(5.5, 12, r, g), 1e-6, 'S′ for rating ' + g);
  assert.ok(all[2].log.days <= all[3].log.days && all[3].log.days < all[4].log.days);
  assert.equal(all[3].log.days, Math.round(X.sRecall(5.5, 12, r, 3)));
  // Ordering also holds for awkward low-stability cards
  for (let s = 0.2; s < 6; s += 0.37) {
    for (let d = 1; d <= 10; d += 1.5) {
      const a = F.repeat({ st: 2, s, d, lr: T0, due: T0 + DAY, stp: 0, n: 2, l: 0 }, T0 + 3 * DAY);
      assert.ok(a[2].log.days <= a[3].log.days && a[3].log.days < a[4].log.days, `s=${s} d=${d}`);
    }
  }
});

test('a lapse reduces stability and increments lapses', () => {
  for (const s of [3, 20, 150]) {
    const card = { st: 2, s, d: 6, lr: T0, due: T0 + s * DAY, stp: 0, n: 5, l: 2 };
    const { card: c, log } = F.schedule(card, 1, T0 + Math.round(s) * DAY);
    assert.ok(c.s < s, `S ${c.s} < ${s}`);
    assert.equal(c.l, 3);
    assert.equal(c.st, F.State.Relearning);
    assert.equal(log.ivl, 10 * MIN);
    assert.ok(c.d > 6, 'difficulty rises after Again');
  }
  // with no relearning steps the card stays in Review with a day interval
  const r = F.schedule({ st: 2, s: 20, d: 6, lr: T0, due: T0 + 20 * DAY, stp: 0, n: 5, l: 0 }, 1, T0 + 20 * DAY, { relearningSteps: [] });
  assert.equal(r.card.st, F.State.Review);
  assert.equal(r.card.l, 1);
  assert.ok(r.log.days >= 1);
});

test('difficulty stays within [1, 10] and stability stays positive over long random histories', () => {
  const rnd = F.prng('difficulty-bounds');
  for (let run = 0; run < 40; run++) {
    let card = F.createCard(T0), now = T0;
    for (let i = 0; i < 60; i++) {
      const g = run % 4 === 0 ? 1 : run % 4 === 1 ? 4 : 1 + Math.floor(rnd() * 4);
      const { card: c } = F.schedule(card, g, now, { fuzz: true, seed: 'run' + run });
      assert.ok(c.d >= 1 && c.d <= 10, `D out of range: ${c.d}`);
      assert.ok(c.s >= F.S_MIN && c.s <= F.S_MAX, `S out of range: ${c.s}`);
      assert.ok(c.due > now);
      card = c;
      now = c.due + Math.floor(rnd() * 3) * DAY; // review on time or a little late
    }
  }
  // repeated Again drives D to (but not past) 10; repeated Easy to (but not below) 1
  let d = 5; for (let i = 0; i < 100; i++) d = F.nextDifficulty(d, 1);
  assert.ok(d <= 10 && d > 9.9);
  d = 5; for (let i = 0; i < 100; i++) d = F.nextDifficulty(d, 4);
  assert.equal(d, 1);
});

test('same-day review uses the short-term formula (SInc floored at 1 for Good/Easy only, as ts-fsrs)', () => {
  const card = { st: 2, s: 30, d: 5, lr: T0, due: T0 + 30 * DAY, stp: 0, n: 4, l: 0 };
  const later = T0 + 3 * 3600e3; // same study day
  const all = F.repeat(card, later);
  close(all[3].card.s, X.sShort(30, 3), 1e-6);
  assert.equal(all[3].card.s, 30, 'SInc < 1 is floored for Good');
  close(all[2].card.s, 30 * Math.exp(W[17] * (2 - 3 + W[18])) * Math.pow(30, -W[19]), 1e-6, 'Hard is not floored');
  assert.ok(all[2].card.s < 30);
});

test('retrievability: 0 for new cards, 0.9 at t = S, decreasing afterwards', () => {
  assert.equal(F.retrievability(F.createCard(T0), T0), 0);
  const card = { st: 2, s: 10, d: 5, lr: T0, due: T0 + 10 * DAY, stp: 0, n: 2, l: 0 };
  close(F.retrievability(card, T0 + 10 * DAY), 0.9, 1e-6);
  assert.ok(F.retrievability(card, T0 + 20 * DAY) < 0.9);
  assert.equal(F.retrievability(card, T0 + 3600e3), 1, 'same day');
});

test('fuzz is deterministic, stays inside the documented range and skips short intervals', () => {
  const card = { st: 2, s: 40, d: 5, lr: T0, due: T0 + 40 * DAY, stp: 0, n: 6, l: 0 };
  const now = T0 + 40 * DAY;
  const a = F.schedule(card, 3, now, { fuzz: true, seed: 'anat-ul-001' });
  const b = F.schedule(card, 3, now + 3600e3, { fuzz: true, seed: 'anat-ul-001' });
  assert.equal(a.log.days, b.log.days, 'same seed and card → same fuzzed interval (independent of the exact time)');
  const plain = F.schedule(card, 3, now).log.days;
  const rg = F.fuzzRange(plain, 40, 36500);
  // delta = 1 + 0.15·4.5 + 0.1·13 + 0.05·(plain − 20)
  close(plain + (1 + 0.15 * 4.5 + 0.1 * 13 + 0.05 * (plain - 20)), rg.max, 0.5 / plain, 'upper bound');
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const d = F.schedule(card, 3, now, { fuzz: true, seed: 'card-' + i }).log.days;
    assert.ok(d >= rg.min && d <= rg.max, `fuzzed ${d} outside [${rg.min}, ${rg.max}]`);
    seen.add(d);
  }
  assert.ok(seen.size > 3, 'fuzz spreads intervals');
  // < 2.5 days: never fuzzed
  for (let i = 0; i < 50; i++) assert.equal(F.applyFuzz(2, 0, {}, 's' + i), 2);
  // the PRNG is reproducible
  const p1 = F.prng('x'), p2 = F.prng('x');
  assert.equal(p1(), p2());
});

test('maximum interval is respected', () => {
  const card = { st: 2, s: 30000, d: 1, lr: T0, due: T0 + 30000 * DAY, stp: 0, n: 20, l: 0 };
  const all = F.repeat(card, T0 + 30000 * DAY, { maxInterval: 365 });
  for (const g of [2, 3, 4]) assert.ok(all[g].log.days <= 365);
});

test('study days honour the rollover hour and are DST-agnostic in UTC', () => {
  const a = Date.UTC(2026, 0, 5, 3, 59), b = Date.UTC(2026, 0, 5, 4, 0);
  assert.equal(F.dayNumber(a, 4) + 1, F.dayNumber(b, 4));
  assert.equal(F.dayKey(a, 4), '2026-01-04');
  assert.equal(F.dayKey(b, 4), '2026-01-05');
  assert.equal(F.dayFromKey('2026-01-05'), F.dayNumber(b, 4));
  const card = { st: 2, s: 5, d: 5, lr: Date.UTC(2026, 0, 4, 23, 0), due: 0, stp: 0, n: 1, l: 0 };
  assert.equal(F.elapsedDays(card, Date.UTC(2026, 0, 5, 8, 0), { rollover: 4 }), 1, '23:00 → 08:00 is one study day');
  assert.equal(F.elapsedDays(card, Date.UTC(2026, 0, 5, 2, 0), { rollover: 4 }), 0, 'before the rollover it is still the same day');
});

test('isDue: review cards are due all day; learning cards by the minute (with learn-ahead)', () => {
  const now = Date.UTC(2026, 0, 5, 9, 0);
  const review = { st: 2, s: 3, d: 5, lr: now - 3 * DAY, due: Date.UTC(2026, 0, 5, 18, 0), stp: 0, n: 2, l: 0 };
  assert.equal(F.isDue(review, now), true);
  assert.equal(F.dueInDays(review, now), 0);
  const tomorrow = Object.assign({}, review, { due: Date.UTC(2026, 0, 6, 9, 0) });
  assert.equal(F.isDue(tomorrow, now), false);
  assert.equal(F.dueInDays(tomorrow, now), 1);
  const learning = { st: 1, s: 2.3, d: 2.1, lr: now, due: now + 5 * MIN, stp: 1, n: 1, l: 0 };
  assert.equal(F.isDue(learning, now), false);
  assert.equal(F.isDue(learning, now, { learnAheadMs: 20 * MIN }), true);
  assert.equal(F.isDue(Object.assign({}, learning, { due: now - DAY }), now), true, 'left over from yesterday');
  assert.equal(F.isDue(F.createCard(now), now), false, 'new cards are introduced by the daily limit, not "due"');
});

test('formatInterval produces Anki-style labels', () => {
  assert.equal(F.formatInterval(0), 'now');
  assert.equal(F.formatInterval(30e3), '<1m');
  assert.equal(F.formatInterval(MIN), '1m');
  assert.equal(F.formatInterval(15 * MIN), '15m');
  assert.equal(F.formatInterval(90 * MIN), '1.5h');
  assert.equal(F.formatInterval(DAY), '1d');
  assert.equal(F.formatInterval(8 * DAY), '8d');
  assert.equal(F.formatInterval(45 * DAY), '1.5mo');
  assert.equal(F.formatInterval(400 * DAY), '1.1y');
});

test('robustness: invalid ratings throw, corrupt cards are reset, extra fields survive', () => {
  assert.throws(() => F.schedule(F.createCard(T0), 5, T0));
  assert.throws(() => F.schedule(F.createCard(T0), 0, T0));
  const corrupt = { st: 2, s: 'x', d: null, due: 'never', lr: 0, x: 1 };
  const { card } = F.schedule(corrupt, 3, T0);
  assert.equal(card.st, F.State.Learning, 'treated as a new card');
  assert.equal(card.s, W[2]);
  assert.equal(card.x, 1, 'UI flags are preserved');
  assert.equal(F.schedule(F.createCard(T0), 3, new Date(T0)).card.lr, T0, 'Date objects are accepted');
});

test('Easy from (re)learning is at least a day longer than Good when both graduate', () => {
  const c = { st: 3, s: 0.25, d: 8, lr: T0, due: T0 + 10 * MIN, stp: 0, n: 5, l: 1 };
  const all = F.repeat(c, T0 + 10 * MIN);
  assert.equal(all[3].card.st, F.State.Review);
  assert.ok(all[4].log.days >= all[3].log.days + 1);
});
