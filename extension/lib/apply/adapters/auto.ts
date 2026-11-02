/**
 * The Auto adapters (spec 17.6): Greenhouse (both UIs), Lever, Ashby, Workable
 * and SmartRecruiters. Every site's selectors are in its SELECTORS entry below
 * (structure checked against public application pages on 2026-11-02; prefer
 * ids, data attributes, labels and text over class names). See CONTRIBUTING.md
 * for fixing a broken adapter.
 */
import type { AutoAdapterId } from "../mode";
import {
  confirmationByText,
  hasApplyForm,
  submitBy,
  verificationCodeAsked,
  visibleCaptcha,
  visibleErrors,
} from "./common";
import type { SiteAdapter } from "./types";

interface Selectors {
  hosts: readonly string[];
  form: readonly string[];
  submit: readonly string[];
  confirmation: readonly string[];
  errors: readonly string[];
  /** Path pattern of the confirmation page, when the site has one. */
  confirmationPath?: RegExp;
  /** Turns a job page path into the application form path. */
  applyPath?: (path: string) => string;
}

export const SELECTORS: Record<AutoAdapterId, Selectors> = {
  greenhouse: {
    hosts: ["boards.greenhouse.io", "job-boards.greenhouse.io"],
    // New UI: form#application-form; old UI: form#application_form.
    form: ["form#application-form", "form#application_form"],
    // New UI: the form's submit button; old UI: input#submit_app.
    submit: [
      "form#application-form button[type=submit]",
      "#submit_app",
      "form#application_form button[type=submit]",
    ],
    confirmation: ["#application_confirmation", "[data-testid=application-confirmation]"],
    errors: [".field-error", ".error-message", ".helper-text--error", "#error_messages"],
    confirmationPath: /\/confirmation\b/,
  },
  lever: {
    hosts: ["jobs.lever.co", "jobs.eu.lever.co"],
    form: ["form#application-form"],
    // The visible button; a hidden one (#hcaptchaSubmitBtn) is used by Lever itself.
    submit: ["#btn-submit", "[data-qa=btn-submit]"],
    confirmation: [".application-confirmation", "[data-qa=msg-submit-success]"],
    errors: [".error-message", ".application-error", "[data-qa=msg-submit-error]"],
    confirmationPath: /\/thanks\/?$/,
    applyPath: (path) => (/\/apply\/?$/.test(path) ? path : `${path.replace(/\/+$/, "")}/apply`),
  },
  ashby: {
    hosts: ["jobs.ashbyhq.com"],
    form: ["form[class*=application-form]", "[class*=ashby-application-form]"],
    submit: ["button[class*=ashby-application-form-submit-button]", "button[type=submit]"],
    confirmation: ["[class*=ashby-application-form-success]"],
    errors: ["[class*=_error]", "[class*=error-message]"],
    applyPath: (path) =>
      /\/application\/?$/.test(path) ? path : `${path.replace(/\/+$/, "")}/application`,
  },
  workable: {
    hosts: ["apply.workable.com"],
    form: ["form[data-ui=application-form]", "form"],
    submit: ["button[data-ui=apply-button]", "form button[type=submit]"],
    confirmation: ["[data-ui=application-success]", "[data-ui=success]"],
    errors: ["[data-ui=error]", "[data-ui=field-error]"],
    applyPath: (path) => (/\/apply\/?$/.test(path) ? path : `${path.replace(/\/+$/, "")}/apply/`),
  },
  smartrecruiters: {
    hosts: ["jobs.smartrecruiters.com"],
    form: ["oc-apply-form", "form"],
    submit: ["button[data-test=footer-submit]", "button[type=submit]"],
    confirmation: ["[data-test=application-success]", "oc-success-screen"],
    errors: ["[data-test=error-message]", ".error-message"],
  },
};

function makeAdapter(id: AutoAdapterId): SiteAdapter {
  const s = SELECTORS[id];
  return {
    id,
    mode: "auto",
    matches: (url) => s.hosts.includes(url.hostname.toLowerCase()),
    detectPage(doc) {
      if (this.detectConfirmation(doc).confirmed) return "confirmation";
      if (hasApplyForm(doc, s.form)) return "apply_form";
      return "job";
    },
    ...(s.applyPath && {
      applyUrl: (url: URL) => {
        const next = new URL(url.href);
        next.pathname = s.applyPath?.(url.pathname) ?? url.pathname;
        return next.href;
      },
    }),
    findSubmitControl: (doc) => submitBy(doc, s.submit),
    detectCaptcha: (doc) => visibleCaptcha(doc),
    detectVerificationCode: (doc) => verificationCodeAsked(doc),
    detectConfirmation(doc) {
      if (s.confirmationPath?.test(doc.location.pathname)) {
        return {
          confirmed: true,
          text: confirmationByText(doc, s.confirmation).text ?? "Confirmation page",
        };
      }
      return confirmationByText(doc, s.confirmation);
    },
    detectErrors: (doc) => visibleErrors(doc, s.errors),
  };
}

export const AUTO_ADAPTERS: Record<AutoAdapterId, SiteAdapter> = {
  greenhouse: makeAdapter("greenhouse"),
  lever: makeAdapter("lever"),
  ashby: makeAdapter("ashby"),
  workable: makeAdapter("workable"),
  smartrecruiters: makeAdapter("smartrecruiters"),
};
