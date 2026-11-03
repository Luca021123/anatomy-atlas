/**
 * Token and cost estimation. Everything that turns "this subsection on this
 * model at this effort" into tokens, dollars and seconds lives here, so the
 * router, the metrics and the executor's projections share one cost model.
 */
import type { Catalog, ModelSpec, PriceCard } from "./catalog.ts";
import type { CalibrationSnapshot, Config, Decomposition, Effort, Subsection, TokenEstimate } from "./types.ts";

export const CHARS_PER_TOKEN = 4;

/** Rough token count for English text and code (about 4 characters per token). */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Tokens of framing the executor wraps around each subsection's instructions. */
export const INSTRUCTION_FRAMING_TOKENS = 150;
/** Extra input an escalated attempt reads: the failed output plus the judge's feedback. */
export const ESCALATION_FEEDBACK_TOKENS = 300;
/** Judge call shape. */
export const JUDGE_SYSTEM_TOKENS = 450;
export const JUDGE_OUTPUT_TOKENS = 350;

export interface CallTokens {
  uncached: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  output: number;
}

export function priceCardFor(spec: ModelSpec, promptTokens: number): PriceCard {
  if (spec.longContext && promptTokens > spec.longContext.aboveTokens) return spec.longContext.pricing;
  return spec.pricing;
}

/** Dollar cost of one API call. */
export function callCost(spec: ModelSpec, t: CallTokens, batch = false): number {
  const prompt = t.uncached + t.cacheRead + t.cacheWrite5m + t.cacheWrite1h;
  const p = priceCardFor(spec, prompt);
  const usd =
    (t.uncached * p.input +
      t.cacheRead * p.cacheRead +
      t.cacheWrite5m * p.cacheWrite5m +
      t.cacheWrite1h * p.cacheWrite1h +
      t.output * p.output) /
    1_000_000;
  return batch ? usd * (1 - spec.batchDiscount) : usd;
}

export const configKey = (c: Config): string => `${c.model}@${c.effort}`;

export interface AttemptEstimate {
  tokens: TokenEstimate;
  /** Cost of one repetition of this attempt (USD). */
  cost: number;
  /** Seconds for one repetition. */
  latency_s: number;
  /** Prefix tokens are cache-eligible for this model. */
  cacheable: boolean;
  max_tokens: number;
}

export interface CostModelOptions {
  cache: boolean;
  systemPromptTokens: number;
}

/**
 * The shared cost model for one decomposition. Estimates are per repetition;
 * callers multiply by `repetitions`.
 */
export class CostModel {
  readonly catalog: Catalog;
  readonly decomposition: Decomposition;
  readonly options: CostModelOptions;
  readonly calibration: CalibrationSnapshot | undefined;
  private readonly subs: Map<string, Subsection>;
  private readonly sharedTokens: number;

  constructor(catalog: Catalog, decomposition: Decomposition, options: CostModelOptions, calibration?: CalibrationSnapshot) {
    this.catalog = catalog;
    this.decomposition = decomposition;
    this.options = options;
    this.calibration = calibration;
    this.subs = new Map(decomposition.subsections.map((s) => [s.id, s]));
    this.sharedTokens = approxTokens(decomposition.shared_context);
  }

  /** Tokens before model-specific adjustments: shared prefix, own input, visible output. */
  base(sub: Subsection): { prefix: number; input: number; output: number } {
    const prefix = this.options.systemPromptTokens + this.sharedTokens;
    // Upstream artifacts: share of each producer's output that this subsection references.
    const refsByProducer = new Map<string, number>();
    for (const ref of sub.inputs) {
      if (ref.from === "project") continue;
      refsByProducer.set(ref.from, (refsByProducer.get(ref.from) ?? 0) + 1);
    }
    let upstream = 0;
    for (const [producerId, refs] of refsByProducer) {
      const producer = this.subs.get(producerId);
      if (!producer) continue;
      const share = Math.min(1, refs / Math.max(1, producer.outputs.length));
      upstream += producer.est_output_tokens * share;
    }
    const instructions =
      approxTokens(
        [
          sub.title,
          sub.description,
          sub.integration_notes,
          ...sub.acceptance_criteria,
          ...sub.outputs.map((o) => `${o.name} ${o.format} ${o.description}`),
        ].join("\n"),
      ) + INSTRUCTION_FRAMING_TOKENS;
    return {
      prefix,
      input: Math.round(sub.est_input_tokens + upstream + instructions),
      output: sub.est_output_tokens,
    };
  }

  outputMultiplier(spec: ModelSpec, effort: Effort): number {
    return this.calibration?.output_multipliers[`${spec.id}@${effort}`] ?? spec.outputMultiplier[effort];
  }

  inputRatio(spec: ModelSpec): number {
    return this.calibration?.input_ratios[spec.id] ?? 1;
  }

  throughput(spec: ModelSpec): number {
    return this.calibration?.throughput[spec.id] ?? spec.outputTps;
  }

  /**
   * One repetition of one attempt. `rung` > 0 means an escalated attempt, which
   * also reads the failed output and the judge's feedback. `warmCache` assumes
   * the shared prefix is already cached for this model.
   */
  attempt(
    sub: Subsection,
    config: Config,
    opts: { rung?: number; batch?: boolean; warmCache?: boolean; ttl?: "5m" | "1h" } = {},
  ): AttemptEstimate {
    const spec = this.catalog.get(config.model);
    const base = this.base(sub);
    const ratio = this.inputRatio(spec);
    const extra = (opts.rung ?? 0) > 0 ? base.output + ESCALATION_FEEDBACK_TOKENS : 0;
    const prefix = Math.round(base.prefix * ratio);
    const input = Math.round((base.input + extra) * ratio);
    const output = base.output;
    const thinking = Math.round(output * Math.max(0, this.outputMultiplier(spec, config.effort) - 1));
    const cacheable = this.options.cache && prefix >= spec.minCacheableTokens;
    const warm = opts.warmCache ?? true;
    const ttl = opts.ttl ?? "5m";
    const tokens: CallTokens = {
      uncached: input + (cacheable ? 0 : prefix),
      cacheRead: cacheable && warm ? prefix : 0,
      cacheWrite5m: cacheable && !warm && ttl === "5m" ? prefix : 0,
      cacheWrite1h: cacheable && !warm && ttl === "1h" ? prefix : 0,
      output: output + thinking,
    };
    return {
      tokens: { prefix, input, output, thinking },
      cost: callCost(spec, tokens, opts.batch ?? false),
      latency_s: spec.ttftS + (output + thinking) / this.throughput(spec),
      cacheable,
      max_tokens: maxTokensFor(spec, output + thinking),
    };
  }

  /** One repetition of a judge call that checks an attempt against the acceptance criteria. */
  judge(sub: Subsection, judge: Config, opts: { batch?: boolean } = {}): { cost: number; latency_s: number } {
    const spec = this.catalog.get(judge.model);
    const criteria = approxTokens(sub.acceptance_criteria.join("\n") + sub.outputs.map((o) => o.name).join(" "));
    const input = Math.round((JUDGE_SYSTEM_TOKENS + criteria + sub.est_output_tokens) * this.inputRatio(spec));
    const output = Math.round(JUDGE_OUTPUT_TOKENS * this.outputMultiplier(spec, judge.effort));
    return {
      cost: callCost(spec, { uncached: input, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, output }, opts.batch ?? false),
      latency_s: spec.ttftS + output / this.throughput(spec),
    };
  }

  /** Shared-prefix tokens (executor system prompt + shared brief) as billed by this model. */
  prefixTokens(model: string): number {
    const spec = this.catalog.get(model);
    return Math.round((this.options.systemPromptTokens + this.sharedTokens) * this.inputRatio(spec));
  }

  /**
   * What the shared prefix costs across `calls` first-attempt calls on one model.
   * Caching is enabled only when the cache write pays for itself (at least two
   * calls, and the write premium recovered by later reads). `warm` is what the
   * per-subsection estimates assumed (every call a cache read), so
   * `cost - warm` is the correction to apply at plan level.
   */
  prefixCost(model: string, calls: number, ttl: "5m" | "1h"): { cost: number; uncached: number; warm: number; enabled: boolean } {
    const spec = this.catalog.get(model);
    const prefix = this.prefixTokens(model);
    const p = spec.pricing;
    const uncached = (calls * prefix * p.input) / 1_000_000;
    const cacheable = this.options.cache && prefix >= spec.minCacheableTokens;
    const warm = cacheable ? (calls * prefix * p.cacheRead) / 1_000_000 : uncached;
    if (!cacheable || calls < 2) return { cost: uncached, uncached, warm, enabled: false };
    const write = ttl === "1h" ? p.cacheWrite1h : p.cacheWrite5m;
    const cached = (prefix * (write + (calls - 1) * p.cacheRead)) / 1_000_000;
    return cached < uncached ? { cost: cached, uncached, warm, enabled: true } : { cost: uncached, uncached, warm, enabled: false };
  }
}

/** A max_tokens ceiling with headroom: twice the expected output, rounded up to 1K, within model limits. */
export function maxTokensFor(spec: ModelSpec, expectedOutput: number): number {
  const target = Math.ceil((expectedOutput * 2 + 1024) / 1024) * 1024;
  return Math.max(4096, Math.min(spec.maxOutput, target));
}

export function round(value: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
