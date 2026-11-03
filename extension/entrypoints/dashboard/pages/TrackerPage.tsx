/**
 * Tracker (spec 18.1, 19): sent applications on a Kanban board or in a list,
 * the application drawer, follow-up and ghosted flags, and CSV export.
 */
import type { ApplicationStage, Settings } from "@job-copilot/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { ApplicationDrawer } from "@/components/tracker/ApplicationDrawer";
import { TrackerBoard } from "@/components/tracker/TrackerBoard";
import { TrackerList } from "@/components/tracker/TrackerList";
import { Button } from "@/components/ui/Button";
import { EmptyState, Loading } from "@/components/ui/States";
import { getDb } from "@/lib/db/db";
import { downloadBlob } from "@/lib/files/open";
import { loadSettings } from "@/lib/settings/settings";
import { setStage, trackerRows, type TrackerRow } from "@/lib/tracker/store";
import { followUpDue, suggestGhosted, trackerCsv } from "@/lib/tracker/tracker";

type View = "board" | "list";
const VIEW_KEY = "jc-tracker-view";

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "board";
  } catch {
    return "board";
  }
}

export function TrackerPage() {
  const rows = useLiveQuery(() => trackerRows(getDb()), []);
  const [view, setView] = useState<View>(savedView);
  const [open, setOpen] = useState<string>();
  const [notifications, setNotifications] = useState<Settings["notifications"]>();

  useEffect(() => {
    void loadSettings().then((s) => {
      setNotifications(s.notifications);
    });
  }, []);

  const followUpDays = notifications?.followUpDays ?? 7;
  const ghostedAfterDays = notifications?.ghostedAfterDays ?? 30;
  const now = new Date();
  const flagsFor = (row: TrackerRow) => [
    ...(followUpDue(row.app, followUpDays, now) ? ["Follow up"] : []),
    ...(suggestGhosted(row.app, ghostedAfterDays, now) ? ["No reply"] : []),
  ];
  const move = (id: string, stage: ApplicationStage) => {
    void setStage(getDb(), id, stage);
  };
  const choose = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // The view choice is a convenience only.
    }
  };
  const exportCsv = () => {
    if (!rows) return;
    const day = new Date().toISOString().slice(0, 10);
    downloadBlob(
      new Blob([trackerCsv(rows, followUpDays)], { type: "text/csv;charset=utf-8" }),
      `jobcopilot-applications-${day}.csv`,
    );
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Tracker</h1>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="View"
            className="flex rounded-md border border-slate-300 dark:border-slate-700"
          >
            {(["board", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => {
                  choose(v);
                }}
                className={`px-3 py-1.5 text-sm first:rounded-l-md last:rounded-r-md focus-visible:outline-2 focus-visible:outline-blue-600 ${view === v ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900" : ""}`}
              >
                {v === "board" ? "Board" : "List"}
              </button>
            ))}
          </div>
          <Button onClick={exportCsv} disabled={!rows || rows.length === 0}>
            Export CSV
          </Button>
        </div>
      </div>

      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title="No applications yet">
          Applications you send, automatically or with Autofill, appear here at “Applied”. Move them
          along as you hear back.
        </EmptyState>
      ) : view === "board" ? (
        <TrackerBoard rows={rows} onOpen={setOpen} onMove={move} flagsFor={flagsFor} />
      ) : (
        <TrackerList
          rows={rows}
          followUpDays={followUpDays}
          onOpen={setOpen}
          onMove={move}
          flagsFor={flagsFor}
        />
      )}

      <ApplicationDrawer
        appId={open}
        followUpDays={followUpDays}
        ghostedAfterDays={ghostedAfterDays}
        onClose={() => {
          setOpen(undefined);
        }}
      />
    </div>
  );
}
