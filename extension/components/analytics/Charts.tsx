/**
 * Analytics charts (spec 19.3), Recharts with the chart tokens in tailwind.css:
 * one axis per chart, thin marks with rounded ends, recessive grid, a tooltip
 * on every mark, a legend for the two-series chart, and every chart's numbers
 * in a table below it.
 */
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FunnelStep, RateRow, UsageDay, WeekCount } from "@/lib/analytics/analytics";

const AXIS = { stroke: "var(--viz-axis)", fontSize: 12, tick: { fill: "var(--viz-muted)" } };
const TOOLTIP = {
  contentStyle: {
    background: "var(--viz-surface)",
    border: "1px solid var(--viz-grid)",
    borderRadius: 6,
    color: "var(--viz-ink)",
    fontSize: 12,
  },
  labelStyle: { color: "var(--viz-ink)", fontWeight: 600 },
  itemStyle: { color: "var(--viz-ink-2)" },
  cursor: { fill: "var(--viz-grid)", fillOpacity: 0.5 },
};
const LABEL = { fill: "var(--viz-ink-2)", fontSize: 12 };

function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/** A titled card with the chart and, below it, the same numbers as a table. */
export function ChartCard({
  title,
  description,
  empty,
  children,
  table,
}: {
  title: string;
  description?: string;
  /** Shown instead of the chart when there is nothing to plot. */
  empty?: string;
  children: ReactNode;
  table: { head: string[]; rows: (string | number)[][] };
}) {
  return (
    <section
      className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
      aria-label={title}
    >
      <h2 className="font-semibold">{title}</h2>
      {description && (
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{description}</p>
      )}
      {empty ? (
        <p className="mt-6 mb-4 text-sm text-slate-500">{empty}</p>
      ) : (
        <>
          <div className="mt-3 h-56" aria-hidden>
            {children}
          </div>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-slate-600 dark:text-slate-400">
              Show the numbers
            </summary>
            <table className="mt-2 w-full text-left tabular-nums">
              <thead className="text-xs text-slate-500">
                <tr>
                  {table.head.map((h) => (
                    <th key={h} className="py-1 pr-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr
                    key={String(row[0])}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    {row.map((cell, i) => (
                      <td key={`${String(row[0])}-${String(i)}`} className="py-1 pr-3">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}

/** Applications per week, stacked by mode (Assist below, Auto on top). */
export function WeeklyChart({ weeks }: { weeks: WeekCount[] }) {
  const total = weeks.reduce((n, w) => n + w.auto + w.assist, 0);
  return (
    <ChartCard
      title="Applications per week"
      description="Last 12 weeks, by how they were sent."
      {...(total === 0 && { empty: "No applications sent in the last 12 weeks." })}
      table={{
        head: ["Week of", "Assist", "Auto"],
        rows: weeks.map((w) => [dayLabel(w.week), w.assist, w.auto]),
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          accessibilityLayer={false}
          data={weeks}
          margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
        >
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="week" tickFormatter={dayLabel} {...AXIS} tickLine={false} />
          <YAxis allowDecimals={false} {...AXIS} tickLine={false} axisLine={false} />
          <Tooltip
            {...TOOLTIP}
            labelFormatter={(w) => (typeof w === "string" ? `Week of ${dayLabel(w)}` : "")}
          />
          <Legend
            position="top"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12 }}
            // Legend text stays in the text colour; the dot carries the series colour.
            formatter={(value) => <span style={{ color: "var(--viz-ink-2)" }}>{value}</span>}
          />
          <Bar
            dataKey="assist"
            name="Assist"
            stackId="mode"
            fill="var(--viz-series-1)"
            stroke="var(--viz-surface)"
            strokeWidth={2}
            maxBarSize={28}
          />
          <Bar
            dataKey="auto"
            name="Auto"
            stackId="mode"
            fill="var(--viz-series-2)"
            stroke="var(--viz-surface)"
            strokeWidth={2}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Reply rate per group: one hue, horizontal bars on a 0-100% axis, labelled. */
export function RateChart({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: RateRow[];
}) {
  const data = rows.map((r) => ({ ...r, text: `${String(r.rate)}% of ${String(r.sent)}` }));
  return (
    <ChartCard
      title={title}
      description={description}
      {...(rows.length === 0 && { empty: "Shows up once you have sent applications." })}
      table={{
        head: ["Group", "Sent", "Replies", "Reply rate"],
        rows: rows.map((r) => [r.label, r.sent, r.replies, `${String(r.rate)}%`]),
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          accessibilityLayer={false}
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 64, bottom: 0, left: 8 }}
        >
          <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(v) => `${String(v)}%`}
            {...AXIS}
            tickLine={false}
          />
          <YAxis type="category" dataKey="label" width={110} {...AXIS} tickLine={false} />
          <Tooltip
            {...TOOLTIP}
            formatter={(_v, _n, item) => {
              const r = (item as { payload: RateRow }).payload;
              return [`${String(r.rate)}% (${String(r.replies)} of ${String(r.sent)})`, "Replies"];
            }}
          />
          <Bar
            dataKey="rate"
            fill="var(--viz-series-1)"
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
            minPointSize={2}
          >
            <LabelList dataKey="text" position="right" style={LABEL} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** How many applications reached each step. */
export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const data = steps.map((s) => ({ ...s, text: `${String(s.count)} · ${String(s.share)}%` }));
  return (
    <ChartCard
      title="Funnel"
      description="How many applications reached each step (counted at the furthest step)."
      {...((steps[0]?.count ?? 0) === 0 && { empty: "Shows up once you have sent applications." })}
      table={{
        head: ["Step", "Applications", "Share of applied"],
        rows: steps.map((s) => [s.label, s.count, `${String(s.share)}%`]),
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          accessibilityLayer={false}
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 64, bottom: 0, left: 8 }}
        >
          <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
          <XAxis type="number" allowDecimals={false} {...AXIS} tickLine={false} />
          <YAxis type="category" dataKey="label" width={80} {...AXIS} tickLine={false} />
          <Tooltip {...TOOLTIP} formatter={(v) => [String(v), "Applications"]} />
          <Bar dataKey="count" fill="var(--viz-series-1)" radius={[0, 4, 4, 0]} maxBarSize={24}>
            <LabelList dataKey="text" position="right" style={LABEL} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** AI requests per day (cache hits are free and shown in the tooltip and table). */
export function UsageChart({ days }: { days: UsageDay[] }) {
  const total = days.reduce((n, d) => n + d.requests + d.cacheHits, 0);
  return (
    <ChartCard
      title="AI usage"
      description="AI requests per day, last 30 days."
      {...(total === 0 && { empty: "No AI requests in the last 30 days." })}
      table={{
        head: ["Day", "Requests", "From the cache"],
        rows: days
          .filter((d) => d.requests + d.cacheHits > 0)
          .map((d) => [dayLabel(d.date), d.requests, d.cacheHits]),
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          accessibilityLayer={false}
          data={days}
          margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
        >
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis
            dataKey="date"
            tickFormatter={dayLabel}
            {...AXIS}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis allowDecimals={false} {...AXIS} tickLine={false} axisLine={false} />
          <Tooltip
            {...TOOLTIP}
            labelFormatter={(d) => (typeof d === "string" ? dayLabel(d) : "")}
            formatter={(v, _n, item) => {
              const day = (item as { payload: UsageDay }).payload;
              return [`${String(v)} (${String(day.cacheHits)} more from the cache)`, "Requests"];
            }}
          />
          <Bar
            dataKey="requests"
            fill="var(--viz-series-1)"
            radius={[4, 4, 0, 0]}
            maxBarSize={14}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
