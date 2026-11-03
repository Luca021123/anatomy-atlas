/**
 * Scoring model shared by the router and the metrics: how hard a subsection is,
 * how likely a configuration is to succeed at it, and what quality floor it
 * must reach.
 */
import { round } from "./estimate.ts";
import type { Category, DifficultyBreakdown, QualityPreset, SignalKey, Signals } from "./types.ts";

// ---------------------------------------------------------------------------
// Probability model
// ---------------------------------------------------------------------------

/** Success probability falls by this many logits per difficulty level beyond a ceiling. */
export const SLOPE = 2.5;
/** A configuration's ceiling is the difficulty at which first-pass success is 90%. */
export const LOGIT_AT_CEILING = Math.log(9);
const P_MAX = 0.995;

export function successProbability(ceiling: number, level: number): number {
  const z = SLOPE * (ceiling - level) + LOGIT_AT_CEILING;
  return Math.min(P_MAX, 1 / (1 + Math.exp(-z)));
}

/** Minimum probability of a correct final result, before the criticality adjustment. */
export const QUALITY_FLOOR_BASE: Record<QualityPreset, number> = { max: 0.95, balanced: 0.92, economy: 0.85 };
/** Minimum first-attempt success: the plan never budgets on a model that will probably fail. */
export const FIRST_PASS_MIN: Record<QualityPreset, number> = { max: 0.85, balanced: 0.75, economy: 0.6 };
export const CRITICALITY_ADJUST = [-0.04, -0.02, 0, 0.025, 0.04];
/** Probability that verification catches a bad output, by verifiability score. */
export const DETECTION_BY_VERIFIABILITY = [0.35, 0.55, 0.7, 0.85, 0.95];
/** Probability that a judge wrongly rejects a good output (causes an unnecessary escalation). */
export const JUDGE_FALSE_REJECT = 0.03;
/** An escalation must raise the capability ceiling by at least this much. */
export const ESCALATION_STEP = 0.4;
/** Nominal wall-clock for a Batch API job (typically well under an hour; up to 24h). */
export const BATCH_LATENCY_S = 3600;
export const MECHANICAL_CATEGORIES = new Set<Category>(["code_generation", "code_edit", "testing", "data_analysis", "ops", "extraction", "transformation"]);

export function qualityFloor(preset: QualityPreset, criticality: number): number {
  const adj = CRITICALITY_ADJUST[Math.min(5, Math.max(1, criticality)) - 1] ?? 0;
  return round(Math.min(0.99, Math.max(0.5, QUALITY_FLOOR_BASE[preset] + adj)), 4);
}

// ---------------------------------------------------------------------------
// Difficulty
// ---------------------------------------------------------------------------

const DIFFICULTY_WEIGHTS: Record<Exclude<SignalKey, "criticality" | "verifiability">, number> = {
  reasoning: 0.3,
  ambiguity: 0.2,
  expertise: 0.2,
  context: 0.1,
  output: 0.1,
  horizon: 0.1,
};

/**
 * Required capability on the 1-5 scale. A task is roughly as hard as its
 * hardest dimension, softened by how hard it is overall: 55% peak, 45% breadth.
 * Context and output size alone make a task a little less hard than reasoning,
 * ambiguity, expertise or horizon do, so they enter the peak at -0.5.
 */
export function difficulty(signals: Signals, offset = 0): DifficultyBreakdown {
  let breadth = 0;
  for (const [k, w] of Object.entries(DIFFICULTY_WEIGHTS)) breadth += w * signals[k as keyof typeof DIFFICULTY_WEIGHTS];
  const peakCandidates: [SignalKey, number][] = [
    ["reasoning", signals.reasoning],
    ["ambiguity", signals.ambiguity],
    ["expertise", signals.expertise],
    ["horizon", signals.horizon],
    ["context", signals.context - 0.5],
    ["output", signals.output - 0.5],
  ];
  let [peakSignal, peak] = peakCandidates[0] as [SignalKey, number];
  for (const [k, v] of peakCandidates) {
    if (v > peak) {
      peak = v;
      peakSignal = k;
    }
  }
  const raw = 0.55 * peak + 0.45 * breadth;
  return {
    breadth: round(breadth, 3),
    peak: round(peak, 3),
    peak_signal: peakSignal,
    raw: round(raw, 3),
    offset: round(offset, 3),
    level: round(Math.min(5.5, Math.max(1, raw + offset)), 3),
  };
}
