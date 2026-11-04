/**
 * The outcome ledger: an append-only JSONL log of every attempt (from `mopt run`
 * or recorded by hand with `mopt log`), and the calibration learned from it.
 *
 * This is the feedback loop that keeps routing honest. The router's capability
 * ceilings and token multipliers are priors; the ledger measures how often each
 * category of work actually passed on the model it was given, how many output
 * and thinking tokens it really used, and how fast it ran, then corrects the
 * priors - cautiously, shrinking small samples towards the prior.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Catalog } from "./catalog.ts";
import { configKey, round } from "./estimate.ts";
import { LOGIT_AT_CEILING, SLOPE } from "./scoring.ts";
import type { CalibrationSnapshot, Category, CategoryStat, ConfigStat, Effort, LedgerStats } from "./types.ts";

export const DEFAULT_LEDGER_PATH = ".mopt/ledger.jsonl";

export interface LedgerRecord {
  v: 1;
  ts: string;
  source: "run" | "manual";
  plan: string;
  subsection: string;
  category: Category;
  /** Difficulty before any calibration offset, so offsets can be re-learned from scratch. */
  level_raw: number;
  /** Capability ceiling of the configuration used (prior, from the catalog at the time). */
  ceiling: number;
  /** Pass probability the router predicted for this attempt (with the offset in force then). */
  predicted_p: number;
  model: string;
  effort: Effort;
  /** 0 for a first attempt, 1+ for escalations. */
  rung: number;
  pass: boolean;
  est?: { input: number; output: number; cost: number; /** Agent mode: estimated total tokens of the subagent run. */ total?: number };
  actual?: {
    input: number;
    output: number;
    thinking: number;
    cache_read: number;
    cache_write: number;
    cost: number;
    latency_s: number;
    /** Agent mode: total tokens the subagent reported (Claude Code's usage summary). */
    total_tokens?: number;
  };
}

/** Pseudo-observations that pull small samples towards the prior. */
const OFFSET_SHRINK_K = 5;
const MULTIPLIER_SHRINK_K = 3;
const MIN_OFFSET = -0.75;
const MAX_OFFSET = 1.25;

export class Ledger {
  readonly path: string;

  constructor(path: string = DEFAULT_LEDGER_PATH) {
    this.path = path;
  }

  append(record: LedgerRecord): void {
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify(record)}\n`, "utf8");
  }

  /** Reads every valid record; malformed lines are skipped, never fatal. */
  read(): LedgerRecord[] {
    if (!existsSync(this.path)) return [];
    const out: LedgerRecord[] = [];
    for (const line of readFileSync(this.path, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as LedgerRecord;
        if (r && r.v === 1 && typeof r.pass === "boolean" && typeof r.model === "string") out.push(r);
      } catch {
        // Skip a corrupt line (e.g. a write interrupted mid-line).
      }
    }
    return out;
  }

  calibration(catalog: Catalog): CalibrationSnapshot {
    return calibrate(this.read(), catalog);
  }

  stats(catalog: Catalog): LedgerStats {
    const records = this.read();
    const snapshot = calibrate(records, catalog);
    const firsts = records.filter((r) => r.rung === 0);
    const byCategory = groupBy(firsts, (r) => r.category);
    const by_category: CategoryStat[] = [...byCategory.entries()]
      .map(([category, rs]) => ({
        category: category as Category,
        attempts: rs.length,
        pass_rate: round(rs.filter((r) => r.pass).length / rs.length, 4),
        predicted_rate: round(mean(rs.map((r) => r.predicted_p)), 4),
        offset: snapshot.category_offsets[category as Category] ?? 0,
      }))
      .sort((a, b) => b.attempts - a.attempts);
    const byConfig = groupBy(records, (r) => configKey(r));
    const by_config: ConfigStat[] = [...byConfig.entries()]
      .map(([config, rs]) => {
        const priced = rs.filter((r) => r.actual && r.est && r.est.cost > 0);
        const withThinking = rs.filter((r) => r.actual && r.actual.thinking > 0 && r.actual.output > r.actual.thinking);
        const timed = rs.filter((r) => r.actual && r.actual.latency_s > 0 && r.actual.output > 0);
        return {
          config,
          attempts: rs.length,
          pass_rate: round(rs.filter((r) => r.pass).length / rs.length, 4),
          cost_ratio: priced.length
            ? round(sum(priced.map((r) => r.actual?.cost ?? 0)) / Math.max(1e-12, sum(priced.map((r) => r.est?.cost ?? 0))), 3)
            : 1,
          output_multiplier: withThinking.length
            ? round(median(withThinking.map((r) => (r.actual as NonNullable<LedgerRecord["actual"]>).output / ((r.actual as NonNullable<LedgerRecord["actual"]>).output - (r.actual as NonNullable<LedgerRecord["actual"]>).thinking))), 3)
            : null,
          tps: timed.length ? round(median(timed.map((r) => (r.actual?.output ?? 0) / (r.actual?.latency_s ?? 1))), 1) : null,
          token_ratio: (() => {
            const runs = rs.filter((r) => (r.actual?.total_tokens ?? 0) > 0 && (r.est?.total ?? 0) > 0);
            return runs.length ? round(median(runs.map((r) => (r.actual?.total_tokens ?? 0) / (r.est?.total ?? 1))), 3) : null;
          })(),
        };
      })
      .sort((a, b) => b.attempts - a.attempts);
    return {
      path: this.path,
      records: records.length,
      ...(records[0] ? { since: records[0].ts } : {}),
      by_category,
      by_config,
      snapshot,
    };
  }
}

/**
 * Learns the calibration snapshot from ledger records.
 *
 * Category offsets: find the difficulty shift δ that makes the router's success
 * curve reproduce the observed first-attempt pass rate of that category
 * (bisection on the same logistic the router uses), then shrink δ towards 0 by
 * n / (n + k). Output multipliers, input ratios and throughput: medians, shrunk
 * towards the catalog prior.
 */
export function calibrate(records: LedgerRecord[], catalog: Catalog): CalibrationSnapshot {
  const snapshot: CalibrationSnapshot = {
    category_offsets: {},
    output_multipliers: {},
    input_ratios: {},
    throughput: {},
    samples: records.length,
  };

  for (const [category, rs] of groupBy(records.filter((r) => r.rung === 0), (r) => r.category)) {
    const n = rs.length;
    const successes = rs.filter((r) => r.pass).length;
    const predicted = mean(rs.map((r) => p(r.ceiling, r.level_raw, 0)));
    // Smooth the observed rate towards the prediction with two pseudo-observations.
    const observed = (successes + 2 * predicted) / (n + 2);
    const delta = solveOffset(rs, observed);
    const shrunk = (delta * n) / (n + OFFSET_SHRINK_K);
    const offset = round(Math.min(MAX_OFFSET, Math.max(MIN_OFFSET, shrunk)), 3);
    if (Math.abs(offset) >= 0.01) snapshot.category_offsets[category as Category] = offset;
  }

  for (const [key, rs] of groupBy(records, (r) => configKey(r))) {
    const spec = catalog.has(rs[0]?.model ?? "") ? catalog.get(rs[0]?.model ?? "") : undefined;
    if (!spec) continue;
    const effort = rs[0]?.effort as Effort;
    const thinkingRuns = rs.filter((r) => r.actual && r.actual.thinking > 0 && r.actual.output > r.actual.thinking);
    if (thinkingRuns.length) {
      const observed = median(thinkingRuns.map((r) => (r.actual?.output ?? 1) / ((r.actual?.output ?? 1) - (r.actual?.thinking ?? 0))));
      const prior = spec.outputMultiplier[effort];
      const n = thinkingRuns.length;
      snapshot.output_multipliers[key] = round(prior + ((observed - prior) * n) / (n + MULTIPLIER_SHRINK_K), 3);
    }
  }

  for (const [model, rs] of groupBy(records, (r) => r.model)) {
    if (!catalog.has(model)) continue;
    const spec = catalog.get(model);
    const agentRuns = rs.filter((r) => (r.actual?.total_tokens ?? 0) > 0 && (r.est?.total ?? 0) > 0);
    if (agentRuns.length) {
      const observed = median(agentRuns.map((r) => (r.actual?.total_tokens ?? 0) / (r.est?.total ?? 1)));
      const n = agentRuns.length;
      (snapshot.agent_scale ??= {})[spec.id] = round(1 + ((observed - 1) * n) / (n + MULTIPLIER_SHRINK_K), 3);
    }
    const sized = rs.filter((r) => r.actual && r.est && r.est.input > 0);
    if (sized.length) {
      const observed = median(
        sized.map((r) => ((r.actual?.input ?? 0) + (r.actual?.cache_read ?? 0) + (r.actual?.cache_write ?? 0)) / (r.est?.input ?? 1)),
      );
      const n = sized.length;
      snapshot.input_ratios[spec.id] = round(1 + ((observed - 1) * n) / (n + MULTIPLIER_SHRINK_K), 3);
    }
    const timed = rs.filter((r) => r.actual && r.actual.latency_s > spec.ttftS && r.actual.output > 0);
    if (timed.length) {
      const observed = median(timed.map((r) => (r.actual?.output ?? 0) / Math.max(0.1, (r.actual?.latency_s ?? 1) - spec.ttftS)));
      const n = timed.length;
      snapshot.throughput[spec.id] = round(spec.outputTps + ((observed - spec.outputTps) * n) / (n + MULTIPLIER_SHRINK_K), 1);
    }
  }
  return snapshot;
}

function p(ceiling: number, level: number, offset: number): number {
  return 1 / (1 + Math.exp(-(SLOPE * (ceiling - level - offset) + LOGIT_AT_CEILING)));
}

/** Bisection for δ where the mean predicted success equals the observed rate (mean p is decreasing in δ). */
function solveOffset(rs: LedgerRecord[], observed: number): number {
  let lo = -3;
  let hi = 3;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const m = mean(rs.map((r) => p(r.ceiling, r.level_raw, mid)));
    if (m > observed) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return m;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}
