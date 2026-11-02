import { FeedIndexSchema, type FeedIndex } from "@job-copilot/shared/schemas/feed";
import { useEffect, useState } from "react";

type State =
  { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; index: FeedIndex };

/** Reads the shared feed published next to this site. */
export function FeedStatus() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}feed/index.json`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setState({ kind: "ready", index: FeedIndexSchema.parse(await res.json()) });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: "error", message: error instanceof Error ? error.message : "unknown" });
      });
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <section className="mt-12 rounded-lg border border-slate-200 p-6 dark:border-slate-800">
      <h2 className="text-xl font-semibold">Job feed status</h2>
      {state.kind === "loading" && <p className="mt-2 text-slate-500">Loading...</p>}
      {state.kind === "error" && (
        <p className="mt-2 text-slate-500">The feed is not published yet ({state.message}).</p>
      )}
      {state.kind === "ready" && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2">
          <dt className="text-slate-500">Open jobs</dt>
          <dd className="font-medium">{state.index.totalOpenJobs.toLocaleString()}</dd>
          <dt className="text-slate-500">Companies</dt>
          <dd className="font-medium">{state.index.companyCount}</dd>
          <dt className="text-slate-500">Last update</dt>
          <dd className="font-medium">{new Date(state.index.generatedAt).toLocaleString()}</dd>
        </dl>
      )}
    </section>
  );
}
