/**
 * Auto pipeline rules (spec 16.5, 14.6, 2.4): who may be queued, which resume
 * goes out, when a person must approve, and the checks right before submitting.
 * Pure functions; the background runner applies them.
 */
import type {
  Application,
  Job,
  JobScore,
  NeedsYouReason,
  Profile,
  Settings,
} from "@job-copilot/shared";
import { localDate } from "../ai/scheduler";
import { isSensitiveKey } from "../apply/fields/rules";
import { resolveMode } from "../apply/mode";
import type { AutofillReportMessage } from "../messaging/protocol";

export type Eligibility =
  | { status: "ok" }
  | { status: "needs_approval"; reason: string }
  | { status: "wait"; until: Date; reason: string }
  | { status: "blocked"; reasons: string[] };

export interface EligibilityInput {
  settings: Settings;
  paused?: { reason: string };
  job: Job;
  score?: JobScore;
  profile: Profile;
  /** Every application, to find duplicates and count caps. */
  applications: readonly Application[];
  /** Jobs by ID (company and dedupeKey of past applications). */
  jobs: ReadonlyMap<string, Job>;
  approved: boolean;
  hasResume: boolean;
  now: Date;
  /** The application this queue item already created (not a duplicate of itself). */
  selfApplicationId?: string;
}

const DONE = new Set<Application["status"]>([
  "submitted",
  "unconfirmed",
  "in_progress",
  "queued",
  "needs_you",
]);
const DAY_MS = 86_400_000;

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Inside the active hours (which may wrap past midnight), or when the next window opens. */
export function activeHoursWait(
  hours: Settings["autoApply"]["activeHours"],
  now: Date,
): Date | undefined {
  if (!hours) return undefined;
  const start = minutes(hours.start);
  const end = minutes(hours.end);
  const current = now.getHours() * 60 + now.getMinutes();
  const inside =
    start <= end ? current >= start && current < end : current >= start || current < end;
  if (inside) return undefined;
  const next = new Date(now);
  next.setHours(Math.floor(start / 60), start % 60, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

function tomorrow(now: Date): Date {
  const d = new Date(now);
  d.setHours(24, 5, 0, 0);
  return d;
}

export function checkEligibility(input: EligibilityInput): Eligibility {
  const { settings, job, now } = input;
  const auto = settings.autoApply;
  const blocked: string[] = [];
  if (!auto.enabled || !auto.explanationAccepted) blocked.push("Auto-apply is off.");
  if (input.paused) blocked.push(`Auto-apply is paused: ${input.paused.reason}`);
  if (resolveMode(job.applyUrl || job.url).mode !== "auto") {
    blocked.push("This job is not on a site where Job Copilot may submit.");
  }
  const basics = input.profile.basics;
  if (!basics.fullName || !basics.email || !basics.phone || !input.hasResume) {
    blocked.push("Add your name, email, phone and a resume first.");
  }
  // Never apply twice: this job, or the same job listed elsewhere (spec 2.3).
  const twinIds = new Set(
    [...input.jobs.values()].filter((j) => j.dedupeKey === job.dedupeKey).map((j) => j.id),
  );
  twinIds.add(job.id);
  if (
    input.applications.some(
      (a) => twinIds.has(a.jobId) && a.id !== input.selfApplicationId && DONE.has(a.status),
    )
  ) {
    blocked.push("You already applied to this job.");
  }
  if (blocked.length > 0) return { status: "blocked", reasons: blocked };

  // Daily and per-company caps (spec 2.4).
  const today = localDate(now.getTime());
  const sentToday = input.applications.filter(
    (a) => a.mode === "auto" && a.submittedAt && localDate(Date.parse(a.submittedAt)) === today,
  ).length;
  if (sentToday >= auto.dailyCap) {
    return {
      status: "wait",
      until: tomorrow(now),
      reason: "Today's limit of automatic applications is reached.",
    };
  }
  const windowStart = now.getTime() - auto.perCompanyWindowDays * DAY_MS;
  const company = job.company.name.toLowerCase();
  const atCompany = input.applications.filter((a) => {
    const other = input.jobs.get(a.jobId);
    return (
      a.mode === "auto" &&
      a.submittedAt !== undefined &&
      Date.parse(a.submittedAt) >= windowStart &&
      other?.company.name.toLowerCase() === company
    );
  });
  if (atCompany.length >= auto.perCompanyCap) {
    const oldest = Math.min(...atCompany.map((a) => Date.parse(a.submittedAt ?? "")));
    return {
      status: "wait",
      until: new Date(oldest + auto.perCompanyWindowDays * DAY_MS),
      reason: `You reached the limit for ${job.company.name} in ${String(auto.perCompanyWindowDays)} days.`,
    };
  }
  const wait = activeHoursWait(auto.activeHours, now);
  if (wait) return { status: "wait", until: wait, reason: "Outside your active hours." };

  if (!input.approved) {
    if (auto.approvalMode === "always") {
      return { status: "needs_approval", reason: "You asked to approve every application." };
    }
    const score = input.score?.final ?? 0;
    if (score < auto.threshold) {
      return {
        status: "needs_approval",
        reason: `Score ${String(score)} is below your threshold of ${String(auto.threshold)}.`,
      };
    }
  }
  return { status: "ok" };
}

/** The resume this application uses (spec 14.1 resumeDefault). */
export function chooseResume(
  settings: Settings,
  score: JobScore | undefined,
): "current" | "tailored" {
  const { resumeDefault, tailoredAboveScore } = settings.autoApply;
  if (resumeDefault === "tailored") return "tailored";
  if (resumeDefault === "tailored_above_score" && (score?.final ?? 0) >= tailoredAboveScore) {
    return "tailored";
  }
  return "current";
}

/**
 * Tailored resumes need approval when the validator recorded issues, and for
 * the first N tailored applications (spec 14.6).
 */
export function tailoredNeedsApproval(
  settings: Settings,
  tailoredSentBefore: number,
  validationIssues: readonly string[] | undefined,
): string | undefined {
  if (validationIssues === undefined) return "Make the tailored resume and check it.";
  if (validationIssues.length > 0)
    return "Some AI changes to the tailored resume were rejected; please check it.";
  if (tailoredSentBefore < settings.autoApply.requireApprovalForFirstTailored) {
    return `Your first ${String(settings.autoApply.requireApprovalForFirstTailored)} tailored resumes need your approval.`;
  }
  return undefined;
}

const CONSENT = new Set([
  "privacy_acknowledgement",
  "background_check_consent",
  "legal_attestation",
]);

export interface PendingQuestion {
  question: string;
  key: string;
  note?: string;
}

export type PreSubmit =
  { ok: true } | { ok: false; reason: NeedsYouReason; detail: string; pending: PendingQuestion[] };

/** The checks right before submitting (spec 16.5 step 5). Any failure: never submit. */
export function preSubmitCheck(report: AutofillReportMessage, approved: boolean): PreSubmit {
  const fail = (
    reason: NeedsYouReason,
    detail: string,
    pending: PendingQuestion[] = [],
  ): PreSubmit => ({
    ok: false,
    reason,
    detail,
    pending,
  });
  if (report.captcha)
    return fail("captcha", "The form shows a CAPTCHA. Please finish it yourself.");
  if (report.verificationCode)
    return fail("verification_code", "The form asks for a verification code.");
  if (report.loginForm) return fail("login_required", "The site wants you to log in first.");

  const open = report.fields.filter(
    (f) =>
      f.status === "needs_you" || f.status === "error" || (f.status === "skipped" && f.required),
  );
  if (open.length > 0) {
    const pending = open.map((f) => ({
      question: f.label || f.key,
      key: f.key,
      ...(f.note && { note: f.note }),
    }));
    const reason: NeedsYouReason = open.some((f) => CONSENT.has(f.key))
      ? "consent_required"
      : open.some((f) => isSensitiveKey(f.key))
        ? "missing_sensitive_answer"
        : open.some((f) => f.status === "error")
          ? "validation_error"
          : "unknown_required_question";
    return fail(reason, `${String(open.length)} question(s) need your answer.`, pending);
  }
  // AI answers are shown for review before anything is sent, unless already approved.
  const ai = report.fields.filter((f) => f.status === "filled" && f.source === "ai");
  if (ai.length > 0 && !approved) {
    return fail(
      "approval_required",
      `${String(ai.length)} answer(s) came from AI; please check them.`,
    );
  }
  return { ok: true };
}
