/** Small DOM helpers for the apply engine: visibility, enabled state and readable text. */

const CONTROLS = "input, select, textarea, button, [role=combobox], [role=listbox]";

/** True in real browsers (layout available); jsdom has no layout. */
function hasLayout(el: Element): boolean {
  return typeof (el as HTMLElement).checkVisibility === "function";
}

/**
 * Visible to the user: not display:none / visibility:hidden / opacity 0 on it or
 * an ancestor, not aria-hidden, not hidden off-screen or squashed to nothing.
 * Hidden "honeypot" fields fail this test and are never filled (spec 2.3).
 */
export function isShown(el: Element): boolean {
  if (el.closest("[hidden], [aria-hidden='true'], [inert]")) return false;
  if (hasLayout(el)) {
    const html = el as HTMLElement;
    if (!html.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const rect = html.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    if (rect.right <= 0 || rect.bottom <= 0) return false;
    return true;
  }
  for (let node: Element | null = el; node; node = node.parentElement) {
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (!style) continue;
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")
      return false;
  }
  return true;
}

export function isDisabled(el: Element): boolean {
  return el.matches(":disabled") || el.closest("[aria-disabled='true']") !== null;
}

/** Collapsed text of an element without the text of form controls inside it (option lists). */
export function textWithoutControls(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  for (const control of Array.from(
    clone.querySelectorAll("select, textarea, [role=listbox], script, style"),
  )) {
    control.remove();
  }
  return clone.textContent.replace(/\s+/g, " ").trim();
}

/**
 * The question text just before a control: a preceding sibling (of the control
 * or of up to 4 ancestors) that has text and no form controls of its own.
 */
export function precedingText(el: Element): string {
  let node: Element | null = el;
  for (let level = 0; node && level < 5; level++, node = node.parentElement) {
    let prev = node.previousElementSibling;
    for (let step = 0; prev && step < 3; step++, prev = prev.previousElementSibling) {
      if (prev.matches(CONTROLS) || prev.querySelector(CONTROLS)) break;
      const text = prev.textContent.replace(/\s+/g, " ").trim();
      if (text !== "") return text.slice(0, 300);
    }
  }
  return "";
}

/** Text of the elements whose IDs are listed (aria-labelledby, aria-describedby). */
export function textOfIds(doc: Document, ids: string | null): string {
  if (!ids) return "";
  return ids
    .split(/\s+/)
    .map((id) => doc.getElementById(id))
    .filter((e): e is HTMLElement => e !== null)
    .map((e) => textWithoutControls(e))
    .join(" ")
    .trim();
}
