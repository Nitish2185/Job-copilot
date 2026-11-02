// Pure helpers for scripts/set-owner.mjs (kept separate so they can be unit-tested).

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

/** Files that must never be rewritten (verbatim spec, lockfile, these scripts and their test data). */
export const SKIP_PATHS = [/^docs\/spec\//, /^pnpm-lock\.yaml$/, /^scripts\//];

export const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".html",
  ".css",
  ".yml",
  ".yaml",
  ".go",
  ".mod",
  ".txt",
]);

export function validateOwner(owner) {
  if (!OWNER_PATTERN.test(owner)) {
    throw new Error(`"${owner}" is not a valid GitHub user or organization name`);
  }
}

export function validateRepo(repo) {
  if (!REPO_PATTERN.test(repo) || repo === "." || repo === "..") {
    throw new Error(`"${repo}" is not a valid GitHub repository name`);
  }
}

/** Reads the current owner and repo from the contents of shared/src/config.ts. */
export function readCurrent(configSource) {
  const owner = /GITHUB_OWNER = "([^"]+)"/.exec(configSource)?.[1];
  const repo = /GITHUB_REPO = "([^"]+)"/.exec(configSource)?.[1];
  if (!owner || !repo) {
    throw new Error("Could not find GITHUB_OWNER and GITHUB_REPO in shared/src/config.ts");
  }
  return { owner, repo };
}

/** The exact strings to replace, from most to least specific. */
export function buildReplacements(from, to) {
  return [
    [`GITHUB_OWNER = "${from.owner}"`, `GITHUB_OWNER = "${to.owner}"`],
    [`GITHUB_REPO = "${from.repo}"`, `GITHUB_REPO = "${to.repo}"`],
    [`github.com/${from.owner}/${from.repo}`, `github.com/${to.owner}/${to.repo}`],
    [
      `${from.owner.toLowerCase()}.github.io/${from.repo}`,
      `${to.owner.toLowerCase()}.github.io/${to.repo}`,
    ],
  ];
}

export function applyReplacements(text, replacements) {
  let result = text;
  for (const [search, replacement] of replacements) {
    result = result.split(search).join(replacement);
  }
  return result;
}

export function shouldProcess(path) {
  if (SKIP_PATHS.some((pattern) => pattern.test(path))) return false;
  const dot = path.lastIndexOf(".");
  return dot !== -1 && TEXT_EXTENSIONS.has(path.slice(dot));
}
