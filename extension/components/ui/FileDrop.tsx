import { FileUp } from "lucide-react";
import { useState, type DragEvent } from "react";
import { ErrorMessage } from "./States";

/**
 * A clear "add a file" area: drop a file on it, or click (or press Enter/Space on)
 * "Choose a file". The real file input stays in the page for keyboards and screen
 * readers; the area shows its focus ring.
 */
export function FileDrop({
  id,
  label,
  title,
  hint,
  accept,
  extensions,
  maxBytes,
  onFile,
}: {
  id: string;
  /** Accessible name of the file input, e.g. "Your resume (PDF or DOCX, up to 5 MB)". */
  label: string;
  /** Large text in the area, e.g. "Drag and drop your resume here". */
  title: string;
  /** Small text under it, e.g. "PDF or DOCX, up to 5 MB". */
  hint: string;
  accept: string;
  /** Allowed file name endings, checked for dropped files (the picker uses `accept`). */
  extensions: readonly string[];
  maxBytes?: number;
  onFile: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string>();

  const take = (file: File | undefined) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!extensions.some((ext) => name.endsWith(ext))) {
      setError(`“${file.name}” is not a ${extensions.join(" or ")} file. Please choose another.`);
      return;
    }
    if (maxBytes !== undefined && file.size > maxBytes) {
      setError(
        `“${file.name}” is ${(file.size / 1_048_576).toFixed(1)} MB. The limit is ${String(Math.round(maxBytes / 1_048_576))} MB.`,
      );
      return;
    }
    setError(undefined);
    onFile(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    take(e.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-3">
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={onDrop}
        data-testid="file-drop"
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600 ${
          dragging
            ? "border-brand-500 bg-brand-50 dark:bg-brand-950"
            : "border-stone-300 bg-stone-50 hover:border-brand-400 hover:bg-brand-50/60 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800"
        }`}
      >
        <span
          aria-hidden
          className="flex size-14 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200"
        >
          <FileUp className="size-7" />
        </span>
        <span className="text-base font-semibold text-stone-900 dark:text-stone-100">
          {dragging ? "Drop it here" : title}
        </span>
        <span className="text-sm text-stone-600 dark:text-stone-400">or</span>
        <span
          aria-hidden
          className="inline-flex min-h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm"
        >
          Choose a file
        </span>
        <span className="text-sm text-stone-600 dark:text-stone-400">{hint}</span>
        <input
          id={id}
          type="file"
          accept={accept}
          aria-label={label}
          className="sr-only"
          onChange={(e) => {
            take(e.target.files?.[0]);
            // Choosing the same file again should still fire a change.
            e.target.value = "";
          }}
        />
      </label>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
