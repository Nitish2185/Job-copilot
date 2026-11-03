import { useLocation } from "react-router";
import { Tip } from "@/components/ui/Tip";

/** One short tip per page (dismissible). The Jobs page shows its own inside its header. */
const TIPS: Record<string, string> = {
  review:
    "Auto-apply waits here for your approval. Open an item to see every answer that will be sent; blue ones were written by the AI.",
  "needs-you":
    "These stopped for something only you can do. “Answer & retry” saves your answer for next time; “Open & finish” reopens the filled form.",
  tracker:
    "Drag a card by its handle (or use Space and the arrow keys) when you hear back. Reminders to follow up come after 7 days by default.",
  analytics:
    "Charts fill in as you move applications along in the Tracker. Every chart has its numbers in a table below it.",
  profile: "Your scores use these skills and years. Saving the profile re-ranks every job.",
  resumes:
    "Tailored resumes appear here per job. You approve each one before it is used, and nothing is added that is not in your profile.",
  companies:
    "Paste a careers link (Greenhouse, Lever, Ashby, SmartRecruiters or Workable) to follow a company the shared feed does not cover.",
  settings:
    "Shortcuts: Alt+Shift+F fills the form on the page, Alt+Shift+J opens the side panel. Change them in your browser's extension shortcuts page.",
};

export function RouteTip() {
  const page = useLocation().pathname.split("/")[1] ?? "";
  const tip = TIPS[page];
  if (!tip) return null;
  return (
    <div className="px-6 pt-4">
      <Tip id={page}>{tip}</Tip>
    </div>
  );
}
