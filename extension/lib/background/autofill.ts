/**
 * Autofill from the background (spec 16.6, 9.3): builds the data a page needs,
 * keeps each tab's last report, and injects the generic Assist script into the
 * tab the user is looking at when they press Autofill (shortcut, menu or panel).
 */
import type { Job } from "@job-copilot/shared";
import { browser } from "wxt/browser";
import type { AutofillData, FileData } from "../apply/engine";
import { getDb } from "../db/db";
import type { AutofillReportMessage } from "../messaging/protocol";
import type { Handlers } from "../messaging/server";
import { loadProfile } from "../profile/store";
import { loadSettings } from "../settings/settings";

export const GENERIC_SCRIPT = "/content-scripts/assist-generic.js";
export const AUTOFILL_COMMAND = "jc-autofill";
const REPORTS_KEY = "autofillReports";

/** "https://jobs.lever.co/acme/123/apply?x=1#y" -> "jobs.lever.co/acme/123" for matching. */
export function comparableUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/(apply|application)\/?$/i, "").replace(/\/+$/, "")}`;
  } catch {
    return url;
  }
}

/** The saved job whose page or apply form this is, if any. */
export async function findJobForUrl(url: string): Promise<Job | undefined> {
  const target = comparableUrl(url);
  return getDb()
    .jobs.filter(
      (j) =>
        comparableUrl(j.url) === target ||
        comparableUrl(j.applyUrl) === target ||
        (j.externalApplyUrl !== undefined && comparableUrl(j.externalApplyUrl) === target),
    )
    .first();
}

export async function blobToFileData(blob: Blob, name: string): Promise<FileData> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 32_768));
  }
  return { name, type: blob.type || "application/pdf", base64: btoa(binary) };
}

async function fileData(fileId: string | undefined): Promise<FileData | undefined> {
  if (!fileId) return undefined;
  const file = await getDb().files.get(fileId);
  return file ? blobToFileData(file.blob, file.name) : undefined;
}

/** The resume to attach: the job's tailored one when chosen, else the chosen base resume. */
async function resumeFileId(
  jobId: string | undefined,
  choice: "current" | "tailored",
): Promise<string | undefined> {
  const db = getDb();
  if (choice === "tailored" && jobId) {
    const tailored = (await db.resumeVersions.where("jobId").equals(jobId).toArray())
      .filter((v) => v.kind === "tailored")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (tailored) return tailored.fileId;
  }
  const [settings, profile] = await Promise.all([loadSettings(), loadProfile(db)]);
  if (settings.tailoring.baseResume === "generated") {
    const generated = await db.resumeVersions.where("kind").equals("base_generated").first();
    if (generated) return generated.fileId;
  }
  return profile.baseResume?.fileId;
}

export async function autofillContext(
  url: string,
  choice: "current" | "tailored",
): Promise<AutofillData> {
  const db = getDb();
  const [profile, stored, answers, settings, job] = await Promise.all([
    loadProfile(db),
    db.preferences.get("me"),
    db.answerBank.filter((a) => a.status === "active").toArray(),
    loadSettings(),
    findJobForUrl(url),
  ]);
  const letter = job
    ? (await db.coverLetters.where("jobId").equals(job.id).toArray()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      )[0]
    : undefined;
  const resume = await fileData(await resumeFileId(job?.id, choice));
  const preferences = stored ? (({ id: _id, ...rest }) => rest)(stored) : undefined;
  return {
    profile,
    ...(preferences && { preferences }),
    answers,
    allowPrivacyAcknowledgement: settings.autoApply.allowPrivacyAcknowledgement,
    ...(job && { jobId: job.id }),
    ...(job?.countryCodes[0] && { jobCountry: job.countryCodes[0] }),
    ...(letter && { coverLetterText: letter.text }),
    ...(resume && { resume }),
    ...(letter?.fileId && { coverLetterFile: await fileData(letter.fileId) }),
  };
}

function sessionArea() {
  // storage.session keeps reports out of the disk; older browsers fall back to local.
  return (
    (browser.storage as { session?: typeof browser.storage.local }).session ?? browser.storage.local
  );
}

async function loadReports(): Promise<Record<string, AutofillReportMessage>> {
  const stored: unknown = (await sessionArea().get(REPORTS_KEY))[REPORTS_KEY];
  return (stored ?? {}) as Record<string, AutofillReportMessage>;
}

export async function saveReport(tabId: number, report: AutofillReportMessage): Promise<void> {
  const reports = await loadReports();
  reports[String(tabId)] = report;
  await sessionArea().set({ [REPORTS_KEY]: reports });
}

export async function lastReport(tabId: number): Promise<AutofillReportMessage | undefined> {
  return (await loadReports())[String(tabId)];
}

/** Injects the generic Assist script (it ignores repeat injections) and runs autofill. */
export async function injectAndRun(
  tabId: number,
  resumeChoice: "current" | "tailored" = "current",
): Promise<{ filled: number; needsYou: number; error?: string }> {
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: [GENERIC_SCRIPT] });
    const reply: unknown = await browser.tabs.sendMessage(tabId, {
      type: AUTOFILL_COMMAND,
      resumeChoice,
    });
    const r = reply as { filled?: number; needsYou?: number; error?: string } | undefined;
    return {
      filled: r?.filled ?? 0,
      needsYou: r?.needsYou ?? 0,
      ...(r?.error && { error: r.error }),
    };
  } catch (e) {
    return {
      filled: 0,
      needsYou: 0,
      error: e instanceof Error ? e.message : "Job Copilot cannot fill forms on this page.",
    };
  }
}

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

export const autofillHandlers: Handlers = {
  "apply/context": ({ url, resumeChoice }) => autofillContext(url, resumeChoice),
  "apply/report": async ({ report }, sender) => {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return { saved: false };
    await saveReport(tabId, report);
    return { saved: true };
  },
  "apply/lastReport": async ({ tabId }) => {
    const report = await lastReport(tabId);
    return report ? { report } : {};
  },
  "apply/autofillTab": async ({ tabId, resumeChoice }) => {
    const id = tabId ?? (await activeTabId());
    if (id === undefined) return { filled: 0, needsYou: 0, error: "No tab to fill." };
    return injectAndRun(id, resumeChoice);
  },
};

export const AUTOFILL_MENU_ID = "jc-autofill-form";

/** Shortcut and right-click menu (spec 9.3); both grant activeTab for the current page. */
export function registerAutofillTriggers(): void {
  browser.runtime.onInstalled.addListener(() => {
    void browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({
        id: AUTOFILL_MENU_ID,
        title: "Autofill this form with Job Copilot",
        contexts: ["page", "editable", "frame"],
      });
    });
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === AUTOFILL_MENU_ID && tab?.id !== undefined) void injectAndRun(tab.id);
  });
  browser.commands.onCommand.addListener((command, tab) => {
    if (command !== "autofill") return;
    void (async () => {
      const id = tab?.id ?? (await activeTabId());
      if (id !== undefined) await injectAndRun(id);
    })();
  });
}
