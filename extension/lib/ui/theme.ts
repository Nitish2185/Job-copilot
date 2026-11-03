/**
 * Light and dark themes (spec 18): Settings > Appearance picks System, Light or
 * Dark. The page's <html> gets data-theme="light" | "dark", which the Tailwind
 * `dark:` variant and the chart colours read.
 */
import type { Settings } from "@job-copilot/shared";
import { loadSettings, onSettingsChanged } from "../settings/settings";

export type ThemeChoice = Settings["ui"]["theme"];

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): "light" | "dark" {
  if (choice === "system") return prefersDark ? "dark" : "light";
  return choice;
}

export function applyTheme(root: HTMLElement, theme: "light" | "dark"): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/** Applies the system theme at once (no flash), then the saved choice, and follows changes. */
export function startTheme(doc: Document = document): void {
  const media = doc.defaultView?.matchMedia("(prefers-color-scheme: dark)");
  let choice: ThemeChoice = "system";
  const update = () => {
    applyTheme(doc.documentElement, resolveTheme(choice, media?.matches ?? false));
  };
  update();
  media?.addEventListener("change", update);
  void loadSettings()
    .then((s) => {
      choice = s.ui.theme;
      update();
    })
    .catch(() => undefined);
  onSettingsChanged((s) => {
    choice = s.ui.theme;
    update();
  });
}
