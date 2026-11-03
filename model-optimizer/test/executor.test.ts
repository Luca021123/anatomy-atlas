/**
 * Executor tests through the real (non-dry-run) code path, with a scripted fake
 * LLM client: prompt construction, artifact hand-off, verification, escalation,
 * budgets, refusals, fatal errors, skipping and per-item units.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { defaultCatalog } from "../src/catalog.ts";
import { EventBus, type RunEvent } from "../src/events.ts";
import { runPlan } from "../src/executor/run.ts";
import { Ledger } from "../src/ledger.ts";
import { type LlmClient, type LlmRequest, type LlmResult, RefusalError, type StructuredRequest } from "../src/llm.ts";
import { routePlan } from "../src/router.ts";
import { type DecompositionInput, DecompositionSchema, type RoutedPlan } from "../src/types.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "mopt-exec-"));

function makePlan(extra: Partial<DecompositionInput> = {}, subsOverride?: DecompositionInput["subsections"]): RoutedPlan {
  const base = { reasoning: 2, ambiguity: 2, expertise: 2, context: 2, output: 2, horizon: 1, criticality: 3, verifiability: 3 };
  const decomposition = DecompositionSchema.parse({
    title: "Executor test plan",
    goal: "Exercise the executor",
    shared_context: "Shared brief for every subsection.",
    subsections: subsOverride ?? [
      {
        id: "S1",
        title: "Design the interface",
        description: "Design it.",
        category: "architecture",
        signals: { ...base, reasoning: 4, criticality: 4 },
        outputs: [{ name: "design", description: "the design", format: "markdown" }],
        acceptance_criteria: ["The design names every endpoint."],
        est_input_tokens: 500,
        est_output_tokens: 800,
      },
      {
        id: "S2",
        title: "Implement the interface",
        description: "Implement it.",
        category: "code_generation",
        signals: base,
        depends_on: ["S1"],
        inputs: [{ artifact: "design", from: "S1" }],
        outputs: [{ name: "code", description: "the code", format: "typescript" }],
        acceptance_criteria: ["Every endpoint in the design is implemented."],
        est_input_tokens: 500,
        est_output_tokens: 1200,
      },
      {
        id: "S3",
        title: "Document the interface",
        description: "Document it.",
        category: "writing",
        signals: base,
        depends_on: ["S2"],
        inputs: [{ artifact: "code", from: "S2" }],
        outputs: [{ name: "docs", description: "the docs", format: "markdown" }],
        acceptance_criteria: ["The docs cover every endpoint."],
        est_input_tokens: 300,
        est_output_tokens: 600,
      },
    ],
    ...extra,
  });
  return routePlan({ decomposition });
}

type Behaviour = {
  /** Decide the task response for a subsection id and attempt number (1-based per subsection). */
  task?: (id: string, attempt: number, req: LlmRequest) => string | Error | undefined;
  /** Decide the judge verdict. */
  judge?: (id: string, attempt: number) => boolean;
};

class FakeClient implements LlmClient {
  readonly calls: { kind: "complete" | "structured"; id: string; req: LlmRequest }[] = [];
  private readonly attempts = new Map<string, number>();
  private readonly judged = new Map<string, number>();
  private readonly plan: RoutedPlan;
  private readonly behaviour: Behaviour;

  constructor(plan: RoutedPlan, behaviour: Behaviour = {}) {
    this.plan = plan;
    this.behaviour = behaviour;
  }

  private usage(req: LlmRequest, output: number) {
    return { input: Math.ceil(req.user.length / 4), output, thinking: Math.round(output * 0.3), cache_write: 0, cache_read: 0 };
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    const id = /# Your subsection: (\S+)/.exec(req.user)?.[1] ?? "?";
    const n = (this.attempts.get(id) ?? 0) + 1;
    this.attempts.set(id, n);
    this.calls.push({ kind: "complete", id, req });
    const sub = this.plan.decomposition.subsections.find((s) => s.id === id);
    const out = this.behaviour.task?.(id, n, req);
    if (out instanceof Error) throw out;
    const text =
      out ??
      `${(sub?.outputs ?? []).map((o) => `<artifact name="${o.name}">content of ${o.name} from ${id} attempt ${n}</artifact>`).join("\n")}\n<notes>PASS - all criteria</notes>`;
    req.onText?.(text);
    return { text, stopReason: "end_turn", servedModel: req.model, usage: this.usage(req, 400), latencyS: 0.01 };
  }

  async structured<T>(req: StructuredRequest<T>): Promise<LlmResult & { parsed: T }> {
    const id = /# Subsection under review: (\S+)/.exec(req.user)?.[1] ?? "?";
    const n = (this.judged.get(id) ?? 0) + 1;
    this.judged.set(id, n);
    this.calls.push({ kind: "structured", id, req });
    const pass = this.behaviour.judge?.(id, n) ?? true;
    const parsed = {
      criteria: [{ criterion: "criterion 1", met: pass, reason: pass ? "ok" : "endpoint /bookings is missing" }],
      pass,
      feedback: pass ? "Looks good." : "Add the missing /bookings endpoint.",
    } as unknown as T;
    return { text: JSON.stringify(parsed), stopReason: "end_turn", servedModel: req.model, usage: this.usage(req, 120), latencyS: 0.01, parsed };
  }
}

async function run(plan: RoutedPlan, client: LlmClient, extra: Partial<Parameters<typeof runPlan>[0]> = {}) {
  const bus = new EventBus();
  const events: RunEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const outDir = tmp();
  const summary = await runPlan({ plan, catalog: defaultCatalog, bus, outDir, client, ...extra });
  return { summary, events, outDir };
}

test("happy path: every subsection passes first time and artifacts flow downstream", async () => {
  const plan = makePlan();
  const client = new FakeClient(plan);
  const ledger = new Ledger(join(tmp(), "ledger.jsonl"));
  const { summary, events, outDir } = await run(plan, client, { ledger });

  assert.equal(summary.status, "completed");
  assert.deepEqual(summary.states.map((s) => s.status), ["done", "done", "done"]);
  assert.equal(summary.totals.first_pass_successes, 3);
  assert.equal(summary.totals.escalations, 0);

  // S2's prompt inlines S1's accepted artifact.
  const s2 = client.calls.find((c) => c.kind === "complete" && c.id === "S2");
  assert.ok(s2?.req.user.includes("content of design from S1 attempt 1"));
  // Every call uses the planned model and effort, and the cached system prefix carries the brief.
  for (const c of client.calls.filter((x) => x.kind === "complete")) {
    const route = plan.routes.find((r) => r.id === c.id);
    assert.equal(c.req.model, route?.model);
    assert.equal(c.req.effort, route?.effort);
    assert.ok(c.req.system[0]?.text.includes("Shared brief for every subsection."));
  }
  // Waves are respected: S2 starts only after S1 completes.
  const idx = (pred: (e: RunEvent) => boolean) => events.findIndex(pred);
  assert.ok(idx((e) => e.type === "subsection.completed" && e.id === "S1") < idx((e) => e.type === "subsection.started" && e.id === "S2"));
  assert.equal(events.at(-1)?.type, "run.finished");

  // Files and ledger.
  assert.ok(existsSync(join(outDir, "run.json")));
  assert.ok(existsSync(join(outDir, "artifacts", "design.md")));
  assert.equal(readFileSync(join(outDir, "artifacts", "code.md"), "utf8"), "content of code from S2 attempt 1");
  const records = ledger.read();
  assert.equal(records.length, 3);
  assert.ok(records.every((r) => r.rung === 0 && r.pass && r.actual && r.actual.output === 400));
  // Spend is the sum of attempt costs.
  const sum = summary.states.reduce((s, st) => s + st.cost_usd, 0);
  assert.ok(Math.abs(sum - summary.totals.spent_usd) < 1e-6);
});

test("a failed verdict escalates to the next rung with the judge's feedback", async () => {
  const plan = makePlan();
  const route = plan.routes.find((r) => r.id === "S1");
  assert.ok(route && route.verification.method !== "self-check" && route.escalation.length > 0);
  const client = new FakeClient(plan, { judge: (id, n) => !(id === "S1" && n === 1) });
  const { summary, events } = await run(plan, client);

  const s1 = summary.states.find((s) => s.id === "S1");
  assert.equal(s1?.status, "done");
  assert.equal(s1?.attempts.length, 2);
  assert.equal(s1?.attempts[0]?.status, "fail");
  assert.equal(s1?.attempts[1]?.model, route.escalation[0]?.model);
  assert.equal(s1?.final_model, route.escalation[0]?.model);
  const retry = client.calls.filter((c) => c.kind === "complete" && c.id === "S1")[1];
  assert.ok(retry?.req.user.includes("Add the missing /bookings endpoint."));
  assert.ok(events.some((e) => e.type === "subsection.escalated" && e.id === "S1"));
  assert.equal(summary.totals.escalations, 1);
  assert.equal(summary.totals.first_pass_successes, 2);
});

test("missing artifacts fail mechanically without a judge call", async () => {
  const plan = makePlan();
  const client = new FakeClient(plan, {
    task: (id, n) => (id === "S3" && n === 1 ? "<notes>forgot the artifact</notes>" : undefined),
  });
  const { summary } = await run(plan, client);
  const s3 = summary.states.find((s) => s.id === "S3");
  assert.equal(s3?.attempts[0]?.status, "fail");
  assert.equal(s3?.attempts[0]?.verdict?.judge_model, "mechanical");
  assert.match(s3?.attempts[0]?.verdict?.feedback ?? "", /Missing or empty artifacts: docs/);
  assert.equal(s3?.status, "done");
  const judgedFirst = client.calls.filter((c) => c.kind === "structured" && c.id === "S3").length;
  assert.equal(judgedFirst, s3?.attempts.filter((a) => a.verdict?.judge_model !== "mechanical").length);
});

test("a refusal counts as a failed attempt and escalates", async () => {
  const plan = makePlan();
  const client = new FakeClient(plan, {
    task: (id, n) => (id === "S2" && n === 1 ? new RefusalError("cyber", "declined") : undefined),
  });
  const { summary } = await run(plan, client);
  const s2 = summary.states.find((s) => s.id === "S2");
  assert.equal(s2?.attempts[0]?.status, "error");
  assert.match(s2?.attempts[0]?.error ?? "", /declined/);
  assert.equal(s2?.status, "done");
});

test("credential errors stop the run instead of escalating", async () => {
  const plan = makePlan();
  const client = new FakeClient(plan, {
    task: () => new Error("Could not resolve authentication method. Expected one of apiKey, authToken"),
  });
  const { summary } = await run(plan, client);
  assert.equal(summary.status, "failed");
  assert.equal(client.calls.filter((c) => c.kind === "complete").length, 1);
  assert.deepEqual(summary.states.map((s) => s.status), ["failed", "skipped", "skipped"]);
});

test("when every rung fails, the subsection fails and its dependents are skipped", async () => {
  const plan = makePlan();
  const client = new FakeClient(plan, { judge: (id) => id !== "S2" });
  const { summary, events } = await run(plan, client);
  const s2Route = plan.routes.find((r) => r.id === "S2");
  const s2 = summary.states.find((s) => s.id === "S2");
  assert.equal(s2?.status, "failed");
  assert.equal(s2?.attempts.length, 1 + (s2Route?.escalation.length ?? 0));
  assert.equal(summary.states.find((s) => s.id === "S3")?.status, "skipped");
  assert.ok(events.some((e) => e.type === "subsection.skipped" && e.id === "S3" && /upstream S2/.test(e.reason)));
  assert.equal(summary.status, "failed");
});

test("the budget stops new attempts before they would overspend", async () => {
  const plan = makePlan();
  const client = new FakeClient(plan);
  const { summary, events } = await run(plan, client, { budgetUsd: 0.000001 });
  assert.equal(summary.status, "budget_exceeded");
  assert.equal(client.calls.length, 0);
  assert.ok(summary.states.every((s) => s.status === "skipped"));
  assert.ok(events.some((e) => e.type === "warning" && /Budget/.test(e.message)));
});

test("listed items run as one call each and their artifacts are merged", async () => {
  const base = { reasoning: 1, ambiguity: 1, expertise: 1, context: 2, output: 2, horizon: 1, criticality: 2, verifiability: 5 };
  const plan = makePlan({}, [
    {
      id: "S1",
      title: "Convert each schedule",
      description: "Convert the schedule.",
      category: "transformation",
      signals: base,
      items: ["Dr A", "Dr B", "Dr C"],
      repetitions: 3,
      outputs: [{ name: "seed", description: "seed rows", format: "json" }],
      acceptance_criteria: ["Rows validate."],
      est_input_tokens: 300,
      est_output_tokens: 300,
    },
  ]);
  const client = new FakeClient(plan);
  const { summary } = await run(plan, client);
  const calls = client.calls.filter((c) => c.kind === "complete");
  assert.equal(calls.length, 3);
  assert.ok(calls.some((c) => c.req.user.includes("item 2 of 3: Dr B")));
  const seed = summary.states[0]?.artifacts.seed ?? "";
  assert.ok(seed.includes("## Dr A") && seed.includes("## Dr C"));
  assert.equal(summary.status, "completed");
});

test("dry run simulates without a client and writes nothing to the ledger", async () => {
  const plan = makePlan();
  const ledger = new Ledger(join(tmp(), "ledger.jsonl"));
  const bus = new EventBus();
  const summary = await runPlan({ plan, catalog: defaultCatalog, bus, outDir: tmp(), dryRun: true, speed: 1e7, ledger });
  assert.equal(summary.states.length, 3);
  assert.ok(summary.totals.spent_usd > 0);
  assert.equal(ledger.read().length, 0);
});

test("dry runs are reproducible for a seed", async () => {
  const plan = makePlan();
  const a = await runPlan({ plan, catalog: defaultCatalog, bus: new EventBus(), outDir: tmp(), dryRun: true, speed: 1e7, seed: 42 });
  const b = await runPlan({ plan, catalog: defaultCatalog, bus: new EventBus(), outDir: tmp(), dryRun: true, speed: 1e7, seed: 42 });
  assert.equal(a.totals.spent_usd, b.totals.spent_usd);
  assert.deepEqual(a.states.map((s) => s.attempts.length), b.states.map((s) => s.attempts.length));
});
