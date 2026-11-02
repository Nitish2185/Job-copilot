import { describe, expect, it } from "vitest";
import { handleMessage, senderAllowed, type Handlers, type Sender } from "@/lib/messaging/server";

const ctx = { extensionId: "ext-id", extensionOrigin: "chrome-extension://ext-id/" };
const dashboard: Sender = {
  id: "ext-id",
  url: "chrome-extension://ext-id/dashboard.html#/matches",
};
const webPage: Sender = {
  id: "ext-id",
  url: "https://www.naukri.com/job",
  tab: { url: "https://www.naukri.com/job" } as Sender["tab"],
};
const otherExtension: Sender = { id: "evil", url: "chrome-extension://evil/page.html" };

const handlers: Handlers = {
  "jobs/setStatus": ({ ids }) => Promise.resolve({ updated: ids.length }),
  "feed/sync": ({ force }) =>
    Promise.resolve({ status: force ? "snapshot" : "unchanged", added: 0, closed: 0 }),
};

describe("handleMessage", () => {
  it("runs the handler for a valid message from an extension page", async () => {
    const reply = await handleMessage(
      { type: "jobs/setStatus", payload: { ids: ["a", "b"], status: "hidden" } },
      dashboard,
      handlers,
      ctx,
    );
    expect(reply).toEqual({ ok: true, data: { updated: 2 } });
  });

  it("applies request defaults", async () => {
    const reply = await handleMessage({ type: "feed/sync", payload: {} }, dashboard, handlers, ctx);
    expect(reply).toEqual({ ok: true, data: { status: "unchanged", added: 0, closed: 0 } });
  });

  it.each([
    ["unknown type", { type: "nope", payload: {} }, dashboard, "Unknown message"],
    ["not an envelope", "hello", dashboard, "Unknown message"],
    [
      "invalid payload",
      { type: "jobs/setStatus", payload: { ids: [], status: "hidden" } },
      dashboard,
      "Invalid jobs/setStatus request",
    ],
    [
      "bad status value",
      { type: "jobs/setStatus", payload: { ids: ["a"], status: "deleted" } },
      dashboard,
      "Invalid jobs/setStatus request",
    ],
    [
      "content script sending a dashboard-only message",
      { type: "jobs/setStatus", payload: { ids: ["a"], status: "hidden" } },
      webPage,
      "Sender not allowed",
    ],
    ["another extension", { type: "feed/sync", payload: {} }, otherExtension, "Sender not allowed"],
    [
      "missing handler",
      { type: "boards/sync", payload: {} },
      dashboard,
      "No handler for boards/sync",
    ],
  ])("rejects %s", async (_label, message, sender, error) => {
    expect(await handleMessage(message, sender, handlers, ctx)).toEqual({ ok: false, error });
  });

  it("rejects handler output that breaks the response schema", async () => {
    const broken: Handlers = {
      "jobs/setStatus": () => Promise.resolve({ updated: -1 }),
    };
    const reply = await handleMessage(
      { type: "jobs/setStatus", payload: { ids: ["a"], status: "saved" } },
      dashboard,
      broken,
      ctx,
    );
    expect(reply.ok).toBe(false);
  });
});

describe("senderAllowed", () => {
  it("allows content scripts only on their exact hosts", () => {
    const rule = { kind: "content", hosts: ["jobs.lever.co"] } as const;
    const tab = (url: string) => ({ id: "ext-id", tab: { url } as Sender["tab"] });
    expect(senderAllowed(rule, tab("https://jobs.lever.co/acme/1/apply"), ctx)).toBe(true);
    expect(senderAllowed(rule, tab("https://jobs.lever.co.evil.com/acme"), ctx)).toBe(false);
    expect(senderAllowed(rule, tab("https://evil.com/?jobs.lever.co"), ctx)).toBe(false);
    expect(senderAllowed(rule, { id: "ext-id" }, ctx)).toBe(false);
  });
});
