/**
 * Page-side helpers for job sites: save the job on the page (JSON-LD, the
 * site's DOM, then the AI), suggest a chat chip without clicking it, and build
 * "Report a broken page" diagnostics without personal data (spec 13.4, 17).
 */
import { normalizeQuestion } from "../answers/answerBank";
import type { AutofillData } from "./engine";
import { isShown, precedingText } from "./dom";
import { discoverFields, type FormField } from "./fields/discover";
import { resolveField } from "./fields/resolve";
import { classifyField } from "./fields/rules";
import type { PageJob } from "./adapters/jobFromPage";
import type { SiteAdapter } from "./adapters/types";

export const SAVE_JOB_COMMAND = "jc-save-job";
export const DIAGNOSTICS_COMMAND = "jc-diagnostics";
/** Visible page text sent to the AI when nothing else can read the job. */
export const PAGE_TEXT_LIMIT = 20_000;

export interface SaveDeps {
  extract: (url: string, text: string) => Promise<{ page?: PageJob; error?: string }>;
  save: (page: PageJob) => Promise<{ jobId: string; created: boolean; mode: "auto" | "assist" }>;
}

export type SaveResult =
  | { jobId: string; created: boolean; mode: "auto" | "assist"; title: string; company: string }
  | { error: string };

/** Reads the job on this page and saves it in Job Copilot. */
export async function saveJobFromPage(
  doc: Document,
  readJob: ((doc: Document) => PageJob | undefined) | undefined,
  deps: SaveDeps,
): Promise<SaveResult> {
  let page = readJob?.(doc);
  if (!page) {
    const text = doc.body.innerText || doc.body.textContent;
    const extracted = await deps.extract(doc.location.href, text.slice(0, PAGE_TEXT_LIMIT));
    if (!extracted.page) return { error: extracted.error ?? "No job found on this page." };
    page = extracted.page;
  }
  const saved = await deps.save(page);
  return { ...saved, title: page.title, company: page.company };
}

/** Chat chips grouped by the element that holds each set of choices. */
export function chipGroups(doc: Document, selector: string): HTMLElement[][] {
  const groups = new Map<Element, HTMLElement[]>();
  const all = Array.from(doc.querySelectorAll<HTMLElement>(selector));
  // A loose selector can match the chip list as well as the chips: keep the innermost.
  const chips = all.filter((el) => !all.some((other) => other !== el && el.contains(other)));
  for (const chip of chips) {
    if (!isShown(chip) || !chip.parentElement) continue;
    const list = groups.get(chip.parentElement) ?? [];
    list.push(chip);
    groups.set(chip.parentElement, list);
  }
  return [...groups.values()];
}

const chipText = (chip: HTMLElement) => chip.textContent.replace(/\s+/g, " ").trim();

/**
 * The chip Job Copilot would choose for a chat question, from the profile or the
 * answer bank only (no AI, nothing sensitive). It is highlighted, never clicked:
 * a chip sends the answer the moment it is pressed (spec 17.1).
 */
export async function suggestChip(
  chips: readonly HTMLElement[],
  data: AutofillData,
  now: Date,
): Promise<HTMLElement | undefined> {
  const first = chips[0];
  if (!first?.parentElement) return undefined;
  const label = precedingText(first.parentElement);
  if (!label) return undefined;
  const options = chips.map(chipText);
  const field: FormField = {
    id: "chat",
    kind: "radio",
    element: first.parentElement,
    inputs: [],
    label,
    question: normalizeQuestion(label),
    required: false,
    options,
    name: "",
    placeholder: "",
    autocomplete: "",
  };
  const key = classifyField(field);
  const resolution = await resolveField(field, key, {
    profile: data.profile,
    ...(data.preferences && { preferences: data.preferences }),
    answers: data.answers,
    mode: "assist",
    allowPrivacyAcknowledgement: false,
    ...(data.jobCountry && { jobCountry: data.jobCountry }),
    formKeys: new Set([key]),
    now,
  });
  if (resolution.status !== "fill" || resolution.value.kind !== "option") return undefined;
  const option = resolution.value.option;
  return chips.find((c) => chipText(c) === option);
}

export const CHIP_HINT = "Job Copilot suggests this answer. Click it yourself to send it.";

export function highlightChip(chip: HTMLElement): void {
  chip.style.outline = "2px solid #16a34a";
  chip.style.outlineOffset = "2px";
  chip.title = CHIP_HINT;
  chip.dataset.jcSuggested = "true";
}

/** "/job-listings-react-dev-acme-123456?x=1" -> "/job-listings-react-dev-acme-:id". */
export function pathPattern(url: string): string {
  try {
    return new URL(url).pathname
      .split("/")
      .map((part) =>
        part
          .replace(/[0-9a-f]{8,}|\d{3,}/gi, ":id")
          .replace(/[^\w:.-]/g, "")
          .slice(0, 60),
      )
      .join("/");
  } catch {
    return "";
  }
}

export interface Diagnostics {
  adapterId: string;
  host: string;
  path: string;
  page: string;
  loggedIn: boolean | "unknown";
  fields: { label: string; kind: string; required: boolean }[];
  loginForm: boolean;
  captcha: boolean;
  jobRead: boolean;
  version: string;
}

/**
 * What a maintainer needs to fix an adapter: page shape only. Field labels are
 * the site's questions; values, the address's query and the page text are never
 * included.
 */
export function collectDiagnostics(
  doc: Document,
  adapter: SiteAdapter & { readJob?: (doc: Document) => PageJob | undefined },
  version: string,
): Diagnostics {
  const { fields, loginForm } = discoverFields(doc);
  return {
    adapterId: adapter.id,
    host: doc.location.hostname,
    path: pathPattern(doc.location.href),
    page: adapter.detectPage(doc),
    loggedIn: adapter.isLoggedIn?.(doc) ?? "unknown",
    fields: fields.slice(0, 60).map((f) => ({
      label: f.label.slice(0, 120),
      kind: f.kind,
      required: f.required,
    })),
    loginForm,
    captcha: adapter.detectCaptcha(doc),
    jobRead: adapter.readJob?.(doc) !== undefined,
    version,
  };
}

/** Unfilled visible controls Job Copilot has not seen yet: a new form step appeared. */
export const SEEN_ATTR = "data-jc-seen";
const CONTROL = "input:not([type=hidden]):not([type=password]), select, textarea";

export function markControlsSeen(doc: Document): void {
  for (const el of Array.from(doc.querySelectorAll(CONTROL))) el.setAttribute(SEEN_ATTR, "");
}

export function hasNewControls(doc: Document): boolean {
  return Array.from(doc.querySelectorAll(`:is(${CONTROL}):not([${SEEN_ATTR}])`)).some((el) =>
    isShown(el),
  );
}
