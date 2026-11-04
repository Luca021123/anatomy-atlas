/**
 * The Claude Code plugin ships a bundled CLI. These tests keep it honest: the
 * bundle must match the current sources, the launcher must run without
 * node_modules, and the manifests must point at files that exist.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
// @ts-expect-error - plain ES module helper without type declarations
import { sourceHash } from "../scripts/source-hash.mjs";

const root = new URL("../", import.meta.url);
const plugin = new URL("plugins/model-optimizer/", root);

test("the plugin bundle is built from the current sources (run `npm run bundle` if this fails)", () => {
  const head = readFileSync(new URL("lib/mopt.mjs", plugin), "utf8").slice(0, 400);
  const stamped = /source-hash: ([0-9a-f]+)/.exec(head)?.[1];
  assert.equal(stamped, sourceHash(new URL("src", root).pathname));
});

test("the plugin command runs from the bundle", () => {
  const bin = new URL("bin/mopt", plugin).pathname;
  assert.ok(statSync(bin).mode & 0o111, "bin/mopt must be executable");
  const schema = JSON.parse(execFileSync(bin, ["schema"], { encoding: "utf8" })) as { type?: string; properties?: Record<string, unknown> };
  assert.equal(schema.type, "object");
  assert.ok(schema.properties?.subsections);
  assert.match(execFileSync(bin, ["--version"], { encoding: "utf8" }), /^\d+\.\d+\.\d+/);
});

test("manifests are valid and reference files that exist", () => {
  const market = JSON.parse(readFileSync(new URL(".claude-plugin/marketplace.json", root), "utf8")) as {
    name: string;
    plugins: { name: string; source: string }[];
  };
  const manifest = JSON.parse(readFileSync(new URL(".claude-plugin/plugin.json", plugin), "utf8")) as { name: string; icon?: string; version: string };
  assert.equal(market.plugins[0]?.name, manifest.name);
  assert.ok(existsSync(new URL(`${market.plugins[0]?.source.replace(/^\.\//, "")}/.claude-plugin/plugin.json`, root)));
  if (manifest.icon) assert.ok(existsSync(new URL(manifest.icon, plugin)));
  const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8")) as { version: string };
  assert.equal(manifest.version, pkg.version, "plugin and package versions must match");
  for (const f of ["skills/optimize/SKILL.md", "agents/mopt-worker.md", "agents/mopt-reviewer.md"]) {
    const text = readFileSync(new URL(f, plugin), "utf8");
    assert.match(text, /^---\nname: [a-z-]+\ndescription: .+/m, `${f} needs name and description frontmatter`);
  }
});
