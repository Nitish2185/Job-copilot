import { describe, expect, it } from "vitest";
import { answerToText, textToAnswer } from "@/lib/answers/answerBank";

describe("answer text editing", () => {
  it("shows answers as text", () => {
    expect(answerToText(["Go", "React"])).toBe("Go, React");
    expect(answerToText(true)).toBe("Yes");
    expect(answerToText(60)).toBe("60");
  });

  it("reads edits back in the previous answer's shape", () => {
    expect(textToAnswer("no", true)).toBe(false);
    expect(textToAnswer("maybe", true)).toBeNull();
    expect(textToAnswer("1,20,000", 5)).toBe(120_000);
    expect(textToAnswer("Go, , Rust", ["Go"])).toEqual(["Go", "Rust"]);
    expect(textToAnswer("  LinkedIn ", "Referral")).toBe("LinkedIn");
    expect(textToAnswer("   ", "x")).toBeNull();
  });
});
