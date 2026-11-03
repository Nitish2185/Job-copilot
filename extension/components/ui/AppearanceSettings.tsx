import { useEffect, useState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { loadSettings, updateSettings } from "@/lib/settings/settings";
import type { ThemeChoice } from "@/lib/ui/theme";

const CHOICES: [ThemeChoice, string][] = [
  ["system", "Same as my system"],
  ["light", "Light"],
  ["dark", "Dark"],
];

/** Light, dark or system theme for the dashboard, side panel and popup. */
export function AppearanceSettings() {
  const [theme, setTheme] = useState<ThemeChoice>();
  useEffect(() => {
    void loadSettings().then((s) => {
      setTheme(s.ui.theme);
    });
  }, []);
  if (!theme) return null;
  return (
    <Field id="theme" label="Theme">
      <select
        id="theme"
        className={inputClass}
        value={theme}
        onChange={(e) => {
          const next = e.target.value as ThemeChoice;
          setTheme(next);
          void updateSettings({ ui: { theme: next } });
        }}
      >
        {CHOICES.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </Field>
  );
}
