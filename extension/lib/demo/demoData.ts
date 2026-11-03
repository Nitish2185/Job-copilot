/**
 * "Load demo data" for development builds (spec 24): fictional jobs, scores and
 * applications so every screen can be checked without real data. Everything
 * it writes has a "demo:" ID and can be removed again; it never touches the
 * user's own records or settings (AI usage stays real).
 */
import {
  dedupeKey,
  type Application,
  type ApplicationStage,
  type Job,
  type JobPlatform,
  type JobScore,
} from "@job-copilot/shared";
import type { JobCopilotDB } from "../db/db";

export const DEMO_PREFIX = "demo:";
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/** Small deterministic generator: the same demo data on every load. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

const COMPANIES = [
  "Northwind Labs",
  "Bluepeak Systems",
  "Lumen Analytics",
  "Quillstack",
  "Harbor Health Tech",
  "Tidewater Payments",
  "Copperleaf Cloud",
  "Orbitly",
  "Fernway Logistics",
  "Brightloom",
];
const TITLES = [
  "Backend Engineer",
  "Full Stack Developer",
  "Frontend Engineer (React)",
  "Software Engineer, Platform",
  "Node.js Developer",
  "Go Developer",
];
const SKILLS = [
  ["go", "postgresql", "docker"],
  ["react", "typescript", "nodejs"],
  ["react", "nextjs", "css"],
  ["kubernetes", "go", "aws"],
  ["nodejs", "mongodb", "express"],
  ["go", "kafka", "grpc"],
];
const PLATFORMS: { platform: JobPlatform; mode: "auto" | "assist"; host: string }[] = [
  { platform: "greenhouse", mode: "auto", host: "https://job-boards.greenhouse.io/demo" },
  { platform: "lever", mode: "auto", host: "https://jobs.lever.co/demo" },
  { platform: "naukri", mode: "assist", host: "https://www.naukri.com/job-listings-demo" },
  { platform: "linkedin", mode: "assist", host: "https://www.linkedin.com/jobs/view/demo" },
  { platform: "ashby", mode: "auto", host: "https://jobs.ashbyhq.com/demo" },
];
const CITIES = ["Bengaluru, India", "Pune, India", "Remote, India", "Hyderabad, India"];

/** The path an application took, by how far it got. */
const PATHS: ApplicationStage[][] = [
  ["applied"],
  ["applied"],
  ["applied"],
  ["applied", "ghosted"],
  ["applied", "rejected"],
  ["applied", "screening"],
  ["applied", "screening", "rejected"],
  ["applied", "screening", "interview"],
  ["applied", "screening", "interview", "rejected"],
  ["applied", "screening", "interview", "offer"],
];

export interface DemoData {
  jobs: Job[];
  scores: JobScore[];
  applications: Application[];
}

export function buildDemoData(now: Date, jobCount = 60, appCount = 34): DemoData {
  const rand = random(42);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;
  const jobs: Job[] = [];
  const scores: JobScore[] = [];
  for (let i = 0; i < jobCount; i++) {
    const t = Math.floor(rand() * TITLES.length);
    const title = TITLES[t] ?? "Software Engineer";
    const company = pick(COMPANIES);
    const where = pick(CITIES);
    const site = pick(PLATFORMS);
    const seen = now.getTime() - Math.floor(rand() * 84) * DAY;
    const url = `${site.host}/${String(1000 + i)}`;
    const id = `${DEMO_PREFIX}${String(i)}`;
    jobs.push({
      id,
      platform: site.platform,
      source: "feed",
      company: { name: company },
      title,
      locations: [where],
      remote: where.startsWith("Remote") ? "remote" : "hybrid",
      countryCodes: ["IN"],
      url,
      applyUrl: url,
      firstSeenAt: iso(seen),
      skills: SKILLS[t] ?? [],
      snippet: `Fictional demo job: ${title} at ${company}.`,
      mode: site.mode,
      dedupeKey: dedupeKey(company, title, `${where} ${String(i)}`),
      status: i < appCount ? "applied" : "new",
    });
    const final = Math.round(45 + rand() * 50);
    scores.push({
      jobId: id,
      profileVersion: 0,
      prefilter: {
        score: final,
        matchedSkills: (SKILLS[t] ?? []).slice(0, 2),
        missingSkills: (SKILLS[t] ?? []).slice(2),
        passed: true,
        reasons: ["Demo data"],
      },
      final,
      isEstimate: rand() < 0.5,
      scoredAt: iso(seen),
    });
  }

  const applications: Application[] = jobs.slice(0, appCount).map((job, i) => {
    const sentAt = now.getTime() - Math.floor(rand() * 80 + 1) * DAY;
    // Better matches and tailored resumes get further, so the charts have a story.
    const score = scores[i]?.final ?? 60;
    const tailored = rand() < 0.4;
    const luck = rand() * 0.7 + (score - 70) / 60 + (tailored ? 0.25 : 0);
    const path = PATHS[
      Math.max(0, Math.min(PATHS.length - 1, Math.floor(luck * PATHS.length)))
    ] ?? ["applied"];
    const events: Application["events"] = [{ at: iso(sentAt), type: "submitted" }];
    for (let s = 1; s < path.length; s++) {
      events.push({
        at: iso(Math.min(now.getTime(), sentAt + s * 6 * DAY)),
        type: "stage",
        detail: `${path[s - 1] ?? "applied"} -> ${path[s] ?? "applied"}`,
      });
    }
    return {
      id: `${DEMO_PREFIX}app:${String(i)}`,
      jobId: job.id,
      mode: job.mode,
      status: "submitted",
      stage: path.at(-1) ?? "applied",
      resumeChoice: tailored ? "tailored" : "current",
      answersSent: [{ question: "Notice period", answer: "30 days", source: "profile" }],
      submittedAt: iso(sentAt),
      notes: "",
      events,
    };
  });

  return { jobs, scores, applications };
}

const isDemo = (id: string) => id.startsWith(DEMO_PREFIX);

export async function loadDemoData(db: JobCopilotDB, now = new Date()): Promise<DemoData> {
  const data = buildDemoData(now);
  await db.transaction("rw", db.jobs, db.scores, db.applications, async () => {
    await db.jobs.bulkPut(data.jobs);
    await db.scores.bulkPut(data.scores);
    await db.applications.bulkPut(data.applications);
  });
  return data;
}

/** Removes every demo record (and nothing else). */
export async function removeDemoData(db: JobCopilotDB): Promise<number> {
  return db.transaction("rw", db.jobs, db.scores, db.applications, async () => {
    const apps = await db.applications.filter((a) => isDemo(a.id)).primaryKeys();
    const jobs = await db.jobs.filter((j) => isDemo(j.id)).primaryKeys();
    await db.applications.bulkDelete(apps);
    await db.jobs.bulkDelete(jobs);
    await db.scores.bulkDelete(jobs);
    return apps.length + jobs.length;
  });
}
