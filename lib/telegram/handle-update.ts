import { isAgentError, runAgent } from "@/lib/agents";
import {
  createChat,
  ensurePrimaryAgent,
  getOrCreateChat,
  getUser,
  getUserByTelegramChatId,
  setTelegramChatId,
} from "@/lib/db/queries";
import type { User } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { createRatelimit } from "@/lib/upstash";
import { sendHtml, startTyping } from "./api";
import { escapeHtml, markdownToTelegramHtml } from "./format";
import { normalizeLinkCode, redeemLinkCode } from "./linking";
import * as msg from "./messages";
import type { TelegramMessage, TelegramUpdate } from "./types";

/** Throttles code guessing: each chat gets a few /link attempts per window. */
const linkAttempts = createRatelimit("telegram-link", 5, "10 m");

type Command = { name: string; arg: string };

/** Parses "/cmd arg" and "/cmd@our_bot arg". Commands addressed to another bot are ignored. */
export function parseCommand(text: string): Command | undefined {
  const m = /^\/([a-zA-Z0-9_]+)(?:@(\S+))?(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m) return undefined;
  const [, name, bot, arg = ""] = m;
  if (bot && bot.toLowerCase() !== env.TELEGRAM_BOT_USERNAME.toLowerCase()) return undefined;
  return { name: name.toLowerCase(), arg: arg.trim() };
}

/** Processes one webhook update. Never throws: failures are logged and the user gets a short error. */
export async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message) return;

  try {
    await handleMessage(message);
  } catch (err) {
    console.error(`[telegram] update ${update.update_id} failed`, err);
    await sendHtml(message.chat.id, msg.GENERIC_ERROR).catch((sendErr) =>
      console.error("[telegram] failed to send error reply", sendErr),
    );
  }
}

async function handleMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const text = message.text?.trim();
  const command = text ? parseCommand(text) : undefined;

  if ((command?.name === "start" || command?.name === "link") && command.arg) {
    return linkChat(message, command.arg);
  }

  const user = await getUserByTelegramChatId(String(chatId));
  if (!user) return sendHtml(chatId, msg.LINK_INSTRUCTIONS());
  if (user.status === "waitlist") return sendHtml(chatId, msg.WAITLIST);

  switch (command?.name) {
    case "start":
      return sendHtml(chatId, msg.LINK_SUCCESS);
    case "link":
      return sendHtml(chatId, msg.LINK_ALREADY_LINKED);
    case "new":
      return startNewChat(user, chatId);
  }

  if (!text) return sendHtml(chatId, msg.TEXT_ONLY);
  return replyWithAgent(user, chatId, text);
}

async function linkChat(message: TelegramMessage, rawCode: string): Promise<void> {
  const chatId = message.chat.id;
  if (message.chat.type !== "private") return sendHtml(chatId, msg.LINK_PRIVATE_ONLY);

  const { success } = await linkAttempts.limit(String(chatId));
  if (!success) return sendHtml(chatId, msg.LINK_TOO_MANY_ATTEMPTS);

  const code = normalizeLinkCode(rawCode);
  const userId = code && (await redeemLinkCode(code));
  const user = userId && (await getUser(userId));
  if (!user) return sendHtml(chatId, msg.LINK_INVALID_CODE);

  const current = await getUserByTelegramChatId(String(chatId));
  if (current?.id === user.id) return sendHtml(chatId, msg.LINK_ALREADY_LINKED);
  if (current) return sendHtml(chatId, msg.LINK_CHAT_TAKEN);

  await setTelegramChatId(user.id, String(chatId));
  return sendHtml(chatId, msg.LINK_SUCCESS);
}

/** Creates a new Telegram chat; it becomes the latest one, so later messages continue it. */
async function startNewChat(user: User, chatId: number): Promise<void> {
  const agent = await ensurePrimaryAgent(user.id);
  await createChat(user.id, { agentId: agent.id, channel: "telegram" });
  return sendHtml(chatId, msg.NEW_CHAT);
}

async function replyWithAgent(user: User, chatId: number, text: string): Promise<void> {
  const stopTyping = startTyping(chatId);
  let reply: string;
  try {
    // One ongoing Telegram chat per user: the latest telegram chat of the primary agent.
    const agent = await ensurePrimaryAgent(user.id);
    const chat = await getOrCreateChat(user.id, { agentId: agent.id, channel: "telegram" });
    const result = await runAgent({
      userId: user.id,
      chatId: chat.id,
      message: text,
      channel: "telegram",
    });
    reply = markdownToTelegramHtml(result.text);
  } catch (err) {
    if (!isAgentError(err)) throw err;
    reply = escapeHtml(err.userMessage);
  } finally {
    stopTyping();
  }
  await sendHtml(chatId, reply);
}
