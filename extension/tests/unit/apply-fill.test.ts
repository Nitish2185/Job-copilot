// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverFields } from "@/lib/apply/fields/discover";
import { fillField, setNativeValue } from "@/lib/apply/fill";

afterEach(() => {
  document.body.innerHTML = "";
});

function fields(html: string) {
  document.body.innerHTML = html;
  return discoverFields(document).fields;
}

describe("text fields", () => {
  it("uses the native setter and fires input, change and blur (React-style listeners)", () => {
    document.body.innerHTML = '<input aria-label="Name">';
    const input = document.querySelector("input");
    if (!input) throw new Error("no input");
    const events: string[] = [];
    for (const type of ["input", "change", "blur"])
      input.addEventListener(type, () => events.push(type));
    setNativeValue(input, "Aarav");
    expect(input.value).toBe("Aarav");
    expect(events).toEqual(["input", "change", "blur"]);
  });

  it("fills and undoes", async () => {
    const [field] = fields('<input aria-label="City" value="Mumbai">');
    if (!field) throw new Error("no field");
    const undo = await fillField(field, { kind: "text", text: "Pune" }, "assist");
    expect((field.element as HTMLInputElement).value).toBe("Pune");
    undo();
    expect((field.element as HTMLInputElement).value).toBe("Mumbai");
  });
});

describe("choices", () => {
  it("selects native options and undoes", async () => {
    const [field] = fields(
      '<select aria-label="Notice"><option>Immediate</option><option>1 month</option></select>',
    );
    if (!field) throw new Error("no field");
    const select = field.element as HTMLSelectElement;
    const changed = vi.fn();
    select.addEventListener("change", changed);
    const undo = await fillField(field, { kind: "option", option: "1 month" }, "assist");
    expect(select.value).toBe("1 month");
    expect(changed).toHaveBeenCalled();
    undo();
    expect(select.selectedIndex).toBe(0);
  });

  it("clicks radios and checkboxes only when the state differs", async () => {
    const [radio, group, box] = fields(`
      <fieldset><legend>Relocate?</legend>
        <label><input type="radio" name="r"> Yes</label><label><input type="radio" name="r"> No</label></fieldset>
      <p>Stacks</p><div>
        <label><input type="checkbox" name="s" checked> React</label><label><input type="checkbox" name="s"> Go</label></div>
      <label><input type="checkbox" name="remote"> Open to remote</label>`);
    if (!radio || !group || !box) throw new Error("fields");
    const clicks = vi.fn();
    document.addEventListener("click", clicks);
    await fillField(radio, { kind: "option", option: "No" }, "assist");
    expect(radio.inputs.map((i) => i.checked)).toEqual([false, true]);
    await fillField(group, { kind: "options", options: ["React", "Go"] }, "assist");
    expect(group.inputs.map((i) => i.checked)).toEqual([true, true]);
    const clicksSoFar = clicks.mock.calls.length;
    await fillField(box, { kind: "check", checked: false }, "assist");
    expect(clicks.mock.calls.length).toBe(clicksSoFar);
  });

  it("opens a custom combobox, filters and picks the option", async () => {
    document.body.innerHTML = `
      <div role="combobox" aria-label="Country" aria-controls="list" aria-expanded="false" tabindex="0">
        <input aria-label="filter"></div>
      <ul id="list" role="listbox" style="display:none">
        <li role="option">India</li><li role="option">Indonesia</li></ul>`;
    const combo = document.querySelector<HTMLElement>("[role=combobox]");
    const list = document.getElementById("list");
    if (!combo || !list) throw new Error("no combobox");
    combo.addEventListener("click", () => {
      combo.setAttribute("aria-expanded", "true");
      list.style.display = "block";
    });
    let chosen = "";
    for (const option of Array.from(list.querySelectorAll("li"))) {
      option.addEventListener("click", () => {
        chosen = option.textContent;
      });
    }
    const [field] = discoverFields(document).fields;
    if (!field) throw new Error("no field");
    await fillField(field, { kind: "option", option: "India" }, "assist");
    expect(chosen).toBe("India");
    expect(combo.querySelector("input")?.value).toBe("India");
  });
});
