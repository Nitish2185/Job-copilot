import { describe, expect, it } from "vitest";
import { dedupeKey, normalizeCompanyName } from "./dedupe";

describe("normalizeCompanyName", () => {
  it.each([
    ["Acme Pvt. Ltd.", "acme"],
    ["Acme Technologies Private Limited", "acme"],
    ["Stripe, Inc.", "stripe"],
    ["Zeta", "zeta"],
    ["Labs", "labs"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeCompanyName(input)).toBe(expected);
  });
});

describe("dedupeKey", () => {
  it("gives the same key for the same job described differently", () => {
    const a = dedupeKey("Acme Pvt Ltd", "Senior Backend Engineer (Go)", "Bengaluru, India");
    const b = dedupeKey("ACME", "Senior Backend Engineer - Go", "Bengaluru,  India");
    expect(a).toBe(b);
    expect(a).toBe("acme|senior backend engineer go|bengaluru india");
  });

  it("separates different locations", () => {
    expect(dedupeKey("Acme", "Engineer", "Pune")).not.toBe(dedupeKey("Acme", "Engineer", "Mumbai"));
  });
});
