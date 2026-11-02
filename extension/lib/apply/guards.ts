/**
 * Click and submit guards (spec 2.1, 2.2). Every programmatic click goes through
 * safeClick(): it refuses anything that submits, advances or navigates, and on
 * Assist sites it allows only form widgets (checkboxes, radios, list options,
 * combobox openers, "Add another" buttons). Submitting is a separate function
 * that checks the page's exact hostname against the Auto allowlist first.
 */
import { AUTO_SUBMIT_HOSTS } from "@job-copilot/shared";

export class ForbiddenClickError extends Error {
  override name = "ForbiddenClickError";
}

export class SubmitHostError extends Error {
  override name = "SubmitHostError";
}

/** Words on buttons and links that submit, advance, navigate, consent or destroy. */
const FORBIDDEN_WORDS =
  /\b(apply|applying|submit|send|sending|continue|next|review|save|saving|done|finish|proceed|confirm|complete|sign\s?in|log\s?in|sign\s?up|register|search|go|back|previous|prev|cancel|close|withdraw|delete|remove|discard|skip|start|begin|post|publish|share|message|reply|chat|book|schedule|pay|buy|checkout|accept|agree|decline|upload\s+and|login|logout|exit|quit|forward|reply)\b|→|»|›/i;

const OPTION_ROLES = new Set([
  "option",
  "menuitemradio",
  "menuitemcheckbox",
  "treeitem",
  "gridcell",
]);
const WIDGET_ROLES = new Set([...OPTION_ROLES, "checkbox", "radio", "switch", "combobox"]);

/** Containers where any click sends a message (chatbots with answer chips). */
const CHAT_CONTAINER =
  '[class*="chat" i], [id*="chat" i], [aria-label*="chat" i], [data-testid*="chat" i], [role="log"]';

function role(el: Element): string {
  return (el.getAttribute("role") ?? "").toLowerCase();
}

/** The text a user would read on the control: label, content, value and title. */
export function controlText(el: Element): string {
  const parts = [
    el.getAttribute("aria-label"),
    el.textContent,
    el instanceof HTMLInputElement ? el.value : null,
    el.getAttribute("title"),
    ...Array.from(el.querySelectorAll("img[alt]"), (img) => img.getAttribute("alt")),
  ];
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/))
      parts.push(el.ownerDocument.getElementById(id)?.textContent ?? null);
  }
  return parts
    .filter((p): p is string => typeof p === "string")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCheckable(el: Element): boolean {
  return el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio");
}

/** The checkbox or radio a label controls, if any. */
function labelControl(el: Element): Element | null {
  const label = el.closest("label");
  if (!label) return null;
  return label.control ?? label.querySelector("input");
}

/**
 * True for anything that could submit a form, move to another step or page,
 * send a message, accept terms or delete data (spec 2.1).
 */
export function isNavigationOrSubmitControl(el: Element): boolean {
  const r = role(el);
  // Clicks inside chat panels send answers.
  if (el.closest(CHAT_CONTAINER)) return true;
  // Links navigate, whatever their href says.
  const anchor = el.closest("a");
  if (anchor && !WIDGET_ROLES.has(role(anchor)) && !WIDGET_ROLES.has(r)) return true;
  if (r === "link") return true;
  if (el.hasAttribute("formaction")) return true;
  if (el instanceof HTMLInputElement && ["submit", "image", "reset"].includes(el.type)) return true;
  const button = el.closest("button");
  if (button) {
    // A <button> in a form submits it unless it says type="button".
    if (button.type === "submit" && button.form) return true;
    if (button.type === "reset") return true;
  }
  if (OPTION_ROLES.has(r) || isCheckable(el)) return false;
  const labelled = labelControl(el);
  if (labelled && isCheckable(labelled)) return false;
  return FORBIDDEN_WORDS.test(controlText(button ?? el));
}

const ADD_ANOTHER = /^\+?\s*add(\s+(another|more|new|an?|one))?(\s+[a-z][\w-]*){0,3}\s*\+?$/i;

/** Clicks Assist mode may make: form widgets and "Add another" buttons (spec 2.1). */
export function isAllowedAssistClick(el: Element): boolean {
  const r = role(el);
  if (OPTION_ROLES.has(r) || r === "checkbox" || r === "radio" || r === "switch") return true;
  if (isCheckable(el)) return true;
  const labelled = labelControl(el);
  if (labelled && isCheckable(labelled)) return true;
  // Combobox openers.
  if (r === "combobox") return true;
  const popup = (el.getAttribute("aria-haspopup") ?? "").toLowerCase();
  if (popup === "listbox" || popup === "true" || popup === "dialog" || popup === "grid")
    return true;
  // "Add another" for repeatable sections (another job, another school).
  const text = controlText(el);
  return ADD_ANOTHER.test(text) && !/\b(to|and|&)\b/i.test(text);
}

function isEnabledAndShown(el: HTMLElement): boolean {
  if (el.matches(":disabled") || el.getAttribute("aria-disabled") === "true") return false;
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  }
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (node.hidden) return false;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style?.display === "none" || style?.visibility === "hidden") return false;
  }
  return true;
}

/** Describes a control for error messages and logs, without page content beyond the label. */
export function describeControl(el: Element): string {
  const text = controlText(el).slice(0, 60);
  return `<${el.tagName.toLowerCase()}${el.getAttribute("role") ? ` role="${role(el)}"` : ""}>${text}`;
}

/**
 * The only way the apply engine clicks. Refuses submit and navigation controls
 * everywhere, and anything but form widgets on Assist sites.
 */
export function safeClick(el: Element, mode: "auto" | "assist"): void {
  if (!(el instanceof HTMLElement)) throw new ForbiddenClickError("Not a clickable element");
  if (isNavigationOrSubmitControl(el)) {
    throw new ForbiddenClickError(
      `Refused to click a submit or navigation control: ${describeControl(el)}`,
    );
  }
  if (mode === "assist" && !isAllowedAssistClick(el)) {
    throw new ForbiddenClickError(`Assist mode only clicks form controls: ${describeControl(el)}`);
  }
  if (!isEnabledAndShown(el)) {
    throw new ForbiddenClickError(`Hidden or disabled: ${describeControl(el)}`);
  }
  el.click();
}

/** Hosts where submitting is allowed. E2E builds add the local fixture host; release builds never do. */
export function autoSubmitHosts(): readonly string[] {
  return import.meta.env.JOB_COPILOT_E2E === true
    ? [...AUTO_SUBMIT_HOSTS, "127.0.0.1"]
    : AUTO_SUBMIT_HOSTS;
}

/** Throws unless the hostname is exactly in the Auto allowlist (spec 2.2). */
export function assertAutoSubmitHost(
  hostname: string,
  allowed: readonly string[] = autoSubmitHosts(),
): void {
  if (!allowed.includes(hostname)) {
    throw new SubmitHostError(`Submitting is never allowed on ${hostname || "this page"}.`);
  }
}

/**
 * The single submit function (spec 2.2): checks the current page's hostname
 * right before clicking the adapter's submit control.
 */
export function submitApplication(
  control: HTMLElement,
  location: Pick<Location, "hostname"> = window.location,
  allowed: readonly string[] = autoSubmitHosts(),
): void {
  assertAutoSubmitHost(location.hostname, allowed);
  control.click();
}
