import { APP_NAME } from "@job-copilot/shared/config";
import { Compass } from "lucide-react";

/** The app's mark and name, shared by the dashboard, side panel and popup. */
export function BrandMark({ as: Tag = "p" }: { as?: "p" | "h1" }) {
  return (
    <Tag className="flex items-center gap-2.5 text-base font-semibold text-stone-900 dark:text-stone-100">
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white"
      >
        <Compass className="size-5" />
      </span>
      {APP_NAME}
    </Tag>
  );
}
