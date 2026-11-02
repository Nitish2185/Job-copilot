import { AUTO_APPLY_LIMITS, AUTO_SUBMIT_HOSTS, type Settings } from "@job-copilot/shared";
import { Dialog } from "radix-ui";
import { useEffect, useState, type SyntheticEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { ErrorMessage } from "@/components/ui/States";
import { sendMessage } from "@/lib/messaging/client";
import type { MessageResponse } from "@/lib/messaging/protocol";
import { loadSettings, updateSettings } from "@/lib/settings/settings";

type Auto = Settings["autoApply"];
type Status = MessageResponse<"autoApply/status">;

/** The one-time explanation the user must accept before auto-apply turns on (spec 2.3). */
function EnableDialog({ onEnabled }: { onEnabled: () => void }) {
  const [open, setOpen] = useState(false);
  const [threshold, setThreshold] = useState(85);
  const [approvalMode, setApprovalMode] = useState<Auto["approvalMode"]>("always");
  const [understood, setUnderstood] = useState(false);
  const enable = async () => {
    await sendMessage("autoApply/enable", { threshold, approvalMode });
    setOpen(false);
    onEnabled();
  };
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="primary">Turn on auto-apply</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 max-h-[90vh] w-[min(36rem,92vw)] -translate-x-1/2 -translate-y-1/2 space-y-3 overflow-auto rounded-lg bg-white p-5 text-sm shadow-xl dark:bg-slate-900">
          <Dialog.Title className="text-lg font-semibold">
            Before you turn on auto-apply
          </Dialog.Title>
          <Dialog.Description asChild>
            <div className="space-y-2">
              <p>
                Job Copilot will apply for you, in a background tab, only on these company job
                forms: {AUTO_SUBMIT_HOSTS.join(", ")}. Naukri, Indeed, LinkedIn, Workday and every
                other site stay Assist: it fills, you submit.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  It submits only when every question was answered from your profile or saved
                  answers.
                </li>
                <li>
                  It stops and asks you for CAPTCHAs, verification codes, consent boxes, missing
                  salary, notice or visa answers, and anything it is unsure about.
                </li>
                <li>
                  At most {String(AUTO_APPLY_LIMITS.dailyCapDefault)} applications a day, 2 per
                  company a month, with a pause between each (you can lower these).
                </li>
                <li>The first tailored resumes and AI-written answers wait for your approval.</li>
                <li>You can pause everything at any time from the toolbar popup or here.</li>
              </ul>
            </div>
          </Dialog.Description>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="enable-threshold" label="Apply automatically from score">
              <input
                id="enable-threshold"
                type="number"
                min={0}
                max={100}
                className={inputClass}
                value={threshold}
                onChange={(e) => {
                  setThreshold(Math.max(0, Math.min(100, Number(e.target.value) || 0)));
                }}
              />
            </Field>
            <Field id="enable-approval" label="Approval">
              <select
                id="enable-approval"
                className={inputClass}
                value={approvalMode}
                onChange={(e) => {
                  setApprovalMode(e.target.value as Auto["approvalMode"]);
                }}
              >
                <option value="always">I approve every application</option>
                <option value="below_threshold">Only below the score</option>
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => {
                setUnderstood(e.target.checked);
              }}
            />
            I understand what auto-apply does
          </label>
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="primary" disabled={!understood} onClick={() => void enable()}>
              Turn on
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Auto-apply settings (spec 18.1): the enable flow, limits, dry run and the kill switch. */
export function AutoApplySettings() {
  const [auto, setAuto] = useState<Auto>();
  const [status, setStatus] = useState<Status>();
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();

  const reload = async () => {
    const [s, st] = await Promise.all([loadSettings(), sendMessage("autoApply/status", {})]);
    setAuto(s.autoApply);
    setStatus(st);
  };
  useEffect(() => {
    void Promise.all([loadSettings(), sendMessage("autoApply/status", {})]).then(([s, st]) => {
      setAuto(s.autoApply);
      setStatus(st);
    });
  }, []);
  if (!auto || !status) return null;

  const set = <K extends keyof Auto>(key: K, value: Auto[K]) => {
    setAuto({ ...auto, [key]: value });
    setMessage(undefined);
  };

  const save = async (event: SyntheticEvent) => {
    event.preventDefault();
    try {
      const { enabled: _e, explanationAccepted: _x, ...rest } = auto;
      await updateSettings({ autoApply: rest });
      setMessage({ ok: true, text: "Saved." });
      await reload();
    } catch {
      setMessage({
        ok: false,
        text: "Check the numbers: daily limit 1-50, pause at least 30 seconds.",
      });
    }
  };

  const number = (key: keyof Auto, label: string, min: number, max: number, hint?: string) => (
    <Field id={`auto-${key}`} label={label} {...(hint && { hint })}>
      <input
        id={`auto-${key}`}
        type="number"
        min={min}
        max={max}
        className={inputClass}
        value={auto[key] as number}
        onChange={(e) => {
          set(key, Number(e.target.value) as never);
        }}
      />
    </Field>
  );

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3" data-testid="auto-apply-status">
        <span className="font-medium">
          {!status.enabled
            ? "Auto-apply is off."
            : status.paused
              ? `Paused: ${status.paused.reason}`
              : "Auto-apply is on."}
        </span>
        {status.enabled && (
          <span className="text-slate-500">
            {String(status.sentToday)} of {String(status.dailyCap)} sent today ·{" "}
            {String(status.pending)} queued · {String(status.review)} to review ·{" "}
            {String(status.needsYou)} need you
            {status.dryRun && " · dry run"}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {!status.enabled && <EnableDialog onEnabled={() => void reload()} />}
        {status.enabled && !status.paused && (
          <Button
            variant="danger"
            onClick={() => void sendMessage("autoApply/pause", {}).then(reload)}
          >
            Pause all auto-apply
          </Button>
        )}
        {status.enabled && status.paused && (
          <Button
            variant="primary"
            onClick={() => void sendMessage("autoApply/resume", {}).then(reload)}
          >
            Resume auto-apply
          </Button>
        )}
        {status.enabled && (
          <Button
            variant="ghost"
            onClick={() => void sendMessage("autoApply/disable", {}).then(reload)}
          >
            Turn off
          </Button>
        )}
      </div>
      <form
        className="space-y-3"
        noValidate
        onSubmit={(e) => void save(e)}
        aria-label="Auto-apply settings"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {number("threshold", "Apply automatically from score", 0, 100)}
          <Field id="auto-approval" label="Approval">
            <select
              id="auto-approval"
              className={inputClass}
              value={auto.approvalMode}
              onChange={(e) => {
                set("approvalMode", e.target.value as Auto["approvalMode"]);
              }}
            >
              <option value="always">I approve every application</option>
              <option value="below_threshold">Only below the score</option>
            </select>
          </Field>
          {number("dailyCap", "Applications per day", 1, AUTO_APPLY_LIMITS.dailyCapMax)}
          {number("perCompanyCap", "Per company", 1, 20)}
          {number("perCompanyWindowDays", "...within days", 1, 365)}
          {number(
            "pauseSeconds",
            "Pause between applications (s)",
            AUTO_APPLY_LIMITS.pauseSecondsMin,
            3600,
          )}
          <Field id="auto-resume" label="Resume to send">
            <select
              id="auto-resume"
              className={inputClass}
              value={auto.resumeDefault}
              onChange={(e) => {
                set("resumeDefault", e.target.value as Auto["resumeDefault"]);
              }}
            >
              <option value="current">My resume</option>
              <option value="tailored">A resume made for each job</option>
              <option value="tailored_above_score">Tailored above a score</option>
            </select>
          </Field>
          {number("tailoredAboveScore", "Tailored from score", 0, 100)}
          {number("requireApprovalForFirstTailored", "Approve the first tailored resumes", 0, 100)}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={auto.activeHours !== undefined}
              onChange={(e) => {
                set("activeHours", e.target.checked ? { start: "09:00", end: "18:00" } : undefined);
              }}
            />
            Only between
          </label>
          {auto.activeHours && (
            <>
              <input
                aria-label="From"
                type="time"
                className={`${inputClass} w-28`}
                value={auto.activeHours.start}
                onChange={(e) => {
                  set("activeHours", {
                    start: e.target.value,
                    end: auto.activeHours?.end ?? "18:00",
                  });
                }}
              />
              <input
                aria-label="Until"
                type="time"
                className={`${inputClass} w-28`}
                value={auto.activeHours.end}
                onChange={(e) => {
                  set("activeHours", {
                    start: auto.activeHours?.start ?? "09:00",
                    end: e.target.value,
                  });
                }}
              />
            </>
          )}
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={auto.dryRun}
            onChange={(e) => {
              set("dryRun", e.target.checked);
            }}
          />
          Dry run: fill and check, but never submit
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={auto.allowPrivacyAcknowledgement}
            onChange={(e) => {
              set("allowPrivacyAcknowledgement", e.target.checked);
            }}
          />
          Allow acknowledging standard privacy notices on company application forms
        </label>
        <Button type="submit" variant="primary">
          Save auto-apply settings
        </Button>
        {message &&
          (message.ok ? (
            <p className="text-green-700 dark:text-green-400">{message.text}</p>
          ) : (
            <ErrorMessage>{message.text}</ErrorMessage>
          ))}
      </form>
    </div>
  );
}
