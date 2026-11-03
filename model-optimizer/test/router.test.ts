import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultCatalog } from "../src/catalog.ts";
import { CostModel } from "../src/estimate.ts";
import { emptyCalibration, PlanError, routePlan } from "../src/router.ts";
import { DecompositionSchema, QUALITY_PRESETS, SIGNAL_KEYS } from "../src/types.ts";
import type { CalibrationSnapshot, Decomposition, DecompositionInput, QualityPreset, RoutedPlan, Signals } from "../src/types.ts";

const sample = () =>
  DecompositionSchema.parse(JSON.parse(readFileSync(new URL("../examples/decomposition.json", import.meta.url), "utf8")));

type SubIn = DecompositionInput["subsections"][number];
const signals = (v: number, extra: Partial<Signals> = {}): Signals => ({
  ...(Object.fromEntries(SIGNAL_KEYS.map((k) => [k, v])) as Signals),
  ...extra,
});
const sub = (id: string, extra: Record<string, unknown> = {}): SubIn =>
  ({
    id,
    title: `Title ${id}`,
    description: `Do ${id}`,
    category: "other",
    signals: signals(2, { verifiability: 3 }),
    outputs: [{ name: `${id}-out`, description: "out" }],
    acceptance_criteria: ["works"],
    est_input_tokens: 2000,
    est_output_tokens: 1500,
    ...extra,
  }) as SubIn;
const mk = (subs: SubIn[], shared_context = "Shared project brief. ".repeat(100)): Decomposition =>
  DecompositionSchema.parse({ title: "T", goal: "G", shared_context, subsections: subs });
const route = (dec: Decomposition, options: Record<string, unknown> = {}, calibration?: CalibrationSnapshot) =>
  routePlan({ decomposition: dec, options: options as never, ...(calibration ? { calibration } : {}) });
const ceilingOf = (c: { model: string; effort: string }) =>
  defaultCatalog.get(c.model).ceiling[c.effort as "low"];
const SUM_TOL = 1e-6;

test("sample: every route meets its quality floor, under every preset", () => {
  for (const quality of QUALITY_PRESETS) {
    const plan = route(sample(), { quality });
    assert.equal(plan.routes.length, 7);
    for (const r of plan.routes) {
      assert.equal(r.meets_floor, true, `${quality} ${r.id}`);
      assert.ok(r.p_final >= r.quality_floor, `${quality} ${r.id}`);
      assert.ok(!r.flags.includes("below-floor"));
    }
    assert.deepEqual(plan.metrics.quality.below_floor, []);
  }
});

test("sample: routes carry coherent request previews and costs", () => {
  const plan = route(sample());
  for (const r of plan.routes) {
    assert.equal(r.request.model, r.model);
    assert.equal(r.request.output_config.effort, r.effort);
    assert.ok(r.request.max_tokens >= 4096);
    assert.ok(r.cost.expected >= r.cost.first_attempt - 1e-9);
    assert.ok(r.cost.worst_case >= r.cost.expected - 1e-9);
    assert.ok(r.p_final >= r.p_first - 1e-9);
    assert.ok(r.cost.first_attempt > 0 && r.latency_s > 0);
  }
});

test("a trivially easy, low-criticality subsection routes to Haiku", () => {
  const dec = mk([sub("A", { signals: signals(1, { verifiability: 5 }), category: "transformation" })]);
  for (const quality of QUALITY_PRESETS) {
    const r = route(dec, { quality }).routes[0]!;
    assert.equal(r.agent_alias, "haiku", quality);
    assert.equal(r.meets_floor, true);
  }
});

test("a very hard, critical subsection routes to Fable or is flagged below the floor", () => {
  const dec = mk([
    sub("A", { signals: signals(3, { reasoning: 5, ambiguity: 5, expertise: 5, criticality: 5, verifiability: 2 }), category: "reasoning" }),
  ]);
  const r = route(dec).routes[0]!;
  assert.ok(r.agent_alias === "fable" || r.flags.includes("below-floor"), `${r.agent_alias} ${r.flags}`);
  assert.ok(r.difficulty.level > 4.5);
  assert.equal(r.verification.human_review, true);
});

test("a very hard subsection never routes to Haiku", () => {
  const dec = mk([sub("A", { signals: signals(5) })]);
  assert.notEqual(route(dec).routes[0]!.agent_alias, "haiku");
});

test("raising the quality preset never lowers p_final for the same subsection", () => {
  const order: QualityPreset[] = ["economy", "balanced", "max"];
  const decs = [
    sample(),
    mk([1, 2, 3, 4, 5].map((v) => sub(`S${v}`, { signals: signals(v, { criticality: 3 }) }))),
    mk([1, 2, 3, 4, 5].map((v) => sub(`T${v}`, { signals: signals(v, { criticality: 5 }) }))),
  ];
  for (const dec of decs) {
    const plans = order.map((quality) => route(dec, { quality }));
    for (let i = 1; i < plans.length; i++) {
      for (const r of plans[i]!.routes) {
        const lower = plans[i - 1]!.routes.find((x) => x.id === r.id)!;
        assert.ok(r.p_final >= lower.p_final - 1e-9, `${r.id}: ${order[i]} ${r.p_final} < ${order[i - 1]} ${lower.p_final}`);
      }
    }
  }
});

test("restricting models to haiku,sonnet uses only those and flags below-floor where needed", () => {
  const dec = mk([
    sub("EASY", { signals: signals(1, { verifiability: 5 }) }),
    sub("MID", { signals: signals(3), depends_on: ["EASY"] }),
    sub("HARD", { signals: signals(5), depends_on: ["MID"] }),
  ]);
  const plan = route(dec, { models: ["haiku", "sonnet"] });
  const allowed = new Set([defaultCatalog.get("haiku").id, defaultCatalog.get("sonnet").id]);
  for (const r of plan.routes) {
    assert.ok(allowed.has(r.model), `${r.id} ${r.model}`);
    for (const e of r.escalation) assert.ok(allowed.has(e.model), `${r.id} escalation ${e.model}`);
    for (const a of r.alternatives) assert.ok(allowed.has(a.model));
    assert.ok(allowed.has(r.verification.judge?.model ?? defaultCatalog.get("haiku").id));
  }
  for (const m of plan.metrics.model_mix) assert.ok(allowed.has(m.model));
  const hard = plan.routes.find((r) => r.id === "HARD")!;
  assert.equal(hard.meets_floor, false);
  assert.ok(hard.flags.includes("below-floor"));
  assert.ok(plan.issues.some((i) => i.code === "W_BELOW_QUALITY_FLOOR" && i.subsection === "HARD"));
  assert.ok(plan.metrics.quality.below_floor.includes("HARD"));
});

test("the chosen config has the minimum expected_cost among the feasible alternatives listed", () => {
  const decs = [sample(), mk([1, 2, 3, 4].map((v) => sub(`S${v}`, { signals: signals(v) })))];
  for (const dec of decs) {
    for (const r of route(dec).routes) {
      assert.ok(r.alternatives.length > 0 && r.alternatives.length <= 5);
      const feasible = r.alternatives.filter((a) => a.feasible);
      if (r.meets_floor) {
        assert.ok(feasible.length > 0);
        for (const a of feasible) assert.ok(r.cost.expected <= a.expected_cost + 1e-12, `${r.id} vs ${a.model}@${a.effort}`);
        assert.ok(feasible.some((a) => a.model === r.model && a.effort === r.effort));
      } else {
        assert.equal(feasible.length, 0);
      }
    }
  }
});

test("escalation ladders strictly increase in capability ceiling", () => {
  const dec = mk([1, 2, 3, 4, 5].map((v) => sub(`S${v}`, { signals: signals(v) })));
  for (const d of [sample(), dec]) {
    for (const maxEscalations of [1, 2, 3]) {
      for (const r of route(d, { maxEscalations }).routes) {
        assert.ok(r.escalation.length <= maxEscalations);
        const ladder = [{ model: r.model, effort: r.effort }, ...r.escalation];
        for (let i = 1; i < ladder.length; i++) {
          assert.ok(ceilingOf(ladder[i]!) > ceilingOf(ladder[i - 1]!), `${r.id} rung ${i}`);
        }
      }
    }
  }
});

test("batch: non-latency-sensitive subsection with repetitions >= 3 is batch-eligible; options.batch applies it at lower cost", () => {
  const dec = mk([
    sub("R", { repetitions: 5, latency_sensitive: false, signals: signals(2) }),
    sub("FEW", { repetitions: 2, latency_sensitive: false, signals: signals(2) }),
    sub("LS", { repetitions: 5, latency_sensitive: true, signals: signals(2) }),
  ]);
  const off = route(dec);
  const on = route(dec, { batch: true });
  const get = (p: RoutedPlan, id: string) => p.routes.find((r) => r.id === id)!;
  assert.equal(get(off, "R").batch.eligible, true);
  assert.equal(get(off, "R").batch.applied, false);
  assert.equal(get(off, "FEW").batch.eligible, false);
  assert.equal(get(off, "LS").batch.eligible, false);
  assert.equal(get(on, "R").batch.applied, true);
  assert.equal(get(on, "R").request.batch, true);
  assert.equal(get(on, "FEW").batch.applied, false);
  assert.equal(get(on, "LS").batch.applied, false);
  // same config, lower cost, and the reported saving matches
  assert.ok(get(on, "R").cost.expected < get(off, "R").cost.expected);
  assert.ok(get(on, "R").batch.saving_usd > 0);
  assert.ok(get(off, "R").batch.saving_usd > 0);
  assert.ok(off.metrics.cost.batch_saving_available > 0);
  assert.equal(on.metrics.cost.batch_saving_available, 0);
  // unaffected subsections cost the same
  assert.equal(get(on, "LS").cost.expected, get(off, "LS").cost.expected);
});

test("batch: the sample's S6 is batch-eligible", () => {
  const plan = route(sample());
  const s6 = plan.routes.find((r) => r.id === "S6")!;
  assert.equal(s6.batch.eligible, true);
  assert.equal(s6.batch.applied, false);
  assert.ok(route(sample(), { batch: true }).routes.find((r) => r.id === "S6")!.batch.applied);
});

function cacheCorrection(plan: RoutedPlan): number {
  const cm = new CostModel(defaultCatalog, plan.decomposition, {
    cache: plan.options.cache,
    systemPromptTokens: plan.options.systemPromptTokens,
  }, plan.calibration);
  let corr = 0;
  for (const c of plan.metrics.cache) {
    const p = cm.prefixCost(c.model, c.calls, c.ttl);
    corr += p.cost - p.warm;
  }
  return corr;
}

test("metrics: total equals the sum of route expected costs plus the cache correction", () => {
  const plans = [
    route(sample()),
    route(sample(), { cache: false }),
    route(sample(), { batch: true, quality: "economy" }),
    route(mk([1, 2, 3].map((v) => sub(`S${v}`, { signals: signals(v), repetitions: v * 2 }))), { quality: "balanced" }),
  ];
  for (const plan of plans) {
    const sum = plan.routes.reduce((s, r) => s + r.cost.expected, 0);
    assert.ok(Math.abs(plan.metrics.cost.expected - sum) < SUM_TOL);
    assert.ok(Math.abs(plan.metrics.cost.expected_with_cache - (sum + cacheCorrection(plan))) < SUM_TOL);
    assert.ok(Math.abs(plan.metrics.cost.cache_saving - plan.metrics.cache.reduce((s, c) => s + c.saving_usd, 0)) < SUM_TOL);
  }
});

test("metrics: cache entries cover each used model and decide per model", () => {
  const plan = route(sample());
  const models = new Set(plan.routes.map((r) => r.model));
  assert.deepEqual(new Set(plan.metrics.cache.map((c) => c.model)), models);
  for (const c of plan.metrics.cache) {
    const calls = plan.routes.filter((r) => r.model === c.model).reduce((s, r) => s + r.repetitions, 0);
    assert.equal(c.calls, calls);
    if (c.calls < 2) assert.equal(c.enabled, false);
    assert.ok(c.saving_usd >= 0);
  }
  const off = route(sample(), { cache: false });
  assert.ok(off.metrics.cache.every((c) => !c.enabled));
});

test("metrics: savings pct is consistent with the reference baseline cost", () => {
  for (const plan of [route(sample()), route(sample(), { quality: "economy", baseline: { model: "fable", effort: "high" } })]) {
    const m = plan.metrics;
    const ref = m.baselines[0]!;
    assert.match(ref.label, /\(reference\)/);
    assert.equal(ref.model, plan.options.baseline.model);
    assert.equal(ref.effort, plan.options.baseline.effort);
    assert.equal(m.savings.vs, ref.label);
    assert.ok(Math.abs(m.savings.usd - (ref.cost - m.cost.expected_with_cache)) < SUM_TOL);
    assert.ok(Math.abs(m.savings.pct - (m.savings.usd / ref.cost) * 100) < 0.006);
    assert.ok(Math.abs(m.savings.net_of_planner_usd - (m.savings.usd - m.planner_overhead)) < SUM_TOL);
  }
});

test("metrics: the reference baseline equals the sum of baseline first attempts plus the prefix correction", () => {
  const plan = route(sample());
  const ref = plan.metrics.baselines[0]!;
  const cm = new CostModel(defaultCatalog, plan.decomposition, { cache: plan.options.cache, systemPromptTokens: plan.options.systemPromptTokens });
  const calls = plan.decomposition.subsections.reduce((s, x) => s + x.repetitions, 0);
  const p = cm.prefixCost(ref.model, calls, "1h");
  let expected = p.cost - p.warm;
  for (const s of plan.decomposition.subsections) expected += cm.attempt(s, { model: ref.model, effort: ref.effort }).cost * s.repetitions;
  assert.ok(Math.abs(ref.cost - expected) < SUM_TOL);
});

test("metrics: the single_config alternative is never cheaper than the routed plan", () => {
  const decs = [sample(), mk([1, 2, 3, 4, 5].map((v) => sub(`S${v}`, { signals: signals(Math.min(v, 4)) }))), mk([sub("ONE")])];
  for (const dec of decs) {
    for (const quality of QUALITY_PRESETS) {
      const m = route(dec, { quality }).metrics;
      if (!m.single_config) continue;
      assert.ok(m.single_config.expected_cost >= m.cost.expected - SUM_TOL, `${quality}: ${m.single_config.expected_cost} < ${m.cost.expected}`);
      assert.ok(m.single_config.routing_gain_pct >= -0.01);
    }
  }
});

test("metrics: model mix, quality and schedule totals are consistent", () => {
  const plan = route(sample());
  const m = plan.metrics;
  assert.equal(m.model_mix.reduce((s, e) => s + e.subsections, 0), plan.routes.length);
  assert.ok(Math.abs(m.model_mix.reduce((s, e) => s + e.share_of_cost, 0) - 1) < 1e-3);
  assert.equal(m.total_repetitions, plan.routes.reduce((s, r) => s + r.repetitions, 0));
  assert.ok(m.quality.floor_min <= m.quality.floor_max);
  assert.ok(m.quality.min_p_final <= m.quality.mean_p_final);
  assert.ok(m.schedule.critical_path_s <= m.schedule.sequential_s + 0.05);
  assert.equal(m.schedule.waves.flat().length, plan.routes.length);
  assert.ok(m.cost.worst_case >= m.cost.expected - SUM_TOL);
});

test("calibration: a category offset raises difficulty for that category only and never makes routing cheaper", () => {
  const dec = sample();
  const base = route(dec);
  for (const offset of [0.3, 0.6, 1.0]) {
    const cal: CalibrationSnapshot = { ...emptyCalibration(), category_offsets: { code_generation: offset }, samples: 50 };
    const plan = route(dec, {}, cal);
    for (const r of plan.routes) {
      const b = base.routes.find((x) => x.id === r.id)!;
      if (r.category === "code_generation") {
        assert.ok(r.difficulty.level > b.difficulty.level, `${r.id}`);
        assert.ok(Math.abs(r.difficulty.level - b.difficulty.level - offset) < 1e-3);
        assert.equal(r.difficulty.offset, offset);
      } else {
        assert.equal(r.difficulty.level, b.difficulty.level);
        assert.equal(r.difficulty.offset, 0);
      }
      assert.ok(r.cost.expected >= b.cost.expected - 1e-9, `${r.id} offset ${offset}: ${r.cost.expected} < ${b.cost.expected}`);
    }
    assert.ok(plan.metrics.cost.expected >= base.metrics.cost.expected - 1e-9);
  }
});

test("calibration: a negative offset never makes routing more expensive", () => {
  const dec = sample();
  const base = route(dec);
  const cal: CalibrationSnapshot = { ...emptyCalibration(), category_offsets: { code_generation: -0.5, architecture: -0.5 }, samples: 50 };
  const plan = route(dec, {}, cal);
  for (const r of plan.routes) {
    assert.ok(r.cost.expected <= base.routes.find((x) => x.id === r.id)!.cost.expected + 1e-9, r.id);
  }
});

test("PlanError is thrown for a cycle, with the issues attached", () => {
  const dec = mk([sub("A", { depends_on: ["B"] }), sub("B", { depends_on: ["A"] })]);
  assert.throws(
    () => route(dec),
    (e: unknown) => e instanceof PlanError && e.issues.some((i) => i.code === "E_CYCLE") && /cycle/i.test(e.message),
  );
});

test("PlanError is thrown for a duplicate id", () => {
  assert.throws(() => route(mk([sub("A"), sub("A")])), (e: unknown) => e instanceof PlanError && e.issues.some((i) => i.code === "E_DUPLICATE_ID"));
});

test("routing does not mutate the input decomposition", () => {
  const dec = mk([sub("A"), sub("B", { inputs: [{ artifact: "A-out", from: "A" }] })]);
  const before = structuredClone(dec);
  const plan = route(dec);
  assert.deepEqual(dec, before);
  assert.deepEqual(plan.decomposition.subsections[1]?.depends_on, ["A"]);
  assert.ok(plan.issues.some((i) => i.code === "W_DEPENDENCY_ADDED"));
});

test("routing 25 subsections takes under 2 seconds", () => {
  const subs: SubIn[] = [];
  for (let i = 0; i < 25; i++) {
    const v = (i % 5) + 1;
    subs.push(
      sub(`S${i}`, {
        signals: signals(v, { criticality: ((i * 2) % 5) + 1 }),
        depends_on: i === 0 ? [] : [`S${i - 1}`],
        repetitions: (i % 4) + 1,
        latency_sensitive: i % 2 === 0,
      }),
    );
  }
  const dec = mk(subs);
  const t0 = performance.now();
  const plan = route(dec);
  const elapsed = performance.now() - t0;
  assert.equal(plan.routes.length, 25);
  assert.ok(elapsed < 2000, `took ${elapsed.toFixed(0)}ms`);
});
