// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Tip } from "@/components/ui/Tip";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Tip", () => {
  it("stays hidden once dismissed", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Tip id="tracker">Drag cards when you hear back.</Tip>);
    expect(screen.getByRole("complementary", { name: "Tip" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Dismiss tip" }));
    expect(screen.queryByText("Drag cards when you hear back.")).toBeNull();
    unmount();
    render(<Tip id="tracker">Drag cards when you hear back.</Tip>);
    expect(screen.queryByText("Drag cards when you hear back.")).toBeNull();
    render(<Tip id="analytics">Charts fill in.</Tip>);
    expect(screen.getByText("Charts fill in.")).toBeTruthy();
  });
});
