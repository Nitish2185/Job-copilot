import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { getDb } from "@/lib/db/db";
import { FEED_NOT_PUBLISHED } from "@/lib/feed/sync";
import { sendMessage } from "@/lib/messaging/client";

function timeAgo(iso: string | undefined): string {
  if (!iso) return "never";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${String(hours)} h ago` : `${String(Math.round(hours / 24))} days ago`;
}

/** Shared feed status and a "Sync now" button. */
export function FeedStatusBar() {
  const state = useLiveQuery(() => getDb().feedState.get("feed"), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const sync = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await sendMessage("feed/sync", { force: false });
      if (result.status === "error") setError(result.error ?? "Sync failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  const status = state?.status ?? "never";
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-6 py-3 text-sm dark:border-stone-800">
      {status === "update_required" ? (
        <span role="alert" className="font-medium text-amber-800 dark:text-amber-300">
          Update the extension to keep receiving jobs.
        </span>
      ) : (
        <span className="text-stone-600 dark:text-stone-400">
          Shared feed: last synced {timeAgo(state?.lastSyncAt)}
          {state?.totalOpenJobs !== undefined &&
            ` · ${state.totalOpenJobs.toLocaleString()} open jobs`}
        </span>
      )}
      {(error ?? (status === "error" ? state?.error : undefined)) && (
        <span role="status" className="font-medium text-amber-800 dark:text-amber-300">
          {(error ?? state?.error) === FEED_NOT_PUBLISHED
            ? "The shared job list is not online yet. Add companies or paste jobs meanwhile."
            : (error ?? state?.error)}
        </span>
      )}
      <Button onClick={() => void sync()} disabled={busy} className="ml-auto">
        {busy ? "Syncing..." : "Sync now"}
      </Button>
    </div>
  );
}
