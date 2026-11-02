import { FEED_BASE_URL } from "@job-copilot/shared/config";
import { useEffect, useState, type SyntheticEvent } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/States";
import { sendMessage } from "@/lib/messaging/client";
import { loadSettings, updateSettings } from "@/lib/settings/settings";

/** Settings grow phase by phase; for now the feed source (spec 13.1). */
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
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <section className="mt-6">
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
