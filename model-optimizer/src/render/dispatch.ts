/** Claude Code dispatch sheet: instructions for an orchestrator session to run a plan with subagents. */
import type { Config, RoutedPlan, Routing, Subsection } from "../types.ts";
import { defaultCatalog } from "../catalog.ts";
import { ARTIFACT_DIR, buildTaskPrompt } from "../prompts.ts";
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

function verifyText(r: Routing): string {
  const j = r.verification.judge ? alias(r.verification.judge.model) : undefined;
  switch (r.verification.method) {
    case "tests":
      return "tests. Run the project's tests, type-check or schema validation and confirm every acceptance criterion.";
    case "judge":
      return `judge (${j ?? "sonnet"}). Check each acceptance criterion yourself, or with a cheap reviewer subagent on the ${j ?? "sonnet"} model.`;
    case "human":
      return "human. Ask a human to review the artifacts against the acceptance criteria.";
    default:
      return "self-check. Trust the subagent's own PASS lines unless something looks wrong.";
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
    "You are the orchestrator. Carry out this plan with subagents, one subsection each, using the Agent tool.",
    "",
    "1. Run the waves in order.",
    "2. Within a wave, launch every subagent in parallel, in ONE message containing several Agent tool calls.",
    "3. Wait for the whole wave to finish before starting the next.",
    "4. After each subagent returns, verify its artifacts against the acceptance criteria. A \"tests\" verification means running the project's tests, type-check or schema validation. \"judge\" means checking each criterion yourself, or with a cheap reviewer subagent on the judge model. \"self-check\" means trusting the subagent's own PASS lines unless something looks wrong.",
    "5. On failure, re-dispatch the same prompt plus a \"Feedback on a previous attempt\" section listing what failed, on the next model in that subsection's escalation ladder.",
    "6. Never run a subsection on a weaker model than the one assigned.",
    "7. Ask a human to sign off any subsection flagged human-review before its dependents start.",
    "",
  );

  L.push("## Summary", "");
  L.push("| Wave | ID | Title | Model | Effort | Verification | Expected cost |", "| --- | --- | --- | --- | --- | --- | --- |");
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
      L.push("```", `description: ${shortDescription(sub.title)}`, "subagent_type: general-purpose", `model: ${r.agent_alias}`, "```", "");
      L.push("Prompt:", "", "````", prompt, "````", "");
      L.push(`Verify: ${verifyText(r)}`, "");
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
  for (const r of plan.routes) L.push(`mopt log --plan ${planPath} --id ${r.id} --model ${r.agent_alias} --effort ${r.effort} --result pass`);
  L.push("```", "");
  return L.join("\n");
}
