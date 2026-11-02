/** Sending side of the message bus (pages and content scripts). */
import { browser } from "wxt/browser";
import {
  MESSAGES,
  ReplySchema,
  type MessageRequest,
  type MessageResponse,
  type MessageType,
} from "./protocol";

export class MessageError extends Error {
  override name = "MessageError";
}

/** Sends a typed message to the background and returns its validated reply. */
export async function sendMessage<K extends MessageType>(
  type: K,
  payload: MessageRequest<K>,
): Promise<MessageResponse<K>> {
  const definition = MESSAGES[type];
  const request: unknown = definition.request.parse(payload);
  const raw: unknown = await browser.runtime.sendMessage({ type, payload: request });
  const reply = ReplySchema.parse(raw);
  if (!reply.ok) throw new MessageError(reply.error);
  return definition.response.parse(reply.data) as MessageResponse<K>;
}
