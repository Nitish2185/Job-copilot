import { Lightbulb, X } from "lucide-react";
import { useState, type ReactNode } from "react";

const KEY = "jc-dismissed-tips";

function dismissed(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** A one-line tip for a page, hidden for good once dismissed (a per-browser convenience). */
export function Tip({ id, children }: { id: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(() => dismissed().includes(id));
  if (hidden) return null;
  return (
    <aside
      aria-label="Tip"
      className="flex items-start gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-200"
    >
      <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="flex-1">{children}</p>
      <button
        type="button"
        aria-label="Dismiss tip"
        className="rounded p-0.5 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-blue-900"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(KEY, JSON.stringify([...dismissed(), id]));
          } catch {
            // Tips are a convenience; without storage they come back next time.
          }
        }}
      >
        <X className="size-4" aria-hidden />
      </button>
    </aside>
  );
}
