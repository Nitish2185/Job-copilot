import { describe, expect, it } from "vitest";
import { guessFullName } from "@/lib/resume/guessName";

describe("guessFullName", () => {
  it("finds the name on the first lines", () => {
    expect(guessFullName("Aarav Mehta\nBengaluru, India\naarav.mehta@example.com")).toBe(
      "Aarav Mehta",
    );
    expect(guessFullName("RESUME\n\nPRIYA S. NAIR\nFull-stack developer")).toBe("Priya S. Nair");
  });

  it("returns nothing when the top of the resume has no name-like line", () => {
    expect(guessFullName("Curriculum Vitae\nSoftware engineer with 5 years\nhttps://x.dev")).toBe(
      undefined,
    );
  });
});
