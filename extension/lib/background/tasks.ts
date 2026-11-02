/**
 * Background tasks shared by alarms and messages. Each long task runs once at a
 * time; a second request while it runs gets the same result.
 */
import { getDb } from "../db/db";
import { syncFeed } from "../feed/sync";
import type { BoardsSyncResult, FeedSyncResult } from "../messaging/protocol";
import type { Handlers } from "../messaging/server";
import { loadSettings } from "../settings/settings";
import { addCompanyFromUrl, syncBoards, type BoardDeps } from "../sources/boards";
import { closeJobs } from "../feed/jobs";

function boardDeps(): BoardDeps {
  return { db: getDb(), fetch: globalThis.fetch.bind(globalThis), now: () => new Date() };
}

let feedRun: Promise<FeedSyncResult> | undefined;

export function runFeedSync(force = false): Promise<FeedSyncResult> {
  feedRun ??= (async () => {
    const settings = await loadSettings();
    if (!settings.sources.feed) return { status: "unchanged" as const, added: 0, closed: 0 };
    return syncFeed(
      {
        db: getDb(),
        fetch: globalThis.fetch.bind(globalThis),
        baseUrl: settings.sources.feedBaseUrl,
        now: () => new Date(),
      },
      { force },
    );
  })().finally(() => {
    feedRun = undefined;
  });
  return feedRun;
}

let boardsRun: Promise<BoardsSyncResult> | undefined;

export function runBoardsSync(id?: string): Promise<BoardsSyncResult> {
  if (id !== undefined) return syncBoards(boardDeps(), id);
  boardsRun ??= (async () => {
    const settings = await loadSettings();
    if (!settings.sources.personalBoards) return { companies: 0, failed: 0, added: 0, closed: 0 };
    return syncBoards(boardDeps());
  })().finally(() => {
    boardsRun = undefined;
  });
  return boardsRun;
}

/** Message handlers for the background service worker. */
export const handlers: Handlers = {
  "feed/sync": ({ force }) => runFeedSync(force),

  "boards/add": ({ url, name }) => addCompanyFromUrl(boardDeps(), url, name),

  "boards/remove": async ({ id }) => {
    const db = getDb();
    const company = await db.companies.get(id);
    if (!company) return { removed: false };
    const prefix = `${company.platform}:${company.token}:`;
    const ids = (await db.jobs.where("company.token").equals(company.token).toArray())
      .filter((j) => j.source === "personal_board" && j.id.startsWith(prefix))
      .map((j) => j.id);
    await closeJobs(db, ids, new Date().toISOString());
    await db.companies.delete(id);
    return { removed: true };
  },

  "boards/setEnabled": async ({ id, enabled }) => ({
    updated: (await getDb().companies.update(id, { enabled })) === 1,
  }),

  "boards/sync": ({ id }) => runBoardsSync(id),

  "jobs/setStatus": async ({ ids, status }) => {
    const db = getDb();
    const updated = await db.jobs.where("id").anyOf(ids).modify({ status });
    return { updated };
  },
};
