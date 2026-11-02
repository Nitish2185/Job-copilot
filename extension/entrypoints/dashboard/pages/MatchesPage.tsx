import { skillDisplayName, type Job } from "@job-copilot/shared";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useLiveQuery } from "dexie-react-hooks";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, Loading } from "@/components/ui/States";
import { getDb } from "@/lib/db/db";
import { sendMessage } from "@/lib/messaging/client";
import { FeedStatusBar } from "./FeedStatusBar";

const HIDDEN_STATUSES = new Set(["hidden", "closed"]);
const ROW_HEIGHT = 84;

type ModeFilter = "all" | "auto" | "assist";

function matches(job: Job, query: string, mode: ModeFilter): boolean {
  if (mode !== "all" && job.mode !== mode) return false;
  if (query === "") return true;
  const haystack = `${job.title} ${job.company.name} ${job.locations.join(" ")} ${job.skills.join(" ")}`;
  return haystack.toLowerCase().includes(query);
}

function postedLabel(job: Job): string {
  const iso = job.postedAt ?? job.firstSeenAt;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Ranked job list (scores arrive in Phase 5); newest first for now. */
export function MatchesPage() {
  const jobs = useLiveQuery(
    () =>
      getDb()
        .jobs.orderBy("firstSeenAt")
        .reverse()
        .filter((j) => !HIDDEN_STATUSES.has(j.status))
        .toArray(),
    [],
  );
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<ModeFilter>("all");
  const query = useDeferredValue(search.trim().toLowerCase());
  const visible = useMemo(
    () => (jobs ?? []).filter((j) => matches(j, query, mode)),
    [jobs, query, mode],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is designed to be called this way
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const hide = (id: string) => void sendMessage("jobs/setStatus", { ids: [id], status: "hidden" });
  const save = (id: string) => void sendMessage("jobs/setStatus", { ids: [id], status: "saved" });

  return (
    <div className="flex h-screen flex-col">
      <FeedStatusBar />
      <div className="flex flex-wrap items-center gap-3 px-6 py-4">
        <h1 className="mr-4 text-xl font-semibold">Jobs</h1>
        <label className="sr-only" htmlFor="job-search">
          Search jobs
        </label>
        <input
          id="job-search"
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          placeholder="Search title, company, location or skill"
          className="w-80 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <label className="sr-only" htmlFor="mode-filter">
          Apply mode
        </label>
        <select
          id="mode-filter"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as ModeFilter);
          }}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="all">All modes</option>
          <option value="auto">Auto</option>
          <option value="assist">Assist</option>
        </select>
        {jobs && (
          <span className="text-sm text-slate-500" aria-live="polite" data-testid="job-count">
            {visible.length.toLocaleString()} jobs
          </span>
        )}
      </div>

      {!jobs ? (
        <Loading label="Loading jobs..." />
      ) : visible.length === 0 ? (
        <div className="px-6">
          <EmptyState title={jobs.length === 0 ? "No jobs yet" : "No jobs match these filters"}>
            {jobs.length === 0
              ? "The shared feed is syncing. Press “Sync now” or add companies you like."
              : "Try a different search or mode."}
          </EmptyState>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-auto px-6 pb-6"
          role="list"
          aria-label="Jobs"
        >
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((row) => {
              const job = visible[row.index];
              if (!job) return null;
              return (
                <div
                  key={job.id}
                  role="listitem"
                  data-testid="job-row"
                  className="absolute left-0 right-0 border-b border-slate-200 py-3 dark:border-slate-800"
                  style={{ height: ROW_HEIGHT, transform: `translateY(${String(row.start)}px)` }}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate font-medium hover:underline"
                      >
                        {job.title}
                      </a>
                      <p className="truncate text-sm text-slate-600 dark:text-slate-400">
                        {job.company.name} · {job.locations[0] ?? "Location not listed"}
                        {job.remote === "remote" && " · Remote"}
                      </p>
                      <p className="mt-1 flex gap-1 truncate">
                        {job.skills.slice(0, 5).map((s) => (
                          <Badge key={s}>{skillDisplayName(s)}</Badge>
                        ))}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={job.mode === "auto" ? "green" : "blue"}>
                        {job.mode === "auto" ? "Auto" : "Assist"}
                      </Badge>
                      {job.status === "saved" && <Badge tone="amber">Saved</Badge>}
                      <span className="w-14 text-right text-xs text-slate-500">
                        {postedLabel(job)}
                      </span>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          save(job.id);
                        }}
                        aria-label={`Save ${job.title}`}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          hide(job.id);
                        }}
                        aria-label={`Hide ${job.title}`}
                      >
                        Hide
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
