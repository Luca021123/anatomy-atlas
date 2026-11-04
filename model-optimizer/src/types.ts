/**
 * Core data contracts for model-optimizer.
 *
 * Three layers of data flow through the tool:
 *   1. Decomposition  - what the planner produces: subsections with scored signals
 *                       and explicit interface contracts (validated with zod).
 *   2. RoutedPlan     - what the router produces: a model + effort + verification
 *                       plan for every subsection, plus plan-level metrics.
 *   3. Run records    - what the executor produces while it runs a plan: attempts,
 *                       actual usage and cost, verdicts and escalations.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export const CATEGORIES = [
  "architecture", // system design, planning, trade-off analysis
  "reasoning", // maths, logic, proofs, root-cause analysis
  "code_generation", // writing new code
  "code_edit", // refactoring or modifying existing code, small fixes
  "testing", // writing tests or test plans
  "review", // critique, code review, verification of others' work
  "research", // gathering and synthesising information
  "writing", // long-form prose, documentation, creative writing
  "extraction", // pulling structured data out of text
  "transformation", // reformatting, converting, translating
  "classification", // labelling, triage, routing
  "summarization", // condensing material
  "data_analysis", // analysing data, statistics, interpreting results
  "integration", // assembling parts, glue work, cross-section consistency
  "ops", // configuration, scripting, deployment, tooling
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** The eight scored signals. Each is an integer from 1 (low) to 5 (high). */
export const SIGNAL_KEYS = [
  "reasoning",
  "ambiguity",
  "expertise",
  "context",
  "output",
  "horizon",
  "criticality",
  "verifiability",
] as const;
export type SignalKey = (typeof SIGNAL_KEYS)[number];

/** Claude Code subagent model aliases (the `model` field of the Agent tool). */
export const AGENT_ALIASES = ["haiku", "sonnet", "opus", "fable"] as const;
export type AgentAlias = (typeof AGENT_ALIASES)[number];

export const QUALITY_PRESETS = ["max", "balanced", "economy"] as const;
export type QualityPreset = (typeof QUALITY_PRESETS)[number];

// ---------------------------------------------------------------------------
// Decomposition (planner output, validated input to the router)
// ---------------------------------------------------------------------------

const score = z.number().int().min(1).max(5);

export const SignalsSchema = z.object({
  reasoning: score,
  ambiguity: score,
  expertise: score,
  context: score,
  output: score,
  horizon: score,
  criticality: score,
  verifiability: score,
});
export type Signals = z.infer<typeof SignalsSchema>;

/** A reference to an artifact this subsection consumes. */
export const ArtifactRefSchema = z.object({
  /** Exact name of the artifact, as declared in the producer's `outputs`. */
  artifact: z.string().min(1),
  /** Producing subsection id, or "project" for material that already exists. */
  from: z.string().min(1),
});
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;

/** An artifact this subsection must produce. */
export const ArtifactSpecSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  /** Free-text format hint, e.g. "markdown", "typescript module", "json". */
  format: z.string().default("markdown"),
});
export type ArtifactSpec = z.infer<typeof ArtifactSpecSchema>;

export const SubsectionSchema = z.object({
  id: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]*$/, "ids must start with a letter (e.g. S1, S2a)"),
  title: z.string().min(1),
  /** The full instruction an executor receives for this unit of work. */
  description: z.string().min(1),
  category: z.enum(CATEGORIES),
  signals: SignalsSchema,
  /** One or two sentences justifying the signal scores. */
  rationale: z.string().default(""),
  depends_on: z.array(z.string()).default([]),
  inputs: z.array(ArtifactRefSchema).default([]),
  outputs: z.array(ArtifactSpecSchema).min(1),
  acceptance_criteria: z.array(z.string().min(1)).min(1),
  /** How this subsection's output plugs into the rest of the project. */
  integration_notes: z.string().default(""),
  /** Tokens of subsection-specific material to read (excludes the shared brief and upstream artifacts). */
  est_input_tokens: z.number().int().min(0),
  /** Tokens of visible output (excludes thinking). */
  est_output_tokens: z.number().int().min(1),
  /** How many times this unit of work repeats (e.g. once per file). */
  repetitions: z.number().int().min(1).default(1),
  /**
   * The concrete items a repeated subsection runs over (file paths, record ids,
   * chapter names). When present, the executor makes one call per item.
   */
  items: z.array(z.string()).default([]),
  /** True when someone is waiting on the result; false makes it a Batch API candidate. */
  latency_sensitive: z.boolean().default(true),
});
export type Subsection = z.infer<typeof SubsectionSchema>;

export const PlannerUsageSchema = z.object({
  input_tokens: z.number().min(0),
  output_tokens: z.number().min(0),
  cost_usd: z.number().min(0),
});

export const DecompositionSourceSchema = z.object({
  planner: z.enum(["llm", "heuristic", "external"]),
  model: z.string().optional(),
  effort: z.enum(EFFORTS).optional(),
  usage: PlannerUsageSchema.optional(),
  elapsed_s: z.number().optional(),
});
export type DecompositionSource = z.infer<typeof DecompositionSourceSchema>;

export const DecompositionSchema = z.object({
  version: z.literal(1).default(1),
  title: z.string().min(1),
  /** The objective, restated precisely. */
  goal: z.string().min(1),
  /** The project brief every subsection receives (cached across calls). */
  shared_context: z.string().default(""),
  assumptions: z.array(z.string()).default([]),
  /** Pointed questions whose answers would change the plan. */
  open_questions: z.array(z.string()).default([]),
  subsections: z.array(SubsectionSchema).min(1),
  source: DecompositionSourceSchema.default({ planner: "external" }),
});
export type Decomposition = z.infer<typeof DecompositionSchema>;
/** The shape a hand-written or LLM-written decomposition file may take before defaults are applied. */
export type DecompositionInput = z.input<typeof DecompositionSchema>;

// ---------------------------------------------------------------------------
// Routing (router output)
// ---------------------------------------------------------------------------

/** A concrete way to run a subsection: a model at an effort level. */
export interface Config {
  model: string;
  effort: Effort;
}

export type VerificationMethod = "self-check" | "judge" | "dual-judge" | "tests" | "human";

export interface Verification {
  method: VerificationMethod;
  /** Model used to judge the output (absent for self-check). */
  judge?: Config;
  /** Independent second reviewer on a different model (dual-judge): both must pass. */
  second_judge?: Config;
  /** Probability that a failed attempt is detected (and therefore escalated). */
  detection_rate: number;
  /** Recommend a human sign-off before downstream work relies on this output. */
  human_review: boolean;
  note: string;
}

/** Per-attempt token estimate for one repetition. */
export interface TokenEstimate {
  /** Shared prefix: executor system prompt + shared brief (cacheable). */
  prefix: number;
  /** Subsection-specific input: own material + upstream artifacts + instructions. */
  input: number;
  /** Visible output. */
  output: number;
  /** Thinking tokens (billed as output). */
  thinking: number;
  /** Agent mode: tool-loop steps of one subagent run, and the run's total tokens (mostly cache reads). */
  steps?: number;
  total?: number;
}

export interface CandidateEval {
  model: string;
  effort: Effort;
  /** Probability the first attempt meets the acceptance criteria. */
  p_first: number;
  /** Probability of a correct final output after verification-triggered escalation. */
  p_final: number;
  /** Cost of the first attempt alone, all repetitions (USD). */
  cost_first: number;
  /** Expected cost including verification and escalations (USD). */
  expected_cost: number;
  /** Cost if every rung of the escalation ladder runs (USD). */
  worst_case_cost: number;
  feasible: boolean;
  ladder: Config[];
}

export interface DifficultyBreakdown {
  /** Weighted mean of the difficulty signals. */
  breadth: number;
  /** The single hardest dimension. */
  peak: number;
  peak_signal: SignalKey;
  /** Difficulty before calibration. */
  raw: number;
  /** Learned calibration offset for this category (from the outcome ledger). */
  offset: number;
  /** Final required capability level on the 1-5 scale. */
  level: number;
}

/** The API request shape the executor will send (minus the messages). */
export interface RequestPreview {
  model: string;
  max_tokens: number;
  output_config: { effort: Effort };
  stream: true;
  cache: { prefix_tokens: number; ttl: "5m" | "1h"; enabled: boolean };
  batch: boolean;
  /** Server-side refusal fallback (beta) - absent for models without it, and for batch requests. */
  fallbacks?: { beta: string; value: "default" };
}

export interface Routing {
  id: string;
  title: string;
  category: Category;
  model: string;
  model_name: string;
  effort: Effort;
  agent_alias: AgentAlias;
  difficulty: DifficultyBreakdown;
  /** Minimum acceptable probability of a correct final output. */
  quality_floor: number;
  p_first: number;
  p_final: number;
  meets_floor: boolean;
  verification: Verification;
  /** Escalation ladder after the first rung. */
  escalation: Config[];
  tokens: TokenEstimate;
  repetitions: number;
  cost: {
    /** First attempt, all repetitions (USD). */
    first_attempt: number;
    /** Including verification and probability-weighted escalations (USD). */
    expected: number;
    /** Every rung runs (USD). */
    worst_case: number;
    /** Same subsection on the baseline config, first attempt only (USD). */
    baseline: number;
  };
  /** Estimated wall-clock seconds for this subsection (repetitions run with the executor's concurrency). */
  latency_s: number;
  batch: { eligible: boolean; applied: boolean; saving_usd: number };
  request: RequestPreview;
  /** Best few alternatives considered, for transparency. */
  alternatives: CandidateEval[];
  reasons: string[];
  flags: string[];
}

export interface RouterOptions {
  /**
   * "agent" (default): subsections run as Claude Code subagents on a subscription,
   * so costs are API-equivalent estimates of usage. "api": one Messages API call
   * per attempt, priced in dollars (used by `mopt run`).
   */
  mode: "agent" | "api";
  quality: QualityPreset;
  /** Allowed model ids, cheapest first is not required. */
  models: string[];
  /** Allowed effort levels. */
  efforts: Effort[];
  /** Reference config for "what would this cost without routing?". */
  baseline: Config;
  /** Apply the Batch API to eligible, non-latency-sensitive subsections. */
  batch: boolean;
  batchMinRepetitions: number;
  /** Assume prompt caching of the shared prefix. */
  cache: boolean;
  maxEscalations: number;
  /** Executor concurrency, used for latency estimates of repeated work. */
  concurrency: number;
  /** Tokens of executor system prompt prepended to every call. */
  systemPromptTokens: number;
  /** Below this % saving versus the best single config, recommend the single config. */
  minRoutingGainPct: number;
}

export type IssueLevel = "error" | "warning" | "info";

export interface Issue {
  level: IssueLevel;
  code: string;
  message: string;
  subsection?: string;
}

export interface Baseline {
  label: string;
  model: string;
  effort: Effort;
  /** First-attempt cost of every subsection on this config (USD). */
  cost: number;
  /** How many subsections this config would leave below their quality floor (first pass, no verification). */
  below_floor: number;
  mean_p_first: number;
}

export interface SingleConfigAlternative {
  model: string;
  effort: Effort;
  /** Expected cost of running every subsection first on this config, with the same verification and escalation. */
  expected_cost: number;
  /** Routing's saving relative to this alternative, in percent. */
  routing_gain_pct: number;
  /** True when routing is not worth the fragmentation and this config should be used for everything. */
  recommended: boolean;
  reason: string;
}

export interface ModelMixEntry {
  model: string;
  model_name: string;
  alias: AgentAlias;
  subsections: number;
  repetitions: number;
  expected_cost: number;
  share_of_cost: number;
  share_of_subsections: number;
}

export interface PlanMetrics {
  currency: "USD";
  pricing_as_of: string;
  subsections: number;
  total_repetitions: number;
  cost: {
    first_pass: number;
    expected: number;
    worst_case: number;
    /** Expected cost after prompt-cache accounting across the whole plan. */
    expected_with_cache: number;
    cache_saving: number;
    /** Extra saving available by batching eligible subsections (when batch is off). */
    batch_saving_available: number;
    /** Median and 90th-percentile plan cost from a Monte Carlo of the escalation ladders. */
    p50: number;
    p90: number;
  };
  planner_overhead: number;
  baselines: Baseline[];
  /** Saving of the routed plan's expected cost versus the reference baseline. */
  savings: { vs: string; usd: number; pct: number; net_of_planner_usd: number };
  single_config: SingleConfigAlternative | null;
  model_mix: ModelMixEntry[];
  quality: {
    floor_min: number;
    floor_max: number;
    mean_p_final: number;
    min_p_final: number;
    below_floor: string[];
    expected_escalations: number;
    human_review: string[];
  };
  schedule: {
    waves: string[][];
    critical_path: string[];
    critical_path_s: number;
    sequential_s: number;
    parallelism: number;
  };
  tokens: { input: number; output: number; thinking: number };
  /** Prompt-cache decision per model: cache the shared prefix only where it pays. */
  cache: CachePlanEntry[];
}

export interface CachePlanEntry {
  model: string;
  /** First-attempt calls that share the prefix on this model. */
  calls: number;
  prefix_tokens: number;
  enabled: boolean;
  ttl: "5m" | "1h";
  /** Longest idle gap between calls on this model (seconds); decides the TTL. */
  max_gap_s: number;
  saving_usd: number;
}

export interface RoutedPlan {
  version: 1;
  created_at: string;
  decomposition: Decomposition;
  options: RouterOptions;
  routes: Routing[];
  metrics: PlanMetrics;
  issues: Issue[];
  /** Calibration snapshot applied while routing (empty when no ledger data). */
  calibration: CalibrationSnapshot;
}

// ---------------------------------------------------------------------------
// Calibration (learned from the outcome ledger)
// ---------------------------------------------------------------------------

export interface CalibrationSnapshot {
  /** Difficulty offset per category, added to the required level. */
  category_offsets: Partial<Record<Category, number>>;
  /** Learned output multiplier (total output / visible output) per "model@effort". */
  output_multipliers: Record<string, number>;
  /** Learned ratio actual/estimated input tokens per model. */
  input_ratios: Record<string, number>;
  /** Learned output tokens per second per model. */
  throughput: Record<string, number>;
  /** Agent mode: learned ratio of a subagent run's actual total tokens to the estimate, per model. */
  agent_scale?: Record<string, number>;
  /** Number of ledger records the snapshot was built from. */
  samples: number;
}

// ---------------------------------------------------------------------------
// Execution (executor output)
// ---------------------------------------------------------------------------

export interface UsageTotals {
  input: number;
  output: number;
  thinking: number;
  cache_write: number;
  cache_read: number;
}

export interface Verdict {
  pass: boolean;
  /** 0-1 share of acceptance criteria met. */
  score: number;
  failed_criteria: string[];
  feedback: string;
  judge_model: string;
  judge_cost_usd: number;
}

export type AttemptStatus = "pass" | "fail" | "error";

export interface AttemptRecord {
  subsection: string;
  attempt: number;
  model: string;
  effort: Effort;
  /** The model that actually served the request (differs after a server-side fallback). */
  served_model: string;
  started_at: string;
  ended_at: string;
  latency_s: number;
  usage: UsageTotals;
  cost_usd: number;
  est_cost_usd: number;
  stop_reason: string | null;
  verdict?: Verdict;
  status: AttemptStatus;
  error?: string;
}

export type SubsectionStatus =
  | "pending"
  | "queued"
  | "running"
  | "verifying"
  | "done"
  | "failed"
  | "skipped";

export interface SubsectionRunState {
  id: string;
  title: string;
  status: SubsectionStatus;
  attempts: AttemptRecord[];
  /** Artifact name -> content extracted from the accepted output. */
  artifacts: Record<string, string>;
  final_model?: string;
  cost_usd: number;
  est_cost_usd: number;
  output_path?: string;
}

export interface LiveTotals {
  elapsed_s: number;
  spent_usd: number;
  /** Router's expected cost for the whole plan. */
  est_total_usd: number;
  /** Spent so far plus the remaining estimate scaled by the observed actual/estimate ratio. */
  projected_total_usd: number;
  baseline_usd: number;
  projected_savings_pct: number;
  done: number;
  failed: number;
  running: number;
  pending: number;
  skipped: number;
  escalations: number;
  first_pass_successes: number;
  budget_usd?: number;
  tokens: UsageTotals;
}

export type RunStatus = "completed" | "failed" | "aborted" | "budget_exceeded";

// ---------------------------------------------------------------------------
// Outcome ledger statistics (`mopt stats`)
// ---------------------------------------------------------------------------

export interface CategoryStat {
  category: Category;
  attempts: number;
  /** Observed first-attempt pass rate. */
  pass_rate: number;
  /** Mean pass probability the router predicted for those attempts. */
  predicted_rate: number;
  /** Difficulty offset currently applied to this category. */
  offset: number;
}

export interface ConfigStat {
  /** "model@effort". */
  config: string;
  attempts: number;
  pass_rate: number;
  /** Actual cost divided by estimated cost (1.0 = accurate), or null when no attempt recorded a dollar cost (e.g. subagent runs). */
  cost_ratio: number | null;
  /** Observed total output / visible output, or null when thinking tokens were not reported. */
  output_multiplier: number | null;
  /** Observed output tokens per second, or null. */
  tps: number | null;
  /** Agent mode: actual total tokens of subagent runs divided by the estimate, or null. */
  token_ratio?: number | null;
}

export interface LedgerStats {
  path: string;
  records: number;
  since?: string;
  by_category: CategoryStat[];
  by_config: ConfigStat[];
  snapshot: CalibrationSnapshot;
}

export interface RunSummary {
  plan_title: string;
  started_at: string;
  ended_at: string;
  status: RunStatus;
  out_dir: string;
  states: SubsectionRunState[];
  totals: LiveTotals;
}
