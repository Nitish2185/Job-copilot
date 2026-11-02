import { useEffect, useState, type SyntheticEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { ErrorMessage } from "@/components/ui/States";
import { sendMessage } from "@/lib/messaging/client";
import { loadSettings, updateSettings } from "@/lib/settings/settings";

interface Values {
  showThreshold: string;
  minPrefilterScore: string;
  dailyScoringBudget: string;
  requestsPerMinute: string;
  dailyRequestBudget: string;
}

const FIELDS: { key: keyof Values; label: string; hint: string; min: number; max: number }[] = [
  {
    key: "showThreshold",
    label: "Show jobs scoring at least",
    hint: "The Matches page hides lower scores unless you choose “Show all scores”.",
    min: 0,
    max: 100,
  },
  {
    key: "minPrefilterScore",
    label: "Local score needed for AI scoring",
    hint: "Jobs below this local score are never sent to the AI.",
    min: 0,
    max: 100,
  },
  {
    key: "dailyScoringBudget",
    label: "Jobs scored by AI per day",
    hint: "10 jobs use one AI request.",
    min: 0,
    max: 5000,
  },
  {
    key: "requestsPerMinute",
    label: "AI requests per minute",
    hint: "Keep it under your provider's free-tier limit.",
    min: 1,
    max: 1000,
  },
  {
    key: "dailyRequestBudget",
    label: "AI requests per day",
    hint: "AI pauses until midnight when this is used up.",
    min: 1,
    max: 100000,
  },
];

/** Matching thresholds and AI limits (spec 18.1 Settings). Saving re-ranks every job. */
export function MatchingSettingsForm({ onSaved }: { onSaved?: (showThreshold: number) => void }) {
  const [values, setValues] = useState<Values>();
  const [status, setStatus] = useState<{ ok: boolean; text: string }>();

  useEffect(() => {
    void loadSettings().then((s) => {
      setValues({
        showThreshold: String(s.matching.showThreshold),
        minPrefilterScore: String(s.matching.minPrefilterScore),
        dailyScoringBudget: String(s.ai.dailyScoringBudget),
        requestsPerMinute: String(s.ai.requestsPerMinute),
        dailyRequestBudget: String(s.ai.dailyRequestBudget),
      });
    });
  }, []);
  if (!values) return null;

  const save = async (event: SyntheticEvent) => {
    event.preventDefault();
    const numbers: Record<string, number> = {};
    for (const f of FIELDS) {
      const n = Number(values[f.key]);
      if (!Number.isInteger(n) || n < f.min || n > f.max) {
        setStatus({
          ok: false,
          text: `${f.label}: write a whole number from ${String(f.min)} to ${String(f.max)}.`,
        });
        return;
      }
      numbers[f.key] = n;
    }
    const n = (key: keyof Values) => numbers[key] ?? 0;
    try {
      await updateSettings({
        matching: { showThreshold: n("showThreshold"), minPrefilterScore: n("minPrefilterScore") },
        ai: {
          dailyScoringBudget: n("dailyScoringBudget"),
          requestsPerMinute: n("requestsPerMinute"),
          dailyRequestBudget: n("dailyRequestBudget"),
        },
      });
      const ranked = await sendMessage("match/prefilter", { all: true });
      setStatus({
        ok: true,
        text: `Saved. Jobs re-ranked: ${ranked.passed.toLocaleString()} fit.`,
      });
      onSaved?.(n("showThreshold"));
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "Could not save." });
    }
  };

  return (
    <form
      noValidate
      onSubmit={(e) => void save(e)}
      className="space-y-3"
      aria-label="Matching settings"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <Field key={f.key} id={`matching-${f.key}`} label={f.label} hint={f.hint}>
            <input
              id={`matching-${f.key}`}
              type="number"
              min={f.min}
              max={f.max}
              className={inputClass}
              value={values[f.key]}
              onChange={(e) => {
                setValues({ ...values, [f.key]: e.target.value });
              }}
            />
          </Field>
        ))}
      </div>
      <Button type="submit" variant="primary">
        Save matching settings
      </Button>
      {status &&
        (status.ok ? (
          <p className="text-sm text-green-700 dark:text-green-400">{status.text}</p>
        ) : (
          <ErrorMessage>{status.text}</ErrorMessage>
        ))}
    </form>
  );
}
