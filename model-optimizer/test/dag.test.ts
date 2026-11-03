import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyzeGraph, asapSchedule, criticalPath, topoSort } from "../src/dag.ts";
import { DecompositionSchema } from "../src/types.ts";
import type { DecompositionInput } from "../src/types.ts";

const sample = () =>
  DecompositionSchema.parse(JSON.parse(readFileSync(new URL("../examples/decomposition.json", import.meta.url), "utf8")));

type SubIn = DecompositionInput["subsections"][number];
const sub = (id: string, extra: Record<string, unknown> = {}): SubIn =>
  ({
    id,
    title: `Title ${id}`,
    description: `Do ${id}`,
    category: "other",
    signals: { reasoning: 2, ambiguity: 2, expertise: 2, context: 2, output: 2, horizon: 2, criticality: 2, verifiability: 3 },
    outputs: [{ name: `${id}-out`, description: "out" }],
    acceptance_criteria: ["works"],
    est_input_tokens: 500,
    est_output_tokens: 500,
    ...extra,
  }) as SubIn;
const mk = (subs: SubIn[]) => DecompositionSchema.parse({ title: "T", goal: "G", subsections: subs });
const codes = (a: ReturnType<typeof analyzeGraph>) => a.issues.map((i) => i.code);

test("sample decomposition analyses cleanly", () => {
  const a = analyzeGraph(sample());
  assert.equal(a.hasCycle, false);
  assert.equal(a.issues.filter((i) => i.level === "error").length, 0);
  assert.equal(a.order.length, 7);
  assert.deepEqual(a.sinks, ["S7"]);
});

test("duplicate id gives E_DUPLICATE_ID", () => {
  const a = analyzeGraph(mk([sub("A"), sub("A")]));
  assert.ok(codes(a).includes("E_DUPLICATE_ID"));
});

test("unknown dependency gives E_UNKNOWN_DEPENDENCY and is removed", () => {
  const a = analyzeGraph(mk([sub("A", { depends_on: ["ZZ"] }), sub("B", { depends_on: ["A"] })]));
  assert.ok(codes(a).includes("E_UNKNOWN_DEPENDENCY"));
  assert.deepEqual(a.decomposition.subsections[0]?.depends_on, []);
  assert.deepEqual(a.decomposition.subsections[1]?.depends_on, ["A"]);
});

test("a cycle gives E_CYCLE, hasCycle and a readable path", () => {
  const a = analyzeGraph(mk([sub("A", { depends_on: ["C"] }), sub("B", { depends_on: ["A"] }), sub("C", { depends_on: ["B"] })]));
  assert.equal(a.hasCycle, true);
  assert.deepEqual(a.order, []);
  assert.deepEqual(a.waves, []);
  const issue = a.issues.find((i) => i.code === "E_CYCLE");
  assert.ok(issue);
  assert.equal(issue.level, "error");
  assert.match(issue.message, /(\w+ -> )+\w+/);
  // path starts and ends at the same node and contains all three
  const path = /Dependency cycle: ([^.]+)\./.exec(issue.message)?.[1]?.split(" -> ") ?? [];
  assert.equal(path[0], path[path.length - 1]);
  assert.deepEqual([...new Set(path)].sort(), ["A", "B", "C"]);
});

test("topoSort reports a cycle path and an order for a DAG", () => {
  const ok = topoSort(mk([sub("A"), sub("B", { depends_on: ["A"] })]).subsections);
  assert.deepEqual(ok.order, ["A", "B"]);
  assert.equal(ok.cycle, undefined);
  const bad = topoSort(mk([sub("A", { depends_on: ["B"] }), sub("B", { depends_on: ["A"] })]).subsections);
  assert.ok(bad.cycle && bad.cycle.length >= 3);
});

test("input from a producer not waited for adds a dependency with W_DEPENDENCY_ADDED", () => {
  const dec = mk([sub("A"), sub("B", { inputs: [{ artifact: "A-out", from: "A" }] })]);
  const a = analyzeGraph(dec);
  const w = a.issues.find((i) => i.code === "W_DEPENDENCY_ADDED");
  assert.ok(w);
  assert.equal(w.subsection, "B");
  assert.deepEqual(a.decomposition.subsections[1]?.depends_on, ["A"]);
});

test("input from a producer that is waited for transitively gives no warning", () => {
  const dec = mk([
    sub("A"),
    sub("B", { depends_on: ["A"] }),
    sub("C", { depends_on: ["B"], inputs: [{ artifact: "A-out", from: "A" }] }),
  ]);
  const a = analyzeGraph(dec);
  assert.ok(!codes(a).includes("W_DEPENDENCY_ADDED"));
  assert.deepEqual(a.decomposition.subsections[2]?.depends_on, ["B"]);
});

test("input from a directly waited producer gives no warning", () => {
  const a = analyzeGraph(mk([sub("A"), sub("B", { depends_on: ["A"], inputs: [{ artifact: "A-out", from: "A" }] })]));
  assert.ok(!codes(a).includes("W_DEPENDENCY_ADDED"));
});

test("unknown artifact name gives W_UNKNOWN_ARTIFACT with a Did you mean hint when close", () => {
  const dec = mk([
    sub("A", { outputs: [{ name: "api-design-doc", description: "d" }] }),
    sub("B", { depends_on: ["A"], inputs: [{ artifact: "api-design", from: "A" }] }),
  ]);
  const w = analyzeGraph(dec).issues.find((i) => i.code === "W_UNKNOWN_ARTIFACT");
  assert.ok(w);
  assert.match(w.message, /Did you mean "api-design-doc"\?/);
});

test("unknown artifact name with nothing close has no hint", () => {
  const dec = mk([
    sub("A", { outputs: [{ name: "alpha", description: "d" }] }),
    sub("B", { depends_on: ["A"], inputs: [{ artifact: "zzz", from: "A" }] }),
  ]);
  const w = analyzeGraph(dec).issues.find((i) => i.code === "W_UNKNOWN_ARTIFACT");
  assert.ok(w);
  assert.doesNotMatch(w.message, /Did you mean/);
});

test("artifact names match case- and separator-insensitively", () => {
  const dec = mk([
    sub("A", { outputs: [{ name: "Design Doc", description: "d" }] }),
    sub("B", { depends_on: ["A"], inputs: [{ artifact: "design_doc", from: "A" }] }),
  ]);
  assert.ok(!codes(analyzeGraph(dec)).includes("W_UNKNOWN_ARTIFACT"));
});

test("waves respect dependencies", () => {
  const a = analyzeGraph(sample());
  const wave = new Map<string, number>();
  a.waves.forEach((w, i) => w.forEach((id) => wave.set(id, i)));
  assert.equal(wave.size, 7);
  for (const s of a.decomposition.subsections) {
    for (const d of s.depends_on) assert.ok((wave.get(d) as number) < (wave.get(s.id) as number), `${d} before ${s.id}`);
  }
  assert.deepEqual(a.waves[0], ["S1"]);
});

test("two or more sinks and no integration subsection gives W_NO_INTEGRATION", () => {
  const a = analyzeGraph(mk([sub("A"), sub("B", { depends_on: ["A"] }), sub("C", { depends_on: ["A"] })]));
  assert.deepEqual(a.sinks.sort(), ["B", "C"]);
  assert.ok(codes(a).includes("W_NO_INTEGRATION"));
});

test("an integration subsection suppresses W_NO_INTEGRATION", () => {
  const a = analyzeGraph(
    mk([sub("A"), sub("B", { depends_on: ["A"] }), sub("C", { depends_on: ["A"] }), sub("D", { category: "integration", depends_on: ["B", "C"] })]),
  );
  assert.ok(!codes(a).includes("W_NO_INTEGRATION"));
});

test("the input decomposition is not mutated", () => {
  const dec = mk([
    sub("A", { depends_on: ["ZZ", "A"] }),
    sub("B", { inputs: [{ artifact: "nope", from: "A" }, { artifact: "x", from: "ghost" }] }),
  ]);
  const before = structuredClone(dec);
  const a = analyzeGraph(dec);
  assert.deepEqual(dec, before);
  assert.notEqual(a.decomposition, dec);
  assert.notDeepEqual(a.decomposition, dec);
});

test("criticalPath picks the longest path", () => {
  const dec = mk([
    sub("A"),
    sub("B", { depends_on: ["A"] }),
    sub("C", { depends_on: ["A"] }),
    sub("D", { depends_on: ["B", "C"] }),
  ]);
  const { order } = topoSort(dec.subsections);
  const dur: Record<string, number> = { A: 1, B: 10, C: 2, D: 3 };
  const cp = criticalPath(dec.subsections, order, (id) => dur[id] as number);
  assert.deepEqual(cp.path, ["A", "B", "D"]);
  assert.equal(cp.seconds, 14);
});

test("asapSchedule start equals the maximum finish of the dependencies", () => {
  const dec = mk([
    sub("A"),
    sub("B", { depends_on: ["A"] }),
    sub("C", { depends_on: ["A"] }),
    sub("D", { depends_on: ["B", "C"] }),
  ]);
  const { order } = topoSort(dec.subsections);
  const dur: Record<string, number> = { A: 1, B: 10, C: 2, D: 3 };
  const t = asapSchedule(dec.subsections, order, (id) => dur[id] as number);
  assert.equal(t.get("A")?.start, 0);
  assert.equal(t.get("B")?.start, 1);
  assert.equal(t.get("C")?.start, 1);
  assert.equal(t.get("D")?.start, Math.max(t.get("B")?.finish as number, t.get("C")?.finish as number));
  assert.equal(t.get("D")?.finish, 14);
});
