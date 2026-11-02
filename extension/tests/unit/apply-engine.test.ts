// @vitest-environment jsdom
import type { Preferences, Profile } from "@job-copilot/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runAutofill } from "@/lib/apply/engine";
import { emptyProfile } from "@/lib/profile/profile";
import { defaultPreferences } from "@/lib/profile/store";

const now = new Date("2026-11-02T06:00:00Z");

const profile: Profile = {
  ...emptyProfile(now),
  basics: {
    fullName: "Aarav Mehta",
    email: "aarav.mehta@example.com",
    phone: "+91 99999 01234",
    city: "Pune",
    country: "IN",
    otherLinks: [],
  },
  totalExperienceMonths: 53,
};

const preferences: Preferences = {
  ...defaultPreferences("IN"),
  willingToRelocate: true,
  noticePeriodDays: 30,
  currentCtc: { amount: 1_200_000, currency: "INR", period: "year" },
  salaryDisclosure: "share",
};

afterEach(() => {
  document.body.innerHTML = "";
});

const FORM = `
  <form id="apply">
    <label for="fn">First name *</label><input id="fn" required>
    <label for="em">Email</label><input id="em" type="email">
    <label for="ctc">Current CTC (in LPA)</label><input id="ctc">
    <fieldset><legend>Are you willing to relocate?</legend>
      <label><input type="radio" name="reloc" value="yes"> Yes</label>
      <label><input type="radio" name="reloc" value="no"> No</label></fieldset>
    <div id="follow-up"></div>
    <label for="why">What excites you about this role?</label><textarea id="why"></textarea>
    <label for="otp">Verification code</label><input id="otp">
    <label for="sp">Will you require visa sponsorship in the United States?</label><input id="sp" required>
    <button type="button" id="next">Next</button>
    <button type="submit">Submit application</button>
  </form>`;

describe("runAutofill", () => {
  it("fills, re-scans revealed questions, uses AI only for open questions and never clicks Next or Submit", async () => {
    document.body.innerHTML = FORM;
    // Choosing "Yes" for relocation reveals a follow-up question.
    document
      .querySelector<HTMLInputElement>('input[value="yes"]')
      ?.addEventListener("change", () => {
        const box = document.getElementById("follow-up");
        if (box) box.innerHTML = '<label for="city">Preferred city</label><input id="city">';
      });
    const forbidden = vi.fn();
    document.getElementById("next")?.addEventListener("click", forbidden);
    document.querySelector("form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      forbidden();
    });
    const askAi = vi.fn(() => Promise.resolve({ answer: "Building tools people use daily." }));

    const { report, undo } = await runAutofill(
      document,
      { profile, preferences, answers: [], allowPrivacyAcknowledgement: false },
      { mode: "assist", askAi, now: () => now },
    );

    const byLabel = Object.fromEntries(report.fields.map((f) => [f.label, f]));
    expect(byLabel["First name *"]).toMatchObject({
      status: "filled",
      value: "Aarav",
      source: "profile",
    });
    expect(byLabel["Current CTC (in LPA)"]).toMatchObject({ value: "12", source: "preferences" });
    expect(byLabel["Are you willing to relocate?"]).toMatchObject({ value: "Yes" });
    expect(byLabel["What excites you about this role?"]).toMatchObject({ source: "ai" });
    expect(byLabel["Verification code"]).toMatchObject({ status: "needs_you" });
    expect(byLabel["Will you require visa sponsorship in the United States?"]).toMatchObject({
      status: "filled",
      value: "No",
    });
    // The follow-up question appeared and was handled in the next pass.
    expect(byLabel["Preferred city"]).toBeDefined();
    expect(report.verificationCode).toBe(true);
    expect(askAi).toHaveBeenCalledOnce();
    expect(forbidden).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLInputElement>("#otp")?.value).toBe("");

    for (const step of undo.reverse()) step();
    expect(document.querySelector<HTMLInputElement>("#fn")?.value).toBe("");
  });

  it("reports login forms and CAPTCHAs without filling them", async () => {
    document.body.innerHTML = `
      <form><input type="email" aria-label="Email"><input type="password" aria-label="Password"></form>
      <div class="g-recaptcha" data-sitekey="x"></div>`;
    const { report } = await runAutofill(
      document,
      { profile, answers: [], allowPrivacyAcknowledgement: false },
      { mode: "assist", now: () => now },
    );
    expect(report).toMatchObject({ loginForm: true, captcha: true, fields: [] });
    expect(document.querySelector<HTMLInputElement>("input[type=email]")?.value).toBe("");
  });
});
