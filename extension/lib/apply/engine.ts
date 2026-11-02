/**
 * The autofill engine (spec 16.3-16.4), run in the page by a content script:
 * attach the resume, wait for the form to settle, then scan, classify, resolve
 * and fill, re-scanning for newly revealed questions (at most 3 passes). It
 * never submits; Assist mode never clicks anything but form widgets.
 */
import type { AnswerBankEntry, Preferences, Profile } from "@job-copilot/shared";
import { discoverFields, type FieldKind, type FormField } from "./fields/discover";
import { resolveField, type FillValue, type Resolution, type ValueSource } from "./fields/resolve";
import { classifyField } from "./fields/rules";
import { fillField, fillFile, type Mode, type Undo } from "./fill";

export interface FileData {
  name: string;
  type: string;
  /** Base64 file content (messages carry text only). */
  base64: string;
}

export interface AutofillData {
  profile: Profile;
  preferences?: Preferences;
  answers: AnswerBankEntry[];
  allowPrivacyAcknowledgement: boolean;
  jobId?: string;
  jobCountry?: string;
  coverLetterText?: string;
  resume?: FileData;
  coverLetterFile?: FileData;
}

export type FieldStatus = "filled" | "needs_you" | "skipped" | "error";

export interface FieldReport {
  id: string;
  label: string;
  key: string;
  status: FieldStatus;
  source?: ValueSource;
  value?: string;
  note?: string;
}

export interface AutofillReport {
  url: string;
  mode: Mode;
  fields: FieldReport[];
  loginForm: boolean;
  captcha: boolean;
  verificationCode: boolean;
}

export interface EngineDeps {
  mode: Mode;
  /** AI answer for a non-sensitive question (through the background). */
  askAi?: (q: {
    question: string;
    kind: FieldKind;
    options: string[];
    maxLength?: number;
    jobId?: string;
  }) => Promise<{
    answer?: string;
    note?: string;
  }>;
  now: () => Date;
  /** Waits until the page stops changing after the resume upload (sites parse it). */
  waitForIdle?: (root: Node) => Promise<void>;
}

const MAX_PASSES = 3;

const CAPTCHA =
  'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"], .g-recaptcha, .h-captcha, .cf-turnstile, [data-sitekey]';
const VERIFICATION =
  /\b(otp|one[ -]?time (password|code|passcode)|verification code|security code|confirmation code|2fa|two[ -]factor)\b/i;

export function detectCaptcha(doc: Document): boolean {
  return doc.querySelector(CAPTCHA) !== null;
}

export function base64ToBlob(file: FileData): Blob {
  const binary = atob(file.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: file.type });
}

/** Resolves when the DOM has been quiet for 1.5 s (at most 10 s). */
export function waitForDomIdle(root: Node, quietMs = 1500, maxMs = 10_000): Promise<void> {
  return new Promise((resolve) => {
    let timer = setTimeout(done, quietMs);
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(done, quietMs);
    });
    const cap = setTimeout(done, maxMs);
    observer.observe(root, { childList: true, subtree: true, attributes: true });
    function done() {
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(cap);
      resolve();
    }
  });
}

function display(value: FillValue): string {
  switch (value.kind) {
    case "text":
      return value.text;
    case "option":
      return value.option;
    case "options":
      return value.options.join(", ");
    case "check":
      return value.checked ? "Ticked" : "Not ticked";
  }
}

/** Runs autofill on the page and returns the report and the undo steps. */
export async function runAutofill(
  doc: Document,
  data: AutofillData,
  deps: EngineDeps,
): Promise<{ report: AutofillReport; undo: Undo[] }> {
  const undo: Undo[] = [];
  const reports = new Map<string, FieldReport>();
  const report: AutofillReport = {
    url: doc.location.href,
    mode: deps.mode,
    fields: [],
    loginForm: false,
    captcha: detectCaptcha(doc),
    verificationCode: false,
  };

  const record = (field: FormField, key: string, r: Omit<FieldReport, "id" | "label" | "key">) => {
    reports.set(field.id, { id: field.id, label: field.label, key, ...r });
  };

  let attachedResume = false;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const { fields, loginForm } = discoverFields(doc);
    report.loginForm ||= loginForm;
    const fresh = fields.filter((f) => !reports.has(f.id));
    if (fresh.length === 0) break;
    const keys = new Map(fresh.map((f) => [f.id, classifyField(f)]));
    const formKeys = new Set([...keys.values(), ...[...reports.values()].map((r) => r.key)]);
    const ctx = {
      profile: data.profile,
      ...(data.preferences && { preferences: data.preferences }),
      answers: data.answers,
      mode: deps.mode,
      allowPrivacyAcknowledgement: data.allowPrivacyAcknowledgement,
      ...(data.coverLetterText && { coverLetterText: data.coverLetterText }),
      ...(data.jobCountry && { jobCountry: data.jobCountry }),
      formKeys,
      now: deps.now(),
    };

    // The resume goes first: many sites read it and fill fields themselves.
    for (const field of fresh) {
      if (keys.get(field.id) !== "resume_file" || attachedResume) continue;
      if (!data.resume) {
        record(field, "resume_file", {
          status: "needs_you",
          note: "Upload a resume in Job Copilot first.",
        });
        continue;
      }
      try {
        undo.push(fillFile(field, base64ToBlob(data.resume), data.resume.name));
        attachedResume = true;
        record(field, "resume_file", {
          status: "filled",
          source: "profile",
          value: data.resume.name,
        });
        await (deps.waitForIdle ?? waitForDomIdle)(doc.body);
      } catch (e) {
        record(field, "resume_file", {
          status: "error",
          note: e instanceof Error ? e.message : String(e),
        });
      }
    }

    for (const field of fresh) {
      if (reports.has(field.id)) continue;
      const key = keys.get(field.id) ?? "unknown";
      // Verification codes are never filled (spec 2.3).
      if (VERIFICATION.test(field.label)) {
        report.verificationCode = true;
        record(field, key, { status: "needs_you", note: "Enter the code yourself." });
        continue;
      }
      let resolution: Resolution = await resolveField(field, key, ctx);
      if (resolution.status === "ask_ai") resolution = await askAi(field, deps, data);
      await apply(field, key, resolution, data, deps, undo, record);
    }
  }
  report.fields = [...reports.values()];
  return { report, undo };
}

async function askAi(field: FormField, deps: EngineDeps, data: AutofillData): Promise<Resolution> {
  const fallback: Resolution = field.required
    ? {
        status: "needs_you",
        reason: "unknown_required_question",
        note: "Please answer this question.",
      }
    : { status: "skip" };
  if (!deps.askAi || field.kind === "file") return fallback;
  try {
    const result = await deps.askAi({
      question: field.label,
      kind: field.kind,
      options: field.options,
      ...(field.maxLength !== undefined && { maxLength: field.maxLength }),
      ...(data.jobId && { jobId: data.jobId }),
    });
    if (!result.answer) {
      return fallback.status === "needs_you" && result.note
        ? { ...fallback, note: result.note }
        : fallback;
    }
    const value: FillValue =
      field.options.length > 0
        ? field.kind === "checkbox_group"
          ? { kind: "options", options: [result.answer] }
          : { kind: "option", option: result.answer }
        : { kind: "text", text: result.answer };
    return { status: "fill", value, source: "ai" };
  } catch {
    return fallback;
  }
}

async function apply(
  field: FormField,
  key: string,
  resolution: Resolution,
  data: AutofillData,
  deps: EngineDeps,
  undo: Undo[],
  record: (field: FormField, key: string, r: Omit<FieldReport, "id" | "label" | "key">) => void,
): Promise<void> {
  try {
    switch (resolution.status) {
      case "fill":
        undo.push(await fillField(field, resolution.value, deps.mode));
        record(field, key, {
          status: "filled",
          source: resolution.source,
          value: display(resolution.value),
        });
        return;
      case "file": {
        const file = resolution.which === "cover_letter" ? data.coverLetterFile : data.resume;
        if (!file) {
          record(field, key, {
            status: field.required ? "needs_you" : "skipped",
            note: "No file to attach.",
          });
          return;
        }
        undo.push(fillFile(field, base64ToBlob(file), file.name));
        record(field, key, { status: "filled", source: "profile", value: file.name });
        return;
      }
      case "needs_you":
        record(field, key, { status: "needs_you", note: resolution.note });
        return;
      case "skip":
      case "ask_ai":
        record(field, key, { status: "skipped" });
        return;
    }
  } catch (e) {
    record(field, key, { status: "error", note: e instanceof Error ? e.message : String(e) });
  }
}
