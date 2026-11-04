// Hash of every TypeScript source file, stamped into the plugin bundle so a test can detect a stale bundle.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export function sourceHash(root = "src") {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".ts")) files.push(path);
    }
  };
  walk(root);
  const hash = createHash("sha256");
  for (const file of files.sort()) hash.update(`${relative(root, file)}\0${readFileSync(file, "utf8")}\0`);
  return hash.digest("hex").slice(0, 16);
}
