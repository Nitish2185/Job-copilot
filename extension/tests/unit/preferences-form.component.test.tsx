// @vitest-environment jsdom
import type { Preferences } from "@job-copilot/shared";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreferencesForm } from "@/components/profile/PreferencesForm";
import { getDb } from "@/lib/db/db";
import { defaultPreferences } from "@/lib/profile/store";

afterEach(async () => {
  cleanup();
  await getDb().preferences.clear();
});

describe("PreferencesForm", () => {
  it("saves the ask-once answers with Indian CTC formats", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn<(p: Preferences) => void>();
    render(
      <PreferencesForm
        preferences={defaultPreferences("IN")}
        currency="INR"
        part="ask-once"
        onSaved={onSaved}
      />,
    );
    expect(screen.queryByLabelText("Desired roles")).toBeNull();

    await user.click(screen.getByRole("button", { name: /add a country/i }));
    await user.type(screen.getByLabelText("Country code"), "in");
    await user.type(screen.getByLabelText("Current CTC"), "12.5 lakh");
    await user.type(screen.getByLabelText("Expected CTC"), "18 LPA");
    await user.click(screen.getByLabelText("I am serving my notice now"));
    await user.type(screen.getByLabelText("Last working day"), "2026-12-15");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    const saved = onSaved.mock.calls[0]?.[0];
    expect(saved?.currentCtc).toEqual({ amount: 1_250_000, currency: "INR", period: "year" });
    expect(saved?.expectedCtc?.min).toBe(1_800_000);
    expect(saved?.workAuthorization).toEqual([{ countryCode: "IN", status: "citizen" }]);
    expect(saved?.servingNotice).toEqual({ lastWorkingDay: "2026-12-15" });
    expect(saved?.eeo).toBeUndefined();
    expect((await getDb().preferences.get("me"))?.currentCtc?.amount).toBe(1_250_000);
  });

  it("shows plain-language problems instead of saving", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <PreferencesForm
        preferences={defaultPreferences("IN")}
        currency="INR"
        part="ask-once"
        onSaved={onSaved}
      />,
    );
    await user.type(screen.getByLabelText("Current CTC"), "negotiable");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/write an amount such as "12 LPA"/)).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("saves job preferences with job types and lists", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn<(p: Preferences) => void>();
    render(
      <PreferencesForm
        preferences={defaultPreferences("IN")}
        currency="INR"
        part="jobs"
        onSaved={onSaved}
      />,
    );
    expect(screen.queryByLabelText("Current CTC")).toBeNull();
    await user.type(
      screen.getByLabelText("Desired roles"),
      "Frontend Developer, Backend Developer",
    );
    await user.click(screen.getByLabelText("Contract"));
    await user.selectOptions(screen.getByLabelText("Remote or office"), "remote");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    const saved = onSaved.mock.calls[0]?.[0];
    expect(saved?.desiredRoles).toEqual(["Frontend Developer", "Backend Developer"]);
    expect(saved?.jobTypes).toEqual(["full_time", "contract"]);
    expect(saved?.remotePreference).toBe("remote");
    expect(saved?.countries).toEqual(["IN"]);
  });
});
