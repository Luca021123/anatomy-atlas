// Builds the zero-install CLI bundle that ships inside the Claude Code plugin.
// zod is bundled; the Anthropic SDK stays external and is loaded only for API mode.
import { chmodSync } from "node:fs";
import { build } from "esbuild";
import { sourceHash } from "./source-hash.mjs";

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "plugins/model-optimizer/lib/mopt.mjs",
  external: ["@anthropic-ai/sdk", "@anthropic-ai/sdk/*"],
  banner: {
    js: `// model-optimizer CLI bundle, generated from src/ by scripts/bundle-plugin.mjs. Do not edit by hand.\n// source-hash: ${sourceHash()}`,
  },
  legalComments: "eof",
  minifyWhitespace: true,
  minifySyntax: true,
  logLevel: "warning",
});
chmodSync("plugins/model-optimizer/bin/mopt", 0o755);
console.log("Bundled plugins/model-optimizer/lib/mopt.mjs");
