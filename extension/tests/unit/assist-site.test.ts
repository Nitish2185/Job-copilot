// @vitest-environment jsdom
import type { Preferences, Profile } from "@job-copilot/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ASSIST_ADAPTERS, GENERIC_ADAPTER } from "@/lib/apply/adapters/assist";
import type { AutofillData } from "@/lib/apply/engine";
import {
  CHIP_HINT,
  chipGroups,
  collectDiagnostics,
  hasNewControls,
  highlightChip,
  markControlsSeen,
  pathPattern,
  saveJobFromPage,
  suggestChip,
} from "@/lib/apply/sitePage";
import {
  BADGE_TAG,
  badgeColor,
  badgeLabel,
  renderBadge,
  showActionButton,
  showBanner,
} from "@/lib/apply/siteUi";
import { canFillNewStep, loggedOutText } from "@/lib/apply/assistSite";
import { diagnosticsText, issueUrlFor } from "@/lib/background/pageHandlers";
import { emptyProfile } from "@/lib/profile/profile";
import { defaultPreferences } from "@/lib/profile/store";

const now = new Date("2026-11-03T06:00:00Z");

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

const profile: Profile = {
  ...emptyProfile(now),
  basics: {
    fullName: "Aarav Mehta",
    email: "aarav.mehta@example.com",
    phone: "+91 99999 01234",
    city: "Pune",
    country: "IN",
    otherLinks: [],
  },
  totalExperienceMonths: 53,
};

const preferences: Preferences = {
  ...defaultPreferences("IN"),
  willingToRelocate: true,
  noticePeriodDays: 30,
};

const data: AutofillData = {
  profile,
  preferences,
  answers: [],
  allowPrivacyAcknowledgement: false,
};

afterEach(() => {
  document.body.innerHTML = "";
  document.querySelectorAll("job-copilot-banner").forEach((e) => {
    e.remove();
  });
});

describe("badges", () => {
  it("colours by score and marks estimates and exclusions", () => {
    expect(badgeColor({ final: 82 }).fg).toBe("#166534");
    expect(badgeColor({ final: 50 }).fg).toBe("#92400e");
    expect(badgeColor({ final: 90, excluded: "Excluded company" }).fg).toBe("#334155");
    expect(badgeLabel({ final: 64, isEstimate: true })).toBe("64~");
    expect(badgeLabel({ final: 10, excluded: "Wrong country" })).toBe("10 · Wrong country");
    expect(badgeLabel({})).toMatch(/add skills/i);
  });

  it("shows the score and skills and saves without following the card's link", async () => {
    document.body.innerHTML = `<a href="https://www.naukri.com/job-1" id="card"><span id="t">React Developer</span></a>`;
    const anchor = byId("t");
    const followed = vi.fn();
    document.getElementById("card")?.addEventListener("click", (e) => {
      if (!e.defaultPrevented) followed();
    });
    const onSave = vi.fn(() => Promise.resolve(true));

    const host = renderBadge(anchor, { final: 78, matched: ["React", "TypeScript"] }, onSave);

    expect(host.tagName.toLowerCase()).toBe(BADGE_TAG);
    expect(anchor.nextElementSibling).toBe(host);
    const root = host.shadowRoot;
    expect(root?.querySelector(".score")?.textContent).toBe("Match 78");
    expect(root?.querySelector(".skills")?.textContent).toBe("React, TypeScript");
    const button = root?.querySelector("button");
    button?.click();
    expect(onSave).toHaveBeenCalledOnce();
    expect(followed).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(button?.textContent).toBe("Saved");
    });
    expect(button?.disabled).toBe(true);
  });

  it("shows jobs already in Job Copilot as saved", () => {
    document.body.innerHTML = `<h2 id="t">Go Engineer</h2>`;
    const host = renderBadge(byId("t"), { final: 55, jobId: "manual:1" }, () =>
      Promise.resolve(true),
    );
    expect(host.shadowRoot?.querySelector("button")?.disabled).toBe(true);
  });
});

describe("logged-out banner", () => {
  it("tells the user to log in and can be dismissed", () => {
    const host = showBanner(document, loggedOutText("naukri"));
    expect(host.shadowRoot?.textContent).toContain(
      "You're logged out of Naukri. Please log in, then press Autofill again.",
    );
    host.shadowRoot?.querySelector("button")?.click();
    expect(document.querySelector("job-copilot-banner")).toBeNull();
  });
});

describe("saveJobFromPage", () => {
  it("uses the adapter's reading and never asks the AI when it worked", async () => {
    document.body.innerHTML = `<h1 class="jd-header-title">Backend Developer</h1>
      <div class="jd-header-comp-name"><a>Acme</a></div>
      <section class="job-desc">Go and Kafka</section>`;
    const extract = vi.fn();
    const save = vi.fn(() =>
      Promise.resolve({ jobId: "manual:1", created: true, mode: "assist" as const }),
    );
    const result = await saveJobFromPage(document, ASSIST_ADAPTERS.naukri.readJob, {
      extract,
      save,
    });
    expect(extract).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Backend Developer", company: "Acme" }),
    );
    expect(result).toMatchObject({ jobId: "manual:1", title: "Backend Developer" });
  });

  it("falls back to the AI with the page text, and reports when it is not a job", async () => {
    document.body.innerHTML = `<p>Careers at Acme. Senior Engineer, remote.</p>`;
    const extract = vi.fn(() =>
      Promise.resolve({ error: "This page does not look like a job posting." }),
    );
    const save = vi.fn();
    const result = await saveJobFromPage(document, GENERIC_ADAPTER.readJob, { extract, save });
    expect(extract).toHaveBeenCalledWith(
      document.location.href,
      expect.stringContaining("Senior Engineer"),
    );
    expect(save).not.toHaveBeenCalled();
    expect(result).toEqual({ error: "This page does not look like a job posting." });
  });
});

describe("chat chips", () => {
  const CHAT = `<div class="chatbot_Drawer">
      <div class="botMsg">What is your notice period?</div>
      <div class="chips"><span class="chip">Immediate</span><span class="chip">15 Days or less</span>
        <span class="chip">1 Month</span><span class="chip">2 Months</span></div>
    </div>`;

  it("suggests the chip from the profile and only highlights it", async () => {
    document.body.innerHTML = CHAT;
    const clicked = vi.fn();
    document.querySelectorAll(".chip").forEach((c) => {
      c.addEventListener("click", clicked);
    });
    const groups = chipGroups(document, ASSIST_ADAPTERS.naukri.selectors.chatChips ?? "");
    expect(groups).toHaveLength(1);
    const chip = await suggestChip(groups[0] ?? [], data, now);
    expect(chip?.textContent).toBe("1 Month");
    if (chip) highlightChip(chip);
    expect(chip?.title).toBe(CHIP_HINT);
    expect(chip?.dataset.jcSuggested).toBe("true");
    expect(clicked).not.toHaveBeenCalled();
  });

  it("suggests nothing for a sensitive or unknown question", async () => {
    document.body.innerHTML = `<div class="chatbot_Drawer"><div>What is your expected CTC?</div>
      <div><span class="chip">5-10 LPA</span><span class="chip">10-15 LPA</span></div></div>`;
    const groups = chipGroups(document, ".chip");
    expect(await suggestChip(groups[0] ?? [], data, now)).toBeUndefined();
  });
});

describe("new form steps", () => {
  it("notices controls that appeared after the last fill", () => {
    document.body.innerHTML = `<input id="a"><input type="hidden" id="h">`;
    expect(hasNewControls(document)).toBe(true);
    markControlsSeen(document);
    expect(hasNewControls(document)).toBe(false);
    document.body.insertAdjacentHTML("beforeend", `<select id="b"><option>x</option></select>`);
    expect(hasNewControls(document)).toBe(true);
  });

  it("ignores password boxes (login forms are never filled)", () => {
    document.body.innerHTML = `<input type="password">`;
    expect(hasNewControls(document)).toBe(false);
  });
});

describe("Report a broken page", () => {
  it("keeps the page's shape and drops IDs, the query and every value", () => {
    expect(
      pathPattern("https://www.naukri.com/job-listings-react-acme-pune-031025500123?src=x"),
    ).toBe("/job-listings-react-acme-pune-:id");
    expect(pathPattern("https://in.indeed.com/viewjob?jk=abc")).toBe("/viewjob");

    document.body.innerHTML = `<label for="e">Email</label><input id="e" type="email" value="aarav.mehta@example.com">
      <label for="n">Notice period *</label><input id="n" value="30">`;
    const d = collectDiagnostics(document, ASSIST_ADAPTERS.indeed, "1.2.3");
    expect(d).toMatchObject({ adapterId: "indeed", version: "1.2.3", jobRead: false });
    expect(d.fields).toEqual([
      { label: "Email", kind: "email", required: false },
      { label: "Notice period *", kind: "text", required: true },
    ]);
    const text = diagnosticsText(d);
    expect(text).toContain("- Notice period * (text, required)");
    expect(text).not.toContain("aarav");
    expect(text).not.toContain("30");
    const url = new URL(issueUrlFor(d, text));
    expect(url.pathname).toBe("/Nitish2185/Job-copilot/issues/new");
    expect(url.searchParams.get("body")).toBe(text);
  });
});

describe("floating action button", () => {
  it("shows the result of its action and appears once", async () => {
    const onClick = vi.fn(() => Promise.resolve("AI-scored 3 jobs."));
    const host = showActionButton(document, "AI-score jobs on this page", onClick);
    expect(showActionButton(document, "again", onClick)).toBe(host);
    host.shadowRoot?.querySelector("button")?.click();
    await vi.waitFor(() => {
      expect(host.shadowRoot?.querySelector(".note")?.textContent).toBe("AI-scored 3 jobs.");
    });
    expect(onClick).toHaveBeenCalledOnce();
    host.remove();
  });
});

describe("Autofill each new step", () => {
  const ready = {
    pressedAutofill: true,
    settingOn: true,
    busy: false,
    tabVisible: true,
    newStep: true,
  };

  it("fills a new step only after Autofill, with the setting on, in the visible tab", () => {
    expect(canFillNewStep(ready)).toBe(true);
    expect(canFillNewStep({ ...ready, pressedAutofill: false })).toBe(false);
    expect(canFillNewStep({ ...ready, settingOn: false })).toBe(false);
    expect(canFillNewStep({ ...ready, tabVisible: false })).toBe(false);
    expect(canFillNewStep({ ...ready, busy: true })).toBe(false);
    expect(canFillNewStep({ ...ready, newStep: false })).toBe(false);
  });
});
