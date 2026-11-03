import { AlertCircle, Inbox } from "lucide-react";
import type { ReactNode } from "react";

/** Loading, empty and error states shared by every list (spec 18). */
export function Loading({ label = "Loading..." }: { label?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 p-6 text-sm text-stone-600">
      <span
        aria-hidden
        className="size-4 animate-spin rounded-full border-2 border-stone-300 border-t-brand-600"
      />
      {label}
    </p>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center dark:border-stone-700 dark:bg-stone-900">
      <Inbox className="mx-auto size-8 text-stone-400" aria-hidden />
      <p className="mt-3 font-medium text-stone-900 dark:text-stone-100">{title}</p>
      {children && (
        <div className="mx-auto mt-1.5 max-w-md text-sm text-stone-600 dark:text-stone-400">
          {children}
        </div>
      )}
    </div>
  );
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
