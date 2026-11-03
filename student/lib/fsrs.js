/* ==========================================================================
   Recall Lab · FSRS-6 scheduler and pure helpers  →  MTLib.fsrs
   --------------------------------------------------------------------------
   FSRS = Free Spaced Repetition Scheduler (open-spaced-repetition project).
   Model: DSR memory model with 21 trainable parameters (FSRS-6, trainable
   forgetting-curve decay w20).

   Implemented from docs/research/emergency-prevention-fsrs.md §8, which was
   checked against the reference source code:
     • ts-fsrs 5.2.3 ("FSRS-6.0")  src/fsrs/algorithm.ts, impl/basic_scheduler.ts,
       strategies/learning_steps.ts, help.ts  (npm: ts-fsrs@5.2.3)
     • py-fsrs  fsrs/scheduler.py  (github.com/open-spaced-repetition/py-fsrs)
     • fsrs-rs  src/inference_v6.rs (github.com/open-spaced-repetition/fsrs-rs)
   Algorithm description: github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
   Paper: Ye J, Su J, Cao Y. "A Stochastic Shortest Path Algorithm for Optimizing
   Spaced Repetition Scheduling." Proc. ACM SIGKDD (KDD '22), 2022.

   Where the references differ we follow ts-fsrs 5.2.3 (each case is marked
   "ts-fsrs:" below), except for two scheduler-policy choices that are marked
   "DEVIATION:" with the reason.

   Pure module: no DOM, no MT. Dates are passed in as Date or epoch ms and
   plain objects come out. Card state is deliberately compact because
   thousands of cards live in localStorage:
     { st: state 0 New | 1 Learning | 2 Review | 3 Relearning,
       due: epoch ms, s: stability (days), d: difficulty (1–10),
       lr: last review epoch ms (0 = never), stp: (re)learning step index,
       n: reviews, l: lapses }
   Unknown keys on a card (e.g. UI flags) are copied through untouched.

   The module also exports small pure helpers used by the Recall Lab UI so
   they can be unit-tested in Node: cloze parsing, HTML-to-text cleaning,
   CSV/TSV/Anki plain-text parsing and CSV writing.
   ========================================================================== */
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;      // Node tests
  else (root.MTLib = root.MTLib || {}).fsrs = lib;                              // browser: MTLib.fsrs
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------------
     1. Constants
     --------------------------------------------------------------------- */
  /** FSRS-6 default parameters w0…w20 (identical in py-fsrs, fsrs-rs inference_v6.rs and ts-fsrs 5.2.3). */
  var DEFAULT_W = Object.freeze([
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
    0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
    0.1542 // w20 = default decay (FSRS6_DEFAULT_DECAY)
  ]);
  var S_MIN = 0.001;      // ts-fsrs 5.2.3 S_MIN (py-fsrs STABILITY_MIN)
  var S_MAX = 36500;      // ts-fsrs S_MAX
  var D_MIN = 1, D_MAX = 10;
  var MIN_MS = 60000, DAY_MS = 86400000;
  var State = Object.freeze({ New: 0, Learning: 1, Review: 2, Relearning: 3 });
  var Rating = Object.freeze({ Again: 1, Hard: 2, Good: 3, Easy: 4 });
  var STATE_NAMES = ['New', 'Learning', 'Review', 'Relearning'];
  var RATING_NAMES = [null, 'Again', 'Hard', 'Good', 'Easy'];
  /** Scheduler defaults (py-fsrs and ts-fsrs agree on all except fuzz; ts-fsrs default fuzz = false). */
  var DEFAULTS = Object.freeze({
    retention: 0.9,              // desired retention
    learningSteps: [1, 10],      // minutes ("1m", "10m")
    relearningSteps: [10],       // minutes ("10m")
    maxInterval: 36500,          // days
    fuzz: false,                 // ts-fsrs default; the Recall Lab UI turns it on (py-fsrs/Anki default)
    rollover: 4                  // hour at which a new study day starts (Anki default 4 am); see dayNumber()
  });
  /** Fuzz ranges (identical in py-fsrs FUZZ_RANGES and ts-fsrs help.ts). */
  var FUZZ_RANGES = [
    { start: 2.5, end: 7.0, factor: 0.15 },
    { start: 7.0, end: 20.0, factor: 0.1 },
    { start: 20.0, end: Infinity, factor: 0.05 }
  ];

  /* ---------------------------------------------------------------------
     2. Small utilities
     --------------------------------------------------------------------- */
  // ts-fsrs rounds every stored/derived value with (+x.toFixed(8)); we do the same.
  function r8(x) { return +x.toFixed(8); }
  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
  function toMs(t) {
    if (t instanceof Date) return t.getTime();
    if (typeof t === 'number' && isFinite(t)) return t;
    if (t == null) return Date.now();
    var n = new Date(t).getTime();
    if (!isFinite(n)) throw new Error('Invalid date: ' + t);
    return n;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** Normalise scheduler options. */
  function options(o) {
    o = o || {};
    var w = (o.w && o.w.length === 21) ? o.w : DEFAULT_W;
    var ret = (typeof o.retention === 'number' && o.retention > 0 && o.retention <= 1) ? o.retention : DEFAULTS.retention;
    var steps = function (v, d) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'number' && x > 0; }) : d; };
    return {
      w: w,
      retention: ret,
      learningSteps: steps(o.learningSteps, DEFAULTS.learningSteps),
      relearningSteps: steps(o.relearningSteps, DEFAULTS.relearningSteps),
      maxInterval: (o.maxInterval >= 1) ? Math.floor(o.maxInterval) : DEFAULTS.maxInterval,
      fuzz: !!o.fuzz,
      seed: o.seed == null ? '' : String(o.seed),
      rollover: (typeof o.rollover === 'number' && o.rollover >= 0 && o.rollover < 24) ? Math.floor(o.rollover) : DEFAULTS.rollover
    };
  }

  /* ---------------------------------------------------------------------
     3. Study days
     FSRS counts elapsed time t in whole days. ts-fsrs uses the difference of
     UTC calendar dates (help.ts dateDiffInDays); py-fsrs uses floor(24-hour
     periods). DEVIATION: we count *local* study days with a rollover hour
     (default 4 am, as in Anki, whose review logs FSRS was trained on), so a
     card reviewed at 23:00 and again at 08:00 is one day apart wherever the
     user lives. With rollover 0 and TZ=UTC this equals ts-fsrs exactly.
     --------------------------------------------------------------------- */
  /** Integer day index of the study day containing ms (local time, rollover hour). */
  function dayNumber(ms, rollover) {
    var d = new Date(toMs(ms));
    var n = Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
    if (d.getHours() < (rollover == null ? DEFAULTS.rollover : rollover)) n -= 1;
    return n;
  }
  /** 'YYYY-MM-DD' label of the study day containing ms. */
  function dayKey(ms, rollover) {
    var d = new Date(dayNumber(ms, rollover) * DAY_MS);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  /** Inverse of dayKey: 'YYYY-MM-DD' -> day index. */
  function dayFromKey(key) {
    var p = String(key).split('-').map(Number);
    return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / DAY_MS);
  }
  /** Add whole calendar days keeping the local clock time (DST-safe). */
  function addDays(ms, days) { var d = new Date(toMs(ms)); d.setDate(d.getDate() + days); return d.getTime(); }
  /** Whole study days elapsed since the card's last review (0 for new cards). */
  function elapsedDays(card, now, opts) {
    if (!card || !card.lr || card.st === State.New) return 0;
    var r = options(opts).rollover;
    return Math.max(0, dayNumber(now, r) - dayNumber(card.lr, r));
  }

  /* ---------------------------------------------------------------------
     4. Memory model (FSRS-6 formulas, research notes §8.2)
     --------------------------------------------------------------------- */
  /** DECAY = −w20; FACTOR = 0.9^(1/DECAY) − 1, so that R(t = S) = 0.9. */
  function decayFactor(w) {
    var decay = -(w || DEFAULT_W)[20];
    var factor = Math.exp(Math.pow(decay, -1) * Math.log(0.9)) - 1;
    return { decay: decay, factor: r8(factor) };        // ts-fsrs rounds FACTOR to 8 dp
  }
  /** Retrievability (probability of recall) after t days with stability S: R = (1 + FACTOR·t/S)^DECAY. */
  function forgettingCurve(t, s, w) {
    var df = decayFactor(w);
    return r8(Math.pow(1 + df.factor * t / s, df.decay));
  }
  /** I(r, S) / S = (r^(1/DECAY) − 1) / FACTOR (= 1 at r = 0.9). */
  function intervalModifier(retention, w) {
    if (!(retention > 0 && retention <= 1)) throw new Error('Desired retention must be in (0, 1]');
    var df = decayFactor(w);
    return r8((Math.pow(retention, 1 / df.decay) - 1) / df.factor);
  }
  /** Raw (unrounded) optimal interval in days: I(r, S) = S/FACTOR · (r^(1/DECAY) − 1). */
  function rawInterval(s, retention, w) { return s * intervalModifier(retention == null ? DEFAULTS.retention : retention, w || DEFAULT_W); }
  /** Interval in whole days: round, at least 1, at most maxInterval (no fuzz). */
  function nextInterval(s, retention, w, maxInterval) {
    return Math.min(Math.max(1, Math.round(rawInterval(s, retention, w))), maxInterval || DEFAULTS.maxInterval);
  }
  /** S0(G) = w[G−1]. ts-fsrs floors it at 0.1 (py-fsrs at 0.001); irrelevant for the defaults. */
  function initStability(g, w) { return Math.max((w || DEFAULT_W)[g - 1], 0.1); }
  /** D0(G) = w4 − e^(w5·(G−1)) + 1, unclamped (callers clamp to [1, 10]; mean reversion uses the raw D0(4)). */
  function initDifficulty(g, w) { w = w || DEFAULT_W; return r8(w[4] - Math.exp((g - 1) * w[5]) + 1); }
  /** D' = clamp(w7·D0(4) + (1 − w7)·(D + ΔD·(10 − D)/9), 1, 10), ΔD = −w6·(G − 3). */
  function nextDifficulty(d, g, w) {
    w = w || DEFAULT_W;
    var delta = -w[6] * (g - 3);
    var damped = d + r8(delta * (10 - d) / 9);                       // linear damping
    var reverted = r8(w[7] * initDifficulty(4, w) + (1 - w[7]) * damped); // mean reversion
    return clamp(reverted, D_MIN, D_MAX);
  }
  /** Stability after a successful review (G = 2, 3, 4). */
  function nextRecallStability(d, s, r, g, w) {
    w = w || DEFAULT_W;
    var hardPenalty = g === Rating.Hard ? w[15] : 1;
    var easyBonus = g === Rating.Easy ? w[16] : 1;
    return r8(clamp(s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) *
      (Math.exp((1 - r) * w[10]) - 1) * hardPenalty * easyBonus), S_MIN, S_MAX));
  }
  /** Long-term stability after a lapse: w11·D^−w12·((S+1)^w13 − 1)·e^(w14·(1 − R)). */
  function nextForgetStability(d, s, r, w) {
    w = w || DEFAULT_W;
    return r8(clamp(w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]), S_MIN, S_MAX));
  }
  /**
   * Same-day (short-term) stability: S' = S·SInc, SInc = e^(w17·(G − 3 + w18))·S^(−w19).
   * ts-fsrs: SInc is floored at 1 only for G ≥ 3 (py-fsrs and the wiki floor it for G ≥ 2).
   */
  function nextShortTermStability(s, g, w) {
    w = w || DEFAULT_W;
    var sinc = Math.pow(s, -w[19]) * Math.exp(w[17] * (g - 3 + w[18]));
    if (g >= 3) sinc = Math.max(sinc, 1);
    return r8(clamp(s * sinc, S_MIN, S_MAX));
  }
  /**
   * One memory-state transition (ts-fsrs FSRSAlgorithm.next_state, which matches py-fsrs and fsrs-rs):
   * first review → S0, D0; same study day (t = 0) → short-term formula; lapse → min(S/e^(w17·w18), S'f);
   * success → recall formula. Returns { s, d, r } where r is the retrievability at review time.
   * (ts-fsrs's BasicScheduler instead always uses the short-term formula in (re)learning and never in
   *  review; we follow the model definition shared by next_state, py-fsrs and fsrs-rs.)
   */
  function nextMemory(s, d, t, g, w) {
    w = w || DEFAULT_W;
    if (!s && !d) return { s: initStability(g, w), d: clamp(initDifficulty(g, w), D_MIN, D_MAX), r: null };
    var r = forgettingCurve(t, s, w);
    var ns;
    if (t === 0) ns = nextShortTermStability(s, g, w);
    else if (g === Rating.Again) ns = clamp(r8(s / Math.exp(w[17] * w[18])), S_MIN, nextForgetStability(d, s, r, w));
    else ns = nextRecallStability(d, s, r, g, w);
    return { s: ns, d: nextDifficulty(d, g, w), r: r };
  }
  /**
   * Interval multiplier relative to 90 % retention: I(r)/I(0.9). Used for the retention-slider
   * workload hint (fewer days between reviews → proportionally more reviews per day, roughly).
   */
  function retentionIntervalFactor(retention, w) { return intervalModifier(retention, w) / intervalModifier(0.9, w); }

  /* ---------------------------------------------------------------------
     5. Fuzz (optional, deterministic)
     Range rule from ts-fsrs help.ts get_fuzz_range (py-fsrs is the same minus
     the elapsed-days clause). The random draw comes from a seeded PRNG
     (FNV-1a hash → mulberry32), seeded with opts.seed + review count + last
     review time, so the preview and the real schedule agree and tests are
     reproducible. ts-fsrs seeds alea() with review time, reps and S·D.
     --------------------------------------------------------------------- */
  function fuzzRange(ivl, elapsed, maxInterval) {
    var delta = 1;
    FUZZ_RANGES.forEach(function (rg) { delta += rg.factor * Math.max(Math.min(ivl, rg.end) - rg.start, 0); });
    ivl = Math.min(ivl, maxInterval);
    var lo = Math.max(2, Math.round(ivl - delta));
    var hi = Math.min(Math.round(ivl + delta), maxInterval);
    if (ivl > elapsed) lo = Math.max(lo, elapsed + 1);
    lo = Math.min(lo, hi);
    return { min: lo, max: hi };
  }
  function hashString(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  /** Deterministic PRNG: returns a function producing floats in [0, 1). */
  function prng(seed) {
    var a = hashString(String(seed)) || 0x9e3779b9;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function fuzzSeed(card, o) { return o.seed + '|' + (card.n || 0) + '|' + (card.lr || 0); }
  /** Apply fuzz to a whole-day interval (no fuzz below 2.5 days, as in both references). */
  function applyFuzz(ivl, elapsed, o, seed) {
    if (!o.fuzz || ivl < 2.5) return Math.round(ivl);
    var rg = fuzzRange(ivl, elapsed, o.maxInterval);
    var u = prng(seed)();
    return Math.min(Math.floor(u * (rg.max - rg.min + 1) + rg.min), o.maxInterval);
  }
  function scheduledDays(s, elapsed, o, seed) {
    var ivl = Math.min(Math.max(1, Math.round(s * intervalModifier(o.retention, o.w))), o.maxInterval);
    return applyFuzz(ivl, elapsed, o, seed);
  }

  /* ---------------------------------------------------------------------
     6. Learning steps
     DEVIATION (scheduler policy, not the memory model): we use the Anki /
     py-fsrs step rules described in the research notes §8.5 — Again → first
     step; Hard → repeat the step (on the first step: the average of the first
     two steps, or 1.5 × a single step); Good → next step, graduating after
     the last; Easy → graduate. ts-fsrs 5.x's BasicLearningStepsStrategy adds
     one to the step index of Learning cards on Good (a compatibility shim for
     its pre-5.0 fixed steps), which skips the 10-minute step after a failed
     first answer. Minutes are rounded as in ts-fsrs (5.5 → 6 min).
     Returns { minutes, step } or null when the card graduates.
     --------------------------------------------------------------------- */
  function stepOutcome(steps, step, g) {
    var n = steps.length;
    if (!n) return null;                                    // no steps: straight to Review
    if (step >= n && g !== Rating.Again) return null;       // step list was shortened since
    if (g === Rating.Again) return { minutes: steps[0], step: 0 };
    if (g === Rating.Hard) {
      var m = step === 0 ? (n === 1 ? steps[0] * 1.5 : (steps[0] + steps[1]) / 2) : steps[Math.min(step, n - 1)];
      return { minutes: Math.round(m), step: step };
    }
    if (g === Rating.Good) return step + 1 < n ? { minutes: steps[step + 1], step: step + 1 } : null;
    return null;                                            // Easy graduates
  }

  /* ---------------------------------------------------------------------
     7. Scheduler
     --------------------------------------------------------------------- */
  /** A brand-new card, due now. */
  function createCard(now) { return { st: State.New, due: toMs(now), s: 0, d: 0, lr: 0, stp: 0, n: 0, l: 0 }; }
  function normaliseCard(card) {
    var c = Object.assign({}, card || {});
    if (!(c.st >= 0 && c.st <= 3)) c.st = State.New;
    c.s = +c.s || 0; c.d = +c.d || 0; c.lr = +c.lr || 0; c.stp = c.stp | 0; c.n = c.n | 0; c.l = c.l | 0;
    if (!isFinite(+c.due)) c.due = 0; else c.due = +c.due;
    if (c.st !== State.New && !(c.s > 0 && c.d >= D_MIN)) { // corrupt memory state → treat as new
      c.st = State.New; c.s = 0; c.d = 0; c.stp = 0;
    }
    return c;
  }
  function checkRating(g) { if (g !== 1 && g !== 2 && g !== 3 && g !== 4) throw new Error('Invalid rating "' + g + '" (expected 1–4)'); }

  /**
   * Compute all four outcomes for a review at `now` (like ts-fsrs `repeat`).
   * Returns { 1: {card, log}, 2: …, 3: …, 4: … }.
   */
  function repeat(card, now, opts) {
    var o = options(opts), c0 = normaliseCard(card), nowMs = toMs(now);
    var isNew = c0.st === State.New;
    var t = isNew ? 0 : elapsedDays(c0, nowMs, o);
    var seed = fuzzSeed(c0, o);
    var out = {};
    var mem = {};
    [1, 2, 3, 4].forEach(function (g) { mem[g] = nextMemory(isNew ? 0 : c0.s, isNew ? 0 : c0.d, t, g, o.w); });

    function finish(g, st, stp, minutes, days, extra) {
      var c = Object.assign({}, c0);
      c.s = mem[g].s; c.d = mem[g].d; c.st = st; c.stp = stp;
      c.n = c0.n + 1; c.lr = nowMs;
      if (extra && extra.lapse) c.l = c0.l + 1;
      var ivlMs = minutes ? minutes * MIN_MS : days * DAY_MS;
      c.due = minutes ? nowMs + minutes * MIN_MS : addDays(nowMs, days);
      var prevIvl = (c0.st === State.Review && c0.lr) ? Math.max(0, dayNumber(c0.due, o.rollover) - dayNumber(c0.lr, o.rollover)) : 0;
      out[g] = {
        card: c,
        log: { r: g, st: c0.st, t: nowMs, e: t, R: mem[g].r, pi: prevIvl, ivl: ivlMs, days: days, mins: minutes }
      };
    }

    if (c0.st === State.Review) {
      // Lapse → relearning steps (or straight back to Review when there are none).
      var rs = stepOutcome(o.relearningSteps, 0, 1);
      if (rs) finish(1, State.Relearning, rs.step, rs.minutes, 0, { lapse: true });
      else finish(1, State.Review, 0, 0, scheduledDays(mem[1].s, t, o, seed), { lapse: true });
      // ts-fsrs ordering rule after Review: Hard ≤ Good < Easy (each at least one day apart).
      var hard = scheduledDays(mem[2].s, t, o, seed), good = scheduledDays(mem[3].s, t, o, seed);
      hard = Math.min(hard, good);
      good = Math.max(good, hard + 1);
      var easy = Math.max(scheduledDays(mem[4].s, t, o, seed), good + 1);
      finish(2, State.Review, 0, 0, Math.min(hard, o.maxInterval));
      finish(3, State.Review, 0, 0, Math.min(good, o.maxInterval));
      finish(4, State.Review, 0, 0, Math.min(easy, o.maxInterval));
    } else {
      var relearn = c0.st === State.Relearning;
      var steps = relearn ? o.relearningSteps : o.learningSteps;
      var step = isNew ? 0 : c0.stp;
      var goodDays = null;
      [1, 2, 3, 4].forEach(function (g) {
        var so = stepOutcome(steps, step, g);
        if (so) { finish(g, relearn ? State.Relearning : State.Learning, so.step, so.minutes, 0); return; }
        var days = scheduledDays(mem[g].s, t, o, seed);
        if (g === 3) goodDays = days;
        // DEVIATION (as in Anki): when Good also graduates, Easy is kept at least a day longer.
        if (g === 4 && goodDays != null) days = Math.min(Math.max(days, goodDays + 1), o.maxInterval);
        finish(g, State.Review, 0, 0, days);
      });
    }
    return out;
  }
  /** Review a card with rating 1 Again | 2 Hard | 3 Good | 4 Easy at `now`. Returns { card, log }. */
  function schedule(card, rating, now, opts) { checkRating(rating); return repeat(card, now, opts)[rating]; }
  /** Interval (ms until due) for each rating, for the answer-button labels. */
  function previewIntervals(card, now, opts) {
    var all = repeat(card, now, opts);
    return { 1: all[1].log.ivl, 2: all[2].log.ivl, 3: all[3].log.ivl, 4: all[4].log.ivl };
  }
  /** Current probability of recall (0 for new cards), using whole elapsed study days as FSRS does. */
  function retrievability(card, now, opts) {
    if (!card || card.st === State.New || !(card.s > 0)) return 0;
    var o = options(opts);
    return forgettingCurve(elapsedDays(card, now, o), card.s, o.w);
  }
  /** Days from today until the card is due (≤ 0 = due today or overdue). New cards → 0. */
  function dueInDays(card, now, opts) {
    if (!card || card.st === State.New) return 0;
    var r = options(opts).rollover;
    return dayNumber(card.due, r) - dayNumber(now, r);
  }
  /**
   * Is a non-new card due? Review cards are due for their whole due study day (as in Anki);
   * (re)learning cards when their minute-level due time has passed (opts.learnAheadMs allows
   * showing them a little early) or when they were left over from a previous day.
   */
  function isDue(card, now, opts) {
    if (!card || card.st === State.New) return false;
    var nowMs = toMs(now);
    if (card.st === State.Review) return dueInDays(card, nowMs, opts) <= 0;
    var ahead = (opts && opts.learnAheadMs) || 0;
    return card.due <= nowMs + ahead || dueInDays(card, nowMs, opts) < 0;
  }

  /** Anki-style compact interval label: <1m, 6m, 1.5h, 3d, 1.2mo, 2.1y. */
  function formatInterval(ms) {
    if (!(ms > 0)) return 'now';
    if (ms < MIN_MS) return '<1m';
    var trim = function (x) { return String(+x.toFixed(1)); };
    var min = ms / MIN_MS;
    if (Math.round(min) < 60) return Math.round(min) + 'm';
    var h = ms / 3600000;
    if (h < 23.5) return (h < 10 ? trim(h) : String(Math.round(h))) + 'h';
    var days = ms / DAY_MS;
    if (Math.round(days) < 30) return Math.max(1, Math.round(days)) + 'd';
    if (days < 365) return trim(days / 30) + 'mo';
    return trim(days / 365) + 'y';
  }

  /* ---------------------------------------------------------------------
     8. Cloze helpers  ({{c1::answer}} and {{c1::answer::hint}}, Anki syntax)
     --------------------------------------------------------------------- */
  var CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;
  /** Sorted unique cloze numbers in a text (e.g. [1, 2]). */
  function clozeNumbers(text) {
    var seen = {}, out = [], m;
    CLOZE_RE.lastIndex = 0;
    while ((m = CLOZE_RE.exec(String(text || ''))) !== null) { var n = +m[1]; if (n > 0 && !seen[n]) { seen[n] = 1; out.push(n); } }
    return out.sort(function (a, b) { return a - b; });
  }
  /**
   * Split a cloze text into render segments for sub-card `n`:
   * [{ type: 'text', text }, { type: 'cloze', n, text, hint, active }]. Inactive clozes are shown
   * as plain answers; the UI hides active ones on the front and highlights them on the back.
   */
  function clozeSegments(text, n) {
    var s = String(text || ''), out = [], last = 0, m;
    CLOZE_RE.lastIndex = 0;
    while ((m = CLOZE_RE.exec(s)) !== null) {
      if (m.index > last) out.push({ type: 'text', text: s.slice(last, m.index) });
      var num = +m[1];
      if (num === n) out.push({ type: 'cloze', n: num, text: m[2], hint: m[3] || '', active: true });
      else out.push({ type: 'text', text: m[2] });
      last = m.index + m[0].length;
    }
    if (last < s.length) out.push({ type: 'text', text: s.slice(last) });
    return out;
  }
  /** Plain-text rendering of a cloze sub-card (front hides the active part as "[…]" or "[hint]"). */
  function clozeText(text, n, reveal) {
    return clozeSegments(text, n).map(function (sg) {
      if (sg.type === 'text') return sg.text;
      return reveal ? sg.text : '[' + (sg.hint || '…') + ']';
    }).join('');
  }
  /** Text with cloze markup removed (all answers shown) — for search and lists. */
  function clozeStrip(text) { return String(text || '').replace(CLOZE_RE, function (m0, n, a) { return a; }); }

  /* ---------------------------------------------------------------------
     9. Import / export helpers
     --------------------------------------------------------------------- */
  // Only these tag names are removed, so plain text such as "K+ < 3.5 and pH > 7.45" survives.
  var TAG_RE = /<\/?(?:a|b|big|blockquote|br|code|del|div|em|font|h[1-6]|hr|i|img|ins|li|mark|ol|p|pre|s|small|span|strike|strong|sub|sup|table|tbody|td|th|thead|tr|u|ul)\b[^>]*>/gi;
  function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|nbsp|amp|lt|gt|quot|apos|#39|ndash|mdash|hellip|deg|plusmn|micro|times|middot|rarr|larr|uarr|darr|alpha|beta|gamma|delta|mu);/gi, function (m, e) {
      var k = e.toLowerCase();
      var named = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', hellip: '…', deg: '°', plusmn: '±', micro: 'µ', times: '×', middot: '·', rarr: '→', larr: '←', uarr: '↑', darr: '↓', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', mu: 'μ' };
      if (named[k] != null) return named[k];
      var code = k.charAt(1) === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      return (code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) ? String.fromCodePoint(code) : '';
    });
  }
  /** Turn Anki/HTML field content into plain text (line breaks kept; images and sounds noted). */
  function htmlToText(str) {
    var s = String(str == null ? '' : str);
    s = s.replace(/\[sound:[^\]]*\]/gi, '')
      .replace(/<img\b[^>]*>/gi, ' [image] ')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/\s*(?:div|p|li|tr|h[1-6]|blockquote|pre)\s*>/gi, '\n')
      .replace(/<\s*li\b[^>]*>/gi, '• ')
      .replace(TAG_RE, '');
    s = decodeEntities(s);
    return s.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  }
  /** Does a field look like it contains HTML markup? */
  function looksLikeHtml(s) { TAG_RE.lastIndex = 0; var r = TAG_RE.test(String(s || '')) || /&(?:nbsp|amp|lt|gt|quot|#\d+);/i.test(String(s || '')); TAG_RE.lastIndex = 0; return r; }

  var SEP_NAMES = { tab: '\t', comma: ',', semicolon: ';', space: ' ', pipe: '|', colon: ':' };
  /** RFC 4180-style split with a given delimiter (quoted fields may contain delimiters, "" and newlines). */
  function splitDelimited(text, delim) {
    var rows = [], row = [], field = '', i = 0, inQ = false, c, n = text.length, quotedField = false;
    while (i < n) {
      c = text.charAt(i);
      if (inQ) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"' && field === '' && !quotedField) { inQ = true; quotedField = true; i++; continue; }
      if (c === delim) { row.push(field); field = ''; quotedField = false; i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; quotedField = false; i++; continue; }
      field += c; i++;
    }
    if (field !== '' || row.length || quotedField) { row.push(field); rows.push(row); }
    return rows;
  }
  /** Guess the delimiter from the first lines: tab, then semicolon, then comma (consistency wins). */
  function guessDelimiter(lines) {
    var sample = lines.filter(function (l) { return l.trim(); }).slice(0, 20);
    if (!sample.length) return '\t';
    var best = '\t', bestScore = -1;
    ['\t', ';', ','].forEach(function (d) {
      var counts = sample.map(function (l) { return l.split(d).length - 1; });
      var withD = counts.filter(function (x) { return x > 0; }).length;
      var score = withD / sample.length + (d === '\t' ? 0.3 : d === ';' ? 0.1 : 0);
      if (withD && score > bestScore) { bestScore = score; best = d; }
    });
    return best;
  }
  /**
   * Parse CSV/TSV or an Anki "Notes in Plain Text" export.
   * Honours Anki header lines (#separator:tab, #html:true, #tags column:N, #deck column:N,
   * #notetype column:N, #guid column:N, #columns:…). Returns
   * { delimiter, html: true|false|null, columns: { tags, deck, notetype, guid } (0-based or -1),
   *   header: [names] | null, rows: [[fields]] } with empty rows removed.
   */
  function parseDelimited(input, opts) {
    opts = opts || {};
    var text = String(input == null ? '' : input).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    var lines = text.split('\n');
    var directives = { separator: null, html: null, tags: -1, deck: -1, notetype: -1, guid: -1, header: null };
    var start = 0;
    while (start < lines.length && /^#/.test(lines[start])) {
      var m = /^#\s*([a-z ]+?)\s*:\s*(.*)$/i.exec(lines[start]);
      if (m) {
        var key = m[1].toLowerCase(), val = m[2];
        if (key === 'separator') { var v = val.trim().toLowerCase(); directives.separator = SEP_NAMES[v] || (val.length === 1 ? val : null); }
        else if (key === 'html') directives.html = /^true$/i.test(val.trim());
        else if (/^(tags|deck|notetype|guid) column$/.test(key)) { var idx = parseInt(val, 10); if (idx > 0) directives[key.split(' ')[0]] = idx - 1; }
        else if (key === 'columns') directives.header = val;
      }
      start++;
    }
    var body = lines.slice(start).join('\n');
    var delim = opts.delimiter || directives.separator || guessDelimiter(lines.slice(start));
    var rows = splitDelimited(body, delim).filter(function (r) { return r.some(function (f) { return String(f).trim() !== ''; }); });
    var header = null;
    if (directives.header) header = splitDelimited(directives.header, delim)[0] || null;
    return {
      delimiter: delim,
      html: directives.html,
      columns: { tags: directives.tags, deck: directives.deck, notetype: directives.notetype, guid: directives.guid },
      header: header,
      rows: rows
    };
  }
  var HEADER_ALIASES = {
    front: ['front', 'question', 'q', 'term', 'prompt', 'text', 'side 1', 'side1'],
    back: ['back', 'answer', 'a', 'definition', 'response', 'side 2', 'side2', 'back extra'],
    tags: ['tags', 'tag', 'labels'],
    extra: ['extra', 'notes', 'note', 'explanation', 'why', 'mnemonic'],
    deck: ['deck', 'deck name']
  };
  /** Suggest column roles { front, back, tags, extra, deck, header:bool } from parsed data. */
  function suggestMapping(parsed) {
    var map = { front: 0, back: 1, tags: -1, extra: -1, deck: -1, header: false };
    var first = (parsed.header || parsed.rows[0] || []).map(function (x) { return String(x).trim().toLowerCase(); });
    var found = {};
    first.forEach(function (name, i) {
      Object.keys(HEADER_ALIASES).forEach(function (role) { if (found[role] == null && HEADER_ALIASES[role].indexOf(name) >= 0) found[role] = i; });
    });
    if (found.front != null && (found.back != null || found.front === 0)) {
      Object.keys(found).forEach(function (k) { map[k] = found[k]; });
      if (found.back == null) map.back = found.front === 0 ? 1 : 0;
      map.header = !parsed.header; // a header row inside the data must be skipped
    } else {
      // Anki plain-text export: skip guid/notetype/deck columns, take the next two fields.
      var skip = [parsed.columns.guid, parsed.columns.notetype, parsed.columns.deck, parsed.columns.tags];
      var width = Math.max.apply(null, parsed.rows.slice(0, 50).map(function (r) { return r.length; }).concat([0]));
      var fields = [];
      for (var i = 0; i < width; i++) if (skip.indexOf(i) < 0) fields.push(i);
      map.front = fields.length > 0 ? fields[0] : 0;
      map.back = fields.length > 1 ? fields[1] : -1;
      map.tags = parsed.columns.tags;
      if (map.tags < 0 && fields.length > 2 && skip.indexOf(2) < 0 && width === 3) map.tags = 2; // front, back, tags
      map.deck = parsed.columns.deck;
    }
    return map;
  }
  /** Normalise a tag list ("a b, c" or array) → unique tags without spaces or '#'. */
  function splitTags(v) {
    var arr = Array.isArray(v) ? v : String(v || '').split(/[\s,]+/);
    var out = [];
    arr.forEach(function (t) { t = String(t).trim().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 60); if (t && out.indexOf(t) < 0) out.push(t); });
    return out.slice(0, 30);
  }
  /**
   * Build card drafts from parsed rows and a column mapping.
   * html: true | false | null (null → strip only if the field looks like HTML).
   * Returns { cards: [{ type:'basic', front, back, extra, tags, deckName } |
   *                    { type:'cloze', text, extra, tags, deckName }], skipped: [{ row, reason }] }.
   */
  function rowsToCards(parsed, mapping, opts) {
    opts = opts || {};
    var maxLen = opts.maxLen || 5000, maxCards = opts.maxCards || 20000;
    var html = parsed.html;
    var cards = [], skipped = [];
    function get(row, idx) {
      if (!(idx >= 0) || idx >= row.length) return '';
      var v = String(row[idx] == null ? '' : row[idx]);
      if (html === true || (html == null && looksLikeHtml(v))) v = htmlToText(v);
      return v.trim().slice(0, maxLen);
    }
    parsed.rows.forEach(function (row, i) {
      if (mapping.header && i === 0) return;
      if (cards.length >= maxCards) { skipped.push({ row: i + 1, reason: 'limit' }); return; }
      var front = get(row, mapping.front), back = get(row, mapping.back), extra = get(row, mapping.extra);
      var tags = mapping.tags >= 0 ? splitTags(get(row, mapping.tags)) : [];
      var deckName = mapping.deck >= 0 ? get(row, mapping.deck) : '';
      if (!front) { skipped.push({ row: i + 1, reason: 'empty front' }); return; }
      if (clozeNumbers(front).length) {
        cards.push({ type: 'cloze', text: front, extra: [back, extra].filter(Boolean).join('\n'), tags: tags, deckName: deckName });
      } else if (!back) {
        skipped.push({ row: i + 1, reason: 'empty back' });
      } else {
        cards.push({ type: 'basic', front: front, back: back, extra: extra, tags: tags, deckName: deckName });
      }
    });
    return { cards: cards, skipped: skipped };
  }
  /** Write rows as CSV (RFC 4180 quoting, CRLF line ends). */
  function toCSV(rows, delim) {
    delim = delim || ',';
    return rows.map(function (r) {
      return r.map(function (v) {
        var s = v == null ? '' : String(v);
        return (s.indexOf(delim) >= 0 || /["\r\n]/.test(s) || /^\s|\s$/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(delim);
    }).join('\r\n');
  }

  return {
    VERSION: 'FSRS-6',
    DEFAULT_W: DEFAULT_W,
    DEFAULTS: DEFAULTS,
    S_MIN: S_MIN, S_MAX: S_MAX,
    DAY_MS: DAY_MS, MIN_MS: MIN_MS,
    State: State, Rating: Rating, STATE_NAMES: STATE_NAMES, RATING_NAMES: RATING_NAMES,
    // memory model
    decayFactor: decayFactor, forgettingCurve: forgettingCurve, intervalModifier: intervalModifier,
    rawInterval: rawInterval, nextInterval: nextInterval, initStability: initStability, initDifficulty: initDifficulty,
    nextDifficulty: nextDifficulty, nextRecallStability: nextRecallStability, nextForgetStability: nextForgetStability,
    nextShortTermStability: nextShortTermStability, nextMemory: nextMemory, retentionIntervalFactor: retentionIntervalFactor,
    // fuzz
    fuzzRange: fuzzRange, prng: prng, applyFuzz: function (ivl, elapsed, opts, seed) { return applyFuzz(ivl, elapsed, options(Object.assign({ fuzz: true }, opts)), seed); },
    stepOutcome: stepOutcome,
    // scheduling
    options: options, createCard: createCard, schedule: schedule, repeat: repeat, previewIntervals: previewIntervals,
    retrievability: retrievability, elapsedDays: elapsedDays, dueInDays: dueInDays, isDue: isDue,
    // time
    dayNumber: dayNumber, dayKey: dayKey, dayFromKey: dayFromKey, addDays: addDays, formatInterval: formatInterval,
    // cloze
    clozeNumbers: clozeNumbers, clozeSegments: clozeSegments, clozeText: clozeText, clozeStrip: clozeStrip,
    // import/export
    htmlToText: htmlToText, looksLikeHtml: looksLikeHtml, parseDelimited: parseDelimited, splitDelimited: splitDelimited,
    suggestMapping: suggestMapping, splitTags: splitTags, rowsToCards: rowsToCards, toCSV: toCSV
  };
});
