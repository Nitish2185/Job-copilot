import { FEED_BASE_URL } from "@job-copilot/shared/config";
import { useEffect, useState, type SyntheticEvent } from "react";
import { AiSettingsForm } from "@/components/ai/AiSettingsForm";
import { AssistSettings } from "@/components/apply/AssistSettings";
import { AutoApplySettings } from "@/components/apply/AutoApplySettings";
import { AiUsage } from "@/components/ai/AiUsage";
import { Button } from "@/components/ui/Button";
import { MatchingSettingsForm } from "@/components/matching/MatchingSettingsForm";
import { CoverLetterSettings } from "@/components/resume/CoverLetterSettings";
import { NotificationSettings } from "@/components/tracker/NotificationSettings";
import { DataControls } from "@/components/data/DataControls";
import { ListingSources } from "@/components/data/ListingSources";
import { AppearanceSettings } from "@/components/ui/AppearanceSettings";
import { DemoDataPanel } from "@/components/ui/DemoDataPanel";
import { AboutSettings, PrivacySettings, ShortcutSettings } from "@/components/ui/MoreSettings";
import { Section } from "@/components/ui/Field";
import { ErrorMessage } from "@/components/ui/States";
import { sendMessage } from "@/lib/messaging/client";
import { loadSettings, updateSettings } from "@/lib/settings/settings";
import { useMatchFilters } from "../matchFilters";

/** Settings grow phase by phase: AI provider (spec 11), matching (spec 12) and the feed (13.1). */
export function SettingsPage() {
  const [feedUrl, setFeedUrl] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string }>();

  useEffect(() => {
    void loadSettings().then((s) => {
      setFeedUrl(s.sources.feedBaseUrl);
    });
  }, []);

  const save = async (event: SyntheticEvent) => {
    event.preventDefault();
    try {
      const url = new URL(feedUrl.trim());
      if (
        url.protocol !== "https:" &&
        url.hostname !== "localhost" &&
        url.hostname !== "127.0.0.1"
      ) {
        throw new Error("The feed URL must start with https://");
      }
      const base = url.toString().endsWith("/") ? url.toString() : `${url.toString()}/`;
      await updateSettings({ sources: { feedBaseUrl: base } });
      setFeedUrl(base);
      const result = await sendMessage("feed/sync", { force: true });
      setStatus(
        result.status === "error"
          ? { ok: false, text: result.error ?? "Sync failed" }
          : {
              ok: true,
              text: `Saved. ${String(result.totalOpenJobs ?? 0)} open jobs in the feed.`,
            },
      );
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Section
        title="AI provider"
        description="Your key is stored only on this device and is never synced or exported."
      >
        <AiUsage />
        <AiSettingsForm />
      </Section>
      <Section
        title="Matching"
        description="How jobs are scored and shown. Saving re-ranks every job on this device."
      >
        <MatchingSettingsForm
          onSaved={(threshold) => {
            useMatchFilters.getState().reset(threshold);
          }}
        />
      </Section>
      <Section
        title="Resumes and cover letters"
        description="Templates and the base resume are on the Resumes page."
      >
        <CoverLetterSettings />
      </Section>
      <Section
        title="Auto-apply"
        description="Off until you turn it on. Only on Greenhouse, Lever, Ashby, Workable and SmartRecruiters forms."
      >
        <AutoApplySettings />
      </Section>
      <Section
        title="Assist sites"
        description="Naukri, Indeed, LinkedIn, Workday and any other form: Job Copilot fills, you review and submit."
      >
        <AssistSettings />
      </Section>
      <Section title="Job search APIs" description="Adzuna and JSearch, off by default.">
        <ListingSources />
      </Section>
      <Section title="Notifications" description="Clicking a notification opens the right page.">
        <NotificationSettings />
      </Section>
      <Section title="Privacy">
        <PrivacySettings />
      </Section>
      <Section title="Appearance">
        <AppearanceSettings />
      </Section>
      <Section title="Keyboard shortcuts">
        <ShortcutSettings />
      </Section>
      <Section
        title="Your data"
        description="Everything stays in this browser. Back it up, move it, or delete it."
      >
        <DataControls />
      </Section>
      <Section title="About">
        <AboutSettings />
      </Section>
      {import.meta.env.DEV && (
        <Section title="Demo data" description="Development builds only.">
          <DemoDataPanel />
        </Section>
      )}
      <section>
        <h2 className="font-medium">Shared job feed</h2>
        <form onSubmit={(e) => void save(e)} className="mt-2 space-y-2">
          <label htmlFor="feed-url" className="block text-sm text-slate-600 dark:text-slate-400">
            Feed address (default {FEED_BASE_URL})
          </label>
          <div className="flex gap-2">
            <input
              id="feed-url"
              value={feedUrl}
              onChange={(e) => {
                setFeedUrl(e.target.value);
              }}
              className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <Button type="submit" variant="primary">
              Save and sync
            </Button>
          </div>
        </form>
        {status &&
          (status.ok ? (
            <p role="status" className="mt-2 text-sm text-green-700 dark:text-green-400">
              {status.text}
            </p>
          ) : (
            <div className="mt-2">
              <ErrorMessage>{status.text}</ErrorMessage>
            </div>
          ))}
      </section>
    </div>
  );
}
