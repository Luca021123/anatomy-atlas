/**
 * Model catalog: identifiers, prices, limits and capability priors.
 *
 * Prices and limits come from Anthropic's published model table (cached
 * 2026-10-06). Capability ceilings, thinking overheads and throughput are
 * PRIORS - reasonable starting points that the outcome ledger recalibrates
 * from real runs (see ledger.ts). Override any of it with `--catalog file.json`.
 */
import { readFileSync } from "node:fs";
import type { AgentAlias, Config, Effort } from "./types.ts";
import { EFFORTS } from "./types.ts";

export const PRICING_AS_OF = "2026-10-06";

/** $ per million tokens. */
export interface PriceCard {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

export interface ModelSpec {
  id: string;
  name: string;
  alias: AgentAlias;
  /** 1 = cheapest tier ... 4 = most capable tier. */
  tier: number;
  pricing: PriceCard;
  /** Alternative rate card used when the prompt exceeds `aboveTokens` (Haiku 5.5). */
  longContext?: { aboveTokens: number; pricing: PriceCard };
  /** Fraction taken off every token on the Batch API. */
  batchDiscount: number;
  contextWindow: number;
  maxOutput: number;
  minCacheableTokens: number;
  efforts: readonly Effort[];
  defaultEffort: Effort;
  /**
   * PRIOR. Difficulty level (1-5 scale, see rubric.ts) at which a first attempt
   * meets its acceptance criteria about 90% of the time, per effort level.
   */
  ceiling: Record<Effort, number>;
  /**
   * PRIOR. Total output tokens divided by visible output tokens, per effort
   * level - i.e. 1 + the thinking overhead.
   */
  outputMultiplier: Record<Effort, number>;
  /** PRIOR. Output tokens per second while generating. */
  outputTps: number;
  /** PRIOR. Seconds before the first output token, excluding thinking. */
  ttftS: number;
  /** Supports the server-side refusal fallback (`fallbacks: "default"`). */
  serverFallback: boolean;
}

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
export const SERVER_FALLBACK_BETA = FALLBACK_BETA;

/** Builds a price card from base prices using the standard cache multipliers. */
function card(input: number, output: number, cacheRead: number): PriceCard {
  return { input, output, cacheWrite5m: input * 1.25, cacheWrite1h: input * 2, cacheRead };
}

export const DEFAULT_MODELS: ModelSpec[] = [
  {
    id: "claude-haiku-5-5",
    name: "Claude Haiku 5.5",
    alias: "haiku",
    tier: 1,
    pricing: card(0.1, 0.5, 0.01),
    longContext: { aboveTokens: 100_000, pricing: card(0.5, 2.5, 0.05) },
    batchDiscount: 0.5,
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    minCacheableTokens: 512,
    efforts: EFFORTS,
    defaultEffort: "medium",
    ceiling: { low: 1.9, medium: 2.4, high: 2.65, xhigh: 2.75, max: 2.8 },
    outputMultiplier: { low: 1.15, medium: 1.45, high: 1.9, xhigh: 2.4, max: 3.0 },
    outputTps: 180,
    ttftS: 0.8,
    serverFallback: false,
  },
  {
    id: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    alias: "sonnet",
    tier: 2,
    pricing: { input: 2, output: 10, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2 },
    batchDiscount: 0.5,
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    minCacheableTokens: 512,
    efforts: EFFORTS,
    defaultEffort: "high",
    ceiling: { low: 2.9, medium: 3.35, high: 3.7, xhigh: 3.85, max: 3.95 },
    outputMultiplier: { low: 1.2, medium: 1.6, high: 2.2, xhigh: 3.0, max: 4.0 },
    outputTps: 90,
    ttftS: 1.5,
    serverFallback: true,
  },
  {
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    alias: "opus",
    tier: 3,
    pricing: { input: 4, output: 20, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2 },
    batchDiscount: 0.5,
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    minCacheableTokens: 512,
    efforts: EFFORTS,
    defaultEffort: "medium",
    ceiling: { low: 3.55, medium: 4.0, high: 4.3, xhigh: 4.5, max: 4.6 },
    outputMultiplier: { low: 1.25, medium: 1.75, high: 2.5, xhigh: 3.5, max: 5.0 },
    outputTps: 55,
    ttftS: 2.5,
    serverFallback: true,
  },
  {
    id: "claude-fable-5-1",
    name: "Claude Fable 5.1",
    alias: "fable",
    tier: 4,
    pricing: card(10, 50, 0.25),
    batchDiscount: 0.5,
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    minCacheableTokens: 512,
    efforts: EFFORTS,
    defaultEffort: "high",
    ceiling: { low: 4.05, medium: 4.45, high: 4.75, xhigh: 4.95, max: 5.05 },
    outputMultiplier: { low: 1.3, medium: 1.85, high: 2.6, xhigh: 3.6, max: 5.0 },
    outputTps: 40,
    ttftS: 4,
    serverFallback: true,
  },
];

export class Catalog {
  readonly models: ModelSpec[];
  readonly pricingAsOf: string;
  private readonly byKey = new Map<string, ModelSpec>();

  constructor(models: ModelSpec[] = DEFAULT_MODELS, pricingAsOf = PRICING_AS_OF) {
    this.models = [...models].sort((a, b) => a.tier - b.tier);
    this.pricingAsOf = pricingAsOf;
    for (const m of this.models) {
      this.byKey.set(m.id, m);
      this.byKey.set(m.alias, m);
      this.byKey.set(m.name.toLowerCase(), m);
    }
  }

  /** Looks a model up by id ("claude-opus-5-5"), alias ("opus") or display name. */
  get(key: string): ModelSpec {
    const spec = this.byKey.get(key) ?? this.byKey.get(key.toLowerCase());
    if (!spec) {
      const known = this.models.map((m) => `${m.alias} (${m.id})`).join(", ");
      throw new Error(`Unknown model "${key}". Known models: ${known}`);
    }
    return spec;
  }

  has(key: string): boolean {
    return this.byKey.has(key) || this.byKey.has(key.toLowerCase());
  }

  /** Every (model, effort) pair, optionally filtered. */
  configs(models?: string[], efforts?: readonly Effort[]): Config[] {
    const allowed = models?.length ? new Set(models.map((m) => this.get(m).id)) : null;
    const out: Config[] = [];
    for (const m of this.models) {
      if (allowed && !allowed.has(m.id)) continue;
      for (const e of m.efforts) {
        if (efforts && !efforts.includes(e)) continue;
        out.push({ model: m.id, effort: e });
      }
    }
    return out;
  }

  /** Parses "opus@high", "claude-sonnet-5-5@medium" or "haiku" (default effort). */
  parseConfig(text: string): Config {
    const [name, effortText] = text.split("@");
    const spec = this.get((name ?? "").trim());
    const effort = (effortText?.trim() || spec.defaultEffort) as Effort;
    if (!spec.efforts.includes(effort)) {
      throw new Error(`Effort "${effort}" is not supported by ${spec.name} (supports ${spec.efforts.join(", ")})`);
    }
    return { model: spec.id, effort };
  }

  label(config: Config): string {
    return `${this.get(config.model).name} @ ${config.effort}`;
  }

  /** Loads a catalog override file: { "pricing_as_of": "...", "models": [ModelSpec, ...] }. */
  static fromFile(path: string): Catalog {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { pricing_as_of?: string; models?: Partial<ModelSpec>[] };
    if (!Array.isArray(raw.models) || raw.models.length === 0) {
      throw new Error(`Catalog file ${path} must contain a non-empty "models" array`);
    }
    const defaults = new Map(DEFAULT_MODELS.map((m) => [m.id, m]));
    const generic = {
      batchDiscount: 0.5,
      contextWindow: 1_000_000,
      maxOutput: 128_000,
      minCacheableTokens: 1024,
      efforts: EFFORTS,
      defaultEffort: "high" as Effort,
      outputTps: 60,
      ttftS: 2,
      serverFallback: false,
    };
    const models = raw.models.map((m, i) => {
      if (!m.id) throw new Error(`Catalog file ${path}: models[${i}] is missing "id"`);
      const merged = { ...generic, ...(defaults.get(m.id) ?? {}), ...m } as ModelSpec;
      for (const key of ["name", "alias", "tier", "pricing", "ceiling", "outputMultiplier"] as const) {
        if (merged[key] === undefined) throw new Error(`Catalog file ${path}: model ${m.id} is missing "${key}"`);
      }
      return merged;
    });
    return new Catalog(models, raw.pricing_as_of ?? PRICING_AS_OF);
  }
}

export const defaultCatalog = new Catalog();
