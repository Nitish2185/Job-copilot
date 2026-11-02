import type { Settings } from "@job-copilot/shared";
import { useEffect, useState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { loadSettings, updateSettings } from "@/lib/settings/settings";

type Mode = Settings["coverLetter"]["mode"];

const MODES: [Mode, string][] = [
  ["ask", "Offer one when a form has a cover letter field"],
  ["always", "Always write one"],
  ["off", "Never"],
];

/** When cover letters are written (spec 15.1 `coverLetter.mode`). */
export function CoverLetterSettings() {
  const [mode, setMode] = useState<Mode>();
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void loadSettings().then((s) => {
      setMode(s.coverLetter.mode);
    });
  }, []);
  if (!mode) return null;
  return (
    <Field id="cover-letter-mode" label="Cover letters when applying">
      <select
        id="cover-letter-mode"
        className={inputClass}
        value={mode}
        onChange={(e) => {
          const next = e.target.value as Mode;
          setMode(next);
          void updateSettings({ coverLetter: { mode: next } }).then(() => {
            setSaved(true);
          });
        }}
      >
        {MODES.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {saved && (
        <span className="mt-1 block text-xs text-green-700 dark:text-green-400">Saved.</span>
      )}
    </Field>
  );
}
