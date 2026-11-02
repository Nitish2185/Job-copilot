/**
 * Field discovery (spec 16.3): visible, enabled controls with their question
 * text. Radio and checkbox groups become one field. Login and sign-up forms
 * (anything with a password box) are left alone (spec 2.3).
 */
import { normalizeQuestion } from "../../answers/answerBank";
import { isDisabled, isShown, precedingText, textOfIds, textWithoutControls } from "../dom";

export type FieldKind =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "date"
  | "select"
  | "radio"
  | "checkbox"
  | "checkbox_group"
  | "combobox"
  | "file";

export interface FormField {
  /** Stable for this page (stored in data-jc-field). */
  id: string;
  kind: FieldKind;
  element: HTMLElement;
  /** Members of a radio or checkbox group (empty otherwise). */
  inputs: HTMLInputElement[];
  /** The question as shown. */
  label: string;
  /** Lowercase, punctuation stripped (for rules and the answer bank). */
  question: string;
  required: boolean;
  /** Choices for selects, radio and checkbox groups. Comboboxes list theirs only when opened. */
  options: string[];
  name: string;
  placeholder: string;
  autocomplete: string;
  maxLength?: number;
  accept?: string;
}

export interface Discovery {
  fields: FormField[];
  /** A visible password box: a login or sign-up form the engine must not fill. */
  loginForm: boolean;
}

const SKIPPED_TYPES = new Set([
  "hidden",
  "submit",
  "button",
  "image",
  "reset",
  "password",
  "search",
]);
const KIND_BY_TYPE: Record<string, FieldKind> = {
  email: "email",
  tel: "tel",
  url: "url",
  number: "number",
  date: "date",
  month: "date",
  file: "file",
};

let nextId = 1;
function fieldId(el: HTMLElement): string {
  el.dataset.jcField ??= String(nextId++);
  return el.dataset.jcField;
}

/** The first non-empty text, trimmed. */
function firstText(...texts: string[]): string {
  return texts.find((t) => t.trim() !== "")?.trim() ?? "";
}

function humanize(name: string): string {
  return name
    .replace(/\[\d*\]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.[\]]+/g, " ")
    .trim();
}

/** The question text for a control, in the order of spec 16.3. */
export function labelFor(el: HTMLElement): string {
  const doc = el.ownerDocument;
  const labels = "labels" in el ? Array.from((el as HTMLInputElement).labels ?? []) : [];
  const forLabel = labels.find((l) => l.htmlFor !== "" && l.htmlFor === el.id);
  const candidates = [
    forLabel ? textWithoutControls(forLabel) : "",
    textOfIds(doc, el.getAttribute("aria-labelledby")),
    el.getAttribute("aria-label") ?? "",
    (() => {
      const wrapping = el.closest("label");
      return wrapping ? textWithoutControls(wrapping) : "";
    })(),
    precedingText(el),
    el.getAttribute("placeholder") ?? "",
    humanize(el.getAttribute("name") ?? ""),
  ];
  return candidates.find((c) => c.trim() !== "")?.trim() ?? "";
}

/** The question for a radio or checkbox group: legend, group label, or the text before it. */
function groupLabel(inputs: readonly HTMLInputElement[]): string {
  const first = inputs[0];
  if (!first) return "";
  const doc = first.ownerDocument;
  const fieldset = first.closest("fieldset");
  const legend = fieldset?.querySelector("legend");
  if (legend && textWithoutControls(legend) !== "") return textWithoutControls(legend);
  const group = first.closest("[role=radiogroup], [role=group]");
  if (group) {
    const text =
      textOfIds(doc, group.getAttribute("aria-labelledby")) ||
      (group.getAttribute("aria-label") ?? "");
    if (text !== "") return text;
  }
  // The text before the first option's own label (or the group's wrapper).
  const optionLabel = first.closest("label") ?? first;
  const container = inputs.length > 1 ? commonAncestor(inputs) : optionLabel;
  return precedingText(container ?? optionLabel) || humanize(first.name) || optionText(first);
}

function commonAncestor(nodes: readonly Element[]): Element | null {
  let candidate: Element | null = nodes[0]?.parentElement ?? null;
  while (candidate && !nodes.every((n) => candidate?.contains(n)))
    candidate = candidate.parentElement;
  return candidate;
}

/** The visible text of one radio or checkbox option. */
function optionText(input: HTMLInputElement): string {
  const label = Array.from(input.labels ?? [])[0];
  if (label) return textWithoutControls(label);
  return firstText(
    input.getAttribute("aria-label") ?? "",
    textOfIds(input.ownerDocument, input.getAttribute("aria-labelledby")),
    input.value,
  );
}

/** Checkboxes and radios are often hidden behind a styled label; the label counts. */
function checkableShown(input: HTMLInputElement): boolean {
  if (isShown(input)) return true;
  return Array.from(input.labels ?? []).some((l) => isShown(l));
}

/** File inputs are usually hidden behind a button; their container counts. */
function fileShown(input: HTMLInputElement): boolean {
  return isShown(input) || (input.parentElement !== null && isShown(input.parentElement));
}

function requiredFrom(el: Element, label: string): boolean {
  return (
    (el as HTMLInputElement).required ||
    el.getAttribute("aria-required") === "true" ||
    /\*\s*$|^\*|\(required\)/i.test(label)
  );
}

function base(el: HTMLElement, kind: FieldKind, label: string): FormField {
  const field: FormField = {
    id: fieldId(el),
    kind,
    element: el,
    inputs: [],
    label,
    question: normalizeQuestion(label),
    required: requiredFrom(el, label),
    options: [],
    name: el.getAttribute("name") ?? "",
    placeholder: el.getAttribute("placeholder") ?? "",
    autocomplete: (el.getAttribute("autocomplete") ?? "").toLowerCase(),
  };
  const maxLength = (el as HTMLInputElement).maxLength;
  if (typeof maxLength === "number" && maxLength > 0) field.maxLength = maxLength;
  return field;
}

/** Finds every fillable field under `root`. */
export function discoverFields(root: ParentNode): Discovery {
  const fields: FormField[] = [];
  const seenGroups = new Set<string>();
  const loginForm = Array.from(
    root.querySelectorAll<HTMLInputElement>("input[type=password]"),
  ).some((p) => isShown(p) && !isDisabled(p));

  const controls = root.querySelectorAll<HTMLElement>("input, textarea, select, [role=combobox]");
  for (const el of Array.from(controls)) {
    // Never fill anything inside a form that asks for a password.
    if (el.closest("form")?.querySelector("input[type=password]")) continue;
    if (el.closest("[role=search], form[role=search]")) continue;
    if (isDisabled(el)) continue;
    // A combobox inside another combobox (the input of a custom select) is the same field.
    if (el.parentElement?.closest("[role=combobox]")) continue;

    if (el.getAttribute("role") === "combobox") {
      if (!isShown(el)) continue;
      fields.push(base(el, "combobox", labelFor(el)));
      continue;
    }
    if (el instanceof HTMLSelectElement) {
      if (!isShown(el)) continue;
      const field = base(el, "select", labelFor(el));
      field.options = Array.from(el.options)
        .filter((o) => !(o.value === "" && /^\s*(select|choose|--|please)/i.test(o.text)))
        .filter((o) => o.text.trim() !== "")
        .map((o) => o.text.trim());
      fields.push(field);
      continue;
    }
    if (el instanceof HTMLTextAreaElement) {
      if (!isShown(el) || el.readOnly) continue;
      fields.push(base(el, "textarea", labelFor(el)));
      continue;
    }
    if (!(el instanceof HTMLInputElement)) continue;
    const type = el.type.toLowerCase();
    if (SKIPPED_TYPES.has(type)) continue;

    if (type === "radio" || type === "checkbox") {
      const scope = el.form ?? el.ownerDocument;
      const group =
        el.name !== ""
          ? Array.from(scope.querySelectorAll<HTMLInputElement>(`input[type=${type}]`)).filter(
              (i) => i.name === el.name && !isDisabled(i) && checkableShown(i),
            )
          : [el];
      const key = `${type}:${el.name || fieldId(el)}`;
      if (seenGroups.has(key) || group.length === 0) continue;
      seenGroups.add(key);
      const isGroup = type === "radio" || group.length > 1;
      const first = group[0] ?? el;
      const label = isGroup ? groupLabel(group) : optionText(first) || labelFor(first);
      const field = base(
        first,
        type === "radio" ? "radio" : isGroup ? "checkbox_group" : "checkbox",
        label,
      );
      field.inputs = group;
      field.options = isGroup ? group.map(optionText) : [];
      field.required = group.some((i) => i.required) || requiredFrom(first, label);
      fields.push(field);
      continue;
    }
    if (type === "file") {
      if (!fileShown(el)) continue;
      const field = base(el, "file", labelFor(el));
      field.accept = el.accept;
      fields.push(field);
      continue;
    }
    if (!isShown(el) || el.readOnly) continue;
    fields.push(base(el, KIND_BY_TYPE[type] ?? "text", labelFor(el)));
  }
  return { fields, loginForm };
}
