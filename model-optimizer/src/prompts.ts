/**
 * How each subsection is briefed - the "in the correct way" half of routing.
 *
 * One definition serves two execution modes:
 *   - "api":   the executor calls the Messages API; upstream artifacts are inlined.
 *   - "agent": a Claude Code subagent; artifacts are exchanged as files under
 *              .mopt/artifacts so parallel subagents can hand work to each other.
 *
 * The system prompt and the shared brief form a stable prefix, so every call on
 * the same model can read it from the prompt cache.
 */
import type { Decomposition, Effort, Routing, Subsection } from "./types.ts";

export const ARTIFACT_DIR = ".mopt/artifacts";

export const EXECUTOR_SYSTEM_PROMPT = `You are one specialist on a team completing a larger project. The project has been divided into subsections and you are responsible for exactly one of them. Other specialists handle the rest, and an integrator assembles everyone's work, so your output must match the interface you are given exactly.

How to work:
- Do exactly the subsection you are given. Do not redo upstream work or start downstream work. If an upstream artifact looks wrong, say so in your notes, then do your best with it.
- The acceptance criteria are the definition of done. Check your output against each one before you finish.
- Keep names, types, file paths and terminology identical to the upstream artifacts and the project brief, because downstream subsections depend on them.
- If information is missing, make the smallest reasonable assumption, record it in your notes, and continue.
- Prefer complete, working output over commentary. Never leave placeholders such as "rest unchanged" or "TODO: implement".

Output format:
- Wrap each required artifact in <artifact name="EXACT-NAME"> and </artifact>, using exactly the names listed under "Required outputs". Put the complete content inside.
- After the artifacts, add <notes> and </notes> containing your assumptions, any problems you noticed upstream, and one line per acceptance criterion in the form "PASS|FAIL - criterion - reason".
- Write nothing outside these tags.`;

export const JUDGE_SYSTEM_PROMPT = `You are a meticulous reviewer. You decide whether a deliverable meets its acceptance criteria.

Judge only against the stated acceptance criteria and required outputs. Be strict about correctness and completeness, and lenient about wording and style. Do not reward length. A criterion is met only if the deliverable itself shows it is met; a claim in the author's notes is not evidence. If a required artifact is missing or truncated, the deliverable fails.`;

/** The shared brief, placed after the system prompt so it is part of the cached prefix. */
export function projectBrief(dec: Decomposition): string {
  const lines = [`# Project brief: ${dec.title}`, "", `Goal: ${dec.goal}`];
  if (dec.shared_context.trim()) lines.push("", dec.shared_context.trim());
  if (dec.assumptions.length) lines.push("", "Assumptions:", ...dec.assumptions.map((a) => `- ${a}`));
  return lines.join("\n");
}

/** Plain-language effort guidance, for agents where effort cannot be set as a parameter. */
export function effortGuidance(effort: Effort): string {
  switch (effort) {
    case "low":
      return "Routine work: be efficient, keep the output focused, and do not over-think it.";
    case "medium":
      return "Standard work: reason as needed, and put correctness ahead of length.";
    case "high":
      return "Demanding work: think through the edge cases and the interfaces before you write.";
    case "xhigh":
    case "max":
      return "Hard work: reason thoroughly, consider alternatives, and verify every acceptance criterion explicitly before you finish.";
  }
}

export interface UpstreamArtifact {
  artifact: string;
  from: string;
  /** Inlined content (api mode). When absent in agent mode, the subagent reads the artifact file. */
  content?: string;
}

export interface TaskPromptArgs {
  decomposition: Decomposition;
  sub: Subsection;
  route?: Routing;
  upstream: UpstreamArtifact[];
  /** Feedback from a failed attempt, for an escalated retry. */
  feedback?: string;
  mode: "api" | "agent";
}

export function artifactPath(name: string): string {
  return `${ARTIFACT_DIR}/${name.replace(/[^A-Za-z0-9._-]+/g, "-")}.md`;
}

/** The user-turn prompt for one subsection. */
export function buildTaskPrompt(args: TaskPromptArgs): string {
  const { decomposition: dec, sub, route, upstream, feedback, mode } = args;
  const out: string[] = [];
  if (mode === "agent") out.push(projectBrief(dec), "");
  out.push(`# Your subsection: ${sub.id} - ${sub.title}`, "", sub.description.trim(), "");

  out.push("## Inputs");
  const fromProject = sub.inputs.filter((i) => i.from === "project").map((i) => i.artifact);
  if (!upstream.length && !fromProject.length) out.push("None beyond the project brief.");
  for (const u of upstream) {
    if (mode === "api" && u.content !== undefined) {
      out.push(`<artifact name="${u.artifact}" from="${u.from}">`, u.content.trim(), "</artifact>");
    } else {
      out.push(`- \`${u.artifact}\` from ${u.from}: read \`${artifactPath(u.artifact)}\`.`);
    }
  }
  if (fromProject.length) {
    out.push(`- Existing project material: ${fromProject.map((n) => `\`${n}\``).join(", ")}${mode === "api" ? " (described in the project brief)" : " (find it in the repository or ask the orchestrator)"}.`);
  }
  out.push("");

  out.push("## Required outputs");
  for (const o of sub.outputs) out.push(`- \`${o.name}\` (${o.format}): ${o.description}`);
  if (mode === "agent") {
    out.push(
      "",
      `Save each artifact to \`${ARTIFACT_DIR}/<name>.md\` (for example \`${artifactPath(sub.outputs[0]?.name ?? "output")}\`). When an artifact is code, also write the real files into the project and list their paths in the artifact file.`,
    );
  }
  out.push("", "## Acceptance criteria");
  sub.acceptance_criteria.forEach((c, i) => out.push(`${i + 1}. ${c}`));
  if (sub.integration_notes.trim()) out.push("", "## How this fits the project", sub.integration_notes.trim());

  if (mode === "agent" && route) out.push("", "## Effort", effortGuidance(route.effort));
  if (feedback) {
    out.push(
      "",
      "## Feedback on a previous attempt",
      "A previous attempt at this subsection did not pass review. Fix every point below and keep whatever was already right:",
      feedback.trim(),
    );
  }
  if (mode === "agent") {
    out.push(
      "",
      "## When you finish",
      "Reply with a short summary, the artifact paths you wrote, and one line per acceptance criterion: PASS or FAIL, then the reason.",
    );
  }
  return out.join("\n");
}

/** The judge's user turn: the criteria plus the candidate deliverable. */
export function buildJudgePrompt(sub: Subsection, deliverable: string): string {
  return [
    `# Subsection under review: ${sub.id} - ${sub.title}`,
    "",
    sub.description.trim(),
    "",
    "## Required outputs",
    ...sub.outputs.map((o) => `- ${o.name} (${o.format}): ${o.description}`),
    "",
    "## Acceptance criteria",
    ...sub.acceptance_criteria.map((c, i) => `${i + 1}. ${c}`),
    "",
    "## Deliverable",
    "<deliverable>",
    deliverable.trim(),
    "</deliverable>",
    "",
    "Assess each acceptance criterion in order. The deliverable passes only if every criterion is met and every required output is present and complete. In feedback, list concretely what must change for a retry to pass.",
  ].join("\n");
}

const ARTIFACT_RE = /<artifact\s+name\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/artifact>/g;
const NOTES_RE = /<notes>([\s\S]*?)<\/notes>/;

const normalizeName = (n: string) => n.trim().toLowerCase().replace(/[\s_]+/g, "-");

/** Extracts the declared artifacts from a model response; reports any that are missing or empty. */
export function parseArtifacts(
  text: string,
  expected: string[],
): { artifacts: Record<string, string>; missing: string[]; notes: string } {
  const found = new Map<string, string>();
  for (const m of text.matchAll(ARTIFACT_RE)) {
    const name = m[1] ?? "";
    const body = (m[2] ?? "").replace(/^\n+|\s+$/g, "");
    found.set(normalizeName(name), body);
  }
  const artifacts: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of expected) {
    const body = found.get(normalizeName(name));
    if (body && body.trim()) artifacts[name] = body;
    else missing.push(name);
  }
  return { artifacts, missing, notes: (NOTES_RE.exec(text)?.[1] ?? "").trim() };
}
