/**
 * The executor: runs a routed plan wave by wave on the Claude API, verifies
 * every output against its acceptance criteria, escalates detected failures up
 * the subsection's ladder, enforces a budget, and streams RunEvents for the
 * live terminal view and the dashboard. Every attempt is written to disk and
 * (outside dry runs) recorded in the outcome ledger.
 *
 * `dryRun` simulates the whole run from the router's own estimates and success
 * model - no API calls, no spend, nothing written to the ledger - so the plan,
 * the schedule and the live feedback can be inspected before paying for them.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Catalog, ModelSpec } from "../catalog.ts";
import { callCost, CostModel, round } from "../estimate.ts";
import { type EventBus, now } from "../events.ts";
import type { Ledger } from "../ledger.ts";
import { describeError, isAuthError, type LlmClient, type LlmResult, RefusalError } from "../llm.ts";
import {
  buildJudgePrompt,
  buildTaskPrompt,
  EXECUTOR_SYSTEM_PROMPT,
  JUDGE_SYSTEM_PROMPT,
  parseArtifacts,
  projectBrief,
  type UpstreamArtifact,
} from "../prompts.ts";
import { JUDGE_FALSE_REJECT, successProbability } from "../scoring.ts";
import type {
  AttemptRecord,
  AttemptStatus,
  Config,
  LiveTotals,
  RoutedPlan,
  Routing,
  RunStatus,
  RunSummary,
  Subsection,
  SubsectionRunState,
  UsageTotals,
  Verdict,
} from "../types.ts";

export interface RunOptions {
  plan: RoutedPlan;
  catalog: Catalog;
  bus: EventBus;
  /** Directory for attempts, artifacts, events.jsonl and run.json. */
  outDir: string;
  /** Required unless dryRun. */
  client?: LlmClient;
  /** Maximum concurrent attempts (default: the plan's concurrency option). */
  concurrency?: number;
  /** Stop starting new attempts once the projected spend would exceed this (USD). */
  budgetUsd?: number;
  dryRun?: boolean;
  /** Dry-run time compression: 25 means a simulated minute takes 2.4 seconds. */
  speed?: number;
  seed?: number;
  ledger?: Ledger;
  /** Use the server-side refusal fallback on models that support it (default true). */
  fallbacks?: boolean;
  signal?: AbortSignal;
}

const VerdictSchema = z.object({
  criteria: z.array(z.object({ criterion: z.string(), met: z.boolean(), reason: z.string() })),
  pass: z.boolean(),
  feedback: z.string(),
});

interface Unit {
  sub: Subsection;
  route: Routing;
  /** The item this unit handles, for subsections that repeat over listed items. */
  item?: string;
  index: number;
  count: number;
  /** Router's expected cost for this unit (USD). */
  est: number;
}

interface AttemptOutcome {
  record: AttemptRecord;
  artifacts: Record<string, string>;
}

class FatalRunError extends Error {}

export async function runPlan(opts: RunOptions): Promise<RunSummary> {
  const { plan, catalog, bus } = opts;
  if (!opts.dryRun && !opts.client) throw new Error("runPlan needs an LLM client unless dryRun is set");
  const dec = plan.decomposition;
  const subs = new Map(dec.subsections.map((s) => [s.id, s]));
  const routes = new Map(plan.routes.map((r) => [r.id, r]));
  const costs = new CostModel(catalog, dec, { cache: plan.options.cache, systemPromptTokens: plan.options.systemPromptTokens }, plan.calibration);
  const semaphore = new Semaphore(Math.max(1, opts.concurrency ?? plan.options.concurrency));
  const speed = Math.max(1, opts.speed ?? 25);
  const order = plan.metrics.schedule.waves.flat();
  const startedMs = Date.now();
  const startedAt = now();

  mkdirSync(opts.outDir, { recursive: true });
  writeFileSync(join(opts.outDir, "plan.json"), JSON.stringify(plan, null, 2));
  const eventsPath = join(opts.outDir, "events.jsonl");
  writeFileSync(eventsPath, "");
  const unsubscribeLog = bus.subscribe((e) => {
    if (e.type === "run.started") appendFileSync(eventsPath, `${JSON.stringify({ ...e, plan: undefined })}\n`);
    else if (e.type !== "subsection.progress") appendFileSync(eventsPath, `${JSON.stringify(e)}\n`);
  });

  const states = new Map<string, SubsectionRunState>(
    dec.subsections.map((s) => [
      s.id,
      { id: s.id, title: s.title, status: "pending", attempts: [], artifacts: {}, cost_usd: 0, est_cost_usd: routes.get(s.id)?.cost.expected ?? 0 },
    ]),
  );

  // Units: one per listed item; otherwise one unit that covers all repetitions.
  const units = new Map<string, Unit[]>();
  for (const sub of dec.subsections) {
    const route = routes.get(sub.id) as Routing;
    const items = sub.items.length ? sub.items : [undefined];
    units.set(
      sub.id,
      items.map((item, index) => ({
        sub,
        route,
        ...(item !== undefined ? { item } : {}),
        index,
        count: items.length,
        est: route.cost.expected / items.length,
      })),
    );
    if (!sub.items.length && sub.repetitions > 1) {
      bus.emit({
        type: "warning",
        at: now(),
        id: sub.id,
        message: `${sub.id} repeats ${sub.repetitions} times but lists no items, so it runs as one call covering all of them; its estimate assumed ${sub.repetitions} calls.`,
      });
    }
  }

  // Running totals for live feedback and projections.
  const tokens: UsageTotals = { input: 0, output: 0, thinking: 0, cache_write: 0, cache_read: 0 };
  let spent = 0;
  let escalations = 0;
  let firstPassSuccesses = 0;
  let finishedActual = 0;
  let finishedEst = 0;
  const finishedUnits = new Set<Unit>();
  let stopping: { status: RunStatus; reason: string } | null = null;

  const observedRatio = () => (finishedEst > 0 ? Math.min(4, Math.max(0.25, finishedActual / finishedEst)) : 1);
  const totals = (): LiveTotals => {
    let remaining = 0;
    for (const list of units.values()) for (const u of list) if (!finishedUnits.has(u)) remaining += u.est;
    const projected = spent + (stopping ? 0 : remaining * observedRatio());
    const baseline = plan.metrics.baselines[0]?.cost ?? 0;
    const count = (s: SubsectionRunState["status"]) => [...states.values()].filter((x) => x.status === s).length;
    return {
      elapsed_s: round((Date.now() - startedMs) / 1000, 1),
      spent_usd: round(spent, 6),
      est_total_usd: plan.metrics.cost.expected_with_cache,
      projected_total_usd: round(projected, 6),
      baseline_usd: baseline,
      projected_savings_pct: round(baseline > 0 ? ((baseline - projected) / baseline) * 100 : 0, 2),
      done: count("done"),
      failed: count("failed"),
      running: count("running") + count("verifying") + count("queued"),
      pending: count("pending"),
      skipped: count("skipped"),
      escalations,
      first_pass_successes: firstPassSuccesses,
      ...(opts.budgetUsd !== undefined ? { budget_usd: opts.budgetUsd } : {}),
      tokens: { ...tokens },
    };
  };
  const emitMetrics = () => bus.emit({ type: "metrics", at: now(), totals: totals() });

  const stop = (status: RunStatus, reason: string) => {
    if (!stopping) {
      stopping = { status, reason };
      bus.emit({ type: "warning", at: now(), message: reason });
    }
  };
  const onAbort = () => stop("aborted", "Run interrupted; finishing in-flight attempts and stopping.");
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  bus.emit({
    type: "run.started",
    at: startedAt,
    plan,
    concurrency: semaphore.max,
    ...(opts.budgetUsd !== undefined ? { budget_usd: opts.budgetUsd } : {}),
    dry_run: opts.dryRun === true,
  });
  emitMetrics();

  // ----------------------------------------------------------------- attempts

  const attemptEstimate = (unit: Unit, config: Config, rung: number): number => {
    const att = costs.attempt(unit.sub, config, { rung, batch: false }).cost;
    const judge =
      unit.route.verification.method !== "self-check" && unit.route.verification.judge
        ? costs.judge(unit.sub, unit.route.verification.judge).cost
        : 0;
    const scale = unit.item === undefined ? unit.sub.repetitions : 1;
    return (att + judge) * scale;
  };

  const cacheFor = (model: string) => {
    const entry = plan.metrics.cache.find((c) => c.model === model);
    return entry && entry.enabled ? { cache: true, ttl: entry.ttl } : { cache: false, ttl: "5m" as const };
  };

  const priceUsage = (spec: ModelSpec, usage: UsageTotals, ttl: "5m" | "1h"): number =>
    callCost(spec, {
      uncached: usage.input,
      cacheRead: usage.cache_read,
      cacheWrite5m: ttl === "5m" ? usage.cache_write : 0,
      cacheWrite1h: ttl === "1h" ? usage.cache_write : 0,
      output: usage.output,
    });

  const unitTag = (unit: Unit) => (unit.count > 1 ? `-item${unit.index + 1}` : "");

  const realAttempt = async (unit: Unit, config: Config, rung: number, attemptNo: number, feedback?: string): Promise<AttemptOutcome> => {
    const client = opts.client as LlmClient;
    const { sub, route } = unit;
    const spec = catalog.get(config.model);
    const state = states.get(sub.id) as SubsectionRunState;
    const upstream: UpstreamArtifact[] = sub.inputs
      .filter((i) => i.from !== "project")
      .map((i) => ({ artifact: i.artifact, from: i.from, content: states.get(i.from)?.artifacts[i.artifact] ?? "(not available)" }));
    let user = buildTaskPrompt({ decomposition: dec, sub, route, upstream, ...(feedback ? { feedback } : {}), mode: "api" });
    if (unit.item !== undefined) user += `\n\n## This call\nHandle item ${unit.index + 1} of ${unit.count}: ${unit.item}`;
    else if (sub.repetitions > 1) user += `\n\n## Scope\nThis work covers ${sub.repetitions} instances; handle all of them in this response.`;
    const { cache, ttl } = cacheFor(config.model);
    const perRepMax = costs.attempt(sub, config, { rung }).max_tokens;
    const maxTokens = Math.min(spec.maxOutput, unit.item === undefined && sub.repetitions > 1 ? perRepMax * sub.repetitions : perRepMax);
    const started = now();
    let chars = 0;
    let tail = "";
    let lastEmit = 0;
    let result: LlmResult | null = null;
    let error: string | undefined;
    try {
      result = await client.complete({
        model: spec.id,
        effort: config.effort,
        maxTokens,
        system: [{ text: `${EXECUTOR_SYSTEM_PROMPT}\n\n${projectBrief(dec)}`, cache, ttl }],
        user,
        fallbacks: opts.fallbacks !== false && spec.serverFallback,
        onText: (delta) => {
          chars += delta.length;
          tail = (tail + delta).slice(-120);
          const t = Date.now();
          if (t - lastEmit > 250) {
            lastEmit = t;
            bus.emit({ type: "subsection.progress", at: now(), id: sub.id, attempt: attemptNo, output_tokens: Math.round(chars / 4), tail });
          }
        },
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
    } catch (e) {
      if (isFatal(e)) throw new FatalRunError(describeError(e));
      error = e instanceof RefusalError ? e.message : describeError(e);
    }

    const usage: UsageTotals = result?.usage ?? { input: 0, output: 0, thinking: 0, cache_write: 0, cache_read: 0 };
    const servedSpec = result && catalog.has(result.servedModel) ? catalog.get(result.servedModel) : spec;
    let cost = priceUsage(servedSpec, usage, ttl);
    const dir = join(opts.outDir, sub.id);
    mkdirSync(dir, { recursive: true });
    const base = `attempt-${attemptNo}${unitTag(unit)}`;
    if (result) writeFileSync(join(dir, `${base}.md`), result.text);

    let status: AttemptStatus = "error";
    let verdict: Verdict | undefined;
    let artifacts: Record<string, string> = {};
    if (result) {
      const parsed = parseArtifacts(result.text, sub.outputs.map((o) => o.name));
      artifacts = parsed.artifacts;
      if (result.stopReason === "max_tokens") {
        status = "fail";
        verdict = mechanicalVerdict(`The response was cut off at max_tokens (${maxTokens}). Be more concise or split the work.`);
      } else if (parsed.missing.length) {
        status = "fail";
        verdict = mechanicalVerdict(`Missing or empty artifacts: ${parsed.missing.join(", ")}. Wrap each required output in <artifact name="..."> tags.`);
      } else if (route.verification.method === "self-check" || !route.verification.judge) {
        const fails = parsed.notes.split("\n").filter((l) => /^\s*(?:[-*]\s*)?FAIL\b/i.test(l));
        status = fails.length ? "fail" : "pass";
        verdict = {
          pass: !fails.length,
          score: fails.length ? Math.max(0, 1 - fails.length / Math.max(1, sub.acceptance_criteria.length)) : 1,
          failed_criteria: fails.map((l) => l.trim()),
          feedback: fails.length ? `Your own check reported failures:\n${fails.join("\n")}` : "Self-check passed.",
          judge_model: "self",
          judge_cost_usd: 0,
        };
      } else {
        state.status = "verifying";
        const judge = route.verification.judge;
        const jspec = catalog.get(judge.model);
        bus.emit({ type: "subsection.verifying", at: now(), id: sub.id, attempt: attemptNo, judge_model: jspec.id });
        try {
          const j = await client.structured({
            model: jspec.id,
            effort: judge.effort,
            maxTokens: 16_000,
            system: [{ text: JUDGE_SYSTEM_PROMPT }],
            user: buildJudgePrompt(sub, result.text),
            schema: VerdictSchema,
            fallbacks: opts.fallbacks !== false && jspec.serverFallback,
            ...(opts.signal ? { signal: opts.signal } : {}),
          });
          const judgeCost = priceUsage(jspec, j.usage, "5m");
          addUsage(tokens, j.usage);
          cost += judgeCost;
          const met = j.parsed.criteria.filter((c) => c.met).length;
          const pass = j.parsed.pass && j.parsed.criteria.every((c) => c.met);
          verdict = {
            pass,
            score: j.parsed.criteria.length ? round(met / j.parsed.criteria.length, 3) : pass ? 1 : 0,
            failed_criteria: j.parsed.criteria.filter((c) => !c.met).map((c) => `${c.criterion}: ${c.reason}`),
            feedback: j.parsed.feedback,
            judge_model: j.servedModel || jspec.id,
            judge_cost_usd: round(judgeCost, 6),
          };
          status = pass ? "pass" : "fail";
          writeFileSync(join(dir, `${base}.verdict.json`), JSON.stringify(j.parsed, null, 2));
        } catch (e) {
          if (isFatal(e)) throw new FatalRunError(describeError(e));
          // A broken judge must not burn the whole ladder: accept, but say so loudly.
          status = "pass";
          verdict = {
            pass: true,
            score: 0,
            failed_criteria: [],
            feedback: `UNVERIFIED: the judge call failed (${describeError(e)}). Review this output by hand.`,
            judge_model: jspec.id,
            judge_cost_usd: 0,
          };
          bus.emit({ type: "warning", at: now(), id: sub.id, message: `${sub.id}: verification could not run, output accepted unverified (${describeError(e)}).` });
        }
      }
    }
    addUsage(tokens, usage);
    const record: AttemptRecord = {
      subsection: sub.id,
      attempt: attemptNo,
      model: spec.id,
      effort: config.effort,
      served_model: result?.servedModel || spec.id,
      started_at: started,
      ended_at: now(),
      latency_s: round(result?.latencyS ?? 0, 2),
      usage,
      cost_usd: round(cost, 6),
      est_cost_usd: round(attemptEstimate(unit, config, rung), 6),
      stop_reason: result?.stopReason ?? null,
      ...(verdict ? { verdict } : {}),
      status,
      ...(error ? { error } : {}),
    };
    if (opts.ledger && !opts.signal?.aborted) {
      opts.ledger.append({
        v: 1,
        ts: record.ended_at,
        source: "run",
        plan: dec.title,
        subsection: sub.id,
        category: sub.category,
        level_raw: route.difficulty.raw,
        ceiling: spec.ceiling[config.effort],
        predicted_p: round(successProbability(spec.ceiling[config.effort], route.difficulty.level), 4),
        model: spec.id,
        effort: config.effort,
        rung,
        pass: status === "pass",
        est: (() => {
          const a = costs.attempt(sub, config, { rung });
          return { input: a.tokens.prefix + a.tokens.input, output: a.tokens.output, cost: a.cost };
        })(),
        actual: {
          input: usage.input,
          output: usage.output,
          thinking: usage.thinking,
          cache_read: usage.cache_read,
          cache_write: usage.cache_write,
          cost: round(cost - (verdict?.judge_cost_usd ?? 0), 6),
          latency_s: record.latency_s,
        },
      });
    }
    return { record, artifacts };
  };

  const simulatedAttempt = async (unit: Unit, config: Config, rung: number, attemptNo: number): Promise<AttemptOutcome> => {
    const { sub, route } = unit;
    const spec = catalog.get(config.model);
    const rng = mulberry32(hashString(`${opts.seed ?? 7}:${sub.id}:${unit.index}:${rung}`));
    const est = costs.attempt(sub, config, { rung });
    const scale = unit.item === undefined ? sub.repetitions : 1;
    const noise = 0.75 + rng() * 0.5; // mean 1.0: simulated usage matches the estimate on average
    const out = Math.round((est.tokens.output + est.tokens.thinking) * noise * scale);
    const { cache, ttl } = cacheFor(config.model);
    const usage: UsageTotals = {
      input: (est.tokens.input + (cache ? 0 : est.tokens.prefix)) * scale,
      output: out,
      thinking: Math.round(est.tokens.thinking * noise * scale),
      cache_write: 0,
      cache_read: cache ? est.tokens.prefix * scale : 0,
    };
    const started = now();
    const genSeconds = (est.latency_s * noise * scale) / speed;
    const steps = Math.max(1, Math.min(40, Math.round(genSeconds * 4)));
    for (let i = 1; i <= steps; i++) {
      await sleep((genSeconds * 1000) / steps, opts.signal);
      bus.emit({
        type: "subsection.progress",
        at: now(),
        id: sub.id,
        attempt: attemptNo,
        output_tokens: Math.round((out * i) / steps),
        tail: `[simulated] ${sub.title} ... ${Math.round((100 * i) / steps)}%`,
      });
    }
    const p = successProbability(spec.ceiling[config.effort], route.difficulty.level);
    const good = rng() < p;
    let cost = priceUsage(spec, usage, ttl);
    let verdict: Verdict;
    if (route.verification.method !== "self-check" && route.verification.judge) {
      const judge = route.verification.judge;
      states.get(sub.id)!.status = "verifying";
      bus.emit({ type: "subsection.verifying", at: now(), id: sub.id, attempt: attemptNo, judge_model: judge.model });
      const j = costs.judge(sub, judge);
      await sleep((j.latency_s * 1000) / speed, opts.signal);
      cost += j.cost;
      const caught = !good && rng() < route.verification.detection_rate;
      const falseReject = good && rng() < JUDGE_FALSE_REJECT;
      const pass = !(caught || falseReject);
      verdict = {
        pass,
        score: pass ? 1 : 0.5,
        failed_criteria: pass ? [] : [sub.acceptance_criteria[0] ?? "acceptance criteria"],
        feedback: pass ? "Simulated verdict: pass." : "Simulated verdict: a criterion was not met.",
        judge_model: judge.model,
        judge_cost_usd: round(j.cost, 6),
      };
    } else {
      const caught = !good && rng() < route.verification.detection_rate;
      verdict = {
        pass: !caught,
        score: caught ? 0.5 : 1,
        failed_criteria: caught ? ["self-check reported a failure"] : [],
        feedback: caught ? "Simulated self-check failure." : "Simulated self-check pass.",
        judge_model: "self",
        judge_cost_usd: 0,
      };
    }
    addUsage(tokens, usage);
    const artifacts = Object.fromEntries(
      sub.outputs.map((o) => [o.name, `(dry run: simulated ${o.format} for ${sub.id} - no API call was made)`]),
    );
    const record: AttemptRecord = {
      subsection: sub.id,
      attempt: attemptNo,
      model: spec.id,
      effort: config.effort,
      served_model: spec.id,
      started_at: started,
      ended_at: now(),
      latency_s: round(genSeconds * speed, 2),
      usage,
      cost_usd: round(cost, 6),
      est_cost_usd: round(attemptEstimate(unit, config, rung), 6),
      stop_reason: "end_turn",
      verdict,
      status: verdict.pass ? "pass" : "fail",
    };
    return { record, artifacts };
  };

  // -------------------------------------------------------------------- units

  /** Runs one unit up its escalation ladder. Returns its artifacts, or null when it failed or was stopped. */
  const runUnit = async (unit: Unit): Promise<{ artifacts: Record<string, string>; firstPass: boolean } | null> => {
    const { sub, route } = unit;
    const state = states.get(sub.id) as SubsectionRunState;
    const ladder: Config[] = [{ model: route.model, effort: route.effort }, ...route.escalation];
    let feedback: string | undefined;
    for (let rung = 0; rung < ladder.length; rung++) {
      const config = ladder[rung] as Config;
      if (stopping) return null;
      const estimate = attemptEstimate(unit, config, rung) * observedRatio();
      if (opts.budgetUsd !== undefined && spent + estimate > opts.budgetUsd) {
        stop("budget_exceeded", `Budget $${opts.budgetUsd.toFixed(2)} reached: spent $${spent.toFixed(4)}, next attempt (${sub.id}) estimated at $${estimate.toFixed(4)}. Stopping before starting more work.`);
        return null;
      }
      const release = await semaphore.acquire();
      if (stopping) {
        release();
        return null;
      }
      const attemptNo = state.attempts.length + 1;
      state.status = "running";
      bus.emit({ type: "subsection.started", at: now(), id: sub.id, attempt: attemptNo, model: config.model, effort: config.effort });
      let outcome: AttemptOutcome;
      try {
        outcome = opts.dryRun
          ? await simulatedAttempt(unit, config, rung, attemptNo)
          : await realAttempt(unit, config, rung, attemptNo, feedback);
      } finally {
        release();
      }
      state.attempts.push(outcome.record);
      state.cost_usd = round(state.cost_usd + outcome.record.cost_usd, 6);
      spent += outcome.record.cost_usd;
      bus.emit({ type: "subsection.attempt_finished", at: now(), id: sub.id, record: outcome.record });
      if (outcome.record.status === "pass") {
        state.final_model = config.model;
        emitMetrics();
        return { artifacts: outcome.artifacts, firstPass: rung === 0 };
      }
      const reason =
        outcome.record.error ??
        (outcome.record.verdict ? `${outcome.record.verdict.failed_criteria.slice(0, 3).join("; ") || outcome.record.verdict.feedback}` : "failed");
      feedback = outcome.record.error
        ? undefined
        : [outcome.record.verdict?.feedback ?? "", ...(outcome.record.verdict?.failed_criteria ?? []).map((c) => `- ${c}`)].join("\n");
      const next = ladder[rung + 1];
      if (next && !stopping) {
        escalations++;
        bus.emit({ type: "subsection.escalated", at: now(), id: sub.id, from: config, to: next, reason });
      }
      emitMetrics();
    }
    return null;
  };

  const runSubsection = async (id: string, deps: Promise<void>[]): Promise<void> => {
    await Promise.all(deps);
    const sub = subs.get(id) as Subsection;
    const state = states.get(id) as SubsectionRunState;
    const blocked = sub.depends_on.find((d) => states.get(d)?.status !== "done");
    if (blocked || stopping) {
      const reason = blocked ? `upstream ${blocked} ${states.get(blocked)?.status ?? "missing"}` : (stopping as { reason: string } | null)?.reason ?? "stopped";
      state.status = "skipped";
      for (const u of units.get(id) ?? []) finishedUnits.add(u);
      bus.emit({ type: "subsection.skipped", at: now(), id, reason });
      emitMetrics();
      return;
    }
    state.status = "queued";
    bus.emit({ type: "subsection.queued", at: now(), id });
    const list = units.get(id) ?? [];
    const results = await Promise.all(
      list.map(async (u) => {
        const r = await runUnit(u);
        finishedUnits.add(u);
        return r;
      }),
    );
    // Track estimate accuracy at subsection granularity.
    finishedActual += state.cost_usd;
    finishedEst += state.est_cost_usd;
    if (results.every((r) => r !== null)) {
      const merged: Record<string, string> = {};
      for (const o of sub.outputs) {
        const parts = results.map((r, i) => {
          const body = r?.artifacts[o.name] ?? "";
          return list.length > 1 ? `## ${list[i]?.item ?? `item ${i + 1}`}\n\n${body}` : body;
        });
        merged[o.name] = parts.join("\n\n");
      }
      state.artifacts = merged;
      state.status = "done";
      if (results.every((r) => r?.firstPass)) firstPassSuccesses++;
      const artDir = join(opts.outDir, "artifacts");
      mkdirSync(artDir, { recursive: true });
      for (const [name, body] of Object.entries(merged)) writeFileSync(join(artDir, `${name.replace(/[^A-Za-z0-9._-]+/g, "-")}.md`), body);
      bus.emit({ type: "subsection.completed", at: now(), id, state: structuredClone(state) });
    } else {
      state.status = stopping ? "skipped" : "failed";
      const reason = stopping ? (stopping as { reason: string }).reason : "Every rung of the escalation ladder failed verification.";
      if (state.status === "skipped") bus.emit({ type: "subsection.skipped", at: now(), id, reason });
      else bus.emit({ type: "subsection.failed", at: now(), id, state: structuredClone(state), reason });
    }
    emitMetrics();
  };

  // ---------------------------------------------------------------- schedule

  const done = new Map<string, Promise<void>>();
  let fatal: string | null = null;
  for (const id of order) {
    const sub = subs.get(id) as Subsection;
    const deps = sub.depends_on.map((d) => done.get(d) ?? Promise.resolve());
    done.set(
      id,
      runSubsection(id, deps).catch((e: unknown) => {
        if (e instanceof FatalRunError) {
          fatal = e.message;
          stop("failed", `Stopping: ${e.message}`);
        } else if (isAbort(e)) {
          stop("aborted", "Run interrupted.");
        } else {
          stop("failed", `Unexpected error in ${id}: ${e instanceof Error ? e.message : String(e)}`);
        }
        const st = states.get(id) as SubsectionRunState;
        if (st.status !== "done") st.status = "failed";
      }),
    );
  }
  await Promise.all(done.values());
  opts.signal?.removeEventListener("abort", onAbort);

  const anyFailed = [...states.values()].some((s) => s.status === "failed");
  const finalStatus: RunStatus = stopping ? (stopping as { status: RunStatus }).status : anyFailed ? "failed" : "completed";
  const summary: RunSummary = {
    plan_title: dec.title,
    started_at: startedAt,
    ended_at: now(),
    status: fatal ? "failed" : finalStatus,
    out_dir: opts.outDir,
    states: dec.subsections.map((s) => states.get(s.id) as SubsectionRunState),
    totals: totals(),
  };
  writeFileSync(join(opts.outDir, "run.json"), JSON.stringify(summary, null, 2));
  bus.emit({ type: "run.finished", at: now(), summary });
  unsubscribeLog();
  return summary;
}

function mechanicalVerdict(feedback: string): Verdict {
  return { pass: false, score: 0, failed_criteria: [feedback], feedback, judge_model: "mechanical", judge_cost_usd: 0 };
}

function addUsage(into: UsageTotals, u: UsageTotals): void {
  into.input += u.input;
  into.output += u.output;
  into.thinking += u.thinking;
  into.cache_write += u.cache_write;
  into.cache_read += u.cache_read;
}

/** Errors that will fail every call (credentials), so the run should stop instead of escalating. */
function isFatal(e: unknown): boolean {
  return isAuthError(e);
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && (e.name === "AbortError" || e.constructor.name === "APIUserAbortError");
}

export class Semaphore {
  readonly max: number;
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(max: number) {
    this.max = max;
  }

  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const grant = () => {
        this.active++;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.active--;
          this.queue.shift()?.();
        });
      };
      if (this.active < this.max) grant();
      else this.queue.push(grant);
    });
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, Math.max(0, ms));
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

/** Small deterministic PRNG for reproducible dry runs. */
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

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
