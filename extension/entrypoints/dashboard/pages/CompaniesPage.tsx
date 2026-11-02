import { useLiveQuery } from "dexie-react-hooks";
import { useState, type SyntheticEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorMessage, Loading } from "@/components/ui/States";
import { getDb } from "@/lib/db/db";
import { sendMessage } from "@/lib/messaging/client";
import { suggestionUrl } from "@/lib/sources/suggest";

const PLATFORM_NAMES: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
};

/** Personal company boards (spec 18.1 #/companies, 13.2). */
export function CompaniesPage() {
  const companies = useLiveQuery(() => getDb().companies.orderBy("[platform+token]").toArray(), []);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();

  const add = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    setMessage(undefined);
    try {
      const result = await sendMessage("boards/add", { url: url.trim() });
      if (result.ok) {
        setMessage({
          ok: true,
          text: `Added ${result.company.name} with ${String(result.jobs)} jobs.`,
        });
        setUrl("");
      } else {
        setMessage({ ok: false, text: result.reason });
      }
    } catch (e) {
      setMessage({
        ok: false,
        text: e instanceof Error ? e.message : "Could not add the company.",
      });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-xl font-semibold">Companies</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Add companies you want to follow. Paste a careers or job link from Greenhouse, Lever, Ashby,
        SmartRecruiters or Workable; their jobs are checked every 6 hours.
      </p>

      <form onSubmit={(e) => void add(e)} className="mt-4 flex gap-2">
        <label htmlFor="company-url" className="sr-only">
          Careers or job link
        </label>
        <input
          id="company-url"
          type="url"
          required
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
          }}
          placeholder="https://jobs.lever.co/company"
          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <Button type="submit" variant="primary" disabled={adding}>
          {adding ? "Adding..." : "Add company"}
        </Button>
      </form>
      {message &&
        (message.ok ? (
          <p role="status" className="mt-2 text-sm text-green-700 dark:text-green-400">
            {message.text}
          </p>
        ) : (
          <div className="mt-2">
            <ErrorMessage>{message.text}</ErrorMessage>
          </div>
        ))}

      <div className="mt-6">
        {!companies ? (
          <Loading />
        ) : companies.length === 0 ? (
          <EmptyState title="No companies yet">
            Jobs from the shared feed already cover many companies. Add others here.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {companies.map((c) => (
              <li key={c.id} className="flex items-center gap-3 p-3" data-testid="company-row">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    {PLATFORM_NAMES[c.platform] ?? c.platform} · {c.token}
                    {c.lastFetchedAt && ` · checked ${new Date(c.lastFetchedAt).toLocaleString()}`}
                  </p>
                </div>
                {c.lastStatus && (
                  <Badge
                    tone={
                      c.lastStatus === "ok" ? "green" : c.lastStatus === "empty" ? "neutral" : "red"
                    }
                  >
                    {c.lastStatus === "ok"
                      ? "OK"
                      : c.lastStatus === "empty"
                        ? "No jobs"
                        : c.lastStatus === "not_found"
                          ? "Not found"
                          : "Error"}
                  </Badge>
                )}
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={(e) =>
                      void sendMessage("boards/setEnabled", { id: c.id, enabled: e.target.checked })
                    }
                  />
                  On
                </label>
                <Button onClick={() => void sendMessage("boards/sync", { id: c.id })}>
                  Check now
                </Button>
                <a
                  href={suggestionUrl(c)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-blue-700 underline dark:text-blue-400"
                >
                  Suggest for the shared list
                </a>
                <Button
                  variant="ghost"
                  onClick={() => void sendMessage("boards/remove", { id: c.id })}
                  aria-label={`Remove ${c.name}`}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
