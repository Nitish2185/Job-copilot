import { JOB_PLATFORMS } from "@job-copilot/shared";
import type { MatchFilters, MatchSort, StatusFilter } from "@/lib/matching/matchList";

const selectClass =
  "rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900";
const inputClass =
  "rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900";

function Labeled({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="text-xs text-stone-500">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Search, score threshold, sort and the other Matches filters (spec 18.1). */
export function MatchFiltersBar({
  filters,
  countries,
  ranked,
  onChange,
  onReset,
}: {
  filters: MatchFilters;
  countries: readonly string[];
  ranked: boolean;
  onChange: (patch: Partial<MatchFilters>) => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <Labeled id="job-search" label="Search jobs">
          <input
            id="job-search"
            type="search"
            value={filters.query}
            onChange={(e) => {
              onChange({ query: e.target.value });
            }}
            placeholder="Title, company, location or skill"
            className={`${inputClass} w-72`}
          />
        </Labeled>
        {ranked && (
          <>
            <Labeled id="min-score" label="Minimum score">
              <input
                id="min-score"
                type="number"
                min={0}
                max={100}
                value={filters.minScore}
                disabled={filters.showAll}
                onChange={(e) => {
                  onChange({ minScore: Math.max(0, Math.min(100, Number(e.target.value) || 0)) });
                }}
                className={`${inputClass} w-20`}
              />
            </Labeled>
            <label className="flex items-center gap-2 pb-1.5 text-sm">
              <input
                type="checkbox"
                checked={filters.showAll}
                onChange={(e) => {
                  onChange({ showAll: e.target.checked });
                }}
              />
              Show all scores
            </label>
          </>
        )}
        <Labeled id="sort" label="Sort by">
          <select
            id="sort"
            value={filters.sort}
            onChange={(e) => {
              onChange({ sort: e.target.value as MatchSort });
            }}
            className={selectClass}
          >
            <option value="score">Score</option>
            <option value="date">Newest</option>
            <option value="company">Company</option>
          </select>
        </Labeled>
        <Labeled id="status-filter" label="Status">
          <select
            id="status-filter"
            value={filters.status}
            onChange={(e) => {
              onChange({ status: e.target.value as StatusFilter });
            }}
            className={selectClass}
          >
            <option value="open">Open</option>
            <option value="saved">Saved</option>
            <option value="applied">Applied</option>
            <option value="hidden">Hidden</option>
            <option value="closed">Closed</option>
          </select>
        </Labeled>
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-stone-600 dark:text-stone-400">
          More filters
        </summary>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <Labeled id="mode-filter" label="Apply mode">
            <select
              id="mode-filter"
              value={filters.mode}
              onChange={(e) => {
                onChange({ mode: e.target.value as MatchFilters["mode"] });
              }}
              className={selectClass}
            >
              <option value="all">All modes</option>
              <option value="auto">Auto</option>
              <option value="assist">Assist</option>
            </select>
          </Labeled>
          <Labeled id="platform-filter" label="Platform">
            <select
              id="platform-filter"
              value={filters.platform}
              onChange={(e) => {
                onChange({ platform: e.target.value as MatchFilters["platform"] });
              }}
              className={selectClass}
            >
              <option value="all">All platforms</option>
              {JOB_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled id="country-filter" label="Country">
            <select
              id="country-filter"
              value={filters.country}
              onChange={(e) => {
                onChange({ country: e.target.value });
              }}
              className={selectClass}
            >
              <option value="">Any country</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled id="remote-filter" label="Workplace">
            <select
              id="remote-filter"
              value={filters.remote}
              onChange={(e) => {
                onChange({ remote: e.target.value as MatchFilters["remote"] });
              }}
              className={selectClass}
            >
              <option value="all">Any</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">Office</option>
            </select>
          </Labeled>
          <Labeled id="posted-filter" label="Posted">
            <select
              id="posted-filter"
              value={filters.postedWithinDays ?? ""}
              onChange={(e) => {
                onChange({
                  postedWithinDays: e.target.value === "" ? null : Number(e.target.value),
                });
              }}
              className={selectClass}
            >
              <option value="">Any time</option>
              <option value="1">Last 24 hours</option>
              <option value="3">Last 3 days</option>
              <option value="7">Last week</option>
              <option value="30">Last month</option>
            </select>
          </Labeled>
          <Labeled id="company-filter" label="Company">
            <input
              id="company-filter"
              value={filters.company}
              onChange={(e) => {
                onChange({ company: e.target.value });
              }}
              className={`${inputClass} w-40`}
            />
          </Labeled>
          <label className="flex items-center gap-2 pb-1.5 text-sm">
            <input
              type="checkbox"
              checked={filters.hasSalary}
              onChange={(e) => {
                onChange({ hasSalary: e.target.checked });
              }}
            />
            Has salary
          </label>
          <button
            type="button"
            onClick={onReset}
            className="pb-1.5 text-sm text-brand-700 underline dark:text-brand-400"
          >
            Reset filters
          </button>
        </div>
      </details>
    </div>
  );
}
