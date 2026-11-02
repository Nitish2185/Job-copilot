/// <reference types="node" />
/**
 * Playwright fixtures: a Chromium profile with the e2e build loaded, and a local
 * static server for fixture files.
 */
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { test as base, chromium, type BrowserContext } from "@playwright/test";

const EXTENSION_PATH = fileURLToPath(new URL("../../.output/chrome-mv3-e2e", import.meta.url));

export interface FixtureServer {
  url: string;
  files: Map<string, string>;
  requests: string[];
}

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  server: FixtureServer;
}>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an options object
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });
    // Never reach the real feed or any real job site from tests.
    await context.route(/^https:\/\/[^/]*github\.io\//, (route) => route.abort());
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(new URL(worker.url()).host);
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an options object
  server: async ({}, use) => {
    const files = new Map<string, string>();
    const requests: string[] = [];
    const server: Server = createServer((req, res) => {
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      requests.push(path);
      const body = files.get(path);
      if (body === undefined) {
        res.writeHead(404).end("not found");
        return;
      }
      res
        .writeHead(200, { "Content-Type": "application/json", ETag: `"${sha256(body)}"` })
        .end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    await use({ url: `http://127.0.0.1:${String(port)}`, files, requests });
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  },
});

export const expect = test.expect;

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Publishes a feed with `count` generated jobs under /feed/ on the fixture server. */
export function publishFeed(server: FixtureServer, count: number): void {
  const companies = ["acme", "globex", "initech", "umbrella", "hooli"];
  const titles = [
    "Backend Engineer",
    "Frontend Developer",
    "Data Scientist",
    "SRE",
    "Full Stack Developer",
  ];
  const jobs = Array.from({ length: count }, (_, i) => {
    const company = companies[i % companies.length] ?? "acme";
    return {
      id: `lever:${company}:job-${String(i)}`,
      platform: "lever",
      company: { name: company.charAt(0).toUpperCase() + company.slice(1), token: company },
      title: `${titles[i % titles.length] ?? "Engineer"} ${String(i)}`,
      locations: [i % 2 === 0 ? "Bengaluru, India" : "Remote - US"],
      remote: i % 2 === 0 ? "hybrid" : "remote",
      countryCodes: [i % 2 === 0 ? "IN" : "US"],
      url: `https://jobs.lever.co/${company}/job-${String(i)}`,
      applyUrl: `https://jobs.lever.co/${company}/job-${String(i)}/apply`,
      firstSeenAt: new Date(Date.UTC(2026, 10, 2, 6, 0, i % 60))
        .toISOString()
        .replace(".000Z", "Z"),
      skills: i % 3 === 0 ? ["go", "kubernetes"] : ["react", "typescript"],
      snippet: "Build and run our platform.",
      descHash: sha256(`job ${String(i)}`),
    };
  });
  const generatedAt = "2026-11-02T06:00:00Z";
  const snapshot = JSON.stringify({ schemaVersion: 1, generatedAt, jobs });
  const index = {
    schemaVersion: 1,
    generatedAt,
    totalOpenJobs: count,
    companyCount: companies.length,
    skillsVersion: "2026-11-02",
    snapshot: { file: "snapshot.json", sha256: sha256(snapshot), count },
    shards: [],
    closedShards: [],
  };
  server.files.set("/feed/snapshot.json", snapshot);
  server.files.set("/feed/index.json", JSON.stringify(index));
}
