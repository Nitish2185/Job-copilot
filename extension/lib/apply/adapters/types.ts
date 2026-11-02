/** The site adapter interface (spec 16.2). Only Auto adapters can find a submit control. */
import type { AdapterId } from "../mode";

export type PageKind = "job" | "apply_form" | "confirmation" | "login" | "other";

export interface SiteAdapter {
  id: AdapterId;
  mode: "auto" | "assist";
  matches(url: URL): boolean;
  detectPage(doc: Document): PageKind;
  isLoggedIn?(doc: Document): boolean | "unknown";
  /** The platform's application form URL for a job page (go there directly, spec 16.5 step 3). */
  applyUrl?(url: URL): string;
  /** ONLY Auto adapters implement this. */
  findSubmitControl?(doc: Document): HTMLElement | null;
  detectCaptcha(doc: Document): boolean;
  detectVerificationCode(doc: Document): boolean;
  detectConfirmation(doc: Document): { confirmed: boolean; text?: string };
  /** Validation errors shown after a submit attempt. */
  detectErrors(doc: Document): string[];
}
