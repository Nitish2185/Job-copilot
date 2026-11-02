/**
 * Detection shared by adapters. CAPTCHA scripts sit invisibly on many
 * application pages (Lever loads hCaptcha, Greenhouse reCAPTCHA); only a
 * challenge the user can see counts (spec 2.3: stop, never solve).
 */
import { isShown } from "../dom";

const CHALLENGE_FRAMES = [
  'iframe[src*="recaptcha/api2/bframe"]',
  'iframe[src*="recaptcha/enterprise/bframe"]',
  'iframe[src*="hcaptcha.com"][src*="frame=challenge"]',
  'iframe[src*="challenges.cloudflare.com"]',
];
/** Checkbox widgets ("I'm not a robot") are challenges; invisible ones are not. */
const CHECKBOX_WIDGETS = [
  'iframe[src*="recaptcha/api2/anchor"]:not([src*="size=invisible"])',
  'iframe[src*="recaptcha/enterprise/anchor"]:not([src*="size=invisible"])',
  'iframe[src*="hcaptcha.com"][src*="frame=checkbox"]',
  '.g-recaptcha:not([data-size="invisible"])',
  '.h-captcha:not([data-size="invisible"])',
  ".cf-turnstile",
];

export function visibleCaptcha(doc: Document): boolean {
  return [...CHALLENGE_FRAMES, ...CHECKBOX_WIDGETS].some((selector) =>
    Array.from(doc.querySelectorAll(selector)).some((el) => isShown(el)),
  );
}

const VERIFICATION =
  /\b(otp|one[ -]?time (password|code|passcode)|verification code|security code|confirmation code|enter the code|code (we|we've) sent)\b/i;

export function verificationCodeAsked(doc: Document): boolean {
  return Array.from(doc.querySelectorAll<HTMLInputElement>("input:not([type=hidden])")).some(
    (input) => {
      if (!isShown(input)) return false;
      const text = [
        input.getAttribute("aria-label"),
        input.getAttribute("placeholder"),
        input.getAttribute("name"),
        input.getAttribute("autocomplete") === "one-time-code" ? "one-time code" : "",
        ...Array.from(input.labels ?? []).map((l) => l.textContent),
      ].join(" ");
      return VERIFICATION.test(text);
    },
  );
}

const CONFIRMATION_TEXT =
  /(thank you for (applying|your application|your interest)|thanks for applying|application (has been |was |is )?(submitted|received|sent)|we('ve| have) received your application|your application (is|was) (in|submitted|received))/i;

/** Confirmation by the page's own element, or by its wording. */
export function confirmationByText(
  doc: Document,
  selectors: readonly string[] = [],
): { confirmed: boolean; text?: string } {
  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    if (el && isShown(el))
      return {
        confirmed: true,
        text: el.textContent.replace(/\s+/g, " ").trim().slice(0, 300),
      };
  }
  const body = (doc.body.innerText || doc.body.textContent || "").replace(/\s+/g, " ");
  const match = CONFIRMATION_TEXT.exec(body);
  return match ? { confirmed: true, text: match[0] } : { confirmed: false };
}

/** Visible validation messages. */
export function visibleErrors(doc: Document, selectors: readonly string[]): string[] {
  const texts = new Set<string>();
  for (const selector of [...selectors, '[role="alert"]', '[aria-live="assertive"]']) {
    for (const el of Array.from(doc.querySelectorAll(selector))) {
      const text = el.textContent.replace(/\s+/g, " ").trim();
      if (text !== "" && isShown(el)) texts.add(text.slice(0, 200));
    }
  }
  // Fields the page marked invalid, named by their label.
  for (const field of Array.from(doc.querySelectorAll<HTMLElement>('[aria-invalid="true"]'))) {
    if (!isShown(field)) continue;
    const label =
      (field as HTMLInputElement).labels?.[0]?.textContent.trim() ??
      field.getAttribute("aria-label") ??
      field.getAttribute("name") ??
      "A field";
    texts.add(`${label}: needs attention`);
  }
  return [...texts];
}

/** The visible enabled submit control: a selector match, else a button reading "Submit (application)". */
export function submitBy(doc: Document, selectors: readonly string[]): HTMLElement | null {
  for (const selector of selectors) {
    const el = Array.from(doc.querySelectorAll<HTMLElement>(selector)).find(
      (e) => isShown(e) && !e.matches(":disabled"),
    );
    if (el) return el;
  }
  return (
    Array.from(doc.querySelectorAll<HTMLElement>("button, input[type=submit], [role=button]")).find(
      (e) =>
        isShown(e) &&
        !e.matches(":disabled") &&
        /^\s*submit( (my |your )?application)?\s*$/i.test(
          e.textContent || (e as HTMLInputElement).value || "",
        ),
    ) ?? null
  );
}

export function hasApplyForm(doc: Document, selectors: readonly string[]): boolean {
  return (
    selectors.some((s) => doc.querySelector(s) !== null) ||
    doc.querySelector("form input[type=file]") !== null
  );
}
