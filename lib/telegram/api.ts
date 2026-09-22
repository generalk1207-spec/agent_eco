import { env } from "@/lib/env";
import { htmlToPlainText } from "./format";
import { splitTelegramHtml } from "./split";

type TelegramResponse<T> =
  | { ok: true; result: T }
  | { ok: false; error_code: number; description: string };

export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly status: number,
    readonly description: string,
  ) {
    super(`Telegram ${method} failed (${status}): ${description}`);
    this.name = "TelegramApiError";
  }
}

export async function callTelegram<T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as TelegramResponse<T> | null;
  if (!data?.ok) {
    throw new TelegramApiError(method, res.status, data?.description ?? res.statusText);
  }
  return data.result;
}

const isParseError = (err: unknown) =>
  err instanceof TelegramApiError && /can't parse entities/i.test(err.description);

/**
 * Sends HTML, split into as many messages as needed. If Telegram rejects a chunk's markup,
 * that chunk is re-sent as plain text so the user still gets the reply.
 */
export async function sendHtml(chatId: number, html: string): Promise<void> {
  for (const chunk of splitTelegramHtml(html)) {
    try {
      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: chunk,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    } catch (err) {
      if (!isParseError(err)) throw err;
      await callTelegram("sendMessage", { chat_id: chatId, text: htmlToPlainText(chunk) });
    }
  }
}

/**
 * Shows "typing…" until the returned stop function is called. Telegram clears the action
 * after about 5 seconds, so it's refreshed every 4.
 */
export function startTyping(chatId: number): () => void {
  const send = () =>
    callTelegram("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  void send();
  const timer = setInterval(send, 4_000);
  return () => clearInterval(timer);
}
