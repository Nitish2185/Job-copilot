// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { discoverFields } from "@/lib/apply/fields/discover";

afterEach(() => {
  document.body.innerHTML = "";
});

function discover(html: string) {
  document.body.innerHTML = html;
  return discoverFields(document);
}

const labels = (html: string) => discover(html).fields.map((f) => f.label);

describe("labels (spec 16.3 order)", () => {
  it("prefers <label for>, then aria-labelledby, aria-label, wrapping label", () => {
    expect(labels('<label for="a">First name *</label><input id="a">')).toEqual(["First name *"]);
    expect(labels('<span id="q">Current CTC (in LPA)</span><input aria-labelledby="q">')).toEqual([
      "Current CTC (in LPA)",
    ]);
    expect(labels('<input aria-label="LinkedIn profile">')).toEqual(["LinkedIn profile"]);
    expect(labels("<label>Phone <input></label>")).toEqual(["Phone"]);
  });

  it("falls back to the question text before the field, then placeholder, then name", () => {
    expect(
      labels('<div class="q">Notice period (days)</div><div><input type="number"></div>'),
    ).toEqual(["Notice period (days)"]);
    expect(labels('<input placeholder="Your email">')).toEqual(["Your email"]);
    expect(labels('<input name="current_company">')).toEqual(["current company"]);
  });

  it("keeps option text out of select labels", () => {
    expect(labels("<label>Country <select><option>India</option></select></label>")).toEqual([
      "Country",
    ]);
  });

  it("normalizes the question and reads required markers", () => {
    const [field] = discover('<label for="a">Expected CTC?*</label><input id="a">').fields;
    expect(field?.question).toBe("expected ctc");
    expect(field?.required).toBe(true);
  });
});

describe("kinds and groups", () => {
  it("groups radios and multi-checkboxes into one field with options", () => {
    const { fields } = discover(`
      <fieldset><legend>Are you willing to relocate?</legend>
        <label><input type="radio" name="reloc" value="y" required> Yes</label>
        <label><input type="radio" name="reloc" value="n"> No</label>
      </fieldset>
      <p>Which stacks have you used?</p>
      <div>
        <label><input type="checkbox" name="stack" value="r"> React</label>
        <label><input type="checkbox" name="stack" value="v"> Vue</label>
      </div>
      <label><input type="checkbox" name="consent"> I agree to the privacy notice</label>`);
    expect(fields.map((f) => [f.kind, f.label, f.options, f.required])).toEqual([
      ["radio", "Are you willing to relocate?", ["Yes", "No"], true],
      ["checkbox_group", "Which stacks have you used?", ["React", "Vue"], false],
      ["checkbox", "I agree to the privacy notice", [], false],
    ]);
  });

  it("reads select options without placeholder entries", () => {
    const [field] = discover(`<label for="n">Notice period</label>
      <select id="n"><option value="">Select...</option><option>Immediate</option><option>30 days</option></select>`).fields;
    expect(field?.kind).toBe("select");
    expect(field?.options).toEqual(["Immediate", "30 days"]);
  });

  it("knows input kinds, comboboxes and file inputs hidden behind a button", () => {
    const { fields } = discover(`
      <input type="email" aria-label="Email">
      <input type="tel" aria-label="Phone">
      <input type="date" aria-label="Start date">
      <textarea aria-label="Why us?"></textarea>
      <div role="combobox" aria-label="Location" tabindex="0"><input aria-label="inner"></div>
      <div><button type="button">Attach</button><input type="file" aria-label="Resume" style="display:none" accept=".pdf"></div>`);
    expect(fields.map((f) => [f.kind, f.label])).toEqual([
      ["email", "Email"],
      ["tel", "Phone"],
      ["date", "Start date"],
      ["textarea", "Why us?"],
      ["combobox", "Location"],
      ["file", "Resume"],
    ]);
    expect(fields.at(-1)?.accept).toBe(".pdf");
  });
});

describe("what is never filled", () => {
  it("skips hidden, disabled, read-only, submit and search fields and honeypots", () => {
    const { fields } = discover(`
      <input aria-label="Visible">
      <input type="hidden" name="token">
      <input aria-label="Disabled" disabled>
      <fieldset disabled><input aria-label="In disabled fieldset"></fieldset>
      <input aria-label="Read only" readonly>
      <input aria-label="Hidden by style" style="display:none">
      <div style="visibility:hidden"><input aria-label="In hidden box"></div>
      <div aria-hidden="true"><input aria-label="Honeypot website"></div>
      <input aria-label="Transparent" style="opacity:0">
      <input type="submit" value="Apply">
      <form role="search"><input aria-label="Search jobs"></form>`);
    expect(fields.map((f) => f.label)).toEqual(["Visible"]);
  });

  it("leaves login and sign-up forms alone", () => {
    const result = discover(`
      <form><input type="email" aria-label="Email"><input type="password" aria-label="Password"></form>
      <form><input aria-label="Full name"></form>`);
    expect(result.loginForm).toBe(true);
    expect(result.fields.map((f) => f.label)).toEqual(["Full name"]);
  });
});
