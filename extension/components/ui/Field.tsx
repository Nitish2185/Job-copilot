import type { ReactNode } from "react";

/** Inputs, selects and text areas share one look: 40 px tall, rounded, clear border. */
export const inputClass =
  "w-full min-h-10 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-xs placeholder:text-stone-500 hover:border-stone-400 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-400";

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
      className={`${className} ${highlight ? "rounded-lg bg-amber-50 p-2 ring-2 ring-amber-300 dark:bg-amber-950" : ""}`}
      data-uncertain={highlight || undefined}
    >
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300"
      >
        {label}
        {highlight && (
          <span className="ml-1 font-normal text-amber-800 dark:text-amber-300">
            (please check)
          </span>
        )}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

/** A white card with a title: the building block of every page. */
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
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{description}</p>
      )}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
