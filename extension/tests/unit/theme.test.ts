// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { updateSettings } from "@/lib/settings/settings";
import { applyTheme, resolveTheme, startTheme } from "@/lib/ui/theme";

beforeEach(() => {
  fakeBrowser.reset();
  delete document.documentElement.dataset.theme;
});

function mockMedia(dark: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: dark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe("theme", () => {
  it("resolves the system choice from the OS setting", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("marks the page and its color scheme", () => {
    applyTheme(document.documentElement, "dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("starts from the system theme, then follows the saved choice", async () => {
    mockMedia(true);
    startTheme();
    expect(document.documentElement.dataset.theme).toBe("dark");
    await updateSettings({ ui: { theme: "light" } });
    await vi.waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
    });
  });
});
