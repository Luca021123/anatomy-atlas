/**
 * Plan-level metrics: what the routed plan is expected to cost, what it would
 * cost without routing, how good it is expected to be, and how long it takes.
 */
import type { Catalog } from "./catalog.ts";
import { criticalPath, type GraphAnalysis } from "./dag.ts";
import { configKey, type CostModel, round } from "./estimate.ts";
import { JUDGE_FALSE_REJECT, successProbability } from "./scoring.ts";
import { costDistribution } from "./simulate.ts";
import type {
  Baseline,
  CachePlanEntry,
  Config,
  Decomposition,
  ModelMixEntry,
  PlanMetrics,
  RouterOptions,
  Routing,
  SingleConfigAlternative,
} from "./types.ts";

/** The 5-minute cache is refreshed on every hit; a longer idle gap needs the 1-hour TTL. */
const FIVE_MINUTE_GAP_S = 270;

/**
 * Decides, per model, whether caching the shared prefix pays and which TTL it
 * needs, from how many calls share it and the idle gaps between them.
 */
export function planCache(
  routes: Routing[],
  costs: CostModel,
  times: Map<string, { start: number; finish: number }>,
): CachePlanEntry[] {
  const byModel = new Map<string, Routing[]>();
  for (const r of routes) byModel.set(r.model, [...(byModel.get(r.model) ?? []), r]);
  const out: CachePlanEntry[] = [];
  for (const [model, rs] of byModel) {
    const calls = rs.reduce((s, r) => s + r.repetitions, 0);
    const spans = rs
      .map((r) => times.get(r.id) ?? { start: 0, finish: 0 })
      .sort((a, b) => a.start - b.start);
    let maxGap = 0;
    let lastFinish = spans[0]?.finish ?? 0;
    for (const span of spans.slice(1)) {
      maxGap = Math.max(maxGap, span.start - lastFinish);
      lastFinish = Math.max(lastFinish, span.finish);
    }
    const ttl: "5m" | "1h" = maxGap > FIVE_MINUTE_GAP_S ? "1h" : "5m";
    const p = costs.prefixCost(model, calls, ttl);
    out.push({
      model,
      calls,
      prefix_tokens: costs.prefixTokens(model),
      enabled: p.enabled,
      ttl,
      max_gap_s: round(maxGap, 1),
      saving_usd: round(p.uncached - p.cost, 6),
    });
  }
  return out;
}

export interface MetricsInput {
  decomposition: Decomposition;
  routes: Routing[];
  options: RouterOptions;
  catalog: Catalog;
  costs: CostModel;
  graph: GraphAnalysis;
  cache: CachePlanEntry[];
  singleConfig: SingleConfigAlternative | null;
}

export function computeMetrics(input: MetricsInput): PlanMetrics {
  const { decomposition: dec, routes, options, catalog, costs, graph, cache } = input;
  const sum = (f: (r: Routing) => number) => routes.reduce((s, r) => s + f(r), 0);

  // Per-route estimates assume every call reads the prefix from a warm cache;
  // correct that to the real per-model cache decision.
  let cacheCorrection = 0;
  for (const c of cache) {
    const p = costs.prefixCost(c.model, c.calls, c.ttl);
    cacheCorrection += p.cost - p.warm;
  }
  const expected = sum((r) => r.cost.expected);
  const expectedWithCache = expected + cacheCorrection;
  const distribution = costDistribution(routes, dec.subsections, costs, catalog, { constant: cacheCorrection });

  // Baselines: everything on one configuration, first attempt only, no verification.
  const baselineConfigs: { label: string; config: Config }[] = [];
  const addBaseline = (config: Config, suffix = "") => {
    if (!catalog.has(config.model)) return;
    const spec = catalog.get(config.model);
    if (!spec.efforts.includes(config.effort)) return;
    const normalized = { model: spec.id, effort: config.effort };
    if (baselineConfigs.some((b) => configKey(b.config) === configKey(normalized))) return;
    baselineConfigs.push({ label: `All on ${catalog.label(normalized)}${suffix}`, config: normalized });
  };
  addBaseline(options.baseline, " (reference)");
  for (const m of [...catalog.models].reverse()) addBaseline({ model: m.id, effort: m.defaultEffort === "medium" && m.tier >= 2 ? "high" : m.defaultEffort });

  const totalCalls = dec.subsections.reduce((s, sub) => s + sub.repetitions, 0);
  const baselines: Baseline[] = baselineConfigs.map(({ label, config }) => {
    const spec = catalog.get(config.model);
    const prefix = costs.prefixCost(spec.id, totalCalls, "1h");
    let cost = prefix.cost - prefix.warm;
    let below = 0;
    let pSum = 0;
    for (const sub of dec.subsections) {
      const route = routes.find((r) => r.id === sub.id);
      cost += costs.attempt(sub, config, { rung: 0 }).cost * sub.repetitions;
      const p = successProbability(spec.ceiling[config.effort], route?.difficulty.level ?? 3);
      pSum += p;
      if (route && p < route.quality_floor) below++;
    }
    return {
      label,
      model: spec.id,
      effort: config.effort,
      cost: round(cost, 6),
      below_floor: below,
      mean_p_first: round(pSum / Math.max(1, dec.subsections.length), 4),
    };
  });
  const reference = baselines[0] as Baseline;
  const savingsUsd = reference.cost - expectedWithCache;
  const plannerOverhead = dec.source.usage?.cost_usd ?? 0;

  // Model mix.
  const mix = new Map<string, ModelMixEntry>();
  for (const r of routes) {
    const spec = catalog.get(r.model);
    const e: ModelMixEntry = mix.get(spec.id) ?? {
      model: spec.id,
      model_name: spec.name,
      alias: spec.alias,
      subsections: 0,
      repetitions: 0,
      expected_cost: 0,
      share_of_cost: 0,
      share_of_subsections: 0,
    };
    e.subsections += 1;
    e.repetitions += r.repetitions;
    e.expected_cost += r.cost.expected;
    mix.set(spec.id, e);
  }
  const modelMix = [...mix.values()]
    .map((e) => ({
      ...e,
      expected_cost: round(e.expected_cost, 6),
      share_of_cost: round(expected > 0 ? e.expected_cost / expected : 0, 4),
      share_of_subsections: round(e.subsections / Math.max(1, routes.length), 4),
    }))
    .sort((a, b) => catalog.get(a.model).tier - catalog.get(b.model).tier);

  // Quality.
  const floors = routes.map((r) => r.quality_floor);
  const finals = routes.map((r) => r.p_final);
  const expectedEscalations = sum((r) => {
    if (!r.escalation.length) return 0;
    const usesJudge = r.verification.method !== "self-check";
    const d = r.verification.detection_rate;
    return r.repetitions * ((1 - r.p_first) * d + (usesJudge ? r.p_first * JUDGE_FALSE_REJECT : 0));
  });

  // Schedule.
  const latency = new Map(routes.map((r) => [r.id, r.latency_s]));
  const cp = criticalPath(dec.subsections, graph.order, (id) => latency.get(id) ?? 0);
  const sequential = sum((r) => r.latency_s);

  return {
    currency: "USD",
    pricing_as_of: catalog.pricingAsOf,
    subsections: routes.length,
    total_repetitions: sum((r) => r.repetitions),
    cost: {
      first_pass: round(sum((r) => r.cost.first_attempt) + cacheCorrection, 6),
      expected: round(expected, 6),
      worst_case: round(sum((r) => r.cost.worst_case) + cacheCorrection, 6),
      expected_with_cache: round(expectedWithCache, 6),
      cache_saving: round(cache.reduce((s, c) => s + c.saving_usd, 0), 6),
      batch_saving_available: round(sum((r) => (r.batch.eligible && !r.batch.applied ? r.batch.saving_usd : 0)), 6),
      p50: round(distribution.p50, 6),
      p90: round(distribution.p90, 6),
    },
    planner_overhead: round(plannerOverhead, 6),
    baselines,
    savings: {
      vs: reference.label,
      usd: round(savingsUsd, 6),
      pct: round(reference.cost > 0 ? (savingsUsd / reference.cost) * 100 : 0, 2),
      net_of_planner_usd: round(savingsUsd - plannerOverhead, 6),
    },
    single_config: input.singleConfig,
    model_mix: modelMix,
    quality: {
      floor_min: round(Math.min(...floors), 4),
      floor_max: round(Math.max(...floors), 4),
      mean_p_final: round(finals.reduce((a, b) => a + b, 0) / Math.max(1, finals.length), 4),
      min_p_final: round(Math.min(...finals), 4),
      below_floor: routes.filter((r) => !r.meets_floor).map((r) => r.id),
      expected_escalations: round(expectedEscalations, 3),
      human_review: routes.filter((r) => r.verification.human_review).map((r) => r.id),
    },
    schedule: {
      waves: graph.waves,
      critical_path: cp.path,
      critical_path_s: round(cp.seconds, 1),
      sequential_s: round(sequential, 1),
      parallelism: round(cp.seconds > 0 ? sequential / cp.seconds : 1, 2),
    },
    tokens: {
      input: Math.round(sum((r) => r.repetitions * (r.tokens.prefix + r.tokens.input))),
      output: Math.round(sum((r) => r.repetitions * r.tokens.output)),
      thinking: Math.round(sum((r) => r.repetitions * r.tokens.thinking)),
    },
    cache,
  };
}
