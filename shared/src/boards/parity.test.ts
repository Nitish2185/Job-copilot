/**
 * The TypeScript board parsers + normalizer must turn the saved API fixtures into
 * exactly the jobs the Go crawler produced (crawler/testdata/golden, first run).
 */
import { describe, expect, it } from "vitest";
import ashbyFixture from "../../../crawler/testdata/fixtures/ashby_board.json";
import greenhouseFixture from "../../../crawler/testdata/fixtures/greenhouse_jobs.json";
import leverFixture from "../../../crawler/testdata/fixtures/lever_postings.json";
import srDetailFixture from "../../../crawler/testdata/fixtures/smartrecruiters_posting_detail.json";
import srListFixture from "../../../crawler/testdata/fixtures/smartrecruiters_postings.json";
import workableFixture from "../../../crawler/testdata/fixtures/workable_widget.json";
import goldenShard from "../../../crawler/testdata/golden/feed/jobs/2026-11-02.json";
import { parseAshbyBoard } from "./ashby";
import { parseGreenhouseJobs } from "./greenhouse";
import { parseLeverPostings } from "./lever";
import { normalizeRawJob, type NormalizedJob } from "./normalize";
import {
  SmartRecruitersListSchema,
  applySmartRecruitersDetail,
  parseSmartRecruitersList,
} from "./smartrecruiters";
import type { BoardCompany, RawJob } from "./types";
import { parseWorkableWidget } from "./workable";

// The same companies the Go golden test crawls.
const gitlab: BoardCompany = { name: "GitLab", platform: "greenhouse", token: "gitlab" };
const palantir: BoardCompany = { name: "Palantir", platform: "lever", token: "palantir" };
const ramp: BoardCompany = { name: "Ramp", platform: "ashby", token: "ramp" };
const bosch: BoardCompany = {
  name: "Bosch Group",
  platform: "smartrecruiters",
  token: "BoschGroup",
};
const blueground: BoardCompany = { name: "Blueground", platform: "workable", token: "blueground" };

async function normalizeAll(company: BoardCompany, raws: RawJob[]): Promise<NormalizedJob[]> {
  const jobs = await Promise.all(raws.map((raw) => normalizeRawJob(company, raw)));
  return jobs.filter((j): j is NormalizedJob => j !== null);
}

describe("TypeScript normalizer matches the Go crawler", () => {
  it("produces the golden jobs from the same fixtures", async () => {
    const srRaws = parseSmartRecruitersList(
      SmartRecruitersListSchema.parse(srListFixture),
      bosch,
    ).map((raw) =>
      raw.externalId === "744000159074300" ? applySmartRecruitersDetail(raw, srDetailFixture) : raw,
    );
    const jobs = [
      ...(await normalizeAll(gitlab, parseGreenhouseJobs(greenhouseFixture, gitlab))),
      ...(await normalizeAll(palantir, parseLeverPostings(leverFixture))),
      ...(await normalizeAll(ramp, parseAshbyBoard(ashbyFixture))),
      ...(await normalizeAll(bosch, srRaws)),
      ...(await normalizeAll(blueground, parseWorkableWidget(workableFixture))),
    ].sort((a, b) => (a.id < b.id ? -1 : 1));

    const golden = goldenShard.jobs.map(({ firstSeenAt: _seen, ...job }) => job);
    expect(jobs.map((j) => j.id)).toEqual(golden.map((j) => j.id));
    for (const [i, job] of jobs.entries()) {
      expect(job, job.id).toEqual(golden[i]);
    }
  });
});
