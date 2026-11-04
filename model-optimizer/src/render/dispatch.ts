/** Claude Code dispatch sheet: instructions for an orchestrator session to run a plan with subagents. */
import type { Config, RoutedPlan, Routing, Subsection } from "../types.ts";
import { defaultCatalog } from "../catalog.ts";
import { ARTIFACT_DIR, buildReviewPrompt, buildTaskPrompt } from "../prompts.ts";
import { usd } from "../format.ts";

export interface DispatchOptions {
  /** Path of the saved plan JSON, used in the `mopt log` commands. */
  planPath?: string;
}

const alias = (id: string): string => {
  try {
    return defaultCatalog.get(id).alias;
  } catch {
    return id;
  }
};
const cfg = (c: Config): string => `${alias(c.model)} (${c.effort})`;
const cell = (v: unknown): string => String(v).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/** 3-5 word description derived from the title. */
function shortDescription(title: string): string {
  const words = title.replace(/[`"']/g, "").split(/\s+/).filter(Boolean);
  const stop = new Set(["and", "or", "the", "a", "an", "of", "to", "for", "in", "on", "with"]);
  const out = words.slice(0, 5);
  while (out.length > 3 && stop.has(out[out.length - 1]!.toLowerCase())) out.pop();
  return out.join(" ");
}

const WORKER = "mopt-worker";
const REVIEWER = "mopt-reviewer";

function agentBlock(fields: Record<string, string>): string[] {
  return ["```", ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`), "```"];
}

function reviewers(r: Routing): { label: string; model: string; effort: string }[] {
  const out: { label: string; model: string; effort: string }[] = [];
  if (r.verification.judge) out.push({ label: "Reviewer", model: alias(r.verification.judge.model), effort: r.verification.judge.effort });
  if (r.verification.second_judge) {
    out.push({ label: "Second reviewer (different model)", model: alias(r.verification.second_judge.model), effort: r.verification.second_judge.effort });
  }
  return out;
}

function verifyText(r: Routing): string {
  switch (r.verification.method) {
    case "tests":
      return "run the project's mechanical checks (tests, type-check, schema validation) until they pass, then the reviewer subagent below must pass every acceptance criterion.";
    case "dual-judge":
      return "two independent reviewer subagents on different models must BOTH return VERDICT: PASS. Run the second only after the first passes.";
    case "judge":
      return "the reviewer subagent below must return VERDICT: PASS on every acceptance criterion.";
    case "human":
      return "a human reviews the artifacts against the acceptance criteria.";
    default:
      return "self-check: accept only if every one of the subagent's own lines is PASS.";
  }
}

export function renderDispatch(plan: RoutedPlan, opts: DispatchOptions = {}): string {
  const dec = plan.decomposition;
  const planPath = opts.planPath ?? "plan.json";
  const L: string[] = [];
  const subs = new Map<string, Subsection>(dec.subsections.map((s) => [s.id, s]));
  const routes = new Map<string, Routing>(plan.routes.map((r) => [r.id, r]));
  const waves = plan.metrics.schedule.waves;

  L.push(`# Dispatch plan: ${dec.title}`, "", dec.goal.trim(), "");
  L.push(
    "## How to run this",
    "",
    "You are the orchestrator. Carry out this plan with subagents, one subsection each, using the Agent tool. The quality bar is that no subsection is accepted with a known failure.",
    "",
    "1. Run the waves in order. Within a wave, launch every subagent in parallel, in ONE message containing several Agent tool calls; wait for the whole wave before starting the next.",
    `2. Pass the \`model\` AND the \`effort\` given for each subsection on its Agent call. This plan explicitly asks for those effort levels. Use \`subagent_type: ${WORKER}\` (listed as \`model-optimizer:${WORKER}\` when the plugin is installed); if it is not available, use \`general-purpose\`, since every prompt is self-contained.`,
    `3. Verify every subsection before anything depends on it, exactly as its "Verify" line says. Reviewers are separate subagents (\`${REVIEWER}\`, or \`general-purpose\` with the review prompt) on the model and effort given. Never review your own dispatch by assumption: a subsection is done only when every check and reviewer passes.`,
    "4. On any failure, re-dispatch the same prompt plus a \"## Feedback on a previous attempt\" section quoting exactly what failed, on the next model in that subsection's escalation ladder, then verify again. If the ladder is exhausted, stop that branch and report it to the user; do not start its dependents.",
    "5. Never run a subsection on a weaker model or a lower effort than assigned.",
    "6. Get a human sign-off on any subsection marked \"Human review: required\" before its dependents start.",
    "7. After each attempt, record the outcome with `mopt log` (commands at the end), including the token count and duration Claude Code reports for the subagent.",
    "",
  );

  L.push("## Summary", "");
  L.push(`| Wave | ID | Title | Model | Effort | Verification | ${plan.options.mode === "agent" ? "Expected usage (API-eq.)" : "Expected cost"} |`, "| --- | --- | --- | --- | --- | --- | --- |");
  waves.forEach((w, i) => {
    for (const id of w) {
      const r = routes.get(id);
      if (!r) continue;
      L.push(`| ${i + 1} | ${cell(id)} | ${cell(r.title)} | ${r.agent_alias} | ${r.effort} | ${r.verification.method} | ${usd(r.cost.expected)} |`);
    }
  });
  L.push("");

  waves.forEach((w, i) => {
    L.push(`## Wave ${i + 1}`, "");
    if (w.length > 1) L.push(`Launch these ${w.length} subagents in parallel, in one message.`, "");
    for (const id of w) {
      const r = routes.get(id);
      const sub = subs.get(id);
      if (!r || !sub) continue;
      const upstream = sub.inputs.filter((x) => x.from !== "project").map((x) => ({ artifact: x.artifact, from: x.from }));
      const prompt = buildTaskPrompt({ decomposition: dec, sub, route: r, upstream, mode: "agent" });
      L.push(`### ${id} - ${sub.title}`, "");
      L.push(...agentBlock({ description: shortDescription(sub.title), subagent_type: WORKER, model: r.agent_alias, effort: r.effort }), "");
      L.push("Prompt:", "", "````", prompt, "````", "");
      L.push(`Verify: ${verifyText(r)}`, "");
      const revs = reviewers(r);
      if (revs.length && r.verification.method !== "self-check") {
        const review = buildReviewPrompt(dec, sub, r.verification.method === "tests");
        for (const rv of revs) {
          L.push(`${rv.label}:`, "", ...agentBlock({ description: `Review ${id}`, subagent_type: REVIEWER, model: rv.model, effort: rv.effort }), "");
        }
        L.push("Review prompt (same for every reviewer):", "", "````", review, "````", "");
      }
      if (r.verification.human_review) L.push("Human review: required. Get a human sign-off before dependents start.", "");
      L.push(`If it fails: ${r.escalation.length ? r.escalation.map(cfg).join(", then ") : "no higher rung; report the failure to the user"}.`, "");
    }
  });

  const integ = plan.routes.filter((r) => r.category === "integration").map((r) => r.id);
  L.push("## Integration", "");
  L.push(
    integ.length
      ? `Integration happens in ${integ.join(", ")}. Make sure every upstream subsection has passed verification first.`
      : "No dedicated integration subsection; after the last wave, check that the outputs fit together yourself.",
    `Subagents write their artifacts under \`${ARTIFACT_DIR}/\`; read them from there when verifying and integrating.`,
    "",
  );

  L.push("## Record outcomes", "");
  L.push(
    "Log every attempt so the router learns from it. Run one command per attempt, with the model and effort actually used. `--result` takes `pass` or `fail`. Examples, using each subsection's assigned model:",
    "",
    "```sh",
  );
  for (const r of plan.routes) {
    L.push(`mopt log --plan ${planPath} --id ${r.id} --model ${r.agent_alias} --effort ${r.effort} --result pass --total-tokens <subagent tokens> --duration-ms <duration>`);
  }
  L.push("```", "");
  return L.join("\n");
}
