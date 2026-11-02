import { skillDisplayName, type JobScore } from "@job-copilot/shared";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useLiveQuery } from "dexie-react-hooks";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { ScoreBadge } from "@/components/matching/ScoreBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorMessage, Loading } from "@/components/ui/States";
import { getDb } from "@/lib/db/db";
import {
  filterMatches,
  postedAt,
  skillGaps,
  sortMatches,
  type MatchRow,
} from "@/lib/matching/matchList";
import { sendMessage } from "@/lib/messaging/client";
import { loadSettings } from "@/lib/settings/settings";
import { useProfile, useScoringQuota } from "../hooks";
import { useMatchFilters } from "../matchFilters";
import { FeedStatusBar } from "./FeedStatusBar";
import { MatchFiltersBar } from "./matches/MatchFiltersBar";
import { SkillGapsPanel } from "./matches/SkillGapsPanel";

const ROW_HEIGHT = 92;
const AI_BATCH = 20;
const GAP_TOP = 100;

function postedLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Ranked job list (spec 18.1): filters, sort, bulk actions and AI scoring. */
export function MatchesPage() {
  const profile = useProfile();
  const jobs = useLiveQuery(() => getDb().jobs.toArray(), []);
  const scores = useLiveQuery(
    async () => new Map((await getDb().scores.toArray()).map((s) => [s.jobId, s])),
    [],
  );
  const { filters, init, update, reset } = useMatchFilters();
  const [showThreshold, setShowThreshold] = useState(60);
  const { quota, refresh } = useScoringQuota();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [scoring, setScoring] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();

  useEffect(() => {
    void loadSettings().then((s) => {
      setShowThreshold(s.matching.showThreshold);
      init(s.matching.showThreshold);
    });
  }, [init]);

  const ranked = (profile?.skills.length ?? 0) > 0;
  const deferredFilters = useDeferredValue(filters);
  const rows = useMemo<MatchRow[]>(
    () =>
      (jobs ?? []).map((job) => {
        const score: JobScore | undefined = scores?.get(job.id);
        return score ? { job, score } : { job };
      }),
    [jobs, scores],
  );
  const visible = useMemo(
    () =>
      deferredFilters
        ? sortMatches(
            filterMatches(rows, deferredFilters, new Date(), ranked),
            deferredFilters.sort,
          )
        : [],
    [rows, deferredFilters, ranked],
  );
  const countries = useMemo(
    () => [...new Set((jobs ?? []).flatMap((j) => j.countryCodes))].sort(),
    [jobs],
  );
  const gaps = useMemo(() => (ranked ? skillGaps(rows, GAP_TOP) : []), [rows, ranked]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is designed to be called this way
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const setStatus = async (ids: string[], status: "saved" | "hidden") => {
    for (let i = 0; i < ids.length; i += 1000) {
      await sendMessage("jobs/setStatus", { ids: ids.slice(i, i + 1000), status });
    }
    setSelected(new Set());
  };

  // "Next 20" means the next estimates in the list as the user sees it.
  const nextToScore = visible
    .filter((r) => r.score?.isEstimate)
    .slice(0, AI_BATCH)
    .map((r) => r.job.id);

  const scoreNext = async () => {
    setScoring(true);
    setMessage(undefined);
    try {
      const result = await sendMessage("match/scoreNext", {
        count: nextToScore.length,
        order: "best",
        jobIds: nextToScore,
      });
      setMessage(
        result.error
          ? {
              ok: false,
              text: `Scored ${String(result.scored)} jobs, then stopped: ${result.error}`,
            }
          : { ok: true, text: `Scored ${String(result.scored)} jobs with AI.` },
      );
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Scoring failed." });
    } finally {
      setScoring(false);
      refresh();
    }
  };

  if (!filters) return <Loading label="Loading jobs..." />;
  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.job.id));

  return (
    <div className="flex h-screen flex-col">
      <FeedStatusBar />
      <div className="space-y-3 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mr-2 text-xl font-semibold">Jobs</h1>
          {jobs && (
            <span className="text-sm text-slate-500" aria-live="polite" data-testid="job-count">
              {visible.length.toLocaleString()} jobs
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {quota && (
              <span className="text-xs text-slate-500" data-testid="ai-quota">
                {quota.aiConfigured
                  ? `${String(quota.remaining)} of ${String(quota.budget)} AI scores left today`
                  : "Add an AI key in Settings to score jobs with AI"}
              </span>
            )}
            <Button
              onClick={() => void scoreNext()}
              disabled={
                scoring ||
                !ranked ||
                !quota?.aiConfigured ||
                quota.remaining === 0 ||
                nextToScore.length === 0
              }
            >
              {scoring ? "Scoring..." : `AI-score the next ${String(AI_BATCH)}`}
            </Button>
          </div>
        </div>
        {profile && !ranked && (
          <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-200">
            Jobs are not ranked yet.{" "}
            <Link to="/onboarding" className="font-medium underline">
              Set up your profile
            </Link>{" "}
            so Job Copilot can score how well each job fits you.
          </p>
        )}
        {message &&
          (message.ok ? (
            <p role="status" className="text-sm text-green-700 dark:text-green-400">
              {message.text}
            </p>
          ) : (
            <ErrorMessage>{message.text}</ErrorMessage>
          ))}
        <MatchFiltersBar
          filters={filters}
          countries={countries}
          ranked={ranked}
          onChange={update}
          onReset={() => {
            reset(showThreshold);
          }}
        />
        <SkillGapsPanel gaps={gaps} top={GAP_TOP} />
        {selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm dark:bg-slate-900">
            <span>{String(selected.size)} selected</span>
            <Button onClick={() => void setStatus([...selected], "saved")}>Save</Button>
            <Button onClick={() => void setStatus([...selected], "hidden")}>Hide</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSelected(new Set());
              }}
            >
              Clear
            </Button>
          </div>
        )}
      </div>

      {!jobs || !scores ? (
        <Loading label="Loading jobs..." />
      ) : visible.length === 0 ? (
        <div className="px-6">
          <EmptyState title={jobs.length === 0 ? "No jobs yet" : "No jobs match these filters"}>
            {jobs.length === 0
              ? "The shared feed is syncing. Press “Sync now” or add companies you like."
              : ranked && !filters.showAll
                ? `No jobs score ${String(filters.minScore)} or more with these filters. Lower the minimum score or turn on “Show all scores”.`
                : "Try a different search or filter."}
          </EmptyState>
        </div>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-6 pb-6">
          <label className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs text-slate-500 dark:border-slate-800">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => {
                setSelected(e.target.checked ? new Set(visible.map((r) => r.job.id)) : new Set());
              }}
            />
            Select all shown
          </label>
          <div
            role="list"
            aria-label="Jobs"
            style={{ height: virtualizer.getTotalSize(), position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const row = visible[item.index];
              if (!row) return null;
              const { job, score } = row;
              const skills = score?.prefilter.matchedSkills.length
                ? score.prefilter.matchedSkills
                : job.skills;
              return (
                <div
                  key={job.id}
                  role="listitem"
                  data-testid="job-row"
                  className="absolute right-0 left-0 border-b border-slate-200 py-3 dark:border-slate-800"
                  style={{ height: ROW_HEIGHT, transform: `translateY(${String(item.start)}px)` }}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1.5"
                      aria-label={`Select ${job.title}`}
                      checked={selected.has(job.id)}
                      onChange={() => {
                        const next = new Set(selected);
                        if (!next.delete(job.id)) next.add(job.id);
                        setSelected(next);
                      }}
                    />
                    <ScoreBadge score={score} />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/jobs/${encodeURIComponent(job.id)}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {job.title}
                      </Link>
                      <p className="truncate text-sm text-slate-600 dark:text-slate-400">
                        {job.company.name} · {job.locations[0] ?? "Location not listed"}
                        {job.remote === "remote" && " · Remote"}
                      </p>
                      <p className="mt-1 flex gap-1 truncate">
                        {skills.slice(0, 5).map((s) => (
                          <Badge
                            key={s}
                            tone={score?.prefilter.matchedSkills.includes(s) ? "green" : "neutral"}
                          >
                            {skillDisplayName(s)}
                          </Badge>
                        ))}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={job.mode === "auto" ? "green" : "blue"}>
                        {job.mode === "auto" ? "Auto" : "Assist"}
                      </Badge>
                      {job.status === "saved" && <Badge tone="amber">Saved</Badge>}
                      <span className="w-14 text-right text-xs text-slate-500">
                        {postedLabel(postedAt(job))}
                      </span>
                      <Button
                        variant="ghost"
                        onClick={() => void setStatus([job.id], "saved")}
                        aria-label={`Save ${job.title}`}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => void setStatus([job.id], "hidden")}
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
