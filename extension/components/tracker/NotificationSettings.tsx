import type { Settings } from "@job-copilot/shared";
import { useEffect, useState, type SyntheticEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { ErrorMessage } from "@/components/ui/States";
import { loadSettings, updateSettings } from "@/lib/settings/settings";

type Notifications = Settings["notifications"];

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel(h: number): string {
  return new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" });
}

/** Digest, alerts and follow-up timing (spec 18.4, 19.2). */
export function NotificationSettings() {
  const [form, setForm] = useState<Notifications>();
  const [status, setStatus] = useState<{ ok: boolean; text: string }>();

  useEffect(() => {
    void loadSettings().then((s) => {
      setForm(s.notifications);
    });
  }, []);
  if (!form) return null;

  const save = async (e: SyntheticEvent) => {
    e.preventDefault();
    try {
      const saved = await updateSettings({ notifications: form });
      setForm(saved.notifications);
      setStatus({ ok: true, text: "Saved." });
    } catch {
      setStatus({ ok: false, text: "Days must be whole numbers of 1 or more." });
    }
  };
  const days = (value: string) => Number.parseInt(value, 10);

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.dailyDigest}
          onChange={(e) => {
            setForm({ ...form, dailyDigest: e.target.checked });
          }}
        />
        Daily digest of new matches
      </label>
      <Field id="digest-hour" label="Send the digest at">
        <select
          id="digest-hour"
          className={inputClass}
          disabled={!form.dailyDigest}
          value={form.digestHour}
          onChange={(e) => {
            setForm({ ...form, digestHour: days(e.target.value) });
          }}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {hourLabel(h)}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.needsYouAlerts}
          onChange={(e) => {
            setForm({ ...form, needsYouAlerts: e.target.checked });
          }}
        />
        Alert me when an application needs me or is ready for review
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Field
          id="follow-up-days"
          label="Remind me to follow up after (days)"
          hint="Only while the application is still at Applied."
        >
          <input
            id="follow-up-days"
            type="number"
            min={1}
            className={inputClass}
            value={Number.isNaN(form.followUpDays) ? "" : form.followUpDays}
            onChange={(e) => {
              setForm({ ...form, followUpDays: days(e.target.value) });
            }}
          />
        </Field>
        <Field
          id="ghosted-days"
          label="Suggest “ghosted” after (days)"
          hint="With no reply since the last change."
        >
          <input
            id="ghosted-days"
            type="number"
            min={1}
            className={inputClass}
            value={Number.isNaN(form.ghostedAfterDays) ? "" : form.ghostedAfterDays}
            onChange={(e) => {
              setForm({ ...form, ghostedAfterDays: days(e.target.value) });
            }}
          />
        </Field>
      </div>
      <Button type="submit" variant="primary">
        Save notification settings
      </Button>
      {status &&
        (status.ok ? (
          <p role="status" className="text-sm text-green-700 dark:text-green-400">
            {status.text}
          </p>
        ) : (
          <ErrorMessage>{status.text}</ErrorMessage>
        ))}
    </form>
  );
}
