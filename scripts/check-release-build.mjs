// Checks a release build (spec 2.1, 2.2): the local test host used by E2E builds must
// not be able to receive submissions, and no every-site host is required. Run after `pnpm -C extension build`:
//   node scripts/check-release-build.mjs [extension/.output/chrome-mv3]
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const TEST_HOST = "127.0.0.1";
const dir = process.argv[2] ?? "extension/.output/chrome-mv3";
if (!existsSync(join(dir, "manifest.json"))) {
  console.error(`No build in ${dir}; run the extension build first.`);
  process.exit(1);
}

const problems = [];
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
for (const host of manifest.host_permissions ?? []) {
  if (host.includes(TEST_HOST) || host.includes("localhost"))
    problems.push(`host_permissions has ${host}`);
}
// Every-site access is never required: the generic script runs through activeTab (spec 2.1).
const BROAD = ["<all_urls>", "*://*/*", "https://*/*", "http://*/*"];
for (const host of [...(manifest.host_permissions ?? []), ...(manifest.permissions ?? [])]) {
  if (BROAD.includes(host)) problems.push(`required permissions include ${host}`);
}
for (const script of manifest.content_scripts ?? []) {
  for (const match of script.matches ?? []) {
    if (match.includes(TEST_HOST) || match.includes("localhost"))
      problems.push(`content script matches ${match}`);
  }
}
// The submit allowlist code must not contain the test host anywhere in the bundle.
function walk(path) {
  for (const name of readdirSync(path)) {
    const file = join(path, name);
    if (statSync(file).isDirectory()) walk(file);
    else if (name.endsWith(".js") && readFileSync(file, "utf8").includes(`"${TEST_HOST}"`)) {
      problems.push(`${file} contains "${TEST_HOST}"`);
    }
  }
}
walk(dir);

if (problems.length > 0) {
  console.error(`Release build check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`Release build check passed (${dir}).`);
