import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { getDb } from "@/lib/db/db";
import { loadDemoData, removeDemoData } from "@/lib/demo/demoData";

/** Development builds only (spec 24): fictional jobs and applications to check every screen. */
export function DemoDataPanel() {
  const [note, setNote] = useState<string>();
  return (
    <div className="space-y-2 text-sm">
      <p className="text-stone-600 dark:text-stone-400">
        Adds 60 fictional jobs and 34 applications (IDs start with “demo:”). Your own data is not
        changed, and “Remove demo data” deletes only these.
      </p>
      <div className="flex gap-2">
        <Button
          onClick={() =>
            void loadDemoData(getDb()).then((d) => {
              setNote(
                `Loaded ${String(d.jobs.length)} jobs and ${String(d.applications.length)} applications.`,
              );
            })
          }
        >
          Load demo data
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            void removeDemoData(getDb()).then((n) => {
              setNote(`Removed ${String(n)} demo records.`);
            })
          }
        >
          Remove demo data
        </Button>
      </div>
      {note && <p role="status">{note}</p>}
    </div>
  );
}
