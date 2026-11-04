/**
 * The router: picks a model, effort level, verification method and escalation
 * ladder for every subsection.
 *
 * Policy, in one sentence: for each subsection, choose the first configuration
 * that minimises the expected cost of a *completed* subsection - including
 * verification and probability-weighted escalation - subject to two hard
 * constraints: the probability of delivering a correct result must reach the
 * subsection's quality floor, and the first attempt must be likely enough to
 * succeed that the plan never budgets on failing.
 *
 * Difficulty (from the scored signals) is compared with each configuration's
 * capability ceiling through a logistic success curve. Ceilings are priors in
 * catalog.ts, corrected over time by the outcome ledger (ledger.ts).
 */
import { type Catalog, defaultCatalog, SERVER_FALLBACK_BETA } from "./catalog.ts";
import { analyzeGraph, asapSchedule } from "./dag.ts";
import { CostModel, configKey, round } from "./estimate.ts";
import { pct, pctFloor, usd } from "./format.ts";
import { computeMetrics, planCache } from "./metrics.ts";
import {
  BATCH_LATENCY_S,
  combinedDetection,
  DETECTION_BY_VERIFIABILITY,
  difficulty,
  ESCALATION_STEP,
  FIRST_PASS_MIN,
  JUDGE_FALSE_REJECT,
  LOGIT_AT_CEILING,
  MECHANICAL_CATEGORIES,
  qualityFloor,
  SLOPE,
  successProbability,
} from "./scoring.ts";
import type {
  CalibrationSnapshot,
  CandidateEval,
  Config,
  Decomposition,
  Effort,
  Issue,
  RoutedPlan,
  RouterOptions,
  Routing,
  SingleConfigAlternative,
  Subsection,
  Verification,
} from "./types.ts";
import { EFFORTS } from "./types.ts";

export const DEFAULT_ROUTER_OPTIONS: RouterOptions = {
  mode: "agent",
  quality: "max",
  models: [],
  efforts: [...EFFORTS],
  baseline: { model: "claude-opus-5-5", effort: "high" },
  batch: false,
  batchMinRepetitions: 3,
  cache: true,
  maxEscalations: 2,
  concurrency: 4,
  systemPromptTokens: 700,
  minRoutingGainPct: 10,
};

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export class PlanError extends Error {
  readonly issues: Issue[];
  constructor(message: string, issues: Issue[]) {
    super(message);
    this.name = "PlanError";
    this.issues = issues;
  }
}

export interface RouteInput {
  decomposition: Decomposition;
  catalog?: Catalog;
  options?: Partial<RouterOptions>;
  calibration?: CalibrationSnapshot;
}

export function emptyCalibration(): CalibrationSnapshot {
  return { category_offsets: {}, output_multipliers: {}, input_ratios: {}, throughput: {}, samples: 0 };
}

export function resolveOptions(partial: Partial<RouterOptions> | undefined, catalog: Catalog): RouterOptions {
  const o: RouterOptions = { ...DEFAULT_ROUTER_OPTIONS, ...(partial ?? {}) };
  o.models = (o.models.length ? o.models : catalog.models.map((m) => m.id)).map((m) => catalog.get(m).id);
  o.efforts = o.efforts.length ? o.efforts : [...EFFORTS];
  const baselineSpec = catalog.get(o.baseline.model);
  o.baseline = { model: baselineSpec.id, effort: o.baseline.effort };
  if (!baselineSpec.efforts.includes(o.baseline.effort)) {
    throw new Error(`Baseline effort "${o.baseline.effort}" is not supported by ${baselineSpec.name}`);
  }
  if (catalog.configs(o.models, o.efforts).length === 0) {
    throw new Error("No model/effort combinations are allowed by the current --models and --efforts filters");
  }
  return o;
}

interface Context {
  catalog: Catalog;
  options: RouterOptions;
  costs: CostModel;
  configs: Config[];
  calibration: CalibrationSnapshot;
}

/** Routes a whole decomposition and computes plan metrics. */
export function routePlan(input: RouteInput): RoutedPlan {
  const catalog = input.catalog ?? defaultCatalog;
  const options = resolveOptions(input.options, catalog);
  const calibration = input.calibration ?? emptyCalibration();
  const graph = analyzeGraph(input.decomposition);
  const fatal = graph.issues.filter((i) => i.level === "error" && (i.code === "E_CYCLE" || i.code === "E_DUPLICATE_ID"));
  if (fatal.length) throw new PlanError(fatal.map((i) => i.message).join("\n"), graph.issues);

  const dec = graph.decomposition;
  const costs = new CostModel(catalog, dec, { cache: options.cache, systemPromptTokens: options.systemPromptTokens, mode: options.mode }, calibration);
  const ctx: Context = { catalog, options, costs, configs: catalog.configs(options.models, options.efforts), calibration };

  const routes = dec.subsections.map((sub) => routeSubsection(sub, ctx));

  // Prompt caching per model: only where the write pays for itself, with a TTL that outlives the idle gaps.
  const latency = new Map(routes.map((r) => [r.id, r.latency_s]));
  const times = asapSchedule(dec.subsections, graph.order, (id) => latency.get(id) ?? 0);
  const cache = planCache(routes, costs, times);
  for (const r of routes) {
    const c = cache.find((x) => x.model === r.model);
    if (c) r.request.cache = { prefix_tokens: c.prefix_tokens, ttl: c.ttl, enabled: c.enabled };
  }

  const issues: Issue[] = [...graph.issues];
  for (const r of routes) {
    if (r.flags.includes("below-floor")) {
      issues.push({
        level: "warning",
        code: "W_BELOW_QUALITY_FLOOR",
        message: `${r.id} cannot reach its ${pct(r.quality_floor)} quality floor on any allowed model (best: ${pct(r.p_final)}). Split it further, sharpen its acceptance criteria, or add human review.`,
        subsection: r.id,
      });
    }
    if (r.flags.includes("exceeds-max-output")) {
      issues.push({
        level: "warning",
        code: "W_EXCEEDS_MAX_OUTPUT",
        message: `${r.id} is expected to need more output tokens (including thinking) than ${r.model_name} can produce in one response. Split it.`,
        subsection: r.id,
      });
    }
  }

  const singleConfig = bestSingleConfig(dec.subsections, routes, ctx);
  const metrics = computeMetrics({ decomposition: dec, routes, options, catalog, costs, graph, cache, singleConfig });
  return {
    version: 1,
    created_at: new Date().toISOString(),
    decomposition: dec,
    options,
    routes,
    metrics,
    issues,
    calibration,
  };
}

function routeSubsection(sub: Subsection, ctx: Context): Routing {
  const { catalog, options, costs } = ctx;
  const diff = difficulty(sub.signals, ctx.calibration.category_offsets[sub.category] ?? 0);
  const floor = qualityFloor(options.quality, sub.signals.criticality, sub.signals.verifiability);
  const firstMin = FIRST_PASS_MIN[options.quality];
  const batchEligible = !sub.latency_sensitive && sub.repetitions >= options.batchMinRepetitions;
  const batch = batchEligible && options.batch;
  const verification = chooseVerification(sub, diff.level, ctx);

  const ladderOrder = ladderOrderFor(sub, ctx);

  const evals = ctx.configs.map((c) => evaluate(c, sub, diff.level, floor, firstMin, verification, batch, ladderOrder, ctx));
  const feasible = evals.filter((e) => e.eval.feasible);
  let chosen: (typeof evals)[number];
  const flags: string[] = [];
  if (feasible.length) {
    chosen = feasible.reduce((best, e) =>
      e.eval.expected_cost < best.eval.expected_cost - 1e-12 ||
      (Math.abs(e.eval.expected_cost - best.eval.expected_cost) <= 1e-12 && e.latency < best.latency)
        ? e
        : best,
    );
  } else {
    chosen = evals.reduce((best, e) =>
      e.eval.p_final > best.eval.p_final + 1e-9 ||
      (Math.abs(e.eval.p_final - best.eval.p_final) <= 1e-9 && e.eval.expected_cost < best.eval.expected_cost)
        ? e
        : best,
    );
    flags.push("below-floor");
  }

  const spec = catalog.get(chosen.eval.model);
  const first = costs.attempt(sub, chosen.eval, { rung: 0, batch });
  if (first.tokens.output + first.tokens.thinking > spec.maxOutput) flags.push("exceeds-max-output");
  if (spec.longContext && first.tokens.prefix + first.tokens.input > spec.longContext.aboveTokens) flags.push("long-context-pricing");
  if (verification.human_review) flags.push("human-review");
  if (batchEligible) flags.push(batch ? "batched" : "batch-eligible");

  const baseline = costs.attempt(sub, options.baseline, { rung: 0 }).cost * sub.repetitions;
  const unbatched = batch
    ? evaluate(chosen.eval, sub, diff.level, floor, firstMin, verification, false, ladderOrder, ctx).eval.expected_cost
    : 0;
  const batchSaving = batchEligible
    ? batch
      ? unbatched - chosen.eval.expected_cost
      : chosen.eval.expected_cost -
        evaluate(chosen.eval, sub, diff.level, floor, firstMin, verification, true, ladderOrder, ctx).eval.expected_cost
    : 0;

  const alternatives = [...evals]
    .sort((a, b) => Number(b.eval.feasible) - Number(a.eval.feasible) || a.eval.expected_cost - b.eval.expected_cost)
    .slice(0, 5)
    .map((e) => roundEval(e.eval));

  const routing: Routing = {
    id: sub.id,
    title: sub.title,
    category: sub.category,
    model: spec.id,
    model_name: spec.name,
    effort: chosen.eval.effort,
    agent_alias: spec.alias,
    difficulty: diff,
    quality_floor: floor,
    p_first: round(chosen.eval.p_first, 4),
    p_final: round(chosen.eval.p_final, 4),
    meets_floor: chosen.eval.feasible,
    verification,
    escalation: chosen.eval.ladder.slice(1),
    tokens: first.tokens,
    repetitions: sub.repetitions,
    cost: {
      first_attempt: round(chosen.eval.cost_first, 6),
      expected: round(chosen.eval.expected_cost, 6),
      worst_case: round(chosen.eval.worst_case_cost, 6),
      baseline: round(baseline, 6),
    },
    latency_s: round(batch ? BATCH_LATENCY_S : chosen.latency, 1),
    batch: { eligible: batchEligible, applied: batch, saving_usd: round(Math.max(0, batchSaving), 6) },
    request: {
      model: spec.id,
      max_tokens: first.max_tokens,
      output_config: { effort: chosen.eval.effort },
      stream: true,
      cache: { prefix_tokens: first.tokens.prefix, ttl: "5m", enabled: first.cacheable },
      batch,
      ...(spec.serverFallback && !batch ? { fallbacks: { beta: SERVER_FALLBACK_BETA, value: "default" as const } } : {}),
    },
    alternatives,
    reasons: [],
    flags,
  };
  routing.reasons = explain(routing, evals.map((e) => e.eval), firstMin, ctx);
  return routing;
}

/** Configurations ordered by the cost of one escalated attempt of this subsection (used to build ladders). */
function ladderOrderFor(sub: Subsection, ctx: Context): Config[] {
  const cost = new Map(ctx.configs.map((c) => [configKey(c), ctx.costs.attempt(sub, c, { rung: 1 }).cost]));
  return [...ctx.configs].sort((a, b) => (cost.get(configKey(a)) ?? 0) - (cost.get(configKey(b)) ?? 0));
}

/** Evaluates starting a subsection on `first`, escalating along the ladder on detected failure. */
function evaluate(
  first: Config,
  sub: Subsection,
  level: number,
  floor: number,
  firstMin: number,
  verification: Verification,
  batch: boolean,
  ladderOrder: Config[],
  ctx: Context,
): { eval: CandidateEval; latency: number } {
  const { catalog, costs, options } = ctx;
  const ladder = buildLadder({ model: first.model, effort: first.effort }, ladderOrder, ctx);
  const usesJudge = verification.method !== "self-check" && verification.judge !== undefined;
  const judgeA = usesJudge && verification.judge ? costs.judge(sub, verification.judge, { batch }) : { cost: 0, latency_s: 0 };
  const judgeB = usesJudge && verification.second_judge ? costs.judge(sub, verification.second_judge, { batch }) : { cost: 0, latency_s: 0 };
  const judge = { cost: judgeA.cost + judgeB.cost, latency_s: judgeA.latency_s + judgeB.latency_s };
  const d = verification.detection_rate;
  const waves = Math.ceil(sub.repetitions / Math.max(1, options.concurrency));

  let pNext = 0;
  let expNext = 0;
  let latNext = 0;
  let worst = 0;
  let pFirst = 0;
  let costFirst = 0;
  for (let i = ladder.length - 1; i >= 0; i--) {
    const c = ladder[i] as Config;
    const spec = catalog.get(c.model);
    const p = successProbability(spec.ceiling[c.effort], level);
    const att = costs.attempt(sub, c, { rung: i, batch });
    const callCost = att.cost + judge.cost;
    const callLatency = (att.latency_s + judge.latency_s) * waves;
    worst += callCost;
    if (i === ladder.length - 1) {
      pNext = p;
      expNext = callCost;
      latNext = callLatency;
    } else {
      const escalate = (1 - p) * d + (usesJudge ? p * JUDGE_FALSE_REJECT : 0);
      pNext = p + (1 - p) * d * pNext;
      expNext = callCost + escalate * expNext;
      latNext = callLatency + escalate * latNext;
    }
    if (i === 0) {
      pFirst = p;
      costFirst = att.cost;
    }
  }
  const reps = sub.repetitions;
  return {
    eval: {
      model: first.model,
      effort: first.effort,
      p_first: pFirst,
      p_final: pNext,
      cost_first: costFirst * reps,
      expected_cost: expNext * reps,
      worst_case_cost: worst * reps,
      feasible: pNext >= floor && pFirst >= firstMin,
      ladder,
    },
    latency: latNext,
  };
}

/**
 * Escalation ladder: after a detected failure, move to the cheapest
 * configuration in a higher model tier whose ceiling is at least
 * ESCALATION_STEP above the current one; within the top tier, raise effort.
 */
function buildLadder(first: Config, ladderOrder: Config[], ctx: Context): Config[] {
  const { catalog, options } = ctx;
  const ladder: Config[] = [first];
  let current = first;
  for (let i = 0; i < options.maxEscalations; i++) {
    const cur = catalog.get(current.model);
    const curCeil = cur.ceiling[current.effort];
    const stronger = ladderOrder.filter((c) => catalog.get(c.model).ceiling[c.effort] >= curCeil + ESCALATION_STEP);
    let next =
      stronger.find((c) => catalog.get(c.model).tier > cur.tier) ?? stronger.find((c) => catalog.get(c.model).tier === cur.tier);
    if (!next) {
      // Nothing clears the step: take the strongest remaining configuration if it is any stronger.
      const strongest = ladderOrder.reduce<Config | undefined>((best, c) => {
        const ceil = catalog.get(c.model).ceiling[c.effort];
        return !best || ceil > catalog.get(best.model).ceiling[best.effort] ? c : best;
      }, undefined);
      if (strongest && catalog.get(strongest.model).ceiling[strongest.effort] > curCeil) next = strongest;
    }
    if (!next || configKey(next) === configKey(current)) break;
    ladder.push(next);
    current = next;
  }
  return ladder;
}

function chooseVerification(sub: Subsection, level: number, ctx: Context): Verification {
  const { catalog, costs, options } = ctx;
  const v = sub.signals.verifiability;
  const c = sub.signals.criticality;
  const base = DETECTION_BY_VERIFIABILITY[v - 1] ?? 0.7;
  const humanReview = c === 5 || (c >= 4 && v <= 2);
  const strict = options.quality === "max";
  // Outside the max preset, easy low-stakes work may check itself. Under max, every output is verified.
  if (!strict && c <= 2 && level <= 2.2) {
    return {
      method: "self-check",
      detection_rate: round(base * 0.5, 3),
      human_review: false,
      note: "Low stakes and low difficulty: the executor checks its own output against the criteria; no separate judge call.",
    };
  }
  const need = level - (c >= 4 ? 0.25 : 0.75);
  const judgeConfigs = ctx.configs
    .filter((cfg) => cfg.effort === "low" || cfg.effort === "medium" || cfg.effort === "high")
    .sort((a, b) => costs.judge(sub, a).cost - costs.judge(sub, b).cost);
  const ceilingOf = (cfg: Config) => catalog.get(cfg.model).ceiling[cfg.effort];
  const strongest = (list: Config[]) =>
    list.reduce<Config | undefined>((best, cfg) => (!best || ceilingOf(cfg) > ceilingOf(best) ? cfg : best), undefined);
  const judge =
    judgeConfigs.find((cfg) => ceilingOf(cfg) >= need) ??
    strongest(judgeConfigs) ??
    ({ model: catalog.models[0]?.id ?? "claude-haiku-5-5", effort: "medium" } as Config);
  const strength = (cfg: Config) => (ceilingOf(cfg) >= level ? 1 : 0.92);
  const mechanical = v >= 4 && MECHANICAL_CATEGORIES.has(sub.category);
  const judgeName = catalog.label(judge);

  if (mechanical) {
    // Mechanical checks catch most failures; the judge covers the criteria tests do not.
    return {
      method: "tests",
      judge,
      detection_rate: round(combinedDetection(base, 0.6 * strength(judge)), 3),
      human_review: humanReview,
      note: `Run the mechanical checks (tests, type-check, schema) until they pass, and have ${judgeName} check every acceptance criterion.`,
    };
  }
  // Under max, critical or hard-to-check work gets a second, independent reviewer on a different model.
  if (strict && (c >= 4 || v <= 2)) {
    const others = judgeConfigs.filter((cfg) => cfg.model !== judge.model);
    const second = others.find((cfg) => ceilingOf(cfg) >= need) ?? strongest(others);
    if (second) {
      return {
        method: "dual-judge",
        judge,
        second_judge: second,
        detection_rate: round(combinedDetection(base * strength(judge), base * strength(second)), 3),
        human_review: humanReview,
        note: `Two independent reviewers on different models, ${judgeName} and ${catalog.label(second)}, must both pass every acceptance criterion.`,
      };
    }
  }
  return {
    method: "judge",
    judge,
    detection_rate: round(base * strength(judge), 3),
    human_review: humanReview,
    note: `${judgeName} checks the output against each acceptance criterion and returns a structured verdict.`,
  };
}

/** Cheapest single first-rung configuration that meets every floor - the "don't fragment" alternative. */
function bestSingleConfig(subs: Subsection[], routes: Routing[], ctx: Context): SingleConfigAlternative | null {
  const routedTotal = routes.reduce((s, r) => s + r.cost.expected, 0);
  const firstMin = FIRST_PASS_MIN[ctx.options.quality];
  const orders = new Map(subs.map((s) => [s.id, ladderOrderFor(s, ctx)]));
  let best: { config: Config; total: number } | null = null;
  for (const config of ctx.configs) {
    let total = 0;
    let ok = true;
    for (const sub of subs) {
      const route = routes.find((r) => r.id === sub.id);
      if (!route) continue;
      const ladderOrder = orders.get(sub.id) ?? ladderOrderFor(sub, ctx);
      const e = evaluate(config, sub, route.difficulty.level, route.quality_floor, firstMin, route.verification, route.batch.applied, ladderOrder, ctx);
      if (!e.eval.feasible) {
        ok = false;
        break;
      }
      total += e.eval.expected_cost;
    }
    if (ok && (!best || total < best.total)) best = { config, total };
  }
  if (!best) return null;
  const label = ctx.catalog.label(best.config);
  const distinct = new Set(routes.map((r) => `${r.model}@${r.effort}`));
  const gain = best.total > 0 ? ((best.total - routedTotal) / best.total) * 100 : 0;
  if (distinct.size === 1) {
    return {
      model: best.config.model,
      effort: best.config.effort,
      expected_cost: round(best.total, 6),
      routing_gain_pct: round(gain, 2),
      recommended: false,
      reason: `Every subsection already routes to a single configuration; nothing to consolidate.`,
    };
  }
  const recommended = gain < ctx.options.minRoutingGainPct;
  return {
    model: best.config.model,
    effort: best.config.effort,
    expected_cost: round(best.total, 6),
    routing_gain_pct: round(gain, 2),
    recommended,
    reason: recommended
      ? `Routing saves only ${gain.toFixed(1)}% versus running everything on ${label}. One model keeps one prompt cache and a simpler workflow, so use ${label} throughout.`
      : `Routing saves ${gain.toFixed(1)}% versus the cheapest single configuration that meets every quality floor (${label}).`,
  };
}

function explain(r: Routing, evals: CandidateEval[], firstMin: number, ctx: Context): string[] {
  const { catalog } = ctx;
  const reasons: string[] = [];
  const d = r.difficulty;
  reasons.push(
    `Difficulty ${d.level.toFixed(2)}/5: hardest signal is ${d.peak_signal} (${d.peak}), overall breadth ${d.breadth}` +
      (d.offset ? `, including a ${d.offset > 0 ? "+" : ""}${d.offset} correction learned from past outcomes in this category.` : "."),
  );
  reasons.push(
    `Quality floor ${pct(r.quality_floor)} (${ctx.options.quality} preset, criticality ${ctx.costs.decomposition.subsections.find((s) => s.id === r.id)?.signals.criticality}); first attempt must succeed at least ${pct(firstMin)} of the time.`,
  );
  reasons.push(
    `${catalog.label(r)}: ${pct(r.p_first)} first-pass, ${pct(r.p_final)} after verification and escalation, expected ${usd(r.cost.expected)} per completed subsection${r.repetitions > 1 ? ` (x${r.repetitions})` : ""}.`,
  );
  const cheaper = evals
    .filter((e) => !e.feasible && e.expected_cost < r.cost.expected)
    .sort((a, b) => b.expected_cost - a.expected_cost)[0];
  if (cheaper) {
    const why =
      cheaper.p_first < firstMin
        ? `first-pass success ${pct(cheaper.p_first)} is below the ${pct(firstMin)} minimum`
        : `final quality ${pctFloor(cheaper.p_final)} is below the ${pct(r.quality_floor)} floor`;
    reasons.push(`Cheaper ${catalog.label(cheaper)} was rejected: ${why}.`);
  }
  const stronger = evals
    .filter((e) => e.feasible && e.p_first > r.p_first + 0.005 && e.expected_cost > r.cost.expected)
    .sort((a, b) => a.expected_cost - b.expected_cost)[0];
  if (stronger && r.cost.expected > 0) {
    reasons.push(
      `${catalog.label(stronger)} would lift first-pass success to ${pct(stronger.p_first)} for ${(stronger.expected_cost / r.cost.expected).toFixed(1)}x the expected cost.`,
    );
  }
  reasons.push(`Verification: ${r.verification.note}${r.verification.human_review ? " A human should sign this off before downstream work relies on it." : ""}`);
  if (r.escalation.length) {
    reasons.push(`On a detected failure, escalate to ${r.escalation.map((c) => catalog.label(c)).join(", then ")}.`);
  }
  if (r.batch.eligible) {
    reasons.push(
      r.batch.applied
        ? `Runs on the Batch API (not latency-sensitive, ${r.repetitions} repetitions), saving ${usd(r.batch.saving_usd)}.`
        : `Batch-eligible (not latency-sensitive, ${r.repetitions} repetitions): --batch would save ${usd(r.batch.saving_usd)}.`,
    );
  }
  if (r.flags.includes("below-floor")) {
    reasons.push(
      `No allowed configuration reaches the ${pct(r.quality_floor)} floor; the strongest option reaches ${pctFloor(r.p_final)}. Split this subsection, sharpen its acceptance criteria, or plan human review.`,
    );
  }
  return reasons;
}

function roundEval(e: CandidateEval): CandidateEval {
  return {
    ...e,
    p_first: round(e.p_first, 4),
    p_final: round(e.p_final, 4),
    cost_first: round(e.cost_first, 6),
    expected_cost: round(e.expected_cost, 6),
    worst_case_cost: round(e.worst_case_cost, 6),
  };
}

/** Exposed for tests and the `explain` command. */
export const _internals = { buildLadder, chooseVerification, evaluate, ESCALATION_STEP, SLOPE, LOGIT_AT_CEILING };
export { difficulty, qualityFloor, successProbability, FIRST_PASS_MIN, pct, usd };
export type { Effort };
