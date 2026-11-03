import type { Application } from "@job-copilot/shared";
import { describe, expect, it } from "vitest";
import {
  addEvent,
  followUpDate,
  followUpDue,
  moveStage,
  suggestGhosted,
  trackerCsv,
} from "@/lib/tracker/tracker";
import { sampleJob } from "./helpers";

const submitted = "2026-10-01T10:00:00Z";
const day = (n: number) => new Date(Date.parse(submitted) + n * 86_400_000);

function app(overrides: Partial<Application> = {}): Application {
  return {
    id: "a1",
    jobId: "lever:acme:1",
    mode: "assist",
    status: "submitted",
    stage: "applied",
    resumeChoice: "current",
    answersSent: [],
    submittedAt: submitted,
    notes: "",
    events: [{ at: submitted, type: "submitted" }],
    ...overrides,
  };
}

describe("stages", () => {
  it("records each change as an event, and nothing when the stage is the same", () => {
    const moved = moveStage(app(), "interview", day(3));
    expect(moved.stage).toBe("interview");
    expect(moved.events.at(-1)).toEqual({
      at: "2026-10-04T10:00:00Z",
      type: "stage",
      detail: "applied -> interview",
    });
    expect(moveStage(moved, "interview", day(4))).toBe(moved);
  });
});

describe("follow-ups", () => {
  it("is due after followUpDays while still at applied", () => {
    expect(followUpDue(app(), 7, day(6))).toBe(false);
    expect(followUpDue(app(), 7, day(7))).toBe(true);
    expect(followUpDue(moveStage(app(), "screening", day(2)), 7, day(9))).toBe(false);
    expect(followUpDue(addEvent(app(), "follow_up_done", day(8)), 7, day(9))).toBe(false);
  });

  it("uses the user's own date when set", () => {
    const own = app({ followUpAt: "2026-10-20T09:00:00Z" });
    expect(followUpDate(own, 7)?.toISOString()).toBe("2026-10-20T09:00:00.000Z");
    expect(followUpDue(own, 7, day(10))).toBe(false);
  });

  it("never follows up on applications that were not sent", () => {
    expect(followUpDue(app({ status: "needs_you" }), 7, day(30))).toBe(false);
  });
});

describe("ghosted suggestion", () => {
  it("comes after ghostedAfterDays without a reply, counted from the last stage change", () => {
    expect(suggestGhosted(app(), 30, day(29))).toBe(false);
    expect(suggestGhosted(app(), 30, day(30))).toBe(true);
    const screening = moveStage(app(), "screening", day(20));
    expect(suggestGhosted(screening, 30, day(40))).toBe(false);
    expect(suggestGhosted(screening, 30, day(50))).toBe(true);
    expect(suggestGhosted(moveStage(app(), "interview", day(1)), 30, day(90))).toBe(false);
    expect(suggestGhosted(addEvent(app(), "ghosted_dismissed", day(31)), 30, day(60))).toBe(false);
  });
});

describe("CSV export", () => {
  it("quotes cells and neutralises formulas", () => {
    const csv = trackerCsv(
      [
        {
          app: app({ notes: 'Called "Priya", said, wait' }),
          job: sampleJob({ title: "=HYPERLINK(evil)" }),
        },
      ],
      7,
    );
    const [header, row] = csv.split("\r\n");
    expect(header).toBe(
      "Company,Title,Stage,Mode,Platform,Submitted,Resume,Follow-up,Job URL,Notes",
    );
    expect(row).toBe(
      `Acme,'=HYPERLINK(evil),Applied,assist,lever,2026-10-01,current,2026-10-08,https://jobs.lever.co/acme/1,"Called ""Priya"", said, wait"`,
    );
  });
});
