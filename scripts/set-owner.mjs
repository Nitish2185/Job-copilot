#!/usr/bin/env node
// Usage: pnpm run set-owner <github-owner> <repo-name> [--dry-run]
//
// Rewrites the GitHub owner and repository everywhere they appear: shared config
// (feed URL, links), the Go module path and imports, the crawler User-Agent,
// the website and docs.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  applyReplacements,
  buildReplacements,
  readCurrent,
  shouldProcess,
  validateOwner,
  validateRepo,
} from "./owner.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const [owner, repo] = args.filter((arg) => !arg.startsWith("--"));

if (!owner || !repo) {
  console.error("Usage: pnpm run set-owner <github-owner> <repo-name> [--dry-run]");
  process.exit(2);
}

try {
  validateOwner(owner);
  validateRepo(repo);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const current = readCurrent(readFileSync("shared/src/config.ts", "utf8"));
if (current.owner === owner && current.repo === repo) {
  console.log(`Already set to ${owner}/${repo}. Nothing to do.`);
  process.exit(0);
}

const replacements = buildReplacements(current, { owner, repo });
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\n")
  .map((line) => line.trim())
  .filter((path) => path && shouldProcess(path));

const changed = [];
for (const path of files) {
  let before;
  try {
    before = readFileSync(path, "utf8");
  } catch {
    continue; // deleted in the working tree
  }
  const after = applyReplacements(before, replacements);
  if (after !== before) {
    changed.push(path);
    if (!dryRun) writeFileSync(path, after);
  }
}

const verb = dryRun ? "Would update" : "Updated";
console.log(
  `${verb} ${changed.length} file(s): ${current.owner}/${current.repo} -> ${owner}/${repo}`,
);
for (const path of changed) console.log(`  ${path}`);
