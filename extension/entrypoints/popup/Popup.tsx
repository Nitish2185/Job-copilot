/** Toolbar popup (spec 18.3): today's counts, the auto-apply kill switch and quick links. */
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { Button } from "@/components/ui/Button";
import { localDate } from "@/lib/ai/scheduler";
import { getDb } from "@/lib/db/db";
import { sendMessage } from "@/lib/messaging/client";
import type { MessageResponse } from "@/lib/messaging/protocol";
import { loadSettings } from "@/lib/settings/settings";

function open(hash: string): void {
  void browser.tabs.create({ url: `${browser.runtime.getURL("/dashboard.html")}${hash}` });
  window.close();
}

async function openSidePanel(): Promise<void> {
  const api = browser as unknown as {
    sidePanel?: { open: (o: { windowId: number }) => Promise<void> };
    sidebarAction?: { open: () => Promise<void> };
  };
  const win = await browser.windows.getCurrent();
  if (api.sidePanel && win.id !== undefined) await api.sidePanel.open({ windowId: win.id });
  else if (api.sidebarAction) await api.sidebarAction.open();
  window.close();
}

export function Popup() {
  const [status, setStatus] = useState<MessageResponse<"autoApply/status">>();
  const [threshold, setThreshold] = useState(60);
  const refresh = () => void sendMessage("autoApply/status", {}).then(setStatus);
  useEffect(() => {
    void sendMessage("autoApply/status", {}).then(setStatus);
    void loadSettings().then((s) => {
      setThreshold(s.matching.showThreshold);
    });
  }, []);
  const newMatches = useLiveQuery(async () => {
    const db = getDb();
    const today = localDate(Date.now());
    const fresh = await db.jobs
      .filter((j) => localDate(Date.parse(j.firstSeenAt)) === today)
      .primaryKeys();
    const scores = await db.scores.bulkGet(fresh);
    return scores.filter((s) => s && !s.prefilter.excluded && s.final >= threshold).length;
  }, [threshold]);

  const counts: [string, number | undefined, string][] = [
    ["New matches today", newMatches, "#/matches"],
    ["Queued", status?.pending, "#/settings"],
    ["To review", status?.review, "#/review"],
    ["Need you", status?.needsYou, "#/needs-you"],
    ["Applied today", status?.appliedToday, "#/matches"],
  ];

  return (
    <main className="w-72 space-y-3 bg-white p-3 text-sm text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <h1 className="font-semibold">Job Copilot</h1>
      <ul className="grid grid-cols-2 gap-2">
        {counts.map(([label, value, hash]) => (
          <li key={label}>
            <button
              type="button"
              className="w-full rounded-md border border-slate-200 p-2 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
              onClick={() => {
                open(hash);
              }}
            >
              <span className="block text-lg font-semibold">{value ?? "–"}</span>
              <span className="text-xs text-slate-500">{label}</span>
            </button>
          </li>
        ))}
      </ul>
      {status?.enabled &&
        (status.paused ? (
          <div className="space-y-1">
            <p className="text-xs text-amber-800">Paused: {status.paused.reason}</p>
            <Button
              variant="primary"
              onClick={() => void sendMessage("autoApply/resume", {}).then(refresh)}
            >
              Resume auto-apply
            </Button>
          </div>
        ) : (
          <Button
            variant="danger"
            onClick={() => void sendMessage("autoApply/pause", {}).then(refresh)}
          >
            Pause all auto-apply
          </Button>
        ))}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            open("#/matches");
          }}
        >
          Open dashboard
        </Button>
        <Button variant="ghost" onClick={() => void openSidePanel()}>
          Side panel
        </Button>
      </div>
    </main>
  );
}
