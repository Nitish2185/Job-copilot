import { describe, expect, it } from "vitest";
import { extractContacts, redactDeep, redactText } from "@/lib/ai/redact";

describe("redactText", () => {
  it.each([
    ["priya.sharma+jobs@gmail.com", "[EMAIL]"],
    ["Mail: a_b.c@company.co.in", "Mail: [EMAIL]"],
    ["+91 98765 43210", "[PHONE]"],
    ["+91-9876543210", "[PHONE]"],
    ["+919876543210", "[PHONE]"],
    ["Mobile: 9876543210", "Mobile: [PHONE]"],
    ["Mobile: 09876543210", "Mobile: [PHONE]"],
    ["98765-43210", "[PHONE]"],
    ["+1 (415) 555-0123", "[PHONE]"],
    ["(415) 555-0123", "[PHONE]"],
    ["415-555-0123", "[PHONE]"],
    ["+44 20 7946 0958", "[PHONE]"],
    ["+65 6123 4567", "[PHONE]"],
    ["DOB: 14/03/1996", "[DATE_OF_BIRTH]"],
    ["Date of Birth - 14 March 1996", "[DATE_OF_BIRTH]"],
    ["Born on March 14, 1996", "[DATE_OF_BIRTH]"],
    ["D.O.B 1996-03-14", "[DATE_OF_BIRTH]"],
    ["Flat No: 12B, Lotus Apartments, Koramangala", "[ADDRESS]"],
    ["42 MG Road, Bengaluru", "[ADDRESS]"],
    ["PIN: 560 034", "[ADDRESS]"],
  ])("redacts %j", (input, expected) => {
    expect(redactText(input)).toBe(expected);
  });

  it.each([
    "Worked at Acme from 2019-2023",
    "Grew revenue by 45% to 1,20,000 users",
    "5+ years of experience with React 18",
    "Salary 12.5 LPA, notice 30 days",
    "Version 3.8.1 released in 2026",
    "Improved latency from 450ms to 120ms",
  ])("leaves %j alone", (input) => {
    expect(redactText(input)).toBe(input);
  });

  it("removes the user's name and its parts", () => {
    const text = "Priya Sharma led the team. Sharma built the API. PRIYA mentored interns.";
    expect(redactText(text, { fullName: "Priya Sharma" })).toBe(
      "[NAME] led the team. [NAME] built the API. [NAME] mentored interns.",
    );
  });

  it("does not remove short or partial name matches inside other words", () => {
    expect(redactText("Anil built the Vanilla JS app", { fullName: "Anil Kumar" })).toBe(
      "[NAME] built the Vanilla JS app",
    );
  });

  it("redacts a full resume header", () => {
    const header = `Priya Sharma
priya.sharma@example.com | +91 98765 43210 | Bengaluru
linkedin.com/in/priya-sharma | github.com/priyas`;
    const out = redactText(header, { fullName: "Priya Sharma" });
    expect(out).not.toMatch(/priya\.sharma@|98765|Priya|Sharma/i);
    expect(out).toContain("Bengaluru");
  });
});

describe("redactDeep", () => {
  it("redacts strings inside nested objects and arrays", () => {
    expect(redactDeep({ a: ["call 9876543210"], b: { c: "x@y.com", n: 5 } }, {})).toEqual({
      a: ["call [PHONE]"],
      b: { c: "[EMAIL]", n: 5 },
    });
  });
});

describe("extractContacts", () => {
  it("finds email, phone and profile links locally", () => {
    const c = extractContacts(
      "Priya | priya@example.com | +91 98765 43210 | https://linkedin.com/in/priya-s | github.com/priyas | https://priya.dev",
    );
    expect(c.emails).toEqual(["priya@example.com"]);
    expect(c.phones).toEqual(["+91 98765 43210"]);
    expect(c.linkedinUrl).toBe("https://linkedin.com/in/priya-s");
    expect(c.githubUsername).toBe("priyas");
    expect(c.portfolioUrls).toEqual(["https://priya.dev"]);
  });
});

describe("profile links", () => {
  it("redacts LinkedIn and GitHub profile links but keeps repository links", () => {
    expect(redactText("See linkedin.com/in/priya-sharma and https://github.com/priyas")).toBe(
      "See [LINKEDIN] and [GITHUB]",
    );
    expect(redactText("Code: https://github.com/priyas/job-board")).toBe(
      "Code: https://github.com/priyas/job-board",
    );
  });
});
