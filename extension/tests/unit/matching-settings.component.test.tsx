// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatchingSettingsForm } from "@/components/matching/MatchingSettingsForm";
import { loadSettings } from "@/lib/settings/settings";

const sendMessage = vi.hoisted(() => vi.fn(() => Promise.resolve({ scored: 12, passed: 7 })));
vi.mock("@/lib/messaging/client", () => ({ sendMessage }));

afterEach(() => {
  cleanup();
  sendMessage.mockClear();
});

describe("MatchingSettingsForm", () => {
  it("saves thresholds and limits, then re-ranks every job", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<MatchingSettingsForm onSaved={onSaved} />);
    const threshold = await screen.findByLabelText("Show jobs scoring at least");
    await user.clear(threshold);
    await user.type(threshold, "70");
    const budget = screen.getByLabelText("Jobs scored by AI per day");
    await user.clear(budget);
    await user.type(budget, "40");
    await user.click(screen.getByRole("button", { name: "Save matching settings" }));

    expect(await screen.findByText("Saved. Jobs re-ranked: 7 fit.")).toBeTruthy();
    expect(sendMessage).toHaveBeenCalledWith("match/prefilter", { all: true });
    expect(onSaved).toHaveBeenCalledWith(70);
    const settings = await loadSettings();
    expect(settings.matching.showThreshold).toBe(70);
    expect(settings.ai.dailyScoringBudget).toBe(40);
  });

  it("explains numbers out of range", async () => {
    const user = userEvent.setup();
    render(<MatchingSettingsForm />);
    const rpm = await screen.findByLabelText("AI requests per minute");
    await user.clear(rpm);
    await user.type(rpm, "0");
    await user.click(screen.getByRole("button", { name: "Save matching settings" }));
    expect(
      await screen.findByText("AI requests per minute: write a whole number from 1 to 1000."),
    ).toBeTruthy();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
