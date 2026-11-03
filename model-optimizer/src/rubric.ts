/**
 * The scoring rubric. One source of truth for the LLM planner prompt, the
 * offline heuristic planner, the `mopt rubric` command and the Claude Code skill,
 * so every decomposition is scored on the same anchored scale.
 */
import type { Category, SignalKey } from "./types.ts";

export interface SignalAnchor {
  key: SignalKey;
  question: string;
  /** Anchors for scores 1..5 (index 0 = score 1). */
  anchors: [string, string, string, string, string];
  /** Whether a high score makes the work harder (true) or only riskier/checkable (false). */
  difficulty: boolean;
}

export const SIGNAL_RUBRIC: SignalAnchor[] = [
  {
    key: "reasoning",
    question: "How much multi-step inference does the work need?",
    difficulty: true,
    anchors: [
      "Lookup, copying or a mechanical transformation; no inference.",
      "Routine application of a known pattern (a standard function, a plain summary).",
      "Several dependent inferential steps; non-trivial debugging or analysis with a clear target.",
      "Deep multi-step reasoning: system design, subtle cross-component bugs, rigorous argument.",
      "Novel reasoning at the frontier: new algorithms, proofs, research-grade synthesis.",
    ],
  },
  {
    key: "ambiguity",
    question: "How underspecified is the work?",
    difficulty: true,
    anchors: [
      "Fully specified; one correct output.",
      "Mostly specified; minor choices with obvious defaults.",
      "Several reasonable approaches; judgment is needed to choose.",
      "Underspecified goals; must infer intent and make trade-offs.",
      "Open-ended; the success criteria themselves must be defined.",
    ],
  },
  {
    key: "expertise",
    question: "How specialised is the knowledge required?",
    difficulty: true,
    anchors: [
      "General knowledge.",
      "Common professional knowledge (mainstream programming, standard writing).",
      "Specialist knowledge in one domain (a framework's internals, statistics, pharmacology basics).",
      "Expert depth: security, concurrency, clinical or legal nuance, advanced mathematics.",
      "Rare, cutting-edge or cross-domain expert knowledge.",
    ],
  },
  {
    key: "context",
    question: "How much material must be held and reconciled at once?",
    difficulty: true,
    anchors: [
      "Self-contained; needs only its own instructions.",
      "A few related inputs (one file, one document).",
      "Several inputs that must be reconciled (multi-file, multi-source).",
      "A large body of material; many constraints must stay consistent.",
      "Whole-project, cross-cutting consistency across everything.",
    ],
  },
  {
    key: "output",
    question: "How large and intricate is the output?",
    difficulty: true,
    anchors: [
      "A label, a number or a few lines.",
      "Short structured output (a function, a paragraph, a small JSON object).",
      "A substantial artifact (a module, a multi-section document).",
      "Long, highly structured or polished output (multi-file code, publication-grade prose).",
      "Very long, intricate output whose internal consistency is hard to keep.",
    ],
  },
  {
    key: "horizon",
    question: "How many steps or tool calls does it take?",
    difficulty: true,
    anchors: [
      "A single response.",
      "A couple of steps or one tool call.",
      "A short agentic loop (read, change, check).",
      "Extended multi-tool work with intermediate decisions.",
      "A long autonomous run with planning, backtracking and many tool calls.",
    ],
  },
  {
    key: "criticality",
    question: "What does an undetected error cost?",
    difficulty: false,
    anchors: [
      "Harmless, or immediately obvious.",
      "Cheap to fix and easy to notice.",
      "Real rework if it slips through.",
      "Propagates downstream or affects users, money, security or health.",
      "Severe, hard to detect or irreversible.",
    ],
  },
  {
    key: "verifiability",
    question: "How mechanically can the output be checked?",
    difficulty: false,
    anchors: [
      "Only an expert reading closely can tell whether it is right.",
      "A careful reviewer can check it, with effort.",
      "Clear acceptance criteria that a reviewer or judge model can check.",
      "Mostly mechanical checks (schema, rubric, reference answer) with a little judgment.",
      "Fully mechanical checks (tests pass, schema validates, exact match).",
    ],
  },
];

export const CATEGORY_GUIDE: Record<Category, string> = {
  architecture: "System design, planning, interface design and trade-off analysis.",
  reasoning: "Maths, logic, proofs, root-cause analysis, hard debugging.",
  code_generation: "Writing new code against a specification.",
  code_edit: "Refactoring or modifying existing code; targeted fixes.",
  testing: "Writing tests, fixtures or test plans.",
  review: "Critiquing or verifying someone else's work.",
  research: "Gathering and synthesising information from sources.",
  writing: "Long-form prose, documentation, creative or persuasive writing.",
  extraction: "Pulling structured data out of unstructured text.",
  transformation: "Reformatting, converting or translating material.",
  classification: "Labelling, triage or routing items into known classes.",
  summarization: "Condensing material while keeping what matters.",
  data_analysis: "Analysing data, statistics, interpreting results.",
  integration: "Assembling the parts into the final deliverable and checking cross-part consistency.",
  ops: "Configuration, scripting, deployment, CI and tooling.",
  other: "Anything that fits none of the above.",
};

/** Decomposition principles the planner follows (also printed by `mopt rubric`). */
export const DECOMPOSITION_PRINCIPLES: string[] = [
  "One subsection = one coherent unit of work that a single model call can complete and that can be checked against its acceptance criteria.",
  "Isolate the hard core. Put the difficult reasoning or design into its own small subsection so that routine work around it (boilerplate, formatting, tests, docs) can run on cheaper models.",
  "Do not over-split. Every subsection re-reads the shared brief and its inputs, so merge tiny steps that share context unless they are truly independent or repeat many times.",
  "Make every interface explicit. Each input names the exact artifact and the subsection that produces it (or \"project\" for existing material); each output is a named artifact.",
  "Write acceptance criteria that a reviewer who has not seen the conversation could check.",
  "Finish with an integration subsection that assembles the deliverables and checks cross-subsection consistency, unless the plan has a single subsection.",
  "Score signals honestly against the anchors. Inflated scores waste money; deflated scores waste rework.",
  "Estimate tokens realistically: about 4 characters of English per token; 100 lines of code is roughly 1,000-1,500 tokens; a dense page of prose is roughly 700 tokens.",
  "Mark work nobody is waiting on as latency_sensitive=false so it can use the Batch API at half price.",
  "Surface assumptions and the pointed questions whose answers would change the plan.",
];

/** Renders the rubric as Markdown (for prompts, the skill and `mopt rubric`). */
export function rubricMarkdown(): string {
  const lines: string[] = ["## Signal rubric (score each 1-5)", ""];
  for (const s of SIGNAL_RUBRIC) {
    lines.push(`### ${s.key} - ${s.question}${s.difficulty ? "" : " (risk signal, not difficulty)"}`);
    s.anchors.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
    lines.push("");
  }
  lines.push("## Categories", "");
  for (const [k, v] of Object.entries(CATEGORY_GUIDE)) lines.push(`- \`${k}\`: ${v}`);
  lines.push("", "## Decomposition principles", "");
  DECOMPOSITION_PRINCIPLES.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
  return lines.join("\n");
}
