/**
 * Monte Carlo of a routed plan's cost. The expected cost averages over
 * escalations; this shows the spread - "price the tail, not the median" - by
 * walking every subsection's escalation ladder many times with the router's
 * own success, detection and false-rejection probabilities. Deterministic for a
 * given seed, and cheap (no I/O, no clock).
 */
import type { Catalog } from "./catalog.ts";
import type { CostModel } from "./estimate.ts";
import { JUDGE_FALSE_REJECT, successProbability } from "./scoring.ts";
import type { Config, Routing, Subsection } from "./types.ts";

/** Repetitions beyond this are simulated in aggregate (the spread narrows anyway). */
const MAX_SIMULATED_REPS = 50;

export interface CostDistribution {
  mean: number;
  p50: number;
  p90: number;
  max: number;
}

export function costDistribution(
  routes: Routing[],
  subsections: Subsection[],
  costs: CostModel,
  catalog: Catalog,
  opts: { iterations?: number; seed?: number; constant?: number } = {},
): CostDistribution {
  const iterations = opts.iterations ?? 2000;
  const rng = mulberry32(opts.seed ?? 1);
  const subs = new Map(subsections.map((s) => [s.id, s]));

  // Pre-compute each rung's cost and success probability per subsection.
  const plans = routes.map((r) => {
    const sub = subs.get(r.id) as Subsection;
    const ladder: Config[] = [{ model: r.model, effort: r.effort }, ...r.escalation];
    const usesJudge = r.verification.method !== "self-check" && r.verification.judge !== undefined;
    const judge =
      (usesJudge && r.verification.judge ? costs.judge(sub, r.verification.judge, { batch: r.batch.applied }).cost : 0) +
      (usesJudge && r.verification.second_judge ? costs.judge(sub, r.verification.second_judge, { batch: r.batch.applied }).cost : 0);
    const rungs = ladder.map((c, i) => ({
      cost: costs.attempt(sub, c, { rung: i, batch: r.batch.applied }).cost + judge,
      p: successProbability(catalog.get(c.model).ceiling[c.effort], r.difficulty.level),
    }));
    const simulated = Math.min(r.repetitions, MAX_SIMULATED_REPS);
    return { rungs, d: r.verification.detection_rate, usesJudge, simulated, scale: r.repetitions / simulated };
  });

  const totals: number[] = new Array(iterations);
  for (let it = 0; it < iterations; it++) {
    let total = opts.constant ?? 0;
    for (const p of plans) {
      let subtotal = 0;
      for (let rep = 0; rep < p.simulated; rep++) {
        for (let i = 0; i < p.rungs.length; i++) {
          const rung = p.rungs[i] as { cost: number; p: number };
          subtotal += rung.cost;
          const good = rng() < rung.p;
          const escalate = good ? p.usesJudge && rng() < JUDGE_FALSE_REJECT : rng() < p.d;
          if (!escalate) break;
        }
      }
      total += subtotal * p.scale;
    }
    totals[it] = total;
  }
  totals.sort((a, b) => a - b);
  const at = (q: number) => totals[Math.min(totals.length - 1, Math.floor(q * totals.length))] ?? 0;
  return {
    mean: totals.reduce((a, b) => a + b, 0) / Math.max(1, totals.length),
    p50: at(0.5),
    p90: at(0.9),
    max: totals[totals.length - 1] ?? 0,
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
