import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyReplacements,
  buildReplacements,
  readCurrent,
  shouldProcess,
  validateOwner,
  validateRepo,
} from "./owner.mjs";

describe("set-owner helpers", () => {
  it("reads the current owner and repo from config source", () => {
    const source =
      'export const GITHUB_OWNER = "Alice";\nexport const GITHUB_REPO = "Job-copilot";';
    assert.deepEqual(readCurrent(source), { owner: "Alice", repo: "Job-copilot" });
  });

  it("rewrites config constants, GitHub URLs, module paths and Pages URLs", () => {
    const replacements = buildReplacements(
      { owner: "Alice", repo: "Job-copilot" },
      { owner: "bob-dev", repo: "job-copilot" },
    );
    const input = [
      'export const GITHUB_OWNER = "Alice";',
      'export const GITHUB_REPO = "Job-copilot";',
      "module github.com/Alice/Job-copilot/crawler",
      'const RepoURL = "https://github.com/Alice/Job-copilot"',
      "https://alice.github.io/Job-copilot/feed/",
    ].join("\n");
    const expected = [
      'export const GITHUB_OWNER = "bob-dev";',
      'export const GITHUB_REPO = "job-copilot";',
      "module github.com/bob-dev/job-copilot/crawler",
      'const RepoURL = "https://github.com/bob-dev/job-copilot"',
      "https://bob-dev.github.io/job-copilot/feed/",
    ].join("\n");
    assert.equal(applyReplacements(input, replacements), expected);
  });

  it("leaves unrelated text alone", () => {
    const replacements = buildReplacements(
      { owner: "Alice", repo: "Job-copilot" },
      { owner: "bob", repo: "x" },
    );
    const text = "Alice wrote github.com/Alice/other-repo";
    assert.equal(applyReplacements(text, replacements), text);
  });

  it("skips the verbatim spec, the lockfile and binary files", () => {
    assert.equal(shouldProcess("docs/spec/part-1.md"), false);
    assert.equal(shouldProcess("pnpm-lock.yaml"), false);
    assert.equal(shouldProcess("scripts/owner.test.mjs"), false);
    assert.equal(shouldProcess("extension/assets/icon.png"), false);
    assert.equal(shouldProcess("crawler/go.mod"), true);
    assert.equal(shouldProcess("shared/src/config.ts"), true);
  });

  it("rejects invalid owner and repo names", () => {
    assert.throws(() => validateOwner("-bad"));
    assert.throws(() => validateOwner("has space"));
    assert.throws(() => validateRepo(".."));
    assert.throws(() => validateRepo("a/b"));
    assert.doesNotThrow(() => validateOwner("Nitish2185"));
    assert.doesNotThrow(() => validateRepo("Job-copilot"));
  });
});
