import { describe, expect, it } from "vitest";
import { AiConsentError, aiPermissionRequest, hasAiDataConsent } from "@/lib/ai/dataConsent";

describe("AI data consent outside Firefox", () => {
  it("asks only for the provider's address, and needs nothing more", async () => {
    expect(aiPermissionRequest(["https://api.groq.com/*"])).toEqual({
      origins: ["https://api.groq.com/*"],
    });
    expect(await hasAiDataConsent()).toBe(true);
  });

  it("explains where to give consent when it is missing", () => {
    expect(new AiConsentError().message).toContain("Settings > AI provider");
  });
});
