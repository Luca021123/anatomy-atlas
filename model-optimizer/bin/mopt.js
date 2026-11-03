#!/usr/bin/env node
// Launcher. In a source checkout, run the TypeScript sources directly (Node >= 22.18
// strips types natively), so edits take effect without a rebuild. Inside node_modules,
// Node refuses to strip types, so an installed package runs the compiled build.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "src", "cli.ts");
const built = join(root, "dist", "cli.js");
const installed = root.split(/[\\/]/).includes("node_modules");
const entry = !installed && existsSync(source) ? source : built;
if (!existsSync(entry)) {
  process.stderr.write("mopt: the compiled build is missing; run `npm run build` in the model-optimizer package.\n");
  process.exit(1);
}
const { main } = await import(pathToFileURL(entry).href);
process.exitCode = await main(process.argv.slice(2));
