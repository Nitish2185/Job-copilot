import {
  FeedCompaniesSchema,
  FeedIndexSchema,
  type FeedCompanies,
  type FeedIndex,
} from "@job-copilot/shared/schemas/feed";
import { useEffect, useState } from "react";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; index: FeedIndex; companies?: FeedCompanies };

const STATUS_TEXT: Record<string, string> = {
  empty: "No open jobs",
  not_found: "Board not found",
  error: "Fetch failed",
};

async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${import.meta.env.BASE_URL}feed/${path}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
  return res.json();
}

/** The shared feed published next to this site: last update, size and failing boards. */
export function FeedStatus() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const index = FeedIndexSchema.parse(await getJson("index.json", controller.signal));
        const companies = await getJson("companies.json", controller.signal)
          .then((raw) => FeedCompaniesSchema.parse(raw))
          .catch(() => undefined);
        setState({ kind: "ready", index, ...(companies && { companies }) });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ kind: "error", message: error instanceof Error ? error.message : "unknown" });
      }
    })();
    return () => {
      controller.abort();
    };
  }, []);

  const failing =
    state.kind === "ready"
      ? (state.companies?.companies ?? []).filter((c) => c.lastStatus !== "ok")
      : [];

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Job feed status</h1>
      <p className="mt-3 leading-relaxed text-stone-700 dark:text-stone-300">
        The shared feed is rebuilt every few hours from public company job boards. The extension
        downloads it from here.
      </p>
      <section className="mt-8 rounded-lg border border-stone-200 p-6 dark:border-stone-800">
        {state.kind === "loading" && <p className="text-stone-500">Loading...</p>}
        {state.kind === "error" && (
          <p className="text-stone-500">The feed is not published yet ({state.message}).</p>
        )}
        {state.kind === "ready" && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            <div>
              <dt className="text-sm text-stone-500">Open jobs</dt>
              <dd className="text-2xl font-semibold">
                {state.index.totalOpenJobs.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-stone-500">Companies</dt>
              <dd className="text-2xl font-semibold">{state.index.companyCount}</dd>
            </div>
            <div>
              <dt className="text-sm text-stone-500">Not working</dt>
              <dd className="text-2xl font-semibold">{failing.length}</dd>
            </div>
            <div>
              <dt className="text-sm text-stone-500">Last update</dt>
              <dd className="font-medium">{new Date(state.index.generatedAt).toLocaleString()}</dd>
            </div>
          </dl>
        )}
      </section>
      {failing.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Boards that need attention</h2>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-stone-500">
              <tr>
                <th className="py-2 pr-3 font-medium">Company</th>
                <th className="py-2 pr-3 font-medium">Platform</th>
                <th className="py-2 pr-3 font-medium">Problem</th>
                <th className="py-2 font-medium">Last worked</th>
              </tr>
            </thead>
            <tbody>
              {failing.map((c) => (
                <tr
                  key={`${c.platform}:${c.token}`}
                  className="border-t border-stone-200 dark:border-stone-800"
                >
                  <td className="py-2 pr-3">{c.name}</td>
                  <td className="py-2 pr-3">{c.platform}</td>
                  <td className="py-2 pr-3">{STATUS_TEXT[c.lastStatus] ?? c.lastStatus}</td>
                  <td className="py-2">
                    {c.lastOkAt ? new Date(c.lastOkAt).toLocaleDateString() : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
