/** Background side of the message bus: validates every message and its sender. */
import { browser, type Browser } from "wxt/browser";
import {
  EnvelopeSchema,
  MESSAGES,
  type MessageResponse,
  type MessageType,
  type ParsedRequest,
  type Reply,
  type SenderRule,
} from "./protocol";

export type Sender = Pick<Browser.runtime.MessageSender, "id" | "url" | "tab">;

export type Handlers = {
  [K in MessageType]?: (payload: ParsedRequest<K>, sender: Sender) => Promise<MessageResponse<K>>;
};

export interface SenderContext {
  extensionId: string;
  /** e.g. chrome-extension://<id>/ */
  extensionOrigin: string;
}

/** True when the sender may send messages governed by this rule. */
export function senderAllowed(rule: SenderRule, sender: Sender, ctx: SenderContext): boolean {
  if (sender.id !== ctx.extensionId) return false;
  if (rule.kind === "extension") {
    return sender.url?.startsWith(ctx.extensionOrigin) === true;
  }
  if (rule.kind === "any_page" && sender.url?.startsWith(ctx.extensionOrigin) === true) return true;
  const pageUrl = sender.tab?.url;
  if (!pageUrl) return false;
  try {
    const url = new URL(pageUrl);
    if (rule.kind === "any_page") return url.protocol === "https:" || url.protocol === "http:";
    const host = url.hostname.toLowerCase();
    return rule.hosts.includes(host);
  } catch {
    return false;
  }
}

/** Routes one message. Never throws: failures become `{ ok: false }` replies. */
export async function handleMessage(
  message: unknown,
  sender: Sender,
  handlers: Handlers,
  ctx: SenderContext,
): Promise<Reply<unknown>> {
  const envelope = EnvelopeSchema.safeParse(message);
  if (!envelope.success || !(envelope.data.type in MESSAGES)) {
    return { ok: false, error: "Unknown message" };
  }
  const type = envelope.data.type as MessageType;
  const definition = MESSAGES[type];
  if (!senderAllowed(definition.sender, sender, ctx)) {
    return { ok: false, error: "Sender not allowed" };
  }
  const handler = handlers[type] as
    ((payload: unknown, sender: Sender) => Promise<unknown>) | undefined;
  if (!handler) return { ok: false, error: `No handler for ${type}` };
  const payload = definition.request.safeParse(envelope.data.payload);
  if (!payload.success) return { ok: false, error: `Invalid ${type} request` };
  try {
    const data = definition.response.parse(await handler(payload.data, sender));
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Installs the runtime.onMessage listener in the background service worker. */
export function registerMessageHandlers(handlers: Handlers): void {
  const ctx: SenderContext = {
    extensionId: browser.runtime.id,
    extensionOrigin: browser.runtime.getURL("/"),
  };
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void handleMessage(message, sender, handlers, ctx).then(sendResponse);
    return true; // keeps the channel open for the async reply
  });
}
