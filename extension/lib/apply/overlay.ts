/**
 * Highlight overlay (spec 16.4): green = from the profile or saved answers,
 * blue = filled by AI (review it), yellow = needs you. A floating panel in a
 * closed Shadow DOM lists every field with its source and offers "Undo autofill".
 */
import type { AutofillReport, FieldReport } from "./engine";

export const COLORS = { filled: "#16a34a", ai: "#2563eb", needs_you: "#ca8a04" } as const;

const SOURCE_TEXT: Record<string, string> = {
  profile: "your profile",
  preferences: "your answers",
  answer_bank: "saved answer",
  ai: "AI - please check",
  decline: "declined to answer",
};

function colorFor(field: FieldReport): string | undefined {
  if (field.status === "needs_you" || field.status === "error") return COLORS.needs_you;
  if (field.status !== "filled") return undefined;
  return field.source === "ai" ? COLORS.ai : COLORS.filled;
}

/** The element to outline: the control, or the group around radios and checkboxes. */
function outlineTarget(doc: Document, id: string): HTMLElement | null {
  const el = doc.querySelector<HTMLElement>(`[data-jc-field="${CSS.escape(id)}"]`);
  if (!el) return null;
  if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) {
    return (
      el.closest<HTMLElement>("fieldset, [role=radiogroup], [role=group]") ??
      el.closest("label") ??
      el
    );
  }
  return el;
}

export const OVERLAY_TAG = "job-copilot-overlay";

/** Shows the highlights and panel; returns a function that removes them. */
export function showOverlay(doc: Document, report: AutofillReport, onUndo: () => void): () => void {
  doc.querySelector(OVERLAY_TAG)?.remove();
  const restored: (() => void)[] = [];
  for (const field of report.fields) {
    const color = colorFor(field);
    const target = outlineTarget(doc, field.id);
    if (!color || !target) continue;
    const before = { outline: target.style.outline, offset: target.style.outlineOffset };
    target.style.outline = `2px solid ${color}`;
    target.style.outlineOffset = "2px";
    target.dataset.jcHighlight =
      field.status === "filled" ? (field.source === "ai" ? "ai" : "filled") : "needs_you";
    restored.push(() => {
      target.style.outline = before.outline;
      target.style.outlineOffset = before.offset;
      delete target.dataset.jcHighlight;
    });
  }

  const host = doc.createElement(OVERLAY_TAG);
  const shadow = host.attachShadow({ mode: "open" });
  const filled = report.fields.filter((f) => f.status === "filled");
  const needsYou = report.fields.filter((f) => f.status === "needs_you" || f.status === "error");
  const warnings = [
    report.loginForm
      ? "This looks like a login or sign-up form. Job Copilot never fills those."
      : "",
    report.captcha ? "There is a CAPTCHA on this page. Please solve it yourself." : "",
    report.verificationCode ? "Enter the verification code yourself." : "",
  ].filter(Boolean);

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .panel { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 340px; max-height: 60vh;
        overflow: auto; background: #fff; color: #111; border: 1px solid #ccc; border-radius: 10px;
        box-shadow: 0 6px 24px rgba(0,0,0,.18); font: 13px/1.4 system-ui, sans-serif; }
      header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid #eee; }
      h2 { font-size: 14px; margin: 0; }
      ul { list-style: none; margin: 0; padding: 6px 12px; }
      li { padding: 4px 0; border-bottom: 1px solid #f2f2f2; display: flex; gap: 8px; }
      .dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; flex: none; }
      .label { font-weight: 600; }
      .muted { color: #555; }
      .warn { background: #fef3c7; color: #78350f; padding: 8px 12px; margin: 0; }
      footer { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid #eee; }
      button { font: inherit; padding: 5px 10px; border-radius: 6px; border: 1px solid #bbb; background: #f8f8f8; cursor: pointer; }
      button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
    </style>
    <section class="panel" role="region" aria-label="Job Copilot autofill">
      <header><h2></h2><button type="button" data-action="close" aria-label="Close">✕</button></header>
      <div class="warnings"></div>
      <ul></ul>
      <footer><button type="button" data-action="undo">Undo autofill</button></footer>
    </section>`;
  const heading = shadow.querySelector("h2");
  if (heading) {
    heading.textContent = `Filled ${String(filled.length)} field${filled.length === 1 ? "" : "s"}${
      needsYou.length > 0 ? `, ${String(needsYou.length)} need you` : ""
    }`;
  }
  const warningBox = shadow.querySelector(".warnings");
  for (const w of warnings) {
    const p = doc.createElement("p");
    p.className = "warn";
    p.textContent = w;
    warningBox?.append(p);
  }
  const list = shadow.querySelector("ul");
  for (const field of [...needsYou, ...filled]) {
    const li = doc.createElement("li");
    const dot = doc.createElement("span");
    dot.className = "dot";
    dot.style.background = colorFor(field) ?? "#999";
    const body = doc.createElement("span");
    const label = doc.createElement("span");
    label.className = "label";
    label.textContent = field.label || field.key;
    const detail = doc.createElement("div");
    detail.className = "muted";
    detail.textContent =
      field.status === "filled"
        ? `${field.value ?? ""} (${SOURCE_TEXT[field.source ?? ""] ?? "filled"})`
        : (field.note ?? "Please fill this in.");
    body.append(label, detail);
    li.append(dot, body);
    list?.append(li);
  }

  const remove = () => {
    for (const r of restored) r();
    host.remove();
  };
  shadow.querySelector('[data-action="close"]')?.addEventListener("click", remove);
  shadow.querySelector('[data-action="undo"]')?.addEventListener("click", () => {
    onUndo();
    remove();
  });
  doc.body.append(host);
  return remove;
}
