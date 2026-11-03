import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ARTIFACT_DIR,
  artifactPath,
  buildJudgePrompt,
  buildTaskPrompt,
  effortGuidance,
  parseArtifacts,
  projectBrief,
} from "../src/prompts.ts";
import type { UpstreamArtifact } from "../src/prompts.ts";
import { routePlan } from "../src/router.ts";
import { DecompositionSchema, EFFORTS } from "../src/types.ts";

const sample = () =>
  DecompositionSchema.parse(JSON.parse(readFileSync(new URL("../examples/decomposition.json", import.meta.url), "utf8")));

// ---- parseArtifacts --------------------------------------------------------

test("parseArtifacts finds artifacts by exact name and extracts notes", () => {
  const text = `<artifact name="api-spec">
openapi: 3.1
</artifact>
<artifact name="schema">
CREATE TABLE t();
</artifact>
<notes>
Assumed UTC.
PASS - criterion - ok
</notes>`;
  const r = parseArtifacts(text, ["api-spec", "schema"]);
  assert.deepEqual(r.artifacts, { "api-spec": "openapi: 3.1", schema: "CREATE TABLE t();" });
  assert.deepEqual(r.missing, []);
  assert.equal(r.notes, "Assumed UTC.\nPASS - criterion - ok");
});

test("parseArtifacts matches names case- and separator-insensitively, keyed by the expected name", () => {
  const text = `<artifact name="DESIGN_DOC">a</artifact><artifact name="Api Spec">b</artifact><artifact name="x-y">c</artifact>`;
  const r = parseArtifacts(text, ["design-doc", "api_spec", "X Y"]);
  assert.deepEqual(r.artifacts, { "design-doc": "a", api_spec: "b", "X Y": "c" });
  assert.deepEqual(r.missing, []);
});

test("parseArtifacts reports missing artifacts", () => {
  const r = parseArtifacts(`<artifact name="one">1</artifact>`, ["one", "two", "three"]);
  assert.deepEqual(Object.keys(r.artifacts), ["one"]);
  assert.deepEqual(r.missing, ["two", "three"]);
});

test("parseArtifacts reports empty and whitespace-only artifacts as missing", () => {
  const r = parseArtifacts(`<artifact name="a"></artifact><artifact name="b">\n  \n</artifact><artifact name="c">ok</artifact>`, ["a", "b", "c"]);
  assert.deepEqual(r.artifacts, { c: "ok" });
  assert.deepEqual(r.missing, ["a", "b"]);
});

test("parseArtifacts tolerates extra attributes, whitespace in the tag and multi-line bodies", () => {
  const r = parseArtifacts(`<artifact  name = "code" format="ts">\n\nline1\n  line2\n\n</artifact>`, ["code"]);
  assert.equal(r.artifacts.code, "line1\n  line2");
});

test("parseArtifacts ignores unexpected artifacts and handles text with no tags", () => {
  const r = parseArtifacts(`<artifact name="extra">x</artifact>`, ["wanted"]);
  assert.deepEqual(r.artifacts, {});
  assert.deepEqual(r.missing, ["wanted"]);
  assert.equal(r.notes, "");
  const none = parseArtifacts("just prose", []);
  assert.deepEqual(none, { artifacts: {}, missing: [], notes: "" });
});

test("parseArtifacts keeps artifact content that contains angle brackets and code", () => {
  const body = "const a: Array<string> = [];\nif (a.length > 0) { return <div/>; }";
  const r = parseArtifacts(`<artifact name="c">\n${body}\n</artifact>`, ["c"]);
  assert.equal(r.artifacts.c, body);
});

// ---- buildTaskPrompt -------------------------------------------------------

function fixture(id: string) {
  const dec = sample();
  const sub = dec.subsections.find((s) => s.id === id)!;
  const plan = routePlan({ decomposition: dec });
  const route = plan.routes.find((r) => r.id === id)!;
  const upstream: UpstreamArtifact[] = sub.inputs
    .filter((i) => i.from !== "project")
    .map((i) => ({ artifact: i.artifact, from: i.from, content: `CONTENT-OF-${i.artifact}\nsecond line` }));
  return { dec, sub, route, upstream };
}

test("api mode inlines upstream content inside <artifact> tags", () => {
  const { dec, sub, route, upstream } = fixture("S7");
  assert.ok(upstream.length > 0);
  const p = buildTaskPrompt({ decomposition: dec, sub, route, upstream, mode: "api" });
  for (const u of upstream) {
    assert.ok(p.includes(`<artifact name="${u.artifact}" from="${u.from}">\n${u.content}\n</artifact>`), u.artifact);
  }
  assert.ok(!p.includes(ARTIFACT_DIR), "api mode does not reference artifact files");
  assert.ok(!p.includes("## Effort"));
  assert.ok(!p.includes(projectBrief(dec)), "the brief is the cached system prefix in api mode");
});

test("api mode falls back to a file reference for upstream without content", () => {
  const { dec, sub, upstream } = fixture("S7");
  const p = buildTaskPrompt({ decomposition: dec, sub, upstream: upstream.map(({ content: _c, ...u }) => u), mode: "api" });
  assert.ok(!p.includes("<artifact name="));
  assert.ok(p.includes(artifactPath(upstream[0]!.artifact)));
});

test("agent mode references artifactPath files, not inlined content, and includes effort guidance and the brief", () => {
  const { dec, sub, route, upstream } = fixture("S7");
  const p = buildTaskPrompt({ decomposition: dec, sub, route, upstream, mode: "agent" });
  for (const u of upstream) {
    assert.ok(p.includes(artifactPath(u.artifact)), u.artifact);
    assert.ok(!p.includes(u.content!), `${u.artifact} content should not be inlined`);
  }
  assert.ok(p.includes("## Effort"));
  assert.ok(p.includes(effortGuidance(route.effort)));
  assert.ok(p.includes(projectBrief(dec)));
  assert.ok(p.includes(`${ARTIFACT_DIR}/<name>.md`));
  assert.ok(p.includes("## When you finish"));
});

test("agent mode omits effort guidance when no route is given", () => {
  const { dec, sub, upstream } = fixture("S7");
  assert.ok(!buildTaskPrompt({ decomposition: dec, sub, upstream, mode: "agent" }).includes("## Effort"));
});

test("effortGuidance is defined and distinct for low, medium, high and the top tier", () => {
  const texts = EFFORTS.map((e) => effortGuidance(e));
  assert.ok(texts.every((t) => t.length > 10));
  assert.equal(new Set(texts).size, 4); // xhigh and max share guidance
  assert.equal(effortGuidance("xhigh"), effortGuidance("max"));
});

test("feedback text appears when given and not otherwise", () => {
  const { dec, sub, route, upstream } = fixture("S3");
  for (const mode of ["api", "agent"] as const) {
    const without = buildTaskPrompt({ decomposition: dec, sub, route, upstream, mode });
    assert.ok(!without.includes("Feedback on a previous attempt"));
    const withFb = buildTaskPrompt({ decomposition: dec, sub, route, upstream, mode, feedback: "  Criterion 2 failed: missing pagination.  " });
    assert.ok(withFb.includes("## Feedback on a previous attempt"), mode);
    assert.ok(withFb.includes("Criterion 2 failed: missing pagination."), mode);
  }
});

test("every acceptance criterion and output name appears in the prompt, for every subsection and mode", () => {
  const dec = sample();
  const plan = routePlan({ decomposition: dec });
  for (const sub of dec.subsections) {
    const route = plan.routes.find((r) => r.id === sub.id)!;
    const upstream = sub.inputs.filter((i) => i.from !== "project").map((i) => ({ artifact: i.artifact, from: i.from, content: "x" }));
    for (const mode of ["api", "agent"] as const) {
      const p = buildTaskPrompt({ decomposition: dec, sub, route, upstream, mode });
      sub.acceptance_criteria.forEach((c, i) => {
        assert.ok(p.includes(c), `${sub.id} ${mode} criterion`);
        assert.ok(p.includes(`${i + 1}. ${c}`));
      });
      for (const o of sub.outputs) assert.ok(p.includes(`\`${o.name}\``), `${sub.id} ${mode} output ${o.name}`);
      assert.ok(p.includes(sub.id) && p.includes(sub.title));
      assert.ok(p.includes(sub.description.trim()));
      if (sub.integration_notes.trim()) assert.ok(p.includes(sub.integration_notes.trim()));
    }
  }
});

test("project-sourced inputs are listed as existing material, and no-input subsections say so", () => {
  const dec = sample();
  const withProject = dec.subsections.find((s) => s.inputs.some((i) => i.from === "project"));
  if (withProject) {
    const p = buildTaskPrompt({ decomposition: dec, sub: withProject, upstream: [], mode: "api" });
    for (const i of withProject.inputs.filter((x) => x.from === "project")) assert.ok(p.includes(`\`${i.artifact}\``));
    assert.ok(p.includes("Existing project material"));
  }
  const bare = { ...dec.subsections[0]!, inputs: [] };
  assert.ok(buildTaskPrompt({ decomposition: dec, sub: bare, upstream: [], mode: "api" }).includes("None beyond the project brief."));
});

test("artifactPath sanitises names into safe file names", () => {
  assert.equal(artifactPath("api-spec"), `${ARTIFACT_DIR}/api-spec.md`);
  assert.equal(artifactPath("my spec/v2"), `${ARTIFACT_DIR}/my-spec-v2.md`);
  assert.ok(!artifactPath("../../etc/passwd").includes("/../"));
});

test("projectBrief includes the title, goal, shared context and assumptions", () => {
  const dec = DecompositionSchema.parse({
    title: "My Title",
    goal: "My Goal",
    shared_context: "  Brief text.  ",
    assumptions: ["Assume A", "Assume B"],
    subsections: sample().subsections,
  });
  const b = projectBrief(dec);
  for (const t of ["My Title", "My Goal", "Brief text.", "- Assume A", "- Assume B"]) assert.ok(b.includes(t), t);
  assert.ok(!projectBrief({ ...dec, shared_context: " ", assumptions: [] }).includes("Assumptions"));
});

test("buildJudgePrompt includes criteria, outputs and the deliverable", () => {
  const { sub } = fixture("S2");
  const p = buildJudgePrompt(sub, "  THE DELIVERABLE  ");
  sub.acceptance_criteria.forEach((c, i) => assert.ok(p.includes(`${i + 1}. ${c}`)));
  for (const o of sub.outputs) assert.ok(p.includes(o.name));
  assert.ok(p.includes("<deliverable>\nTHE DELIVERABLE\n</deliverable>"));
});

test("a task prompt's required outputs round-trip through parseArtifacts", () => {
  const { sub } = fixture("S2");
  const names = sub.outputs.map((o) => o.name);
  const response = names.map((n) => `<artifact name="${n}">\nbody of ${n}\n</artifact>`).join("\n") + "\n<notes>\nall good\n</notes>";
  const r = parseArtifacts(response, names);
  assert.deepEqual(r.missing, []);
  for (const n of names) assert.equal(r.artifacts[n], `body of ${n}`);
  assert.equal(r.notes, "all good");
});
