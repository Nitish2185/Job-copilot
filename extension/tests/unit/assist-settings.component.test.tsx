// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { AssistSettings } from "@/components/apply/AssistSettings";
import { loadSettings } from "@/lib/settings/settings";

/** What the background reports: LinkedIn turns on once the browser granted it. */
const granted = vi.hoisted(() => ({ linkedin: false }));
const sendMessage = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      sites: [
        { id: "linkedin", enabled: granted.linkedin },
        { id: "workday", enabled: false },
      ],
    }),
  ),
);
vi.mock("@/lib/messaging/client", () => ({ sendMessage }));

afterEach(() => {
  cleanup();
  sendMessage.mockClear();
  granted.linkedin = false;
});

describe("AssistSettings", () => {
  it("saves the each-step and badge choices", async () => {
    const user = userEvent.setup();
    render(<AssistSettings />);
    const eachStep = await screen.findByLabelText(/Autofill each new step automatically/);
    expect((eachStep as HTMLInputElement).checked).toBe(true);
    await user.click(eachStep);
    await user.click(screen.getByLabelText("Indeed"));
    await vi.waitFor(async () => {
      const { assist } = await loadSettings();
      expect(assist.autofillEachStep).toBe(false);
      expect(assist.badges.indeed).toBe(false);
      expect(assist.badges.naukri).toBe(true);
    });
  });

  it("explains LinkedIn before asking the browser, then registers it", async () => {
    const user = userEvent.setup();
    const request = vi.fn(() => {
      granted.linkedin = true;
      return Promise.resolve(true);
    });
    Object.assign(browser.permissions, { request });
    render(<AssistSettings />);
    await user.click(await screen.findByRole("button", { name: "Turn on LinkedIn" }));
    expect(screen.getByText(/You click Next, Review and Submit yourself/)).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Allow LinkedIn" }));
    expect(request).toHaveBeenCalledWith({ origins: ["https://www.linkedin.com/*"] });
    expect(await screen.findByRole("button", { name: "Turn off LinkedIn" })).toBeTruthy();
  });

  it("says so when the permission is declined", async () => {
    const user = userEvent.setup();
    Object.assign(browser.permissions, { request: vi.fn(() => Promise.resolve(false)) });
    render(<AssistSettings />);
    await user.click(await screen.findByRole("button", { name: "Turn on Workday" }));
    await user.click(screen.getByRole("button", { name: "Allow Workday" }));
    expect(await screen.findByText(/Workday was not enabled/)).toBeTruthy();
  });
});
