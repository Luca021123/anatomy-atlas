/**
 * LLM planner: turns free-form input (a task, a project brief, a plan, notes)
 * into a Decomposition with scored signals and explicit interface contracts.
 *
 * Separation of concerns: the model supplies judgment about the work (what the
 * parts are, how hard and how risky each is); it never picks models. The
 * deterministic router turns those scores into model, effort and verification
 * decisions, so routing stays auditable and calibratable.
 */
import { z } from "zod";
import type { Catalog } from "../catalog.ts";
import { approxTokens, callCost } from "../estimate.ts";
import type { LlmClient } from "../llm.ts";
import { rubricMarkdown } from "../rubric.ts";
import { CATEGORIES, type Config, type Decomposition, DecompositionSchema, SIGNAL_KEYS } from "../types.ts";

/** Lenient shape for structured output; normalisation and strict validation happen afterwards. */
const LlmDecompositionSchema = z.object({
  title: z.string(),
  goal: z.string(),
  shared_context: z.string(),
  assumptions: z.array(z.string()),
  open_questions: z.array(z.string()),
  subsections: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      category: z.enum(CATEGORIES),
      signals: z.object({
        reasoning: z.number(),
        ambiguity: z.number(),
        expertise: z.number(),
        context: z.number(),
        output: z.number(),
        horizon: z.number(),
        criticality: z.number(),
        verifiability: z.number(),
      }),
      rationale: z.string(),
      depends_on: z.array(z.string()),
      inputs: z.array(z.object({ artifact: z.string(), from: z.string() })),
      outputs: z.array(z.object({ name: z.string(), description: z.string(), format: z.string() })),
      acceptance_criteria: z.array(z.string()),
      integration_notes: z.string(),
      est_input_tokens: z.number(),
      est_output_tokens: z.number(),
      repetitions: z.number(),
      items: z.array(z.string()),
      latency_sensitive: z.boolean(),
    }),
  ),
});
type LlmDecomposition = z.infer<typeof LlmDecompositionSchema>;

export const PLANNER_SYSTEM_PROMPT = `You are the planning stage of a model optimizer. You receive a task, project or plan in any form and break it into subsections. A separate, deterministic router then assigns each subsection to a Claude model and effort level from the signal scores you give, so the cheapest model that can do the work well does it, and the expensive models are reserved for the parts that need them.

Your job is judgment about the work itself:
1. Understand the real objective, and restate it precisely as the goal.
2. Break the work into subsections that follow the decomposition principles below. Size the plan to the task: a small task can be a single subsection; a large project might need fifteen or twenty. Never split work only to make the plan look thorough, because every subsection adds overhead.
3. Give every subsection an explicit interface: inputs name the exact artifact and the id of the subsection that produces it (or "project" for material that already exists), and outputs are named artifacts with a format. Use identical artifact names on both sides.
4. Score the eight signals for each subsection honestly against the anchored rubric. Scores drive cost and quality, so do not inflate or deflate them. Explain the scores in one or two sentences in the rationale.
5. Estimate tokens realistically, and mark work nobody is waiting on as latency_sensitive=false. When the same unit of work repeats over a set (files, records, chapters), make it one subsection with repetitions set to the count, list the items when the input names them, and estimate tokens for a single item.
6. Put the context that every subsection needs (stack, constraints, conventions, audience) into shared_context. It is sent with every call and cached, so keep it complete but free of anything only one subsection needs.
7. Record your assumptions, plus the pointed questions whose answers would change the plan.

Do not choose models and do not mention models: the router does that. Use ids S1, S2, S3, and so on, in a sensible execution order.

${rubricMarkdown()}`;

export interface PlannerOptions {
  client: LlmClient;
  catalog: Catalog;
  /** Model and effort for planning (default: Claude Opus 5.5 at medium effort). */
  planner: Config;
  /** Extra project context (README, existing plan, constraints). */
  context?: string[];
  title?: string;
  /** Called while the planner streams, with the approximate output tokens so far. */
  onProgress?: (outputTokens: number, elapsedS: number) => void;
  signal?: AbortSignal;
}

export async function planWithLlm(input: string, options: PlannerOptions): Promise<Decomposition> {
  const spec = options.catalog.get(options.planner.model);
  const user = buildPlannerInput(input, options);
  let chars = 0;
  const started = performance.now();
  const result = await options.client.structured({
    model: spec.id,
    effort: options.planner.effort,
    maxTokens: Math.min(spec.maxOutput, 64_000),
    system: [{ text: PLANNER_SYSTEM_PROMPT }],
    user,
    schema: LlmDecompositionSchema,
    fallbacks: spec.serverFallback,
    onText: (delta) => {
      chars += delta.length;
      options.onProgress?.(Math.round(chars / 4), (performance.now() - started) / 1000);
    },
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const cost = callCost(spec, {
    uncached: result.usage.input,
    cacheRead: result.usage.cache_read,
    cacheWrite5m: result.usage.cache_write,
    cacheWrite1h: 0,
    output: result.usage.output,
  });
  return normalize(result.parsed, {
    planner: "llm",
    model: result.servedModel || spec.id,
    effort: options.planner.effort,
    usage: { input_tokens: result.usage.input, output_tokens: result.usage.output, cost_usd: cost },
    elapsed_s: Math.round(result.latencyS * 10) / 10,
  }, options.title);
}

export function buildPlannerInput(input: string, options: Pick<PlannerOptions, "context" | "title">): string {
  const parts = ["Break the following into subsections.", ""];
  if (options.title) parts.push(`Working title: ${options.title}`, "");
  parts.push("<input>", input.trim(), "</input>");
  for (const [i, ctx] of (options.context ?? []).entries()) {
    parts.push("", `<project_context index="${i + 1}">`, ctx.trim(), "</project_context>");
  }
  parts.push(
    "",
    `The input is about ${approxTokens(input).toLocaleString("en-US")} tokens long. Return the decomposition as JSON matching the schema.`,
  );
  return parts.join("\n");
}

/** Clamps and repairs model output, then validates it strictly. */
export function normalize(
  raw: LlmDecomposition,
  source: Decomposition["source"],
  title?: string,
): Decomposition {
  const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));
  const idMap = new Map<string, string>();
  raw.subsections.forEach((s, i) => {
    const clean = s.id.trim().replace(/[^A-Za-z0-9_.-]/g, "");
    idMap.set(s.id, /^[A-Za-z]/.test(clean) && clean ? clean : `S${i + 1}`);
  });
  const mapId = (id: string) => (id === "project" ? "project" : (idMap.get(id) ?? id));
  const subsections = raw.subsections.map((s, i) => {
    const signals = Object.fromEntries(SIGNAL_KEYS.map((k) => [k, clampInt(s.signals[k], 1, 5)])) as Record<
      (typeof SIGNAL_KEYS)[number],
      number
    >;
    const outputs = s.outputs.filter((o) => o.name.trim());
    return {
      id: idMap.get(s.id) ?? `S${i + 1}`,
      title: s.title.trim() || `Subsection ${i + 1}`,
      description: s.description.trim() || s.title.trim(),
      category: s.category,
      signals,
      rationale: s.rationale.trim(),
      depends_on: s.depends_on.map(mapId),
      inputs: s.inputs.filter((x) => x.artifact.trim()).map((x) => ({ artifact: x.artifact.trim(), from: mapId(x.from.trim()) })),
      outputs: outputs.length
        ? outputs.map((o) => ({ name: o.name.trim(), description: o.description, format: o.format || "markdown" }))
        : [{ name: `${(idMap.get(s.id) ?? `S${i + 1}`).toLowerCase()}-output`, description: "Result of this subsection", format: "markdown" }],
      acceptance_criteria: s.acceptance_criteria.filter((c) => c.trim()).length
        ? s.acceptance_criteria.filter((c) => c.trim())
        : [`The output fully accomplishes: ${s.title.trim()}`],
      integration_notes: s.integration_notes,
      est_input_tokens: clampInt(s.est_input_tokens, 0, 900_000),
      est_output_tokens: clampInt(s.est_output_tokens, 1, 128_000),
      items: s.items.filter((x) => x.trim()),
      repetitions: s.items.filter((x) => x.trim()).length || clampInt(s.repetitions, 1, 100_000),
      latency_sensitive: s.latency_sensitive,
    };
  });
  return DecompositionSchema.parse({
    version: 1,
    title: title ?? (raw.title.trim() || "Untitled plan"),
    goal: raw.goal.trim() || raw.title.trim() || "Complete the plan",
    shared_context: raw.shared_context,
    assumptions: raw.assumptions,
    open_questions: raw.open_questions,
    subsections,
    source,
  });
}
