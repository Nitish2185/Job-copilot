// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { AUTO_ADAPTERS } from "@/lib/apply/adapters/auto";
import { visibleCaptcha, verificationCodeAsked } from "@/lib/apply/adapters/common";

afterEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});

// Structure only, as seen on public application pages (no personal data).
const LEVER_FORM = `
  <form id="application-form" enctype="multipart/form-data" method="POST">
    <div class="application-question resume">
      <input class="application-file-input invisible-resume-upload" data-qa="input-resume" id="resume-upload-input" name="resume" tabindex="-1" type="file">
    </div>
    <div class="application-question"><label>Full name<input name="name"></label></div>
    <div class="h-captcha" data-size="invisible" data-sitekey="x"></div>
    <button id="hcaptchaSubmitBtn" type="submit" class="hidden" style="display:none"></button>
    <button id="btn-submit" type="button" data-qa="btn-submit">Submit application</button>
  </form>`;

const GREENHOUSE_FORM = `
  <form method="get" action="/embed/job_app?for=acme&token=1" id="application-form" class="application--form">
    <input id="first_name"><input id="resume" class="visually-hidden" type="file">
    <button type="submit" class="btn btn--pill">Submit application</button>
  </form>`;

describe("Auto adapters", () => {
  it("finds Lever's visible submit button, not its hidden CAPTCHA button", () => {
    document.body.innerHTML = LEVER_FORM;
    const lever = AUTO_ADAPTERS.lever;
    expect(lever.detectPage(document)).toBe("apply_form");
    expect(lever.findSubmitControl?.(document)?.id).toBe("btn-submit");
    expect(lever.detectCaptcha(document)).toBe(false);
  });

  it("finds Greenhouse's submit button", () => {
    document.body.innerHTML = GREENHOUSE_FORM;
    expect(AUTO_ADAPTERS.greenhouse.findSubmitControl?.(document)?.textContent).toBe(
      "Submit application",
    );
  });

  it("goes straight to the application form", () => {
    expect(AUTO_ADAPTERS.lever.applyUrl?.(new URL("https://jobs.lever.co/acme/abc"))).toBe(
      "https://jobs.lever.co/acme/abc/apply",
    );
    expect(AUTO_ADAPTERS.lever.applyUrl?.(new URL("https://jobs.lever.co/acme/abc/apply"))).toBe(
      "https://jobs.lever.co/acme/abc/apply",
    );
    expect(AUTO_ADAPTERS.ashby.applyUrl?.(new URL("https://jobs.ashbyhq.com/acme/9"))).toBe(
      "https://jobs.ashbyhq.com/acme/9/application",
    );
    expect(
      AUTO_ADAPTERS.workable.applyUrl?.(new URL("https://apply.workable.com/acme/j/ABC/")),
    ).toBe("https://apply.workable.com/acme/j/ABC/apply/");
  });

  it("detects confirmation by page, element or wording", () => {
    window.history.replaceState(null, "", "/acme/abc/thanks");
    document.body.innerHTML = "<h2>Application submitted!</h2>";
    expect(AUTO_ADAPTERS.lever.detectConfirmation(document).confirmed).toBe(true);
    window.history.replaceState(null, "", "/embed/job_app");
    document.body.innerHTML = '<div id="application_confirmation">Thank you for applying.</div>';
    expect(AUTO_ADAPTERS.greenhouse.detectConfirmation(document)).toEqual({
      confirmed: true,
      text: "Thank you for applying.",
    });
    document.body.innerHTML = "<p>We have received your application for Engineer.</p>";
    expect(AUTO_ADAPTERS.ashby.detectConfirmation(document).confirmed).toBe(true);
    document.body.innerHTML = GREENHOUSE_FORM;
    expect(AUTO_ADAPTERS.greenhouse.detectConfirmation(document).confirmed).toBe(false);
  });

  it("reads validation errors", () => {
    document.body.innerHTML = `
      <label for="e">Email</label><input id="e" aria-invalid="true">
      <div class="error-message">Please complete this required field.</div>
      <div role="alert"></div>`;
    expect(AUTO_ADAPTERS.lever.detectErrors(document)).toEqual([
      "Please complete this required field.",
      "Email: needs attention",
    ]);
  });
});

describe("CAPTCHA and verification codes", () => {
  it("ignores invisible CAPTCHA scripts and stops on a visible challenge", () => {
    document.body.innerHTML = `
      <div class="g-recaptcha" data-size="invisible"></div>
      <iframe src="https://www.google.com/recaptcha/api2/anchor?k=x&size=invisible"></iframe>`;
    expect(visibleCaptcha(document)).toBe(false);
    document.body.innerHTML =
      '<iframe src="https://www.google.com/recaptcha/api2/anchor?k=x&size=normal"></iframe>';
    expect(visibleCaptcha(document)).toBe(true);
    document.body.innerHTML =
      '<iframe src="https://newassets.hcaptcha.com/captcha/v1/x/static/hcaptcha.html#frame=challenge"></iframe>';
    expect(visibleCaptcha(document)).toBe(true);
    document.body.innerHTML =
      '<div style="display:none"><iframe src="https://www.google.com/recaptcha/api2/bframe"></iframe></div>';
    expect(visibleCaptcha(document)).toBe(false);
  });

  it("notices verification code boxes", () => {
    document.body.innerHTML =
      '<label for="c">Enter the code we sent to your email</label><input id="c">';
    expect(verificationCodeAsked(document)).toBe(true);
    document.body.innerHTML = '<input autocomplete="one-time-code">';
    expect(verificationCodeAsked(document)).toBe(true);
    document.body.innerHTML = '<input aria-label="Postal code">';
    expect(verificationCodeAsked(document)).toBe(false);
  });
});
