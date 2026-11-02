import { describe, expect, it } from "vitest";
import { suggestionUrl } from "@/lib/sources/suggest";

describe("suggestionUrl", () => {
  it("opens a pre-filled issue with a ready-to-paste companies.json entry", () => {
    const url = new URL(
      suggestionUrl({
        id: "lever:acme",
        name: "Acme",
        platform: "lever",
        token: "acme",
        variant: "eu",
        addedAt: "2026-11-02T06:00:00Z",
        enabled: true,
      }),
    );
    expect(url.origin + url.pathname).toBe("https://github.com/Nitish2185/Job-copilot/issues/new");
    expect(url.searchParams.get("title")).toBe("Add Acme to the shared feed");
    expect(url.searchParams.get("body")).toContain(
      '{"name":"Acme","platform":"lever","token":"acme","variant":"eu","region":[]}',
    );
  });
});
