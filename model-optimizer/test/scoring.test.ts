import { test } from "node:test";
import assert from "node:assert/strict";
import { difficulty, qualityFloor, successProbability } from "../src/scoring.ts";
import { QUALITY_PRESETS, SIGNAL_KEYS } from "../src/types.ts";
import type { Signals } from "../src/types.ts";

const sig = (v: number | Partial<Signals>): Signals => {
  const base = typeof v === "number" ? v : 3;
  const s = Object.fromEntries(SIGNAL_KEYS.map((k) => [k, base])) as Signals;
  return typeof v === "number" ? s : { ...s, ...v };
};
const DIFFICULTY_KEYS = ["reasoning", "ambiguity", "expertise", "context", "output", "horizon"] as const;

test("successProbability is 0.9 at the ceiling", () => {
  for (const c of [1, 2.4, 3.7, 5]) assert.ok(Math.abs(successProbability(c, c) - 0.9) < 1e-9);
});

test("successProbability rises with the ceiling and falls with the level", () => {
  let prev = 0;
  for (let c = 1; c <= 5; c += 0.25) {
    const p = successProbability(c, 3);
    assert.ok(c > 3.5 ? p >= prev : p > prev, `ceiling ${c}`); // flat once the 0.995 cap binds
    prev = p;
  }
  assert.ok(successProbability(3, 2) > successProbability(3, 4));
});

test("successProbability is capped at 0.995 and stays in (0, 1]", () => {
  for (let c = 0; c <= 10; c += 0.5) {
    for (let l = 1; l <= 5.5; l += 0.5) {
      const p = successProbability(c, l);
      assert.ok(p > 0 && p <= 0.995);
    }
  }
  assert.equal(successProbability(10, 1), 0.995);
  assert.ok(successProbability(1, 5) < 0.01);
});

test("qualityFloor is ordered max > balanced > economy for every criticality", () => {
  for (let c = 1; c <= 5; c++) {
    const [mx, bal, eco] = ["max", "balanced", "economy"].map((p) => qualityFloor(p as "max", c)) as [number, number, number];
    assert.ok(mx > bal && bal > eco, `criticality ${c}`);
  }
});

test("qualityFloor rises with criticality and never exceeds 0.99", () => {
  for (const preset of QUALITY_PRESETS) {
    let prev = 0;
    for (let c = 1; c <= 5; c++) {
      const f = qualityFloor(preset, c);
      assert.ok(f > prev, `${preset} criticality ${c}`);
      assert.ok(f <= 0.99);
      prev = f;
    }
  }
});

test("difficulty: all-1 signals give level 1", () => {
  const d = difficulty(sig(1));
  assert.ok(Math.abs(d.level - 1) < 0.01);
  assert.ok(Math.abs(d.raw - 1) < 0.01);
});

test("difficulty: all-5 signals give a level of 5 or close to it", () => {
  const d = difficulty(sig(5));
  assert.ok(d.level >= 4.7 && d.level <= 5.5, `level ${d.level}`);
});

test("difficulty: raising any difficulty signal never lowers the level", () => {
  for (const key of DIFFICULTY_KEYS) {
    for (const base of [1, 3, 5]) {
      let prev = -Infinity;
      for (let v = 1; v <= 5; v++) {
        const { level } = difficulty(sig({ ...sig(base), [key]: v }));
        assert.ok(level >= prev - 1e-9, `${key} base ${base} v ${v}`);
        prev = level;
      }
    }
  }
});

test("difficulty: criticality and verifiability do not affect the level", () => {
  for (const key of ["criticality", "verifiability"] as const) {
    const levels = [1, 2, 3, 4, 5].map((v) => difficulty(sig({ ...sig(2), [key]: v })).level);
    assert.ok(levels.every((l) => l === levels[0]), key);
  }
});

test("difficulty: a positive offset raises the level by exactly that amount", () => {
  const s = sig({ reasoning: 3, ambiguity: 2, expertise: 3, context: 2, output: 2, horizon: 2 });
  const base = difficulty(s);
  for (const off of [0.25, 0.5, 1]) {
    const d = difficulty(s, off);
    assert.ok(Math.abs(d.level - base.level - off) < 1e-3, `offset ${off}`);
    assert.equal(d.offset, off);
  }
});

test("difficulty: level is clamped to [1, 5.5]", () => {
  assert.equal(difficulty(sig(1), -3).level, 1);
  assert.equal(difficulty(sig(5), 3).level, 5.5);
});

test("difficulty: reports the hardest signal as the peak", () => {
  const d = difficulty(sig({ ...sig(1), expertise: 5 }));
  assert.equal(d.peak_signal, "expertise");
  assert.equal(d.peak, 5);
});
