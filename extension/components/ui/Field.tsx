import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600";

/** A labelled form control. `highlight` marks a value the AI was unsure about. */
export function Field({
  id,
  label,
  hint,
  highlight = false,
  className = "",
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  highlight?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`${className} ${highlight ? "rounded-md bg-amber-50 p-1.5 ring-2 ring-amber-400 dark:bg-amber-950" : ""}`}
      data-uncertain={highlight || undefined}
    >
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
      >
        {label}
        {highlight && (
          <span className="ml-1 text-amber-700 dark:text-amber-300">(please check)</span>
        )}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <h2 className="font-semibold">{title}</h2>
      {description && (
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{description}</p>
      )}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
