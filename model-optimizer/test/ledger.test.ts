import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultCatalog } from "../src/catalog.ts";
import { calibrate, Ledger } from "../src/ledger.ts";
import type { LedgerRecord } from "../src/ledger.ts";
import { LOGIT_AT_CEILING, SLOPE, successProbability } from "../src/scoring.ts";
import type { Category, Effort } from "../src/types.ts";

const tmpLedger = (name = "ledger.jsonl") => new Ledger(join(mkdtempSync(join(tmpdir(), "mopt-ledger-")), name));
const SONNET = "claude-sonnet-5-5";
const SONNET_CEILING = defaultCatalog.get("sonnet").ceiling.high;

/** Level at which the router predicts probability `p` for a ceiling. */
const levelFor = (ceiling: number, p: number) => ceiling + (LOGIT_AT_CEILING - Math.log(p / (1 - p))) / SLOPE;

function rec(over: Partial<LedgerRecord> = {}): LedgerRecord {
  return {
    v: 1,
    ts: "2026-11-01T00:00:00.000Z",
    source: "manual",
    plan: "p",
    subsection: "S1",
    category: "code_generation",
    level_raw: 3,
    ceiling: SONNET_CEILING,
    predicted_p: 0.9,
    model: SONNET,
    effort: "high",
    rung: 0,
    pass: true,
    ...over,
  };
}
const many = (n: number, f: (i: number) => Partial<LedgerRecord>) => Array.from({ length: n }, (_, i) => rec(f(i)));
const offsetOf = (records: LedgerRecord[], cat: Category = "code_generation") => calibrate(records, defaultCatalog).category_offsets[cat] ?? 0;

test("read returns an empty list for a missing file", () => {
  assert.deepEqual(tmpLedger().read(), []);
});

test("append and read round-trip records, creating parent directories", () => {
  const dir = mkdtempSync(join(tmpdir(), "mopt-ledger-"));
  const ledger = new Ledger(join(dir, "nested", "deeper", "l.jsonl"));
  const a = rec({ subsection: "A" });
  const b = rec({ subsection: "B", pass: false, rung: 1, actual: { input: 10, output: 20, thinking: 5, cache_read: 0, cache_write: 0, cost: 0.01, latency_s: 2 }, est: { input: 10, output: 15, cost: 0.02 } });
  ledger.append(a);
  ledger.append(b);
  assert.deepEqual(ledger.read(), [a, b]);
});

test("a corrupt or foreign line is skipped, valid records on both sides survive", () => {
  const ledger = tmpLedger();
  ledger.append(rec({ subsection: "A" }));
  appendFileSync(ledger.path, "{not json at all\n");
  appendFileSync(ledger.path, `${JSON.stringify({ v: 2, pass: true, model: "x" })}\n`);
  appendFileSync(ledger.path, `${JSON.stringify({ v: 1, model: "x" })}\n`);
  appendFileSync(ledger.path, "\n   \n");
  appendFileSync(ledger.path, '{"v":1,"ts":"trunc');
  appendFileSync(ledger.path, "\n");
  ledger.append(rec({ subsection: "B" }));
  assert.deepEqual(ledger.read().map((r) => r.subsection), ["A", "B"]);
  assert.equal(ledger.stats(defaultCatalog).records, 2);
});

test("calibrate: no records gives an empty snapshot", () => {
  const s = calibrate([], defaultCatalog);
  assert.deepEqual(s.category_offsets, {});
  assert.deepEqual(s.output_multipliers, {});
  assert.equal(s.samples, 0);
});

test("calibrate: many failures where the predicted pass rate was high give a positive offset", () => {
  const level = levelFor(SONNET_CEILING, 0.9);
  const records = many(40, () => ({ level_raw: level, pass: false, predicted_p: 0.9 }));
  assert.ok(offsetOf(records) > 0.3, `offset ${offsetOf(records)}`);
});

test("calibrate: many successes where predictions were middling give a negative offset", () => {
  const level = levelFor(SONNET_CEILING, 0.5);
  assert.ok(Math.abs(successProbability(SONNET_CEILING, level) - 0.5) < 1e-9);
  const records = many(40, () => ({ level_raw: level, pass: true, predicted_p: 0.5 }));
  assert.ok(offsetOf(records) < -0.3, `offset ${offsetOf(records)}`);
});

test("calibrate: outcomes that match the prediction give no offset", () => {
  const level = levelFor(SONNET_CEILING, 0.8);
  const records = many(100, (i) => ({ level_raw: level, pass: i % 5 !== 0 })); // 80% pass
  assert.ok(Math.abs(offsetOf(records)) < 0.1);
});

test("calibrate: offsets shrink towards 0 with few samples (n=2 vs n=40, same pass rate)", () => {
  const level = levelFor(SONNET_CEILING, 0.9);
  const failing = (n: number) => many(n, () => ({ level_raw: level, pass: false }));
  const small = offsetOf(failing(2));
  const large = offsetOf(failing(40));
  assert.ok(small > 0 && large > small, `n=2: ${small}, n=40: ${large}`);
  const mid = levelFor(SONNET_CEILING, 0.5);
  const passing = (n: number) => many(n, () => ({ level_raw: mid, pass: true }));
  assert.ok(offsetOf(passing(2)) < 0 && offsetOf(passing(40)) < offsetOf(passing(2)));
  // a single observation moves the offset very little
  assert.ok(Math.abs(offsetOf(failing(1))) < Math.abs(offsetOf(failing(40))) / 2);
});

test("calibrate: offsets stay within [-0.75, 1.25]", () => {
  const lowLevel = levelFor(SONNET_CEILING, 0.99);
  const highFail = offsetOf(many(5000, () => ({ level_raw: lowLevel, pass: false })));
  assert.ok(highFail <= 1.25 && highFail > 1);
  const veryHard = 5.5;
  const highPass = offsetOf(many(5000, () => ({ level_raw: veryHard, pass: true })));
  assert.ok(highPass >= -0.75 && highPass < -0.5);
  assert.equal(highFail, 1.25);
  assert.equal(highPass, -0.75);
});

test("calibrate: only first attempts (rung 0) drive category offsets, and categories are independent", () => {
  const level = levelFor(SONNET_CEILING, 0.9);
  const records = [
    ...many(30, () => ({ level_raw: level, pass: false, category: "testing" as Category })),
    ...many(30, () => ({ level_raw: level, pass: false, rung: 1, category: "writing" as Category })),
  ];
  const snap = calibrate(records, defaultCatalog);
  assert.ok((snap.category_offsets.testing ?? 0) > 0.3);
  assert.equal(snap.category_offsets.writing, undefined);
  assert.equal(snap.category_offsets.code_generation, undefined);
  assert.equal(snap.samples, 60);
});

test("calibrate: thinking-token records move output_multipliers towards the observed ratio, not all the way with few samples", () => {
  const prior = defaultCatalog.get("sonnet").outputMultiplier.high;
  // output 1000 total of which 800 thinking: observed multiplier 1000 / 200 = 5
  const thinking = (n: number) => many(n, () => ({ actual: { input: 1000, output: 1000, thinking: 800, cache_read: 0, cache_write: 0, cost: 0.01, latency_s: 5 } }));
  const key = `${SONNET}@high`;
  const m2 = calibrate(thinking(2), defaultCatalog).output_multipliers[key]!;
  const m40 = calibrate(thinking(40), defaultCatalog).output_multipliers[key]!;
  assert.ok(m2 > prior && m2 < 5, `n=2: ${m2}`);
  assert.ok(m40 > m2 && m40 < 5, `n=40: ${m40}`);
  assert.ok(Math.abs(m2 - (prior + ((5 - prior) * 2) / 5)) < 1e-3);
  // a lower observation moves the other way
  const low = calibrate(many(10, () => ({ actual: { input: 1, output: 1000, thinking: 100, cache_read: 0, cache_write: 0, cost: 0, latency_s: 1 } })), defaultCatalog);
  assert.ok((low.output_multipliers[key] ?? prior) < prior);
});

test("calibrate: records without thinking tokens leave multipliers alone", () => {
  const snap = calibrate(many(5, () => ({ actual: { input: 1000, output: 1000, thinking: 0, cache_read: 0, cache_write: 0, cost: 0.01, latency_s: 5 } })), defaultCatalog);
  assert.deepEqual(snap.output_multipliers, {});
});

test("calibrate: input ratios and throughput shrink towards the prior", () => {
  const actual = { input: 2000, output: 900, thinking: 0, cache_read: 0, cache_write: 0, cost: 0.01, latency_s: 11.5 };
  const est = { input: 1000, output: 900, cost: 0.01 };
  const snap = calibrate(many(10, () => ({ actual, est })), defaultCatalog);
  const ratio = snap.input_ratios[SONNET]!;
  assert.ok(ratio > 1 && ratio < 2);
  assert.ok(Math.abs(ratio - (1 + (1 * 10) / 13)) < 1e-3);
  // observed 900 tok / (11.5 - 1.5 ttft) = 90 tps equals the prior
  assert.ok(Math.abs(snap.throughput[SONNET]! - 90) < 0.2);
});

test("calibrate: unknown models are ignored", () => {
  const snap = calibrate(many(3, () => ({ model: "claude-unknown-9", actual: { input: 1, output: 100, thinking: 50, cache_read: 0, cache_write: 0, cost: 0, latency_s: 9 }, est: { input: 1, output: 1, cost: 1 } })), defaultCatalog);
  assert.deepEqual(snap.output_multipliers, {});
  assert.deepEqual(snap.input_ratios, {});
});

test("Ledger.calibration reads the file and matches calibrate()", () => {
  const ledger = tmpLedger();
  const level = levelFor(SONNET_CEILING, 0.9);
  const rs = many(20, () => ({ level_raw: level, pass: false }));
  for (const r of rs) ledger.append(r);
  assert.deepEqual(ledger.calibration(defaultCatalog), calibrate(rs, defaultCatalog));
});

test("stats() reports pass rates, cost ratios, multipliers and throughput", () => {
  const ledger = tmpLedger();
  const sonnetHigh = (over: Partial<LedgerRecord>) => rec({ model: SONNET, effort: "high", ...over });
  const haikuLow = (over: Partial<LedgerRecord>) => rec({ model: "claude-haiku-5-5", effort: "low" as Effort, ceiling: 1.9, ...over });
  const a = (cost: number, thinking = 0, output = 1000, latency = 10) => ({ input: 100, output, thinking, cache_read: 0, cache_write: 0, cost, latency_s: latency });
  // Sonnet: 4 first attempts in code_generation (3 pass), 1 escalation in writing (fail)
  ledgerAppend(ledger, [
    sonnetHigh({ pass: true, predicted_p: 0.9, est: { input: 100, output: 1000, cost: 0.1 }, actual: a(0.2, 500, 1000, 10) }),
    sonnetHigh({ pass: true, predicted_p: 0.8, est: { input: 100, output: 1000, cost: 0.1 }, actual: a(0.2, 500, 1000, 20) }),
    sonnetHigh({ pass: true, predicted_p: 0.7, est: { input: 100, output: 1000, cost: 0.1 }, actual: a(0.2, 500, 1000, 5) }),
    sonnetHigh({ pass: false, predicted_p: 0.6 }),
    sonnetHigh({ pass: false, rung: 1, category: "writing", predicted_p: 0.5 }),
    haikuLow({ pass: true, category: "writing", predicted_p: 0.99 }),
    haikuLow({ pass: false, category: "writing", predicted_p: 0.99 }),
  ]);
  const s = ledger.stats(defaultCatalog);
  assert.equal(s.records, 7);
  assert.equal(s.since, "2026-11-01T00:00:00.000Z");
  assert.equal(s.path, ledger.path);

  const cg = s.by_category.find((c) => c.category === "code_generation")!;
  assert.equal(cg.attempts, 4);
  assert.equal(cg.pass_rate, 0.75);
  assert.equal(cg.predicted_rate, 0.75); // mean(0.9, 0.8, 0.7, 0.6)
  const wr = s.by_category.find((c) => c.category === "writing")!;
  assert.equal(wr.attempts, 2); // the rung-1 record is not a first attempt
  assert.equal(wr.pass_rate, 0.5);
  assert.equal(s.by_category[0]!.category, "code_generation"); // sorted by attempts

  const sonnetStat = s.by_config.find((c) => c.config === `${SONNET}@high`)!;
  assert.equal(sonnetStat.attempts, 5);
  assert.equal(sonnetStat.pass_rate, 0.6);
  assert.equal(sonnetStat.cost_ratio, 2); // 0.6 actual / 0.3 estimated over the priced records
  assert.equal(sonnetStat.output_multiplier, 2); // 1000 / (1000 - 500)
  assert.equal(sonnetStat.tps, 100); // median of 100, 50, 200
  const haikuStat = s.by_config.find((c) => c.config === "claude-haiku-5-5@low")!;
  assert.equal(haikuStat.attempts, 2);
  assert.equal(haikuStat.pass_rate, 0.5);
  assert.equal(haikuStat.cost_ratio, 1);
  assert.equal(haikuStat.output_multiplier, null);
  assert.equal(haikuStat.tps, null);
  assert.equal(s.by_config[0]!.config, `${SONNET}@high`);
  assert.equal(s.snapshot.samples, 7);
});

test("stats() on an empty ledger", () => {
  const s = tmpLedger().stats(defaultCatalog);
  assert.equal(s.records, 0);
  assert.equal(s.since, undefined);
  assert.deepEqual(s.by_category, []);
  assert.deepEqual(s.by_config, []);
});

test("stats() reports the offset currently applied to each category", () => {
  const ledger = tmpLedger();
  const level = levelFor(SONNET_CEILING, 0.9);
  ledgerAppend(ledger, many(30, () => ({ level_raw: level, pass: false })));
  const s = ledger.stats(defaultCatalog);
  assert.equal(s.by_category[0]!.offset, s.snapshot.category_offsets.code_generation);
  assert.ok(s.by_category[0]!.offset > 0);
});

function ledgerAppend(ledger: Ledger, rs: LedgerRecord[]) {
  writeFileSync(ledger.path, "");
  for (const r of rs) ledger.append(r);
}
