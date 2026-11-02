import { describe, expect, it, vi } from "vitest";
import type * as Runner from "@/lib/ai/runner";
import { aiHandlers } from "@/lib/background/aiHandlers";

const runTask = vi.hoisted(() =>
  vi.fn((_rt: Runner.AiRuntime, _task: unknown, _input: unknown) =>
    Promise.resolve({ value: { uncertainFields: [] }, model: "test-model" }),
  ),
);
vi.mock("@/lib/ai/runner", async (importOriginal) => ({
  ...(await importOriginal<typeof Runner>()),
  runTask,
}));

describe("ai/extractProfile handler", () => {
  it("redacts the name the user confirmed during onboarding", async () => {
    const handler = aiHandlers["ai/extractProfile"];
    await handler?.({ resumeText: "Aarav Mehta\nGo developer", fullName: " Aarav Mehta " }, {});
    const rt = runTask.mock.calls[0]?.[0];
    expect(rt?.identity.fullName).toBe("Aarav Mehta");
    expect(rt?.redact).toBe(true);
  });
});
