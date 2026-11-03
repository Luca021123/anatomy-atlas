'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../student/lib/ebm.js');
const near = (a, b, tol = 1e-3, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' expected ' + b + ' got ' + a);

test('normal distribution helpers', () => {
  near(E.normInv(0.975), 1.959964, 1e-6);
  near(E.normInv(0.8), 0.841621, 1e-6);
  near(E.normInv(0.5), 0, 1e-12);
  near(E.normCdf(1.959964), 0.975, 1e-6);
  near(E.normCdf(-1), 0.158655, 1e-6);
  near(E.normCdf(3.5), 0.999767, 1e-6);
  near(E.zFor(0.99), 2.575829, 1e-5);
});

test('Wilson interval: Newcombe 1998 example 81/263 = 0.2553 to 0.3662', () => {
  const w = E.wilson(81, 263);
  near(w.p, 0.3080, 1e-4); near(w.lo, 0.2553, 1e-4); near(w.hi, 0.3662, 1e-4);
  const z = E.wilson(0, 20); near(z.lo, 0, 1e-12); near(z.hi, 0.1611, 1e-3);   // Newcombe 0/20
  const f = E.wilson(10, 10); near(f.hi, 1, 1e-12); near(f.lo, 0.7225, 1e-3);
});

test('diagnostic 2x2: sensitivity 90/100, specificity 80/100', () => {
  const d = E.diagnostic(90, 20, 10, 80);
  near(d.sensitivity.p, 0.9, 1e-12); near(d.specificity.p, 0.8, 1e-12);
  near(d.ppv.p, 90 / 110, 1e-12); near(d.npv.p, 80 / 90, 1e-12);
  near(d.lrPos.v, 4.5, 1e-12); near(d.lrNeg.v, 0.125, 1e-12);
  near(d.accuracy.p, 0.85, 1e-12); near(d.prevalence.p, 0.5, 1e-12); near(d.dor.v, 36, 1e-9);
  // log-method CI for LR+ : SE = sqrt(1/90 - 1/100 + 1/20 - 1/100) = 0.2
  const se = Math.sqrt(1 / 90 - 1 / 100 + 1 / 20 - 1 / 100);
  near(d.lrPos.lo, 4.5 * Math.exp(-1.959964 * se), 1e-4); near(d.lrPos.hi, 4.5 * Math.exp(1.959964 * se), 1e-4);
  // DOR SE = sqrt(1/90+1/20+1/10+1/80)
  const sd = Math.sqrt(1 / 90 + 1 / 20 + 1 / 10 + 1 / 80);
  near(d.dor.hi, 36 * Math.exp(1.959964 * sd), 1e-3);
  near(d.sensitivity.lo, 0.8256, 1e-3); near(d.sensitivity.hi, 0.9448, 1e-3);
  near(d.youden, 0.7, 1e-12);
  assert.equal(d.corrected, false);
});

test('diagnostic 2x2: zero cell uses Haldane-Anscombe correction for ratios only', () => {
  const d = E.diagnostic(50, 0, 5, 45);
  assert.equal(d.corrected, true);
  near(d.specificity.p, 1, 1e-12);
  assert.ok(isFinite(d.lrPos.v) && isFinite(d.dor.hi));
  assert.equal(d.lrPosRaw, Infinity);
});

test('predictive values and likelihood ratios from Se/Sp/prevalence', () => {
  const p = E.predictiveValues(0.9, 0.9, 0.01);
  near(p.ppv, 0.009 / (0.009 + 0.099), 1e-12); // 8.3%
  near(p.ppv, 0.0833, 1e-3); near(p.npv, 0.891 / (0.891 + 0.001), 1e-12);
  const lr = E.lrFrom(0.9, 0.8); near(lr.pos, 4.5, 1e-12); near(lr.neg, 0.125, 1e-12);
  assert.equal(E.lrFrom(0.9, 1).pos, Infinity);
});

test('pre-test to post-test probability (Bayes odds form)', () => {
  near(E.postTest(0.3, 4.5), 0.658, 1e-3);       // odds 0.4286 x 4.5 = 1.9286 -> 0.6585
  near(E.postTest(0.5, 1), 0.5, 1e-12);
  near(E.postTest(0.1, 10), 0.526, 1e-3);
  near(E.postTest(0.01, 0.1), 0.001, 2e-5);
  assert.equal(E.postTest(0, 5), 0); assert.equal(E.postTest(1, 5), 1);
  near(E.preTestFor(E.postTest(0.2, 7), 7), 0.2, 1e-12);
  near(E.probToOdds(0.75), 3, 1e-12); near(E.oddsToProb(3), 0.75, 1e-12);
});

test('natural frequencies: 1% prevalence, 90% sens, 90% spec, 1000 people', () => {
  const f = E.naturalFrequencies(0.01, 0.9, 0.9, 1000);
  near(f.disease, 10, 1e-9); near(f.tp, 9, 1e-9); near(f.fn, 1, 1e-9); near(f.fp, 99, 1e-9); near(f.tn, 891, 1e-9);
  near(f.ppv, 9 / 108, 1e-9);
  const r = E.naturalFrequenciesRounded(0.01, 0.9, 0.95, 1000);
  assert.equal(r.disease, 10); assert.equal(r.tp, 9); assert.equal(r.tn, 941); assert.equal(r.fp, 49); near(r.ppv, 9 / 58, 1e-9);  // 940.5 rounds up
});

test('therapy 2x2: textbook-style example 15/100 vs 30/100', () => {
  const t = E.therapy(15, 85, 30, 70);
  near(t.eer.p, 0.15, 1e-12); near(t.cer.p, 0.30, 1e-12);
  near(t.rr.v, 0.5, 1e-12);
  const seRR = Math.sqrt(1 / 15 - 1 / 100 + 1 / 30 - 1 / 100); near(seRR, 0.28284, 1e-5);
  near(t.rr.lo, 0.5 * Math.exp(-1.959964 * seRR), 1e-6); near(t.rr.lo, 0.2872, 1e-3); near(t.rr.hi, 0.8704, 1e-3);
  near(t.or.v, (15 * 70) / (85 * 30), 1e-12); near(t.or.lo, 0.2053, 1e-3); near(t.or.hi, 0.8258, 1e-3);
  near(t.arr.v, 0.15, 1e-12); near(t.rrr.v, 0.5, 1e-12); near(t.rrr.lo, 1 - 0.8704, 1e-3); near(t.rrr.hi, 1 - 0.2872, 1e-3);
  near(t.nnt.v, 1 / 0.15, 1e-12); assert.equal(t.nnt.kind, 'NNTB'); assert.equal(t.nnt.crosses, false);
  near(t.nnt.lo, 1 / t.arr.hi, 1e-9); near(t.nnt.hi, 1 / t.arr.lo, 1e-9);
});

test('ARR CI: Newcombe 1998 hybrid score for 56/70 vs 48/80 = 0.0524 to 0.3339', () => {
  // treatment = 48/80 events (EER .6), control = 56/70 events (CER .8): ARR = 0.2
  const t = E.therapy(48, 32, 56, 14);
  near(t.arr.v, 0.2, 1e-12); near(t.arr.lo, 0.0524, 1e-3); near(t.arr.hi, 0.3339, 1e-3);
  near(t.arrWald.lo, 0.2 - 1.959964 * Math.sqrt(0.8 * 0.2 / 70 + 0.6 * 0.4 / 80), 1e-6);
});

test('Katz RR: classic cohort example (Lancaster / Altman) 2x2 with equal exposure', () => {
  // Altman, Practical Statistics for Medical Research: RR = (a/(a+b)) / (c/(c+d)); a=30,b=70,c=10,d=90 -> RR 3, SE ln = sqrt(1/30-1/100+1/10-1/100)=0.3
  const t = E.therapy(30, 70, 10, 90);
  near(t.rr.v, 3, 1e-12);
  near(Math.log(t.rr.hi / t.rr.v) / 1.959964, Math.sqrt(1 / 30 - 1 / 100 + 1 / 10 - 1 / 100), 1e-6);
  near(t.or.v, (30 * 90) / (70 * 10), 1e-12);
  assert.equal(t.nnt.kind, 'NNTH'); near(t.nnt.v, 5, 1e-9);   // ARR = -0.20 -> NNH 5
});

test('NNT CI crossing zero reports NNTB..infinity..NNTH (Altman 1998)', () => {
  const t = E.therapy(18, 82, 22, 78);  // ARR 0.04, wide CI
  assert.ok(t.arr.lo < 0 && t.arr.hi > 0);
  assert.equal(t.nnt.crosses, true);
  near(t.nnt.v, 25, 1e-9);
  near(t.nnt.nntbLimit, 1 / t.arr.hi, 1e-9); near(t.nnt.nnthLimit, 1 / -t.arr.lo, 1e-9);
  assert.match(t.nnt.text, /infinity/);
  const direct = E.nnt({ v: 0.1, lo: 0.02, hi: 0.18 });
  near(direct.lo, 1 / 0.18, 1e-9); near(direct.hi, 50, 1e-9);
  const zero = E.nnt({ v: 0, lo: -0.05, hi: 0.05 });
  assert.equal(zero.v, Infinity);
});

test('sample size, two proportions (alpha .05, power 80%)', () => {
  const r = E.sampleSizeProportions(0.5, 0.4, 0.05, 0.8);
  assert.equal(r.n1, 388); assert.equal(r.total, 776);
  const c = E.sampleSizeProportions(0.5, 0.4, 0.05, 0.8, 1, true);
  assert.equal(c.n1, 408);                                           // Fleiss continuity-corrected
  const s = E.sampleSizeProportions(0.2, 0.1, 0.05, 0.9);           // 90% power
  const za = 1.959964, zb = 1.281552, pb = 0.15;
  const manual = Math.pow(za * Math.sqrt(2 * pb * (1 - pb)) + zb * Math.sqrt(0.2 * 0.8 + 0.1 * 0.9), 2) / 0.01;
  assert.equal(s.n1, Math.ceil(manual - 1e-9));
  const k2 = E.sampleSizeProportions(0.5, 0.4, 0.05, 0.8, 2);
  assert.ok(k2.n2 === Math.ceil(2 * k2.raw - 1e-9) && k2.total > 776);
  assert.equal(E.sampleSizeProportions(0.3, 0.3), null);
});

test('sample size, two means', () => {
  const r = E.sampleSizeMeans(5, 10, 0.05, 0.8);  // effect size 0.5 -> 2(2.8)^2/0.25 = 62.8
  assert.equal(r.n1, 63);
  near(r.raw, 2 * Math.pow(1.959964 + 0.841621, 2) / 0.25, 1e-3);
  assert.equal(E.sampleSizeMeans(5, 10, 0.05, 0.8, 1, true).n1, 64);  // matches t-test power calculation
  assert.equal(E.sampleSizeMeans(5, 10, 0.05, 0.9).n1, 85);           // 2(3.2415)^2/.25 = 84.06 -> 85
  assert.equal(E.sampleSizeMeans(0, 10), null);
  const k = E.sampleSizeMeans(5, 10, 0.05, 0.8, 2);                  // 2:1 allocation
  assert.equal(k.n1, 48); assert.equal(k.n2, 95);
  near(k.raw, 1.5 * 7.8489 * 4, 0.1);
});

test('Poisson exact (Garwood) and Byar intervals', () => {
  const a = E.poissonExact(10); near(a.lo, 4.795, 2e-3); near(a.hi, 18.390, 2e-3);
  const b = E.poissonExact(0); near(b.lo, 0, 1e-12); near(b.hi, 3.689, 1e-3);
  const c = E.poissonExact(5); near(c.lo, 1.623, 2e-3); near(c.hi, 11.668, 2e-3);
  const d = E.poissonExact(100); near(d.lo, 81.36, 0.02); near(d.hi, 121.63, 0.02);
  const by = E.poissonByar(10); near(by.lo, 4.79, 0.02); near(by.hi, 18.39, 0.02);
  const by100 = E.poissonByar(100); near(by100.lo, 81.36, 0.1); near(by100.hi, 121.6, 0.15);
});

test('incidence rate and SMR', () => {
  const r = E.incidenceRate(10, 2000, 1000);
  near(r.rate, 5, 1e-12); near(r.lo, 4.795 / 2, 2e-3); near(r.hi, 18.39 / 2, 2e-3);
  const s = E.smr(30, 20); near(s.smr, 1.5, 1e-12);
  const p = E.poissonExact(30); near(s.lo, p.lo / 20, 1e-9); near(s.hi, p.hi / 20, 1e-9); near(s.lo, 1.012, 5e-3); near(s.hi, 2.141, 5e-3);
  const sb = E.smr(30, 20, 'byar'); near(sb.lo, 1.012, 0.01); near(sb.hi, 2.14, 0.02);
  assert.equal(E.smr(5, 0), null);
  assert.equal(E.incidenceRate(5, 0), null);
});

test('attributable risk and population attributable fraction', () => {
  const a = E.attributableRisk(0.0015, 0.0005);   // e.g. smoking and a disease, per person-year
  near(a.ar, 0.001, 1e-12); near(a.arPercent, 2 / 3, 1e-12); near(a.rr, 3, 1e-12);
  near(E.pafLevin(0.25, 3), 0.5 / 1.5, 1e-12);     // pe(RR-1)=0.5 -> 33.3%
  near(E.pafLevin(0.1, 1), 0, 1e-12);
  near(E.pafMiettinen(0.8, 3), 0.8 * 2 / 3, 1e-12);
  near(E.pafFromIncidence(0.0010, 0.0005), 0.5, 1e-12);
});

test('direct age-standardisation', () => {
  const strata = [{ cases: 10, py: 10000, weight: 50 }, { cases: 40, py: 10000, weight: 30 }, { cases: 100, py: 5000, weight: 20 }];
  const r = E.directStandardise(strata, 1000);
  // rates 1, 4, 20 per 1000; weights .5,.3,.2 -> 0.5+1.2+4 = 5.7
  near(r.asr, 5.7, 1e-9);
  near(r.crude, 150 / 25000 * 1000, 1e-9);
  const v = (0.25 * 10 / 1e8) + (0.09 * 40 / 1e8) + (0.04 * 100 / 25e6);
  near(r.se, Math.sqrt(v) * 1000, 1e-9);
  assert.ok(r.lo < r.asr && r.hi > r.asr);
  assert.equal(E.directStandardise([{ cases: 1, py: 0, weight: 1 }]), null);
});

test('infectious disease helpers', () => {
  near(E.herdImmunityThreshold(2), 0.5, 1e-12); near(E.herdImmunityThreshold(15), 1 - 1 / 15, 1e-12);
  assert.equal(E.herdImmunityThreshold(0.8), 0);
  near(E.criticalCoverage(4, 0.9), 0.75 / 0.9, 1e-12);
  const v = E.vaccineEfficacy(10, 1000, 50, 1000);
  near(v.ve, 0.8, 1e-12);
  const se = Math.sqrt(1 / 10 - 1 / 1000 + 1 / 50 - 1 / 1000);
  near(v.lo, 1 - 0.2 * Math.exp(1.959964 * se), 1e-5); near(v.hi, 1 - 0.2 * Math.exp(-1.959964 * se), 1e-5);
  near(E.veFromRR(0.05), 0.95, 1e-12);
});

test('doubling time', () => {
  const d = E.doublingTime(100, 200, 3); near(d.time, 3, 1e-12); assert.equal(d.kind, 'doubling');
  const e = E.doublingTime(100, 400, 4); near(e.time, 2, 1e-12);
  const h = E.doublingTime(800, 100, 6); near(h.time, 2, 1e-12); assert.equal(h.kind, 'halving');
  near(E.doublingFromPercent(0.0718), 10, 0.01);   // rule of 70/72
  near(E.doublingFromPercent(1), 1, 1e-12);
  assert.equal(E.doublingTime(0, 5, 1), null);
});
