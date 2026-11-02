import {
  SettingsSchema,
  type Application,
  type Job,
  type JobScore,
  type Settings,
} from "@job-copilot/shared";
import { describe, expect, it } from "vitest";
import type { AutofillReportMessage } from "@/lib/messaging/protocol";
import { emptyProfile } from "@/lib/profile/profile";
import {
  activeHoursWait,
  checkEligibility,
  chooseResume,
  preSubmitCheck,
  tailoredNeedsApproval,
  type EligibilityInput,
} from "@/lib/queue/rules";

const now = new Date(2026, 10, 2, 11, 0);

function settings(auto: Partial<Settings["autoApply"]> = {}): Settings {
  const s = SettingsSchema.parse({});
  return { ...s, autoApply: { ...s.autoApply, enabled: true, explanationAccepted: true, ...auto } };
}

const job = (id: string, extra: Partial<Job> = {}): Job => ({
  id,
  platform: "lever",
  source: "feed",
  company: { name: "Acme" },
  title: "Engineer",
  locations: [],
  remote: "remote",
  countryCodes: [],
  url: `https://jobs.lever.co/acme/${id}`,
  applyUrl: `https://jobs.lever.co/acme/${id}/apply`,
  firstSeenAt: "2026-11-01T00:00:00Z",
  skills: [],
  snippet: "",
  mode: "auto",
  dedupeKey: `acme|engineer|${id}`,
  status: "new",
  ...extra,
});

const score = (final: number): JobScore => ({
  jobId: "1",
  profileVersion: 1,
  prefilter: { score: final, matchedSkills: [], missingSkills: [], passed: true, reasons: [] },
  final,
  isEstimate: false,
  scoredAt: "2026-11-02T00:00:00Z",
});

const app = (jobId: string, extra: Partial<Application> = {}): Application => ({
  id: `app-${jobId}`,
  jobId,
  mode: "auto",
  status: "submitted",
  stage: "applied",
  resumeChoice: "current",
  answersSent: [],
  notes: "",
  events: [],
  submittedAt: now.toISOString(),
  ...extra,
});

const profile = {
  ...emptyProfile(now),
  basics: {
    ...emptyProfile(now).basics,
    fullName: "Aarav",
    email: "a@example.com",
    phone: "+91 1",
  },
};

function input(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  const target = overrides.job ?? job("1");
  return {
    settings: settings({ approvalMode: "below_threshold" }),
    job: target,
    score: score(90),
    profile,
    applications: [],
    jobs: new Map([[target.id, target]]),
    approved: false,
    hasResume: true,
    now,
    ...overrides,
  };
}

describe("checkEligibility (spec 16.5 step 1)", () => {
  it("allows a high-scoring job on an Auto site", () => {
    expect(checkEligibility(input())).toEqual({ status: "ok" });
  });

  it("blocks when off, paused, not an Auto site, incomplete or already applied", () => {
    expect(checkEligibility(input({ settings: SettingsSchema.parse({}) }))).toMatchObject({
      status: "blocked",
    });
    expect(checkEligibility(input({ paused: { reason: "3 failures in a row" } }))).toMatchObject({
      reasons: ["Auto-apply is paused: 3 failures in a row"],
    });
    expect(
      checkEligibility(
        input({
          job: job("1", {
            applyUrl: "https://www.naukri.com/job/1",
            url: "https://www.naukri.com/job/1",
          }),
        }),
      ),
    ).toMatchObject({ status: "blocked" });
    expect(checkEligibility(input({ hasResume: false }))).toMatchObject({ status: "blocked" });
    const a = job("1");
    const twin = job("2", { dedupeKey: a.dedupeKey });
    expect(
      checkEligibility(
        input({
          job: a,
          jobs: new Map([
            ["1", a],
            ["2", twin],
          ]),
          applications: [app("2")],
        }),
      ),
    ).toMatchObject({ reasons: ["You already applied to this job."] });
  });

  it("waits for caps and active hours", () => {
    const today = Array.from({ length: 20 }, (_, i) =>
      app(`x${String(i)}`, { id: `x${String(i)}` }),
    );
    expect(checkEligibility(input({ applications: today }))).toMatchObject({ status: "wait" });
    const atAcme = [app("a", { id: "a" }), app("b", { id: "b" })];
    const jobs = new Map([
      ["1", job("1")],
      ["a", job("a")],
      ["b", job("b")],
    ]);
    expect(checkEligibility(input({ applications: atAcme, jobs }))).toMatchObject({
      status: "wait",
      reason: "You reached the limit for Acme in 30 days.",
    });
    expect(
      checkEligibility(
        input({ settings: settings({ activeHours: { start: "18:00", end: "22:00" } }) }),
      ),
    ).toMatchObject({ status: "wait", reason: "Outside your active hours." });
  });

  it("asks for approval below the threshold or when every item needs approval", () => {
    expect(
      checkEligibility(
        input({ score: score(70), settings: settings({ approvalMode: "below_threshold" }) }),
      ),
    ).toMatchObject({
      status: "needs_approval",
    });
    expect(
      checkEligibility(input({ settings: settings({ approvalMode: "always" }) })),
    ).toMatchObject({
      status: "needs_approval",
    });
    expect(
      checkEligibility(input({ settings: settings({ approvalMode: "always" }), approved: true })),
    ).toEqual({ status: "ok" });
  });

  it("handles active hours that cross midnight", () => {
    const hours = { start: "22:00", end: "06:00" };
    expect(activeHoursWait(hours, new Date(2026, 10, 2, 23, 0))).toBeUndefined();
    expect(activeHoursWait(hours, new Date(2026, 10, 2, 5, 0))).toBeUndefined();
    expect(activeHoursWait(hours, new Date(2026, 10, 2, 12, 0))?.getHours()).toBe(22);
  });
});

describe("resume choice and approval (spec 14.1, 14.6)", () => {
  it("follows the resume default", () => {
    expect(chooseResume(settings(), score(95))).toBe("current");
    expect(chooseResume(settings({ resumeDefault: "tailored" }), score(10))).toBe("tailored");
    expect(
      chooseResume(
        settings({ resumeDefault: "tailored_above_score", tailoredAboveScore: 80 }),
        score(85),
      ),
    ).toBe("tailored");
    expect(
      chooseResume(
        settings({ resumeDefault: "tailored_above_score", tailoredAboveScore: 80 }),
        score(70),
      ),
    ).toBe("current");
  });

  it("needs approval for the first tailored resumes and for any validation issue", () => {
    expect(tailoredNeedsApproval(settings(), 2, [])).toContain("first 5");
    expect(tailoredNeedsApproval(settings(), 9, ["Summary adds numbers"])).toContain("rejected");
    expect(tailoredNeedsApproval(settings(), 9, undefined)).toContain("Make the tailored resume");
    expect(tailoredNeedsApproval(settings(), 9, [])).toBeUndefined();
    expect(
      tailoredNeedsApproval(settings({ requireApprovalForFirstTailored: 0 }), 0, []),
    ).toBeUndefined();
  });
});

describe("preSubmitCheck (spec 16.5 step 5)", () => {
  const report = (
    fields: AutofillReportMessage["fields"],
    extra: Partial<AutofillReportMessage> = {},
  ): AutofillReportMessage => ({
    url: "https://jobs.lever.co/acme/1/apply",
    mode: "auto",
    loginForm: false,
    captcha: false,
    verificationCode: false,
    fields,
    ...extra,
  });
  const filled = {
    id: "1",
    label: "Name",
    key: "full_name",
    status: "filled" as const,
    source: "profile" as const,
    value: "A",
  };

  it("passes a fully filled form", () => {
    expect(preSubmitCheck(report([filled]), false)).toEqual({ ok: true });
  });

  it("stops for CAPTCHAs, codes and logins", () => {
    expect(preSubmitCheck(report([filled], { captcha: true }), true)).toMatchObject({
      reason: "captcha",
    });
    expect(preSubmitCheck(report([filled], { verificationCode: true }), true)).toMatchObject({
      reason: "verification_code",
    });
    expect(preSubmitCheck(report([filled], { loginForm: true }), true)).toMatchObject({
      reason: "login_required",
    });
  });

  it("names what is missing", () => {
    const result = preSubmitCheck(
      report([
        filled,
        {
          id: "2",
          label: "Expected CTC",
          key: "expected_ctc",
          status: "needs_you",
          note: "Add it",
        },
        { id: "3", label: "Portfolio", key: "portfolio", status: "skipped", required: true },
      ]),
      true,
    );
    expect(result).toMatchObject({
      ok: false,
      reason: "missing_sensitive_answer",
      pending: [
        { question: "Expected CTC", key: "expected_ctc", note: "Add it" },
        { question: "Portfolio", key: "portfolio" },
      ],
    });
    expect(
      preSubmitCheck(
        report([{ id: "4", label: "I agree", key: "legal_attestation", status: "needs_you" }]),
        true,
      ),
    ).toMatchObject({ reason: "consent_required" });
  });

  it("shows AI answers for review before anything is sent", () => {
    const ai = {
      id: "5",
      label: "Why us?",
      key: "unknown",
      status: "filled" as const,
      source: "ai" as const,
      value: "x",
    };
    expect(preSubmitCheck(report([filled, ai]), false)).toMatchObject({
      reason: "approval_required",
    });
    expect(preSubmitCheck(report([filled, ai]), true)).toEqual({ ok: true });
  });
});
