import { env } from "@/lib/env";

/**
 * Minimal Telegram Bot API client. No SDK: the webhook bot only needs a few methods.
 * Docs: https://core.telegram.org/bots/api
 */

const API_BASE = "https://api.telegram.org";

export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly errorCode: number | undefined,
    description: string,
  ) {
    super(`Telegram ${method} failed (${errorCode ?? "no code"}): ${description}`);
    this.name = "TelegramApiError";
  }
}

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
};

export async function callTelegram<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as TelegramResponse<T>;
  if (!data.ok || data.result === undefined) {
    throw new TelegramApiError(method, data.error_code, data.description ?? "unknown error");
  }
  return data.result;
}

export function sendMessage(
  chatId: string | number,
  text: string,
  options: Record<string, unknown> = {},
) {
  return callTelegram<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    ...options,
  });
}

export function sendChatAction(chatId: string | number, action = "typing") {
  return callTelegram<boolean>("sendChatAction", { chat_id: chatId, action });
}

/** Point Telegram at our webhook. secret_token is echoed back in X-Telegram-Bot-Api-Secret-Token. */
export function setWebhook(url: string) {
  return callTelegram<boolean>("setWebhook", {
    url,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
  });
}

export function deleteWebhook() {
  return callTelegram<boolean>("deleteWebhook", {});
}

/** True when the request really came from Telegram. Check this first in the webhook handler. */
export function isValidWebhookSecret(header: string | null): boolean {
  return header === env.TELEGRAM_WEBHOOK_SECRET;
}
