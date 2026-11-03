/* MTLib.ebm — pure statistics for evidence-based medicine and epidemiology.
 *
 * Sources
 *  - Wilson EB (1927) J Am Stat Assoc 22:209. Score interval; Newcombe RG (1998) Stat Med 17:857-872 (method 3),
 *    and Newcombe RG (1998) Stat Med 17:873-890 (hybrid score interval for a difference, method 10).
 *  - Likelihood ratios, log method: Simel DL, Samsa GP, Matchar DB (1991) J Clin Epidemiol 44:763; Altman DG et al.,
 *    Statistics with Confidence 2nd ed. (2000), ch. 10.
 *  - RR (Katz log method) and OR (Woolf logit method): Katz D et al. (1978) Biometrics 34:469; Woolf B (1955) Ann Hum Genet 19:251.
 *  - NNT and its confidence interval by inversion: Altman DG (1998) BMJ 317:1309-1312; Laupacis A, Sackett DL, Roberts RS (1988) NEJM 318:1728.
 *  - Fagan TJ (1975) NEJM 293:257 (nomogram); Sackett DL et al., Evidence-Based Medicine 2nd ed. (2000).
 *  - Sample size, two proportions: Fleiss JL, Levin B, Paik MC, Statistical Methods for Rates and Proportions 3rd ed. (2003)
 *    (continuity correction eq. 4.14); two means: Chow S-C, Shao J, Wang H, Sample Size Calculations in Clinical Research (2008);
 *    small-sample adjustment of Guenther WC (1981) Am Stat 35:243 (adds z(1-a/2)^2 / 4 per group).
 *  - Levin ML (1953) Acta Un Int Cancer 9:531 (PAF); Miettinen OS (1974) Am J Epidemiol 99:325.
 *  - Exact (Garwood 1936) Poisson interval; Byar approximation (Breslow & Day, Statistical Methods in Cancer Research vol II, 1987, p.69).
 *  - Direct standardisation: Dobson AJ et al. (1991) Stat Med 10:457; Armitage & Berry, Statistical Methods in Medical Research.
 *  - Herd immunity: Anderson RM & May RM, Infectious Diseases of Humans (1991); vaccine efficacy: Orenstein WA et al. (1985) Bull WHO 63:1055.
 */
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else (root.MTLib = root.MTLib || {}).ebm = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LN2 = Math.LN2;

  /* ---------- normal distribution ---------- */
  /** Standard normal CDF (series for |x|<7, continued-fraction tail beyond). */
  function normCdf(x) {
    if (x === Infinity) return 1; if (x === -Infinity) return 0;
    var ax = Math.abs(x), p;
    if (ax > 8.3) p = 0;
    else if (ax < 3) {
      var sum = ax, term = ax, n = 0;
      while (Math.abs(term) > 1e-17 * Math.abs(sum) && n < 200) { n++; term *= ax * ax / (2 * n + 1); sum += term; }
      p = 1 - (0.5 + sum * Math.exp(-ax * ax / 2) / Math.sqrt(2 * Math.PI));
    } else { // Lentz continued fraction for the upper tail Q(x)
      var f = 0; for (var k = 60; k >= 1; k--) f = k / (ax + f);
      p = Math.exp(-ax * ax / 2) / Math.sqrt(2 * Math.PI) / (ax + f);
    }
    return x >= 0 ? 1 - p : p;
  }
  /** Standard normal quantile, Wichura AS241 (PPND16), relative accuracy ~1e-16. */
  function normInv(p) {
    if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
    var q = p - 0.5, r, val;
    if (Math.abs(q) <= 0.425) {
      r = 0.180625 - q * q;
      return q * (((((((r * 2509.0809287301226727 + 33430.575583588128105) * r + 67265.770927008700853) * r + 45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r + 133.14166789178437745) * r + 3.387132872796366608) /
        (((((((r * 5226.495278852545925 + 28729.085735721942674) * r + 39307.89580009271061) * r + 21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r + 42.313330701600911252) * r + 1);
    }
    r = q < 0 ? p : 1 - p;
    r = Math.sqrt(-Math.log(r));
    if (r <= 5) {
      r -= 1.6;
      val = (((((((r * 7.7454501427834140764e-4 + 0.0227238449892691845833) * r + 0.24178072517745061177) * r + 1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r + 4.6303378461565452959) * r + 1.42343711074968357734) /
        (((((((r * 1.05075007164441684324e-9 + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r + 0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r + 2.05319162663775882187) * r + 1);
    } else {
      r -= 5;
      val = (((((((r * 2.01033439929228813265e-7 + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r + 0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r + 5.4637849111641143699) * r + 6.6579046435011037772) /
        (((((((r * 2.04426310338993978564e-15 + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r + 7.868691311456132591e-4) * r + 0.0148753612908506148525) * r + 0.13692988092273580531) * r + 0.59983220655588793769) * r + 1);
    }
    return q < 0 ? -val : val;
  }
  /** Two-sided z for a confidence level, e.g. 0.95 -> 1.959964. */
  function zFor(level) { return normInv(1 - (1 - (level == null ? 0.95 : level)) / 2); }

  /* ---------- proportions ---------- */
  /** Wilson score interval for x/n (Newcombe 1998, method 3). */
  function wilson(x, n, level) {
    if (!(n > 0)) return { p: NaN, lo: NaN, hi: NaN, x: x, n: n };
    var z = zFor(level), p = x / n, z2 = z * z, d = 1 + z2 / n;
    var c = (p + z2 / (2 * n)) / d;
    var h = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / d;
    return { p: p, lo: Math.max(0, c - h), hi: Math.min(1, c + h), x: x, n: n };
  }

  /* ---------- diagnostic accuracy ---------- */
  function ratioCI(est, se, z) { return { v: est, lo: Math.exp(Math.log(est) - z * se), hi: Math.exp(Math.log(est) + z * se) }; }
  /**
   * Diagnostic 2x2: tp, fp, fn, tn (rows = test result, columns = reference standard).
   * Proportions use Wilson CIs. LR+/LR-/DOR use log-method CIs; if any cell is 0 the Haldane-Anscombe
   * correction (+0.5 to every cell) is applied to the ratio measures only, and `corrected` is set.
   */
  function diagnostic(tp, fp, fn, tn, level) {
    var z = zFor(level);
    var N = tp + fp + fn + tn, dis = tp + fn, hea = fp + tn, pos = tp + fp, neg = fn + tn;
    var out = { tp: tp, fp: fp, fn: fn, tn: tn, n: N, diseased: dis, healthy: hea, testPos: pos, testNeg: neg };
    if (!(N > 0)) return out;
    out.sensitivity = wilson(tp, dis, level);
    out.specificity = wilson(tn, hea, level);
    out.ppv = wilson(tp, pos, level);
    out.npv = wilson(tn, neg, level);
    out.accuracy = wilson(tp + tn, N, level);
    out.prevalence = wilson(dis, N, level);
    var a = tp, b = fp, c = fn, d = tn, corrected = false;
    if (a === 0 || b === 0 || c === 0 || d === 0) { a += 0.5; b += 0.5; c += 0.5; d += 0.5; corrected = true; }
    out.corrected = corrected;
    var se = a + c, sp = b + d; // corrected diseased / healthy totals
    var sens = a / se, spec = d / sp;
    // LR+ = sens/(1-spec) = [a/(a+c)] / [b/(b+d)]
    out.lrPos = ratioCI(sens / (1 - spec), Math.sqrt(1 / a - 1 / se + 1 / b - 1 / sp), z);
    // LR- = (1-sens)/spec = [c/(a+c)] / [d/(b+d)]
    out.lrNeg = ratioCI((1 - sens) / spec, Math.sqrt(1 / c - 1 / se + 1 / d - 1 / sp), z);
    out.dor = ratioCI((a * d) / (b * c), Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d), z);
    // uncorrected point estimates when defined
    if (!corrected) { /* identical formulas, nothing to change */ } else {
      var s0 = dis ? tp / dis : NaN, p0 = hea ? tn / hea : NaN;
      out.lrPosRaw = (1 - p0) ? s0 / (1 - p0) : Infinity;
      out.lrNegRaw = p0 ? (1 - s0) / p0 : Infinity;
    }
    out.youden = out.sensitivity.p + out.specificity.p - 1;
    return out;
  }

  /** PPV and NPV from sensitivity, specificity and prevalence (all 0..1) via Bayes' theorem. */
  function predictiveValues(sens, spec, prev) {
    var tp = sens * prev, fp = (1 - spec) * (1 - prev), fn = (1 - sens) * prev, tn = spec * (1 - prev);
    return { ppv: tp + fp > 0 ? tp / (tp + fp) : NaN, npv: tn + fn > 0 ? tn / (tn + fn) : NaN, pTestPos: tp + fp };
  }
  function lrFrom(sens, spec) { return { pos: (1 - spec) > 0 ? sens / (1 - spec) : Infinity, neg: spec > 0 ? (1 - sens) / spec : Infinity }; }

  /* ---------- Bayes: pre- to post-test probability ---------- */
  function probToOdds(p) { return p >= 1 ? Infinity : p / (1 - p); }
  function oddsToProb(o) { return o === Infinity ? 1 : o / (1 + o); }
  /** Post-test probability = (pre/(1-pre) x LR) converted back to a probability. */
  function postTest(pre, lr) {
    if (!(pre >= 0 && pre <= 1) || !(lr >= 0)) return NaN;
    if (pre === 1) return 1;
    if (lr === Infinity) return pre === 0 ? NaN : 1;
    return oddsToProb(probToOdds(pre) * lr);
  }
  /** Pre-test probability that would give a stated post-test probability with this LR. */
  function preTestFor(post, lr) { if (!(lr > 0)) return NaN; return oddsToProb(probToOdds(post) / lr); }
  /** Natural frequencies for N people (not rounded): { disease, tp, fn, healthy, fp, tn, positives, ppv }. */
  function naturalFrequencies(prev, sens, spec, N) {
    var dis = N * prev, tp = dis * sens, fn = dis - tp, healthy = N - dis, tn = healthy * spec, fp = healthy - tn;
    return { N: N, disease: dis, tp: tp, fn: fn, healthy: healthy, tn: tn, fp: fp, positives: tp + fp, negatives: fn + tn, ppv: tp + fp > 0 ? tp / (tp + fp) : NaN, npv: tn + fn > 0 ? tn / (tn + fn) : NaN };
  }
  /** Same but rounded to whole people (what an icon array shows), with PPV recomputed from the whole numbers. */
  function naturalFrequenciesRounded(prev, sens, spec, N) {
    var dis = Math.round(N * prev), tp = Math.round(dis * sens), fn = dis - tp, healthy = N - dis, tn = Math.round(healthy * spec), fp = healthy - tn;
    return { N: N, disease: dis, tp: tp, fn: fn, healthy: healthy, tn: tn, fp: fp, positives: tp + fp, negatives: fn + tn, ppv: tp + fp > 0 ? tp / (tp + fp) : NaN, npv: tn + fn > 0 ? tn / (tn + fn) : NaN };
  }

  /* ---------- therapy / risk 2x2 ---------- */
  /**
   * Treatment (experimental) group: a events, b non-events. Control group: c events, d non-events.
   * ARR = CER - EER (positive = benefit when the event is bad). RR/OR are experimental vs control.
   * Cells with zero get the Haldane-Anscombe 0.5 correction for ratio CIs (flag `corrected`).
   */
  function therapy(a, b, c, d, level) {
    var z = zFor(level), n1 = a + b, n2 = c + d;
    var out = { a: a, b: b, c: c, d: d, n1: n1, n2: n2 };
    if (!(n1 > 0 && n2 > 0)) return out;
    var eer = a / n1, cer = c / n2;
    out.eer = wilson(a, n1, level); out.cer = wilson(c, n2, level);
    var A = a, B = b, C = c, D = d, corrected = false;
    if (a === 0 || b === 0 || c === 0 || d === 0) { A += 0.5; B += 0.5; C += 0.5; D += 0.5; corrected = true; }
    out.corrected = corrected;
    var N1 = A + B, N2 = C + D;
    var rr = (A / N1) / (C / N2), seRR = Math.sqrt(1 / A - 1 / N1 + 1 / C - 1 / N2);
    out.rr = ratioCI(rr, seRR, z); // Katz log method
    var or = (A * D) / (B * C), seOR = Math.sqrt(1 / A + 1 / B + 1 / C + 1 / D);
    out.or = ratioCI(or, seOR, z); // Woolf
    out.rrr = { v: 1 - out.rr.v, lo: 1 - out.rr.hi, hi: 1 - out.rr.lo };
    // ARR = CER - EER with Newcombe hybrid score CI (method 10) on the difference of independent proportions
    var w1 = wilson(c, n2, level), w2 = wilson(a, n1, level); // p1 = CER, p2 = EER
    var diff = cer - eer;
    out.arr = {
      v: diff,
      lo: diff - Math.sqrt(Math.pow(cer - w1.lo, 2) + Math.pow(w2.hi - eer, 2)),
      hi: diff + Math.sqrt(Math.pow(w1.hi - cer, 2) + Math.pow(eer - w2.lo, 2))
    };
    var wald = Math.sqrt(cer * (1 - cer) / n2 + eer * (1 - eer) / n1);
    out.arrWald = { v: diff, lo: diff - z * wald, hi: diff + z * wald };
    out.nnt = nnt(out.arr);
    return out;
  }
  /**
   * NNT/NNH from an ARR and its CI by inversion (Altman 1998).
   * ARR > 0 -> NNT (benefit, NNTB); ARR < 0 -> NNH (harm, NNTH). When the CI spans 0, the interval is
   * not a single closed range: it runs from the benefit limit through infinity to the harm limit.
   * Returns { v, kind:'NNTB'|'NNTH'|'none', lo, hi, crosses, text }.
   */
  function nnt(arr) {
    var v = arr.v, lo = arr.lo, hi = arr.hi, r = { arr: v, crosses: lo <= 0 && hi >= 0 };
    if (!v) { r.kind = 'none'; r.v = Infinity; r.text = 'No difference: NNT is infinite.'; r.crosses = true; r.nntbLimit = hi > 0 ? 1 / hi : Infinity; r.nnthLimit = lo < 0 ? 1 / -lo : Infinity; return r; }
    r.kind = v > 0 ? 'NNTB' : 'NNTH';
    r.v = 1 / Math.abs(v);
    if (!r.crosses) { // same sign across the interval
      var l1 = 1 / Math.abs(lo), l2 = 1 / Math.abs(hi);
      r.lo = Math.min(l1, l2); r.hi = Math.max(l1, l2);
      r.text = r.kind + ' ' + fmtN(r.v) + ' (' + fmtN(r.lo) + ' to ' + fmtN(r.hi) + ')';
    } else {
      r.nntbLimit = hi > 0 ? 1 / hi : Infinity; // best-case benefit
      r.nnthLimit = lo < 0 ? 1 / -lo : Infinity; // worst-case harm
      r.text = 'The ARR interval includes 0, so the NNT interval is NNTB ' + fmtN(r.nntbLimit) + ' to infinity to NNTH ' + fmtN(r.nnthLimit) + ' (Altman 1998).';
    }
    return r;
  }
  function fmtN(x) { return x === Infinity ? '∞' : (Math.round(x * 10) / 10).toString(); }

  /* ---------- sample size ---------- */
  /**
   * Two independent proportions (Fleiss 2003, eq. 4.14 uncorrected; continuity-corrected per Fleiss, Tytun & Ury 1980).
   * p1, p2 expected proportions; alpha two-sided; power; ratio k = n2/n1. Returns per-group n (rounded up).
   */
  function sampleSizeProportions(p1, p2, alpha, power, ratio, continuity) {
    alpha = alpha == null ? 0.05 : alpha; power = power == null ? 0.8 : power; var k = ratio || 1;
    if (!(p1 >= 0 && p1 <= 1 && p2 >= 0 && p2 <= 1) || p1 === p2) return null;
    var za = normInv(1 - alpha / 2), zb = normInv(power), delta = Math.abs(p1 - p2);
    var pbar = (p1 + k * p2) / (1 + k), q1 = 1 - p1, q2 = 1 - p2, qbar = 1 - pbar;
    var num = za * Math.sqrt((1 + 1 / k) * pbar * qbar) + zb * Math.sqrt(p1 * q1 + p2 * q2 / k);
    var n1 = num * num / (delta * delta);
    if (continuity) n1 = n1 / 4 * Math.pow(1 + Math.sqrt(1 + 2 * (k + 1) / (n1 * k * delta)), 2);
    var g1 = Math.ceil(n1 - 1e-9), g2 = Math.ceil(k * n1 - 1e-9);
    return { n1: g1, n2: g2, total: g1 + g2, raw: n1, za: za, zb: zb };
  }
  /**
   * Two means (normal approximation): n1 = (1 + 1/k) (sd (z_a + z_b) / diff)^2 per Chow et al. 2008.
   * tAdjust adds Guenther's (1981) small-sample term z_a^2/4 (k = 1), which closely reproduces the t-test answer.
   */
  function sampleSizeMeans(diff, sd, alpha, power, ratio, tAdjust) {
    alpha = alpha == null ? 0.05 : alpha; power = power == null ? 0.8 : power; var k = ratio || 1;
    if (!(diff > 0) || !(sd > 0)) return null;
    var za = normInv(1 - alpha / 2), zb = normInv(power);
    var n1 = (1 + 1 / k) * Math.pow(sd * (za + zb) / diff, 2);
    if (tAdjust) n1 += za * za / 4 * (1 + 1 / k) / 2; // = za^2/4 when k = 1
    var g1 = Math.ceil(n1 - 1e-9), g2 = Math.ceil(k * n1 - 1e-9);
    return { n1: g1, n2: g2, total: g1 + g2, raw: n1, za: za, zb: zb, effect: diff / sd };
  }

  /* ---------- Poisson / rates ---------- */
  function poissonCdf(k, mu) { // P(X <= k)
    if (mu <= 0) return 1;
    var term = Math.exp(-mu), sum = term;
    for (var i = 1; i <= k; i++) { term *= mu / i; sum += term; }
    return Math.min(1, sum);
  }
  function bisect(f, lo, hi) { for (var i = 0; i < 200; i++) { var m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; } return (lo + hi) / 2; }
  /** Exact (Garwood) CI for a Poisson count k. */
  function poissonExact(k, level) {
    var a = 1 - (level == null ? 0.95 : level), lo = 0, hi;
    if (k > 0) lo = bisect(function (mu) { return (1 - poissonCdf(k - 1, mu)) - a / 2; }, 0, k + 10 * Math.sqrt(k) + 10); // P(X >= k) rises with mu
    hi = bisect(function (mu) { return a / 2 - poissonCdf(k, mu); }, 0, k + 10 * Math.sqrt(k) + 20); // P(X <= k) falls with mu
    return { lo: lo, hi: hi };
  }
  /** Byar's approximation to the exact Poisson CI. */
  function poissonByar(k, level) {
    var z = zFor(level), kp = k + 1;
    var lo = k > 0 ? k * Math.pow(1 - 1 / (9 * k) - z / (3 * Math.sqrt(k)), 3) : 0;
    var hi = kp * Math.pow(1 - 1 / (9 * kp) + z / (3 * Math.sqrt(kp)), 3);
    return { lo: Math.max(0, lo), hi: hi };
  }
  /** Incidence rate = events / person-time, with exact Poisson CI. `scale` e.g. 1000 (per 1000 person-years). */
  function incidenceRate(events, personTime, scale, level) {
    if (!(personTime > 0) || !(events >= 0)) return null;
    var ci = poissonExact(events, level), s = scale || 1;
    return { rate: events / personTime * s, lo: ci.lo / personTime * s, hi: ci.hi / personTime * s, events: events, personTime: personTime, scale: s };
  }
  /** Standardised mortality (or incidence) ratio O/E with exact or Byar CI. */
  function smr(observed, expected, method, level) {
    if (!(expected > 0) || !(observed >= 0)) return null;
    var ci = method === 'byar' ? poissonByar(observed, level) : poissonExact(observed, level);
    return { smr: observed / expected, lo: ci.lo / expected, hi: ci.hi / expected, observed: observed, expected: expected, method: method === 'byar' ? 'byar' : 'exact' };
  }

  /* ---------- measures of association / impact ---------- */
  /** Attributable risk (risk difference) and attributable fraction among the exposed. */
  function attributableRisk(riskExposed, riskUnexposed) {
    var ar = riskExposed - riskUnexposed, rr = riskExposed / riskUnexposed;
    return { ar: ar, arPercent: riskExposed > 0 ? ar / riskExposed : NaN, rr: rr, nne: ar !== 0 ? 1 / Math.abs(ar) : Infinity };
  }
  /** Levin's PAF = pe (RR-1) / (1 + pe (RR-1)); pe = prevalence of exposure in the population. */
  function pafLevin(pe, rr) { var x = pe * (rr - 1); return x / (1 + x); }
  /** Miettinen's PAF from the proportion of cases that are exposed: pc (RR-1)/RR. */
  function pafMiettinen(pCasesExposed, rr) { return pCasesExposed * (rr - 1) / rr; }
  /** PAF from population and unexposed incidence: (Ip - Io) / Ip. */
  function pafFromIncidence(ip, io) { return (ip - io) / ip; }

  /* ---------- direct standardisation ---------- */
  /**
   * Directly age-standardised rate. strata: [{ cases, py, weight }] where weight is the standard population (any scale).
   * Returns ASR per 1 unit of person-time (multiply by scale), SE from Var = sum w^2 d / py^2 (Poisson, normal approx.),
   * with the Dobson (Fay-Feuer type) gamma CI is NOT used; normal-approximation CI is returned, flagged `approx`.
   */
  function directStandardise(strata, scale, level) {
    var W = 0; strata.forEach(function (s) { W += s.weight; });
    if (!(W > 0)) return null;
    var asr = 0, v = 0, cases = 0, py = 0, rows = [], valid = true;
    strata.forEach(function (s) {
      if (!(s.py > 0)) { valid = false; return; }
      var w = s.weight / W, r = s.cases / s.py;
      asr += w * r; v += w * w * s.cases / (s.py * s.py); cases += s.cases; py += s.py;
      rows.push({ rate: r, w: w });
    });
    if (!valid) return null;
    var z = zFor(level), se = Math.sqrt(v), sc = scale || 1;
    return { asr: asr * sc, se: se * sc, lo: Math.max(0, asr - z * se) * sc, hi: (asr + z * se) * sc, crude: cases / py * sc, cases: cases, py: py, rows: rows, approx: true };
  }

  /* ---------- infectious disease ---------- */
  /** Herd-immunity threshold 1 - 1/R0 (homogeneous mixing, perfect vaccine). */
  function herdImmunityThreshold(r0) { return r0 > 1 ? 1 - 1 / r0 : 0; }
  /** Vaccine coverage needed given vaccine efficacy: HIT / VE (>1 means unattainable). */
  function criticalCoverage(r0, ve) { return ve > 0 ? herdImmunityThreshold(r0) / ve : NaN; }
  /** Vaccine efficacy = 1 - RR from attack rates (vaccinated a/n1, unvaccinated c/n2), with the Katz CI. */
  function vaccineEfficacy(cV, nV, cU, nU, level) {
    var t = therapy(cV, nV - cV, cU, nU - cU, level);
    if (!t.rr) return null;
    return { ve: 1 - t.rr.v, lo: 1 - t.rr.hi, hi: 1 - t.rr.lo, rr: t.rr, corrected: t.corrected };
  }
  /** VE from the screening method / simple rates: ve = 1 - rrv. */
  function veFromRR(rr) { return 1 - rr; }
  /** Growth rate r from two counts and elapsed time; doubling (r>0) or halving (r<0) time = ln2/|r|. */
  function growthRate(n1, n2, dt) { return Math.log(n2 / n1) / dt; }
  function doublingTime(n1, n2, dt) {
    if (!(n1 > 0 && n2 > 0 && dt > 0)) return null;
    var r = growthRate(n1, n2, dt);
    return { r: r, time: r === 0 ? Infinity : LN2 / Math.abs(r), kind: r > 0 ? 'doubling' : r < 0 ? 'halving' : 'flat', pctPerUnit: (Math.exp(r) - 1) };
  }
  /** Doubling time from a constant percentage growth per time unit g (e.g. 0.10): ln2 / ln(1+g). */
  function doublingFromPercent(g) { return g > -1 && g !== 0 ? LN2 / Math.abs(Math.log(1 + g)) : Infinity; }

  return {
    normCdf: normCdf, normInv: normInv, zFor: zFor, wilson: wilson,
    diagnostic: diagnostic, predictiveValues: predictiveValues, lrFrom: lrFrom,
    probToOdds: probToOdds, oddsToProb: oddsToProb, postTest: postTest, preTestFor: preTestFor,
    naturalFrequencies: naturalFrequencies, naturalFrequenciesRounded: naturalFrequenciesRounded,
    therapy: therapy, nnt: nnt,
    sampleSizeProportions: sampleSizeProportions, sampleSizeMeans: sampleSizeMeans,
    poissonCdf: poissonCdf, poissonExact: poissonExact, poissonByar: poissonByar,
    incidenceRate: incidenceRate, smr: smr,
    attributableRisk: attributableRisk, pafLevin: pafLevin, pafMiettinen: pafMiettinen, pafFromIncidence: pafFromIncidence,
    directStandardise: directStandardise,
    herdImmunityThreshold: herdImmunityThreshold, criticalCoverage: criticalCoverage, vaccineEfficacy: vaccineEfficacy, veFromRR: veFromRR,
    growthRate: growthRate, doublingTime: doublingTime, doublingFromPercent: doublingFromPercent
  };
});
