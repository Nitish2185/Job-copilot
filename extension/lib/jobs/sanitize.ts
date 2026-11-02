/**
 * Sanitizes external HTML (job descriptions) with DOMPurify (spec 4). Needs a
 * DOM, so it runs in extension pages, not the background worker.
 */
import DOMPurify from "dompurify";

let configured = false;

function configure(): void {
  if (configured) return;
  configured = true;
  // Links in job descriptions open in a new tab and never get access to this page.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

export function sanitizeHtml(html: string): string {
  configure();
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "iframe", "img"],
    FORBID_ATTR: ["style", "class", "id"],
  });
}
