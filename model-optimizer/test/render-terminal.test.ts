import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DecompositionSchema } from "../src/types.ts";
import type { AttemptRecord, LedgerStats, LiveTotals, RunSummary, SubsectionRunState } from "../src/types.ts";
import { routePlan } from "../src/router.ts";
import { defaultCatalog } from "../src/catalog.ts";
import type { RunEvent } from "../src/events.ts";
import {
  createLiveView,
  renderModels,
  renderPlan,
  renderRunSummary,
  renderStats,
  termOptionsFromEnv,
} from "../src/render/terminal.ts";

const dec = DecompositionSchema.parse(JSON.parse(readFileSync(new URL("../examples/decomposition.json", import.meta.url), "utf8")));
const plan = routePlan({ decomposition: dec });
const plain = { color: false, width: 100 };
const colored = { color: true, width: 120 };
const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

const usage = { input: 1000, output: 500, thinking: 200, cache_write: 0, cache_read: 300 };
const attempt = (id: string, n: number, model: string, cost: number): AttemptRecord => ({
  subsection: id,
  attempt: n,
  model,
  effort: "medium",
  served_model: model,
  started_at: "2026-01-01T00:00:00Z",
  ended_at: "2026-01-01T00:00:10Z",
  latency_s: 10,
  usage,
  cost_usd: cost,
  est_cost_usd: cost,
  stop_reason: "end_turn",
  status: "pass",
});
const stateOf = (id: string, status: SubsectionRunState["status"], cost: number, est: number): SubsectionRunState => {
  const r = plan.routes.find((x) => x.id === id)!;
  return {
    id,
    title: r.title,
    status,
    attempts: status === "skipped" ? [] : [attempt(id, 1, r.model, cost)],
    artifacts: {},
    final_model: status === "skipped" ? undefined : r.model,
    cost_usd: cost,
    est_cost_usd: est,
  };
};
const totals = (over: Partial<LiveTotals> = {}): LiveTotals => ({
  elapsed_s: 75,
  spent_usd: 0.5,
  est_total_usd: 0.6,
  projected_total_usd: 0.55,
  baseline_usd: 1.5,
  projected_savings_pct: 63,
  done: 2,
  failed: 0,
  running: 1,
  pending: 4,
  skipped: 0,
  escalations: 1,
  first_pass_successes: 1,
  tokens: usage,
  ...over,
});
const summary: RunSummary = {
  plan_title: dec.title,
  started_at: "2026-01-01T00:00:00Z",
  ended_at: "2026-01-01T00:02:00Z",
  status: "completed",
  out_dir: "/tmp/out-dir",
  states: [stateOf("S1", "done", 0.2, 0.16), stateOf("S2", "failed", 0.05, 0.1), stateOf("S3", "skipped", 0, 0.01)],
  totals: totals({ done: 4, first_pass_successes: 3, escalations: 2, spent_usd: 0.3, baseline_usd: 1.2 }),
};

test("renderPlan lists every subsection and the savings line", () => {
  const out = renderPlan(plan, plain);
  for (const r of plan.routes) assert.ok(out.includes(r.id), r.id);
  assert.match(out, /Savings/);
  assert.match(out, /56\.1%/);
  assert.match(out, /Model mix/);
  assert.match(out, /Opus 5\.5/);
  assert.ok(!out.includes("\x1b"));
  assert.match(out, /H human review/);
});

test("renderPlan with color keeps columns aligned", () => {
  const out = renderPlan(plan, colored);
  assert.ok(out.includes("\x1b[38;5;135m"));
  const lines = strip(out).split("\n");
  const start = lines.findIndex((l) => l.startsWith("ID"));
  const tableLines = lines.slice(start, start + 2 + plan.routes.length).filter((l) => l.includes("│"));
  assert.equal(tableLines.length, plan.routes.length + 1);
  const idx = tableLines.map((l) => l.indexOf("│"));
  assert.ok(idx.every((i) => i === idx[0]), JSON.stringify(idx));
  const last = tableLines.map((l) => l.lastIndexOf("│"));
  assert.ok(last.every((i) => i === last[0]));
});

test("renderPlan verbose includes reasons and ladder", () => {
  const terse = renderPlan(plan, plain);
  const verbose = renderPlan(plan, plain, { verbose: true });
  const reason = plan.routes[0]!.reasons[0]!.slice(0, 30);
  assert.ok(verbose.includes(reason));
  assert.ok(!terse.includes(reason));
  assert.match(verbose, /ladder:/);
  assert.match(verbose, /max_tokens/);
});

test("renderPlan narrow width stays within bounds", () => {
  const out = renderPlan(plan, { color: false, width: 60 });
  assert.ok(out.includes("…"));
});

test("renderRunSummary totals", () => {
  const out = renderRunSummary(summary, plan, plain);
  assert.match(out, /Spent/);
  assert.match(out, /\$0\.30/);
  assert.match(out, /3\/4 \(75%\)/);
  assert.match(out, /2 escalations/);
  assert.match(out, /✓/);
  assert.match(out, /✗/);
  assert.match(out, /skipped/);
  assert.match(out, /75%|\(75\.0%\)/);
  assert.match(out, /\/tmp\/out-dir/);
  assert.match(out, /completed/);
  assert.ok(!out.includes("\x1b"));
});

test("renderModels lists all models and footnote", () => {
  const out = renderModels(defaultCatalog, plain);
  for (const m of defaultCatalog.models) {
    assert.ok(out.includes(m.id), m.id);
    assert.ok(out.includes(m.alias));
  }
  assert.match(out, /xhigh/);
  assert.match(out, /Ceilings, multipliers and throughput are priors; `mopt stats` shows/);
});

const emptySnap = { category_offsets: {}, output_multipliers: {}, input_ratios: {}, throughput: {}, samples: 0 };
test("renderStats with no records", () => {
  const out = renderStats({ path: "/x/ledger.jsonl", records: 0, by_category: [], by_config: [], snapshot: emptySnap }, plain);
  assert.match(out, /ledger\.jsonl/);
  assert.match(out, /mopt run/);
  assert.match(out, /mopt log/);
});

test("renderStats with records", () => {
  const stats: LedgerStats = {
    path: "/x/ledger.jsonl",
    records: 20,
    by_category: [
      { category: "code_generation", attempts: 12, pass_rate: 0.75, predicted_rate: 0.9, offset: 0.15 },
      { category: "writing", attempts: 8, pass_rate: 1, predicted_rate: 0.9, offset: -0.1 },
    ],
    by_config: [
      { config: "claude-opus-5-5@medium", attempts: 10, pass_rate: 0.9, cost_ratio: 1.12, output_multiplier: 1.8, tps: 52 },
      { config: "claude-haiku-5-5@low", attempts: 10, pass_rate: 0.8, cost_ratio: 1.12, output_multiplier: null, tps: null },
    ],
    snapshot: { ...emptySnap, samples: 20 },
  };
  const out = renderStats(stats, plain);
  assert.match(out, /\+0\.15/);
  assert.match(out, /-0\.10/);
  assert.match(out, /Estimates run 12% low on average/);
  assert.match(out, /claude-opus-5-5@medium/);
});

test("termOptionsFromEnv clamps width", () => {
  const o = termOptionsFromEnv({ isTTY: false, columns: 300 } as NodeJS.WriteStream);
  assert.equal(o.width, 160);
  assert.equal(termOptionsFromEnv({ isTTY: false, columns: 10 } as NodeJS.WriteStream).width, 60);
});

function fakeStream(isTTY: boolean) {
  const chunks: string[] = [];
  const stream = { isTTY, columns: 100, write: (s: string) => (chunks.push(String(s)), true) };
  return { stream: stream as unknown as NodeJS.WriteStream, chunks, text: () => chunks.join("") };
}

const t0 = Date.parse("2026-01-01T00:00:00Z");
const at = (s: number) => new Date(t0 + s * 1000).toISOString();
const script = (): RunEvent[] => {
  const r0 = plan.routes[0]!;
  return [
    { type: "run.started", at: at(0), plan, concurrency: 2, budget_usd: 1, dry_run: false },
    { type: "subsection.started", at: at(1), id: "S1", attempt: 1, model: r0.model, effort: r0.effort },
    { type: "subsection.progress", at: at(2), id: "S1", attempt: 1, output_tokens: 1200, tail: "..." },
    { type: "subsection.verifying", at: at(3), id: "S1", attempt: 1, judge_model: "claude-haiku-5-5" },
    { type: "metrics", at: at(4), totals: totals() },
    { type: "metrics", at: at(8), totals: totals() },
    { type: "subsection.escalated", at: at(9), id: "S1", from: { model: r0.model, effort: r0.effort }, to: { model: "claude-opus-5-5", effort: "medium" }, reason: "verdict failed" },
    { type: "warning", at: at(10), message: "slow response" },
    { type: "metrics", at: at(14), totals: totals() },
    { type: "subsection.completed", at: at(83), id: "S1", state: stateOf("S1", "done", 0.2, 0.16) },
    { type: "subsection.failed", at: at(84), id: "S2", state: stateOf("S2", "failed", 0.05, 0.1), reason: "tests failed" },
    { type: "subsection.skipped", at: at(85), id: "S3", reason: "dependency S2 failed" },
    { type: "run.finished", at: at(90), summary },
  ];
};

test("live view non-interactive prints plain timestamped lines", () => {
  const f = fakeStream(false);
  const view = createLiveView(f.stream, { ...plain, interactive: false });
  for (const e of script()) view.onEvent(e);
  view.stop();
  view.stop();
  const text = f.text();
  assert.ok(!text.includes("\x1b"));
  assert.match(text, /\[00:00\] Run started/);
  assert.match(text, /\[00:01\] S1 started: Opus 5\.5 @ medium/);
  assert.match(text, /\[00:09\] S1 escalated → Opus 5\.5 @ medium/);
  assert.match(text, /\[00:10\] warning: slow response/);
  assert.match(text, /\[01:23\] S1 completed/);
  assert.match(text, /S2 FAILED: tests failed/);
  assert.match(text, /S3 skipped/);
  assert.match(text, /Run completed/);
  // metrics throttled: at 4s and 14s only, not at 8s
  const metricLines = text.split("\n").filter((l) => l.includes("projected") && !l.includes("Run "));
  assert.equal(metricLines.length, 2);
  assert.ok(text.split("\n").filter(Boolean).every((l) => /^\[\d\d:\d\d\] /.test(l)));
});

test("live view interactive redraws in place and stop is idempotent", async () => {
  const f = fakeStream(true);
  const view = createLiveView(f.stream, { ...colored, interactive: true });
  const ev = script();
  for (const e of ev.slice(0, 5)) view.onEvent(e);
  await new Promise((r) => setTimeout(r, 250));
  const mid = f.text();
  assert.match(mid, /\x1b\[\d+F/);
  assert.match(mid, /\x1b\[0J/);
  assert.match(strip(mid), /verifying with Haiku 5\.5/);
  assert.match(strip(mid), /S1/);
  for (const e of ev.slice(5)) view.onEvent(e);
  view.stop();
  view.stop();
  const count = f.chunks.length;
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(f.chunks.length, count, "no writes after stop");
  const final = strip(f.chunks[f.chunks.length - 1]!);
  assert.match(final, /✓/);
  assert.match(final, /✗/);
  assert.match(final, /⇢/);
  assert.match(final, /tests failed/);
  assert.match(final, /slow response/);
  assert.match(final, /budget/);
});
