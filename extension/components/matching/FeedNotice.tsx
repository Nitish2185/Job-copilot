import { Info } from "lucide-react";
import { Link } from "react-router";
import { FEED_NOT_PUBLISHED } from "@/lib/feed/sync";

/**
 * Why no jobs came from the shared job list, and what to do meanwhile. Not an error
 * box: the rest of Job Copilot works without the shared list.
 */
export function FeedNotice({ error }: { error: string }) {
  const notPublished = error === FEED_NOT_PUBLISHED;
  return (
    <div
      role="status"
      className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="space-y-2">
        <p className="font-medium">
          {notPublished
            ? "The shared job list is not online yet, so no jobs were downloaded."
            : error}
        </p>
        <p>Meanwhile, you can still get jobs:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Add companies you like on the{" "}
            <Link to="/companies" className="font-medium underline">
              Companies
            </Link>{" "}
            page (paste their careers link). Job Copilot reads their job boards directly.
          </li>
          <li>Paste a job on the Jobs page with “Add job manually”.</li>
          <li>Save jobs while you browse Naukri, Indeed or any careers site.</li>
        </ul>
        <p>Job Copilot checks the shared list again every few hours by itself.</p>
      </div>
    </div>
  );
}
