import { describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  deepMerge,
  ensureSettings,
  loadFlags,
  loadSecrets,
  loadSettings,
  updateFlags,
  updateSecrets,
  updateSettings,
} from "@/lib/settings/settings";

describe("settings", () => {
  it("returns defaults when nothing is stored, with auto-apply off", async () => {
    const s = await loadSettings();
    expect(s.autoApply.enabled).toBe(false);
    expect(s.matching.showThreshold).toBe(60);
  });

  it("saves partial updates and keeps the rest", async () => {
    await updateSettings({ autoApply: { pauseSeconds: 45 } });
    const s = await loadSettings();
    expect(s.autoApply.pauseSeconds).toBe(45);
    expect(s.autoApply.dailyCap).toBe(20);
  });

  it("rejects invalid updates and leaves storage unchanged", async () => {
    await expect(updateSettings({ autoApply: { pauseSeconds: 5 } })).rejects.toThrow();
    expect((await loadSettings()).autoApply.pauseSeconds).toBe(90);
  });

  it("falls back to defaults for corrupt stored settings", async () => {
    await fakeBrowser.storage.sync.set({ settings: { autoApply: { dailyCap: 9999 } } });
    expect((await loadSettings()).autoApply.dailyCap).toBe(20);
  });

  it("writes defaults on first install only", async () => {
    await ensureSettings();
    expect(await fakeBrowser.storage.sync.get("settings")).toHaveProperty("settings");
    await updateSettings({ ui: { theme: "dark" } });
    await ensureSettings();
    expect((await loadSettings()).ui.theme).toBe("dark");
  });

  it("never puts secrets in sync storage", async () => {
    await updateSecrets({ aiKeys: { gemini: "secret-key" }, githubToken: "gh-token" });
    expect((await loadSecrets()).aiKeys.gemini).toBe("secret-key");
    const sync = JSON.stringify(await fakeBrowser.storage.sync.get(null));
    expect(sync).not.toContain("secret-key");
    expect(sync).not.toContain("gh-token");
    const local = JSON.stringify(await fakeBrowser.storage.local.get(null));
    expect(local).toContain("secret-key");
  });

  it("stores runtime flags locally", async () => {
    await updateFlags({ autoApplyPaused: { at: "2026-11-02T06:00:00Z", reason: "CAPTCHA" } });
    expect((await loadFlags()).autoApplyPaused?.reason).toBe("CAPTCHA");
  });
});

describe("deepMerge", () => {
  it("merges objects and replaces arrays", () => {
    expect(deepMerge({ a: { b: 1, c: [1, 2] }, d: 1 }, { a: { c: [3] } })).toEqual({
      a: { b: 1, c: [3] },
      d: 1,
    });
  });
});
