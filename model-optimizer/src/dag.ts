/**
 * Dependency graph and interface-contract checks.
 *
 * A plan only "fits together" if every subsection's inputs are produced by a
 * subsection it waits for, nothing waits in a cycle, and the final outputs are
 * assembled somewhere. This module checks that, repairs what it safely can
 * (missing dependency edges), and computes the parallel schedule.
 */
import type { Decomposition, Issue, Subsection } from "./types.ts";

export interface GraphAnalysis {
  /** The decomposition after safe repairs (a deep copy; the input is not mutated). */
  decomposition: Decomposition;
  issues: Issue[];
  /** Topological order (empty when the graph has a cycle). */
  order: string[];
  /** Parallel waves: every subsection in a wave depends only on earlier waves. */
  waves: string[][];
  sinks: string[];
  hasCycle: boolean;
}

export function analyzeGraph(input: Decomposition): GraphAnalysis {
  const dec: Decomposition = structuredClone(input);
  const issues: Issue[] = [];
  const subs = dec.subsections;

  // 1. Unique ids.
  const seen = new Set<string>();
  for (const s of subs) {
    if (seen.has(s.id)) {
      issues.push({ level: "error", code: "E_DUPLICATE_ID", message: `Subsection id "${s.id}" is used more than once.`, subsection: s.id });
    }
    seen.add(s.id);
  }
  const byId = new Map(subs.map((s) => [s.id, s]));

  // 2. Dependencies point at real subsections, not at themselves.
  for (const s of subs) {
    const kept: string[] = [];
    for (const dep of s.depends_on) {
      if (dep === s.id) {
        issues.push({ level: "warning", code: "W_SELF_DEPENDENCY", message: `${s.id} listed itself as a dependency; removed.`, subsection: s.id });
      } else if (!byId.has(dep)) {
        issues.push({ level: "error", code: "E_UNKNOWN_DEPENDENCY", message: `${s.id} depends on unknown subsection "${dep}"; removed.`, subsection: s.id });
      } else if (!kept.includes(dep)) {
        kept.push(dep);
      }
    }
    s.depends_on = kept;
  }

  // 3. Inputs: the producer exists, is waited for (directly or transitively), and declares the artifact.
  const waitsFor = (from: string, target: string): boolean => {
    const stack = [...(byId.get(from)?.depends_on ?? [])];
    const visited = new Set<string>();
    while (stack.length) {
      const id = stack.pop() as string;
      if (id === target) return true;
      if (visited.has(id)) continue;
      visited.add(id);
      stack.push(...(byId.get(id)?.depends_on ?? []));
    }
    return false;
  };
  for (const s of subs) {
    for (const ref of s.inputs) {
      if (ref.from === "project") continue;
      const producer = byId.get(ref.from);
      if (!producer) {
        issues.push({
          level: "warning",
          code: "W_UNKNOWN_INPUT_SOURCE",
          message: `${s.id} expects "${ref.artifact}" from "${ref.from}", which is not a subsection. Treating it as existing project material.`,
          subsection: s.id,
        });
        ref.from = "project";
        continue;
      }
      if (producer.id === s.id) {
        issues.push({ level: "error", code: "E_SELF_INPUT", message: `${s.id} consumes its own output "${ref.artifact}".`, subsection: s.id });
        continue;
      }
      if (!waitsFor(s.id, producer.id)) {
        s.depends_on.push(producer.id);
        issues.push({
          level: "warning",
          code: "W_DEPENDENCY_ADDED",
          message: `${s.id} consumes "${ref.artifact}" from ${producer.id} but did not wait for it; added the dependency.`,
          subsection: s.id,
        });
      }
      const names = producer.outputs.map((o) => o.name);
      if (!names.some((n) => normalize(n) === normalize(ref.artifact))) {
        const suggestion = closest(ref.artifact, names);
        issues.push({
          level: "warning",
          code: "W_UNKNOWN_ARTIFACT",
          message: `${s.id} expects "${ref.artifact}" from ${producer.id}, which only declares ${names.map((n) => `"${n}"`).join(", ")}.${suggestion ? ` Did you mean "${suggestion}"?` : ""}`,
          subsection: s.id,
        });
      }
    }
  }

  // 4. Cycles and schedule.
  const { order, cycle } = topoSort(subs);
  if (cycle) {
    issues.push({ level: "error", code: "E_CYCLE", message: `Dependency cycle: ${cycle.join(" -> ")}. The plan cannot be scheduled.` });
    return { decomposition: dec, issues, order: [], waves: [], sinks: [], hasCycle: true };
  }
  const waves = computeWaves(subs, order);

  // 5. Sinks, unused outputs and the integration step.
  const dependents = new Map<string, string[]>(subs.map((s) => [s.id, []]));
  for (const s of subs) for (const d of s.depends_on) dependents.get(d)?.push(s.id);
  const sinks = subs.filter((s) => (dependents.get(s.id) ?? []).length === 0).map((s) => s.id);

  const consumed = new Set<string>();
  for (const s of subs) for (const ref of s.inputs) if (ref.from !== "project") consumed.add(`${ref.from}::${normalize(ref.artifact)}`);
  for (const s of subs) {
    if (sinks.includes(s.id)) continue;
    for (const o of s.outputs) {
      if (!consumed.has(`${s.id}::${normalize(o.name)}`)) {
        issues.push({
          level: "info",
          code: "I_UNUSED_OUTPUT",
          message: `Output "${o.name}" of ${s.id} is not consumed by any later subsection.`,
          subsection: s.id,
        });
      }
    }
  }

  const hasIntegration = subs.some((s) => s.category === "integration");
  if (subs.length > 2 && sinks.length > 1 && !hasIntegration) {
    issues.push({
      level: "warning",
      code: "W_NO_INTEGRATION",
      message: `${sinks.length} subsections (${sinks.join(", ")}) end the plan and nothing assembles them. Add an integration subsection that combines them and checks they are consistent.`,
    });
  }

  // 6. Granularity hints.
  for (const s of subs) {
    if (subs.length > 1 && s.repetitions === 1 && s.est_output_tokens < 150 && s.category !== "classification") {
      issues.push({
        level: "info",
        code: "I_TINY_SUBSECTION",
        message: `${s.id} produces ~${s.est_output_tokens} tokens; the per-call overhead may outweigh the saving. Consider merging it with a neighbour.`,
        subsection: s.id,
      });
    }
    if (s.est_output_tokens > 32_000) {
      issues.push({
        level: "warning",
        code: "W_OVERSIZED_SUBSECTION",
        message: `${s.id} is expected to produce ~${s.est_output_tokens.toLocaleString("en-US")} tokens in one call. Split it so each part can be checked on its own.`,
        subsection: s.id,
      });
    }
  }

  return { decomposition: dec, issues, order, waves, sinks, hasCycle: false };
}

/** Kahn's algorithm; returns a cycle path when the graph is not a DAG. */
export function topoSort(subs: Subsection[]): { order: string[]; cycle?: string[] } {
  const indeg = new Map(subs.map((s) => [s.id, 0]));
  const out = new Map<string, string[]>(subs.map((s) => [s.id, []]));
  for (const s of subs) {
    for (const d of s.depends_on) {
      if (!indeg.has(d)) continue;
      indeg.set(s.id, (indeg.get(s.id) ?? 0) + 1);
      out.get(d)?.push(s.id);
    }
  }
  const queue = subs.filter((s) => indeg.get(s.id) === 0).map((s) => s.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift() as string;
    order.push(id);
    for (const next of out.get(id) ?? []) {
      const n = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, n);
      if (n === 0) queue.push(next);
    }
  }
  if (order.length === subs.length) return { order };
  return { order, cycle: findCycle(subs) };
}

function findCycle(subs: Subsection[]): string[] {
  const deps = new Map(subs.map((s) => [s.id, s.depends_on]));
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  let found: string[] = [];
  const visit = (id: string): boolean => {
    state.set(id, 1);
    stack.push(id);
    for (const d of deps.get(id) ?? []) {
      if (!deps.has(d)) continue;
      if (state.get(d) === 1) {
        found = [...stack.slice(stack.indexOf(d)), d];
        return true;
      }
      if (!state.get(d) && visit(d)) return true;
    }
    stack.pop();
    state.set(id, 2);
    return false;
  };
  for (const s of subs) if (!state.get(s.id) && visit(s.id)) break;
  // Report in "runs before" order: reverse of the depends-on walk.
  return found.reverse();
}

export function computeWaves(subs: Subsection[], order: string[]): string[][] {
  const byId = new Map(subs.map((s) => [s.id, s]));
  const level = new Map<string, number>();
  for (const id of order) {
    const s = byId.get(id);
    const l = s && s.depends_on.length ? Math.max(...s.depends_on.map((d) => (level.get(d) ?? 0) + 1)) : 0;
    level.set(id, l);
  }
  const waves: string[][] = [];
  for (const id of order) {
    const l = level.get(id) ?? 0;
    (waves[l] ??= []).push(id);
  }
  return waves;
}

/** Earliest start/finish times with unlimited parallelism (seconds from plan start). */
export function asapSchedule(
  subs: Subsection[],
  order: string[],
  duration: (id: string) => number,
): Map<string, { start: number; finish: number }> {
  const byId = new Map(subs.map((s) => [s.id, s]));
  const times = new Map<string, { start: number; finish: number }>();
  for (const id of order) {
    const start = Math.max(0, ...(byId.get(id)?.depends_on ?? []).map((d) => times.get(d)?.finish ?? 0));
    times.set(id, { start, finish: start + duration(id) });
  }
  return times;
}

/** Longest path through the DAG weighted by duration (seconds). */
export function criticalPath(
  subs: Subsection[],
  order: string[],
  duration: (id: string) => number,
): { path: string[]; seconds: number } {
  const byId = new Map(subs.map((s) => [s.id, s]));
  const finish = new Map<string, number>();
  const prev = new Map<string, string | undefined>();
  for (const id of order) {
    const s = byId.get(id);
    let start = 0;
    let via: string | undefined;
    for (const d of s?.depends_on ?? []) {
      const f = finish.get(d) ?? 0;
      if (f > start) {
        start = f;
        via = d;
      }
    }
    finish.set(id, start + duration(id));
    prev.set(id, via);
  }
  let end: string | undefined;
  let best = -1;
  for (const [id, f] of finish) {
    if (f > best) {
      best = f;
      end = id;
    }
  }
  const path: string[] = [];
  for (let cur = end; cur; cur = prev.get(cur)) path.unshift(cur);
  return { path, seconds: Math.max(0, best) };
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

/** Closest name by token overlap, for "did you mean" hints. */
function closest(target: string, candidates: string[]): string | undefined {
  const tokens = (s: string) => new Set(normalize(s).split(/[^a-z0-9]+/).filter(Boolean));
  const t = tokens(target);
  let best: string | undefined;
  let bestScore = 0;
  for (const c of candidates) {
    const ct = tokens(c);
    let overlap = 0;
    for (const x of t) if (ct.has(x)) overlap++;
    const score = overlap / Math.max(1, Math.max(t.size, ct.size));
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= 0.34 ? best : undefined;
}
