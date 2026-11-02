import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { JobCopilotDB, SCHEMA_V1 } from "@/lib/db/db";
import { sampleJob } from "./helpers";

let counter = 0;
const freshName = () => `test-db-${String(++counter)}-${String(Date.now())}`;

describe("JobCopilotDB", () => {
  it("creates every table from the spec", async () => {
    const db = new JobCopilotDB(freshName());
    await db.open();
    const tables = db.tables.map((t) => t.name).sort();
    expect(tables).toEqual(Object.keys(SCHEMA_V1).sort());
    db.close();
  });

  it("queries jobs by the indexed fields", async () => {
    const db = new JobCopilotDB(freshName());
    await db.jobs.bulkPut([
      sampleJob({ id: "a", status: "new", platform: "lever" }),
      sampleJob({
        id: "b",
        status: "hidden",
        platform: "greenhouse",
        company: { name: "Beta", token: "beta" },
      }),
    ]);
    expect(await db.jobs.where("status").equals("new").count()).toBe(1);
    expect(await db.jobs.where("company.token").equals("beta").count()).toBe(1);
    expect(await db.jobs.orderBy("firstSeenAt").count()).toBe(2);
    db.close();
  });

  it("keeps user data when a later version adds an index (migration)", async () => {
    const name = freshName();
    const v1 = new JobCopilotDB(name);
    await v1.jobs.put(sampleJob({ id: "kept", status: "saved" }));
    await v1.feedState.put({
      id: "feed",
      baseUrl: "x",
      appliedShards: {},
      appliedClosed: {},
      status: "ok",
    });
    v1.close();

    // Simulates a future release: version 2 adds an index and fills a new field.
    class FutureDB extends JobCopilotDB {
      constructor() {
        super(name);
        this.version(2)
          .stores({ jobs: `${SCHEMA_V1.jobs}, title` })
          .upgrade(async (tx) => {
            await tx
              .table("jobs")
              .toCollection()
              .modify((job: Record<string, unknown>) => {
                job.migratedInV2 = true;
              });
          });
      }
    }
    const v2 = new FutureDB();
    await v2.open();
    expect(v2.verno).toBe(2);
    const job = (await v2.jobs.get("kept")) as Record<string, unknown> | undefined;
    expect(job).toMatchObject({ id: "kept", status: "saved", migratedInV2: true });
    expect(await v2.feedState.get("feed")).toBeDefined();
    expect(await v2.jobs.where("title").equals("Backend Engineer").count()).toBe(1);
    v2.close();
    await Dexie.delete(name);
  });
});
