/**
 * Filling techniques (spec 16.4). Values are set directly (no fake typing or
 * mouse movement, spec 2.3); the only clicks go through safeClick(). Every change
 * records how to undo it.
 */
import type { FormField } from "./fields/discover";
import type { FillValue } from "./fields/resolve";
import { safeClick } from "./guards";
import { isShown } from "./dom";

export type Mode = "auto" | "assist";

/** Restores what was there before the fill. */
export type Undo = () => void;

function fire(el: Element, ...types: string[]): void {
  for (const type of types) el.dispatchEvent(new Event(type, { bubbles: true }));
}

/** Sets a value the way React and Vue forms notice (native setter, then input/change/blur). */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  if (descriptor?.set) descriptor.set.call(el, value);
  else el.value = value;
  fire(el, "input", "change", "blur");
}

export function selectNativeOption(select: HTMLSelectElement, text: string): boolean {
  const option = Array.from(select.options).find((o) => o.text.trim() === text.trim());
  if (!option) return false;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  if (descriptor?.set) descriptor.set.call(select, option.value);
  else select.value = option.value;
  fire(select, "input", "change", "blur");
  return true;
}

/** Ticks or unticks a checkbox or radio by clicking it, only when its state differs. */
export function setChecked(input: HTMLInputElement, checked: boolean, mode: Mode): void {
  if (input.checked === checked) return;
  // Custom-styled boxes hide the input; their label is what the user clicks.
  const target = isShown(input) ? input : (Array.from(input.labels ?? [])[0] ?? input);
  safeClick(target, mode);
  if (input.checked !== checked) throw new Error("The choice did not change");
}

export function attachFile(
  input: HTMLInputElement,
  blob: Blob,
  fileName: string,
  type = "application/pdf",
): void {
  const transfer = new DataTransfer();
  transfer.items.add(new File([blob], fileName, { type }));
  input.files = transfer.files;
  fire(input, "input", "change");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Visible options of the listbox a combobox controls (or any open listbox). */
function comboboxOptions(combo: HTMLElement): HTMLElement[] {
  const doc = combo.ownerDocument;
  const ids =
    `${combo.getAttribute("aria-controls") ?? ""} ${combo.getAttribute("aria-owns") ?? ""}`
      .split(/\s+/)
      .filter(Boolean);
  const boxes = ids.map((id) => doc.getElementById(id)).filter((b): b is HTMLElement => b !== null);
  const scope =
    boxes.length > 0 ? boxes : Array.from(doc.querySelectorAll<HTMLElement>("[role=listbox]"));
  return scope
    .flatMap((box) => Array.from(box.querySelectorAll<HTMLElement>("[role=option]")))
    .filter((o) => isShown(o));
}

/**
 * Opens a custom combobox, types into its filter box when it has one, and picks
 * the option by its text. Every click goes through safeClick().
 */
export async function chooseComboboxOption(
  combo: HTMLElement,
  text: string,
  mode: Mode,
): Promise<void> {
  if (combo.getAttribute("aria-expanded") !== "true") safeClick(combo, mode);
  const filter =
    combo instanceof HTMLInputElement
      ? combo
      : combo.querySelector<HTMLInputElement>("input:not([type=hidden])");
  if (filter && !filter.readOnly) setNativeValue(filter, text);
  const wanted = text.trim().toLowerCase();
  for (let waited = 0; waited <= 1500; waited += 100) {
    const options = comboboxOptions(combo);
    const match =
      options.find((o) => o.textContent.trim().toLowerCase() === wanted) ??
      options.find((o) => o.textContent.trim().toLowerCase().startsWith(wanted));
    if (match) {
      safeClick(match, mode);
      return;
    }
    await sleep(100);
  }
  throw new Error(`No option "${text}" in the list`);
}

/** Fills one field and returns how to undo it. */
export async function fillField(field: FormField, value: FillValue, mode: Mode): Promise<Undo> {
  const el = field.element;
  switch (value.kind) {
    case "text": {
      if (field.kind === "combobox") {
        await chooseComboboxOption(el, value.text, mode);
        return () => undefined;
      }
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        throw new Error("Not a text field");
      }
      const before = el.value;
      setNativeValue(el, value.text);
      return () => {
        setNativeValue(el, before);
      };
    }
    case "option": {
      if (el instanceof HTMLSelectElement) {
        const before = el.selectedIndex;
        if (!selectNativeOption(el, value.option)) throw new Error(`No option "${value.option}"`);
        return () => {
          el.selectedIndex = before;
          fire(el, "input", "change");
        };
      }
      if (field.kind === "radio") {
        const index = field.options.indexOf(value.option);
        const target = field.inputs[index];
        if (!target) throw new Error(`No option "${value.option}"`);
        const before = field.inputs.find((i) => i.checked);
        setChecked(target, true, mode);
        return () => {
          target.checked = false;
          if (before) before.checked = true;
          fire(before ?? target, "change");
        };
      }
      await chooseComboboxOption(el, value.option, mode);
      return () => undefined;
    }
    case "options": {
      const before = field.inputs.map((i) => i.checked);
      field.inputs.forEach((input, i) => {
        setChecked(input, value.options.includes(field.options[i] ?? ""), mode);
      });
      return () => {
        field.inputs.forEach((input, i) => {
          input.checked = before[i] ?? false;
          fire(input, "change");
        });
      };
    }
    case "check": {
      if (!(el instanceof HTMLInputElement)) throw new Error("Not a checkbox");
      const before = el.checked;
      setChecked(el, value.checked, mode);
      return () => {
        el.checked = before;
        fire(el, "change");
      };
    }
  }
}

/** Attaches a file and returns how to undo it. */
export function fillFile(field: FormField, blob: Blob, fileName: string): Undo {
  const input = field.element;
  if (!(input instanceof HTMLInputElement) || input.type !== "file")
    throw new Error("Not a file field");
  const before = input.files;
  attachFile(input, blob, fileName, blob.type || "application/pdf");
  return () => {
    const transfer = new DataTransfer();
    for (const file of Array.from(before ?? [])) transfer.items.add(file);
    input.files = transfer.files;
    fire(input, "change");
  };
}
