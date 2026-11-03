/**
 * Analytics (spec 19.3): applications per week, reply rates by platform,
 * resume type and score, the funnel, skills to learn next and AI usage.
 * Everything is computed on this device and works with no data.
 */
import { skillDisplayName } from "@job-copilot/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { FunnelChart, RateChart, UsageChart, WeeklyChart } from "@/components/analytics/Charts";
import { Loading } from "@/components/ui/States";
import { loadUsageHistory } from "@/lib/ai/usageHistory";
import {
  applicationsPerWeek,
  funnel,
  ratesByPlatform,
  ratesByResume,
  ratesByScore,
  responded,
  usageSeries,
} from "@/lib/analytics/analytics";
import { getDb } from "@/lib/db/db";
import { skillGaps, type MatchRow } from "@/lib/matching/matchList";
import { isTracked } from "@/lib/tracker/tracker";

async function loadAnalytics() {
  const db = getDb();
  const [apps, jobs, scores, history] = await Promise.all([
    db.applications.toArray(),
    db.jobs.toArray(),
    db.scores.toArray(),
    loadUsageHistory(),
  ]);
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const scoreById = new Map(scores.map((s) => [s.jobId, s]));
  const rows = apps.map((app) => ({
    app,
    job: jobById.get(app.jobId),
    score: scoreById.get(app.jobId),
  }));
  const matchRows: MatchRow[] = jobs.map((job) => {
    const score = scoreById.get(job.id);
    return score ? { job, score } : { job };
  });
  return { apps, rows, history, gaps: skillGaps(matchRows, 100, 10) };
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

export function AnalyticsPage() {
  const data = useLiveQuery(loadAnalytics, []);
  if (!data) return <Loading />;
  const now = new Date();
  const sent = data.apps.filter(isTracked);
  const replies = sent.filter(responded).length;
  const steps = funnel(data.apps);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Analytics</h1>
      {sent.length === 0 && (
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-400">
          Charts fill in as you apply and move applications along in the Tracker. Skills to learn
          next and AI usage work already.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Applications sent" value={String(sent.length)} />
        <Stat
          label="Reply rate"
          value={sent.length ? `${String(Math.round((100 * replies) / sent.length))}%` : "–"}
          note="Reached screening or later"
        />
        <Stat label="Interviews" value={String(steps[2]?.count ?? 0)} />
        <Stat label="Offers" value={String(steps[3]?.count ?? 0)} />
      </div>
      <WeeklyChart weeks={applicationsPerWeek(data.apps, now)} />
      <div className="grid gap-6 lg:grid-cols-2">
        <FunnelChart steps={steps} />
        <RateChart
          title="Reply rate by platform"
          description="Share of applications that reached screening or later."
          rows={ratesByPlatform(data.rows)}
        />
        <RateChart
          title="Does tailoring help?"
          description="Reply rate with your resume and with resumes made for the job."
          rows={ratesByResume(data.rows)}
        />
        <RateChart
          title="Reply rate by match score"
          description="Do better matches get more replies?"
          rows={ratesByScore(data.rows)}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section
          className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
          aria-label="Learn next"
        >
          <h2 className="font-semibold">Learn next</h2>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            Skills your best 100 matches ask for that your profile does not list.
          </p>
          {data.gaps.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              No gaps found yet. This fills in once jobs are scored.
            </p>
          ) : (
            <ol className="mt-3 space-y-1 text-sm">
              {data.gaps.map((gap, i) => (
                <li key={gap.skill} className="flex justify-between gap-3">
                  <span>
                    <span className="mr-2 text-slate-400 tabular-nums">{i + 1}.</span>
                    {skillDisplayName(gap.skill)}
                  </span>
                  <span className="text-slate-500 tabular-nums">
                    {gap.jobs} job{gap.jobs === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <UsageChart days={usageSeries(data.history, now)} />
      </div>
    </div>
  );
}
