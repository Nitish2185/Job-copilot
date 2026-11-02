// @vitest-environment jsdom
import type { Preferences, Profile } from "@job-copilot/shared";
import { afterEach, describe, expect, it } from "vitest";
import { newAnswer } from "@/lib/answers/answerBank";
import { discoverFields } from "@/lib/apply/fields/discover";
import { resolveField, type ResolveContext } from "@/lib/apply/fields/resolve";
import { classifyField } from "@/lib/apply/fields/rules";
import { emptyProfile } from "@/lib/profile/profile";
import { defaultPreferences } from "@/lib/profile/store";

const now = new Date("2026-11-02T06:00:00Z");

const profile: Profile = {
  ...emptyProfile(now),
  basics: {
    fullName: "Aarav Kumar Mehta",
    email: "aarav.mehta@example.com",
    phone: "+91 99999 01234",
    city: "Pune",
    state: "Maharashtra",
    country: "IN",
    linkedinUrl: "https://linkedin.com/in/aarav-mehta-example",
    githubUsername: "aarav-dev",
    otherLinks: [],
  },
  skills: [{ id: "react", displayName: "React", years: 3, source: "resume" }],
  experience: [
    {
      id: "e1",
      company: "Example Fintech",
      title: "Software Engineer",
      startDate: "2022-07",
      endDate: null,
      bullets: [],
      skills: [],
    },
  ],
  totalExperienceMonths: 53,
  education: [
    {
      id: "ed",
      institution: "Example Institute",
      degree: "B.Tech",
      field: "Computer Science",
      endYear: 2020,
    },
  ],
};

const preferences: Preferences = {
  ...defaultPreferences("IN"),
  workAuthorization: [{ countryCode: "IN", status: "citizen" }],
  needsSponsorship: false,
  noticePeriodDays: 60,
  currentCtc: { amount: 1_250_000, currency: "INR", period: "year" },
  expectedCtc: { min: 1_800_000, currency: "INR", period: "year" },
  salaryDisclosure: "share",
  willingToRelocate: true,
  eeo: { gender: "Male" },
};

function ctx(overrides: Partial<ResolveContext> = {}): ResolveContext {
  return {
    profile,
    preferences,
    answers: [],
    mode: "assist",
    allowPrivacyAcknowledgement: false,
    formKeys: new Set(),
    now,
    ...overrides,
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

/** Renders a form and resolves every field with the keys found on it. */
async function resolve(html: string, overrides: Partial<ResolveContext> = {}) {
  document.body.innerHTML = html;
  const { fields } = discoverFields(document);
  const keys = fields.map((f) => classifyField(f));
  const c = ctx({ formKeys: new Set(keys), ...overrides });
  return Promise.all(fields.map((f, i) => resolveField(f, keys[i] ?? "unknown", c)));
}

const one = async (html: string, overrides: Partial<ResolveContext> = {}) =>
  (await resolve(html, overrides))[0];

describe("profile values", () => {
  it("fills names, email and links", async () => {
    const results = await resolve(`
      <input aria-label="First name"><input aria-label="Last name"><input type="email" aria-label="Email">
      <input aria-label="LinkedIn profile"><input aria-label="GitHub"><input aria-label="Current company">`);
    expect(
      results.map((r) =>
        r.status === "fill" && r.value.kind === "text" ? r.value.text : r.status,
      ),
    ).toEqual([
      "Aarav",
      "Mehta",
      "aarav.mehta@example.com",
      "https://linkedin.com/in/aarav-mehta-example",
      "https://github.com/aarav-dev",
      "Example Fintech",
    ]);
  });

  it("splits the phone when the form asks for the country code separately", async () => {
    const results = await resolve(`
      <select aria-label="Country code"><option>+1</option><option>India (+91)</option></select>
      <input type="tel" aria-label="Phone">`);
    expect(results).toEqual([
      { status: "fill", value: { kind: "option", option: "India (+91)" }, source: "profile" },
      { status: "fill", value: { kind: "text", text: "9999901234" }, source: "profile" },
    ]);
    expect(await one('<input type="tel" aria-label="Mobile number">')).toMatchObject({
      value: { text: "+91 99999 01234" },
    });
  });

  it("gives total experience as years, or years and months", async () => {
    expect(await one('<input aria-label="Total experience (in years)">')).toMatchObject({
      value: { text: "4.4" },
    });
    const split = await resolve(`
      <select aria-label="Total experience (years)"><option>3</option><option>4</option><option>5</option></select>
      <select aria-label="Total experience (months)"><option>4</option><option>5</option></select>`);
    expect(
      split.map((r) =>
        r.status === "fill" && r.value.kind === "option" ? r.value.option : r.status,
      ),
    ).toEqual(["4", "5"]);
    expect(
      await one(
        '<select aria-label="Total experience"><option>0-2 years</option><option>2-5 years</option></select>',
      ),
    ).toMatchObject({ value: { option: "2-5 years" } });
  });

  it("uses skill years from the profile", async () => {
    expect(
      await one('<input type="number" aria-label="Years of experience with React">'),
    ).toMatchObject({
      value: { text: "3" },
    });
  });

  it("fills education and country", async () => {
    const results = await resolve(`
      <input aria-label="University"><input aria-label="Graduation year">
      <select aria-label="Country"><option>United States</option><option>India</option></select>`);
    expect(results.map((r) => (r.status === "fill" ? r.value : r.status))).toEqual([
      { kind: "text", text: "Example Institute" },
      { kind: "text", text: "2020" },
      { kind: "option", option: "India" },
    ]);
  });
});

describe("Indian forms", () => {
  it("writes CTC in lakhs when the label says LPA and picks CTC ranges", async () => {
    expect(await one('<input aria-label="Current CTC (in LPA)">')).toMatchObject({
      value: { text: "12.5" },
      source: "preferences",
    });
    expect(await one('<input aria-label="Expected CTC">')).toMatchObject({
      value: { text: "18 LPA" },
    });
    expect(
      await one(
        '<select aria-label="Current CTC"><option>5-10 LPA</option><option>10-15 LPA</option><option>15+ LPA</option></select>',
      ),
    ).toMatchObject({ value: { option: "10-15 LPA" } });
  });

  it("answers notice period buckets and immediate joiner questions", async () => {
    expect(
      await one(
        '<select aria-label="Notice period"><option>Immediate</option><option>1 month</option><option>2 months</option><option>3 months</option></select>',
      ),
    ).toMatchObject({ value: { option: "2 months" } });
    expect(
      await one(`<fieldset><legend>Are you an immediate joiner?</legend>
        <label><input type="radio" name="i"> Yes</label><label><input type="radio" name="i"> No</label></fieldset>`),
    ).toMatchObject({ value: { option: "No" } });
    expect(await one('<input type="number" aria-label="Notice period (days)">')).toMatchObject({
      value: { text: "60" },
    });
  });

  it("never converts pay into another currency", async () => {
    expect(await one('<input aria-label="Expected salary (USD)">')).toMatchObject({
      status: "needs_you",
    });
    expect(await one('<input aria-label="Expected salary in ₹">')).toMatchObject({
      status: "fill",
    });
  });

  it("stops salary questions when the user wants to answer them each time", async () => {
    const result = await one('<input aria-label="Expected CTC">', {
      preferences: { ...preferences, salaryDisclosure: "ask_each_time" },
    });
    expect(result).toMatchObject({ status: "needs_you", reason: "missing_sensitive_answer" });
  });
});

describe("sensitive questions (spec 2.3)", () => {
  const authUs = `<fieldset><legend>Are you legally authorized to work in the United States?</legend>
    <label><input type="radio" name="a"> Yes</label><label><input type="radio" name="a"> No</label></fieldset>`;

  it("answers work authorization only from the user's own answers", async () => {
    expect(await one(authUs)).toMatchObject({
      status: "needs_you",
      reason: "missing_sensitive_answer",
    });
    const withUs = {
      ...preferences,
      workAuthorization: [{ countryCode: "US", status: "work_visa" as const }],
    };
    expect(await one(authUs, { preferences: withUs })).toMatchObject({ value: { option: "Yes" } });
  });

  it("answers sponsorship and relocation from preferences", async () => {
    const results = await resolve(`
      <fieldset><legend>Will you now or in the future require visa sponsorship?</legend>
        <label><input type="radio" name="s"> Yes</label><label><input type="radio" name="s"> No</label></fieldset>
      <fieldset><legend>Are you willing to relocate?</legend>
        <label><input type="radio" name="r"> Yes</label><label><input type="radio" name="r"> No</label></fieldset>`);
    expect(
      results.map((r) =>
        r.status === "fill" && r.value.kind === "option" ? r.value.option : r.status,
      ),
    ).toEqual(["No", "Yes"]);
  });

  it("needs the user for every sensitive question before the ask-once answers exist", async () => {
    const results = await resolve(
      `<input aria-label="Notice period"><input aria-label="Current CTC"><input aria-label="Date of birth">`,
      { preferences: undefined },
    );
    expect(results.every((r) => r.status === "needs_you")).toBe(true);
  });

  it("uses a saved answer for a sensitive question", async () => {
    const saved = await newAnswer(
      {
        question: "Have you ever been convicted of a crime?",
        answer: "No",
        fieldType: "radio",
        sensitive: true,
      },
      now,
    );
    const html = `<fieldset><legend>Have you ever been convicted of a crime?</legend>
      <label><input type="radio" name="c"> Yes</label><label><input type="radio" name="c"> No</label></fieldset>`;
    expect(await one(html)).toMatchObject({ status: "needs_you", reason: "consent_required" });
    expect(await one(html, { answers: [saved] })).toMatchObject({
      value: { option: "No" },
      source: "answer_bank",
    });
  });

  it("never ticks consent boxes, except the privacy notice on Auto sites when allowed", async () => {
    const html = '<label><input type="checkbox" name="p"> I have read the privacy notice</label>';
    expect(await one(html)).toMatchObject({ status: "needs_you", reason: "consent_required" });
    expect(await one(html, { mode: "auto" })).toMatchObject({ status: "needs_you" });
    expect(await one(html, { mode: "auto", allowPrivacyAcknowledgement: true })).toMatchObject({
      value: { kind: "check", checked: true },
    });
    expect(
      await one(
        '<label><input type="checkbox" name="t"> I certify the information is true and complete</label>',
        {
          mode: "auto",
          allowPrivacyAcknowledgement: true,
        },
      ),
    ).toMatchObject({ status: "needs_you", reason: "consent_required" });
  });
});

describe("diversity questions", () => {
  it("uses the saved answer, else declines", async () => {
    const results = await resolve(`
      <select aria-label="Gender"><option>Male</option><option>Female</option><option>Decline to self-identify</option></select>
      <select aria-label="Veteran status"><option>I am a protected veteran</option><option>I don't wish to answer</option></select>
      <select aria-label="Race"><option>Asian</option><option>White</option></select>`);
    expect(results).toEqual([
      { status: "fill", value: { kind: "option", option: "Male" }, source: "preferences" },
      {
        status: "fill",
        value: { kind: "option", option: "I don't wish to answer" },
        source: "decline",
      },
      { status: "skip" },
    ]);
  });
});

describe("other questions", () => {
  it("asks the AI for unknown questions and leaves unanswerable known ones", async () => {
    expect(await one('<textarea aria-label="Describe a challenging project"></textarea>')).toEqual({
      status: "ask_ai",
    });
    expect(await one('<input aria-label="Postal code">')).toEqual({ status: "skip" });
    expect(await one('<input aria-label="Postal code" required>')).toMatchObject({
      status: "needs_you",
      reason: "unknown_required_question",
    });
  });

  it("reuses an active saved answer for a similar question", async () => {
    const saved = await newAnswer(
      {
        question: "Why do you want to join us?",
        answer: "I love the product.",
        fieldType: "textarea",
        sensitive: false,
      },
      now,
    );
    expect(
      await one('<textarea aria-label="Why do you want to join us"></textarea>', {
        answers: [saved],
      }),
    ).toMatchObject({
      value: { text: "I love the product." },
      source: "answer_bank",
    });
  });

  it("attaches files", async () => {
    expect(await one('<input type="file" aria-label="Resume">')).toEqual({
      status: "file",
      which: "resume",
    });
    expect(await one('<input type="file" aria-label="Cover letter">')).toEqual({ status: "skip" });
    expect(
      await one('<input type="file" aria-label="Cover letter">', { coverLetterText: "Dear team" }),
    ).toEqual({
      status: "file",
      which: "cover_letter",
    });
  });
});
