import { describe, expect, it } from "vitest";
import { hostPattern } from "@/lib/ai/hostPattern";

describe("hostPattern", () => {
  it("turns provider addresses into host permission patterns without ports", () => {
    expect(hostPattern("https://api.groq.com/openai/v1")).toBe("https://api.groq.com/*");
    expect(hostPattern("http://localhost:11434/v1")).toBe("http://localhost/*");
  });

  it("rejects empty and non-web addresses", () => {
    expect(hostPattern("")).toBeNull();
    expect(hostPattern("file:///etc/passwd")).toBeNull();
    expect(hostPattern("not a url")).toBeNull();
  });
});
