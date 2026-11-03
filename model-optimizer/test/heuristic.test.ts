import { test } from "node:test";
import assert from "node:assert/strict";
import { planHeuristically } from "../src/planner/heuristic.ts";
import { DecompositionSchema } from "../src/types.ts";
import type { Category, Decomposition } from "../src/types.ts";

function check(d: Decomposition): void {
  DecompositionSchema.parse(d);
  const byId = new Map(d.subsections.map((s) => [s.id, s]));
  assert.equal(byId.size, d.subsections.length, "ids unique");
  for (const s of d.subsections) {
    for (const inp of s.inputs) {
      const prod = byId.get(inp.from);
      assert.ok(prod, `${s.id} input from unknown ${inp.from}`);
      assert.ok(prod.outputs.some((o) => o.name === inp.artifact), `${s.id} input ${inp.artifact} not declared by ${inp.from}`);
      assert.ok(s.depends_on.includes(inp.from));
    }
    for (const dep of s.depends_on) assert.ok(byId.has(dep));
  }
  // acyclic: DFS
  const state = new Map<string, number>();
  const visit = (id: string): void => {
    assert.notEqual(state.get(id), 1, `cycle at ${id}`);
    if (state.get(id) === 2) return;
    state.set(id, 1);
    for (const dep of byId.get(id)?.depends_on ?? []) visit(dep);
    state.set(id, 2);
  };
  for (const s of d.subsections) visit(s.id);
  assert.equal(d.source.planner, "heuristic");
  assert.ok(d.assumptions[0]?.startsWith("Heuristic (offline)"));
}

const MARKDOWN = `# Launch the customer portal

We need a secure customer portal for our clinic so that patients can book appointments.

## Authentication design
Design the authentication architecture for the portal.
- Support OAuth and password login
- Consider security trade-offs

## Booking API
Implement the booking endpoint in TypeScript.
- Create appointments
- Cancel appointments

## Booking tests
Write unit tests for the Booking API with edge cases.
`;

test("markdown plan with headings and nested bullets", () => {
  const d = planHeuristically(MARKDOWN);
  check(d);
  assert.equal(d.title, "Launch the customer portal");
  assert.match(d.goal, /customer portal/);
  assert.match(d.shared_context, /secure customer portal/);
  const [a, b, c, integ] = d.subsections;
  assert.equal(d.subsections.length, 4);
  assert.equal(a?.category, "architecture");
  assert.equal(b?.category, "code_generation");
  assert.equal(c?.category, "testing");
  assert.match(a?.description ?? "", /OAuth/);
  assert.match(b?.description ?? "", /Cancel appointments/);
  assert.equal(integ?.category, "integration");
  assert.ok((a?.signals.expertise ?? 0) >= 4, "security/clinical raises expertise");
  assert.ok(c?.depends_on.includes("S2"), "tests mention the Booking API");
});

test("numbered list is sequential", () => {
  const d = planHeuristically(`1. Extract the invoice fields from the PDFs\n2. Classify each invoice by vendor\n3) Summarize spend per vendor`);
  check(d);
  assert.deepEqual(d.subsections.slice(0, 3).map((s) => s.depends_on), [[], ["S1"], ["S2"]]);
  assert.deepEqual(d.subsections[1]?.inputs, [{ artifact: d.subsections[0]?.outputs[0]?.name, from: "S1" }]);
});

test("numbered item marked independent has no previous dependency", () => {
  const d = planHeuristically(`1. Write the intro\n2. Draft the glossary, independent of the intro\n3. Draft the appendix`);
  assert.deepEqual(d.subsections[1]?.depends_on, []);
  check(d);
});

test("bullet list is independent and gets an integration step", () => {
  const d = planHeuristically(`- Draft a blog post about onboarding\n- Classify the support tickets by urgency\n- Convert the pricing table to CSV`);
  check(d);
  assert.equal(d.subsections.length, 4);
  for (const s of d.subsections.slice(0, 3)) assert.deepEqual(s.depends_on, []);
  const last = d.subsections[3];
  assert.equal(last?.category, "integration");
  assert.deepEqual(last?.depends_on, ["S1", "S2", "S3"]);
  assert.equal(last?.est_input_tokens, 0);
  assert.equal(last?.signals.context, 4);
  assert.equal(last?.integration_notes, "Final deliverable");
  assert.match(d.subsections[0]?.integration_notes ?? "", /S4/);
});

test("bullet referencing an earlier item depends on it", () => {
  const d = planHeuristically(`- Design the database schema\n- Implement the API using the database schema\n- Write the README`);
  check(d);
  assert.deepEqual(d.subsections[1]?.depends_on, ["S1"]);
  assert.deepEqual(d.subsections[2]?.depends_on, []);
});

test("plain prose single task is one subsection without integration", () => {
  const d = planHeuristically("Write a function that parses ISO dates.");
  check(d);
  assert.equal(d.subsections.length, 1);
  assert.notEqual(d.subsections[0]?.category, "integration");
  assert.match(d.goal, /^Complete: /);
});

test("prose sentences sharing an object are grouped", () => {
  const d = planHeuristically("Summarize the quarterly report. The report should be short. Then translate the executive summary into French.");
  check(d);
  assert.ok(d.subsections.length <= 2);
});

test("category detection", () => {
  const cases: [string, Category][] = [
    ["Design the system architecture and weigh the trade-offs", "architecture"],
    ["Prove the algorithm terminates and find the root cause of the hang", "reasoning"],
    ["Implement the login endpoint", "code_generation"],
    ["Refactor and rename the helper module", "code_edit"],
    ["Write unit tests with good coverage", "testing"],
    ["Review and audit the pull request", "review"],
    ["Research and compare vector databases", "research"],
    ["Draft a blog post about the launch", "writing"],
    ["Extract the names and dates from the emails", "extraction"],
    ["Convert the markdown files to HTML", "transformation"],
    ["Classify and tag each ticket", "classification"],
    ["Summarize the meeting notes", "summarization"],
    ["Analyze the sales statistics and metrics", "data_analysis"],
    ["Configure the Docker CI pipeline", "ops"],
    ["Integrate and merge the results", "integration"],
  ];
  for (const [text, cat] of cases) {
    const d = planHeuristically(text);
    assert.equal(d.subsections[0]?.category, cat, text);
    check(d);
  }
});

test("signals follow keywords", () => {
  const easy = planHeuristically("Classify each ticket as bug or feature").subsections[0];
  const hard = planHeuristically("Design a novel distributed consensus protocol with cryptographic signatures for production payments").subsections[0];
  assert.ok(easy && hard);
  assert.ok(easy.signals.reasoning <= 2);
  assert.ok(hard.signals.reasoning >= 5 - 1);
  assert.ok(hard.signals.expertise >= 4);
  assert.ok(hard.signals.criticality >= 4);
  assert.match(hard.rationale, /cryptography/);
  const whole = planHeuristically("Refactor the entire codebase to use async functions").subsections[0];
  assert.ok((whole?.signals.context ?? 0) >= 4);
});

test("repetition detection", () => {
  const d = planHeuristically("Summarize each of the 40 files in the docs folder overnight as a batch");
  const s = d.subsections[0];
  assert.equal(s?.repetitions, 40);
  assert.equal(s?.latency_sensitive, false);
  check(d);
  assert.equal(planHeuristically("Write a parser").subsections[0]?.repetitions, 1);
  assert.equal(planHeuristically("Classify 200 records by region").subsections[0]?.repetitions, 200);
});

test("subsections are capped at 25", () => {
  const lines = Array.from({ length: 60 }, (_, i) => `${i + 1}. ${i % 2 ? "Write unit tests for module" : "Implement function"} number ${i}`);
  const d = planHeuristically(lines.join("\n"));
  check(d);
  assert.ok(d.subsections.length <= 25, String(d.subsections.length));
  const bullets = planHeuristically(Array.from({ length: 30 }, (_, i) => `- Summarize chapter ${i + 1}`).join("\n"));
  check(bullets);
  assert.ok(bullets.subsections.length <= 25);
});

test("title option and open questions", () => {
  const d = planHeuristically("- Fix stuff\n- Tidy up, etc\n- Do it somehow\n- Is this needed?\n- Implement the exporter module for CSV files", { title: "My Plan" });
  check(d);
  assert.equal(d.title, "My Plan");
  assert.ok(d.open_questions.length > 0 && d.open_questions.length <= 3);
});

test("every output passes the schema for odd inputs", () => {
  for (const t of ["", "   ", "?", "# Only a heading", "## A\n## B\n## C", "- a", "1. one\n2. two\n3. three\n4. four"]) {
    check(planHeuristically(t));
  }
});

test("regressions: imperative preamble becomes the goal, 'each of the N' counts, the verb 'book' is not book-length output", () => {
  const dec = planHeuristically(
    "# Clinic app\n\nBuild a booking app for a small practice.\n\n1. Implement the API to list slots, book, reschedule and cancel.\n2. Convert each of the 3 practitioners' weekly schedules into seed data.\n3. Write the docs.",
  );
  assert.equal(dec.goal, "Build a booking app for a small practice.");
  const api = dec.subsections.find((s) => /Implement the API/.test(s.title));
  assert.ok(api && !/large output/.test(api.rationale), api?.rationale);
  const convert = dec.subsections.find((s) => /Convert each/.test(s.title));
  assert.equal(convert?.repetitions, 3);
});

test("regressions: time and measurement units are not repetitions", () => {
  const dec = planHeuristically(
    "- Write the email reminder job that runs 24 hours before each appointment.\n- Poll the queue every 5 minutes and summarise each batch.\n- Translate each of the 12 chapters into Afrikaans.",
  );
  const byTitle = (re: RegExp) => dec.subsections.find((s) => re.test(s.title));
  assert.equal(byTitle(/reminder/)?.repetitions, 1);
  assert.equal(byTitle(/Poll the queue/)?.repetitions, 1);
  assert.equal(byTitle(/Translate/)?.repetitions, 12);
});
