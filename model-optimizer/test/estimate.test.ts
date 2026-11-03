import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultCatalog } from "../src/catalog.ts";
import {
  approxTokens,
  callCost,
  CostModel,
  ESCALATION_FEEDBACK_TOKENS,
  maxTokensFor,
  priceCardFor,
} from "../src/estimate.ts";
import type { CallTokens } from "../src/estimate.ts";
import { DecompositionSchema, EFFORTS } from "../src/types.ts";
import type { Config } from "../src/types.ts";

const sample = () =>
  DecompositionSchema.parse(JSON.parse(readFileSync(new URL("../examples/decomposition.json", import.meta.url), "utf8")));

const haiku = defaultCatalog.get("haiku");
const sonnet = defaultCatalog.get("sonnet");
const opus = defaultCatalog.get("opus");
const close = (a: number, b: number, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps, `${a} !== ${b}`);
const zero: CallTokens = { uncached: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, output: 0 };

test("callCost matches hand arithmetic for each price field (Sonnet 5.5)", () => {
  // $/MTok: input 2, output 10, cache write 5m 2.5, cache write 1h 4, cache read 0.2
  close(callCost(sonnet, { ...zero, uncached: 1_000_000 }), 2);
  close(callCost(sonnet, { ...zero, output: 1_000_000 }), 10);
  close(callCost(sonnet, { ...zero, cacheWrite5m: 1_000_000 }), 2.5);
  close(callCost(sonnet, { ...zero, cacheWrite1h: 1_000_000 }), 4);
  close(callCost(sonnet, { ...zero, cacheRead: 1_000_000 }), 0.2);
  close(callCost(sonnet, { uncached: 1000, cacheRead: 2000, cacheWrite5m: 3000, cacheWrite1h: 4000, output: 500 }), 0.0309);
});

test("callCost matches hand arithmetic for Opus 5.5", () => {
  close(callCost(opus, { uncached: 10_000, cacheRead: 50_000, cacheWrite5m: 0, cacheWrite1h: 0, output: 2_000 }), (10_000 * 4 + 50_000 * 0.2 + 2_000 * 20) / 1e6);
});

test("the batch discount halves the cost", () => {
  const t: CallTokens = { uncached: 1000, cacheRead: 2000, cacheWrite5m: 300, cacheWrite1h: 0, output: 800 };
  for (const spec of defaultCatalog.models) {
    close(callCost(spec, t, true), callCost(spec, t, false) * 0.5);
  }
});

test("Haiku 5.5's long-context card applies above 100K prompt tokens only", () => {
  assert.equal(priceCardFor(haiku, 100_000), haiku.pricing);
  assert.equal(priceCardFor(haiku, 100_001), haiku.longContext?.pricing);
  close(callCost(haiku, { ...zero, uncached: 100_000, output: 1000 }), (100_000 * 0.1 + 1000 * 0.5) / 1e6);
  close(callCost(haiku, { ...zero, uncached: 100_001, output: 1000 }), (100_001 * 0.5 + 1000 * 2.5) / 1e6);
  // the prompt total includes cached tokens
  close(callCost(haiku, { ...zero, uncached: 50_000, cacheRead: 60_000 }), (50_000 * 0.5 + 60_000 * 0.05) / 1e6);
  // models without a long-context card are unaffected
  assert.equal(priceCardFor(sonnet, 900_000), sonnet.pricing);
});

test("approxTokens is about four characters per token", () => {
  assert.equal(approxTokens(""), 0);
  assert.equal(approxTokens("abcd"), 1);
  assert.equal(approxTokens("abcde"), 2);
});

const model = (cache = true) => {
  const dec = sample();
  return { dec, cm: new CostModel(defaultCatalog, dec, { cache, systemPromptTokens: 700 }) };
};

test("CostModel.attempt: escalated rungs read more input than rung 0", () => {
  const { dec, cm } = model();
  for (const s of dec.subsections) {
    for (const m of ["haiku", "sonnet", "opus", "fable"]) {
      const cfg = defaultCatalog.parseConfig(`${m}@medium`);
      const r0 = cm.attempt(s, cfg, { rung: 0 });
      const r1 = cm.attempt(s, cfg, { rung: 1 });
      assert.equal(r1.tokens.input - r0.tokens.input, s.est_output_tokens + ESCALATION_FEEDBACK_TOKENS);
      assert.ok(r1.cost > r0.cost);
    }
  }
});

test("CostModel.attempt: higher effort means more thinking tokens and higher cost on the same model", () => {
  const { dec, cm } = model();
  for (const s of dec.subsections) {
    for (const spec of defaultCatalog.models) {
      let prevThinking = -1;
      let prevCost = -1;
      for (const effort of EFFORTS) {
        const a = cm.attempt(s, { model: spec.id, effort });
        assert.ok(a.tokens.thinking > prevThinking, `${spec.alias}@${effort} thinking`);
        assert.ok(a.cost > prevCost, `${spec.alias}@${effort} cost`);
        prevThinking = a.tokens.thinking;
        prevCost = a.cost;
      }
    }
  }
});

test("CostModel.attempt: a warm cache bills the prefix at the cache-read price", () => {
  const { dec, cm } = model();
  const s = dec.subsections[1]!;
  const cfg: Config = { model: sonnet.id, effort: "high" };
  const a = cm.attempt(s, cfg, { warmCache: true });
  assert.ok(a.cacheable);
  const out = a.tokens.output + a.tokens.thinking;
  close(a.cost, (a.tokens.input * 2 + a.tokens.prefix * 0.2 + out * 10) / 1e6, 1e-9);
  // cold 5m write costs more than warm; 1h write more than 5m; no cache costs most of the warm ones
  const cold5 = cm.attempt(s, cfg, { warmCache: false, ttl: "5m" });
  const cold1h = cm.attempt(s, cfg, { warmCache: false, ttl: "1h" });
  close(cold5.cost, (a.tokens.input * 2 + a.tokens.prefix * 2.5 + out * 10) / 1e6, 1e-9);
  close(cold1h.cost, (a.tokens.input * 2 + a.tokens.prefix * 4 + out * 10) / 1e6, 1e-9);
  assert.ok(a.cost < cold5.cost && cold5.cost < cold1h.cost);
  const off = new CostModel(defaultCatalog, dec, { cache: false, systemPromptTokens: 700 }).attempt(s, cfg);
  assert.equal(off.cacheable, false);
  close(off.cost, ((a.tokens.input + a.tokens.prefix) * 2 + out * 10) / 1e6, 1e-9);
});

test("CostModel.attempt: max_tokens is within [4096, model max] and covers output plus thinking", () => {
  const { dec, cm } = model();
  for (const s of dec.subsections) {
    for (const spec of defaultCatalog.models) {
      for (const effort of EFFORTS) {
        const a = cm.attempt(s, { model: spec.id, effort });
        assert.ok(a.max_tokens >= 4096);
        assert.ok(a.max_tokens <= spec.maxOutput);
        assert.ok(a.max_tokens >= a.tokens.output + a.tokens.thinking);
      }
    }
  }
});

test("maxTokensFor respects the floor and the model ceiling", () => {
  assert.equal(maxTokensFor(sonnet, 10), 4096);
  assert.equal(maxTokensFor(sonnet, 10_000_000), sonnet.maxOutput);
  assert.ok(maxTokensFor(sonnet, 20_000) >= 20_000);
});

test("CostModel.attempt: batch halves the attempt cost", () => {
  const { dec, cm } = model();
  const s = dec.subsections[0]!;
  const cfg: Config = { model: opus.id, effort: "medium" };
  close(cm.attempt(s, cfg, { batch: true }).cost, cm.attempt(s, cfg).cost * 0.5, 1e-12);
});

test("CostModel.attempt: calibration multipliers override the priors", () => {
  const dec = sample();
  const s = dec.subsections[0]!;
  const cfg: Config = { model: sonnet.id, effort: "high" };
  const base = new CostModel(defaultCatalog, dec, { cache: true, systemPromptTokens: 700 });
  const cal = new CostModel(
    defaultCatalog,
    dec,
    { cache: true, systemPromptTokens: 700 },
    { category_offsets: {}, output_multipliers: { [`${sonnet.id}@high`]: 4 }, input_ratios: {}, throughput: {}, samples: 10 },
  );
  assert.equal(cal.attempt(s, cfg).tokens.thinking, s.est_output_tokens * 3);
  assert.ok(cal.attempt(s, cfg).tokens.thinking > base.attempt(s, cfg).tokens.thinking);
});

test("prefixCost: caching is disabled for a single call", () => {
  const { cm } = model();
  const p = cm.prefixCost(sonnet.id, 1, "5m");
  assert.equal(p.enabled, false);
  close(p.cost, p.uncached);
});

test("prefixCost: caching is enabled when it saves money, and the saving matches hand arithmetic", () => {
  const { cm } = model();
  const prefix = cm.prefixTokens(sonnet.id);
  const calls = 10;
  const p = cm.prefixCost(sonnet.id, calls, "5m");
  assert.equal(p.enabled, true);
  close(p.uncached, (calls * prefix * 2) / 1e6);
  close(p.cost, (prefix * (2.5 + (calls - 1) * 0.2)) / 1e6);
  close(p.warm, (calls * prefix * 0.2) / 1e6);
  assert.ok(p.cost < p.uncached);
  assert.ok(p.warm <= p.cost);
});

test("prefixCost: never reports a negative saving", () => {
  const { cm } = model();
  const noCache = model(false).cm;
  for (const spec of defaultCatalog.models) {
    for (const calls of [0, 1, 2, 3, 5, 50]) {
      for (const ttl of ["5m", "1h"] as const) {
        for (const m of [cm, noCache]) {
          const p = m.prefixCost(spec.id, calls, ttl);
          assert.ok(p.uncached - p.cost >= -1e-15, `${spec.alias} ${calls} ${ttl}`);
          if (!p.enabled) close(p.cost, p.uncached);
        }
      }
    }
  }
});

test("prefixCost: a write premium that is not recovered leaves caching off (Haiku, 1h, 2 calls)", () => {
  const { cm } = model();
  // write 0.2 + one read 0.01 = 0.21 > 2 uncached reads at 0.1
  const p = cm.prefixCost(haiku.id, 2, "1h");
  assert.equal(p.enabled, false);
  close(p.cost, p.uncached);
  assert.equal(cm.prefixCost(haiku.id, 2, "5m").enabled, true);
});

test("prefixCost: disabled when the cache option is off", () => {
  const p = model(false).cm.prefixCost(sonnet.id, 20, "5m");
  assert.equal(p.enabled, false);
  close(p.cost, p.uncached);
});
