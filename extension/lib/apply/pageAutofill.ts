/**
 * The page side of Autofill, shared by the generic Assist script and the Auto
 * site script: fetch the data, fill, highlight, report.
 */
import { sendMessage } from "../messaging/client";
import { runAutofill, type AutofillData, type AutofillReport } from "./engine";
import type { Mode } from "./fill";
import { showOverlay } from "./overlay";

/** Shared by both content scripts so a page answers the Autofill command only once. */
export const ASSIST_LOADED = "__jobCopilotAssistLoaded";
export const AUTOFILL_COMMAND = "jc-autofill";

export async function fillThisPage(
  data: AutofillData,
  mode: Mode,
): Promise<{ report: AutofillReport; filled: number; needsYou: number }> {
  const { report, undo } = await runAutofill(document, data, {
    mode,
    askAi: (q) => sendMessage("ai/answerQuestion", q),
    now: () => new Date(),
  });
  showOverlay(document, report, () => {
    for (const step of [...undo].reverse()) step();
  });
  await sendMessage("apply/report", { report });
  return {
    report,
    filled: report.fields.filter((f) => f.status === "filled").length,
    needsYou: report.fields.filter((f) => f.status === "needs_you" || f.status === "error").length,
  };
}

/** The user pressed Autofill: always Assist (fill only; submitting is the queue's job). */
export async function manualAutofill(resumeChoice: "current" | "tailored") {
  const data = await sendMessage("apply/context", { url: location.href, resumeChoice });
  const { filled, needsYou } = await fillThisPage(data, "assist");
  return { filled, needsYou };
}
