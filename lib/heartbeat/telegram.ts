import { env } from "@/lib/env";

const TELEGRAM_MAX_LENGTH = 4096;

/** Minimal Bot API sender for scheduled-job output. Splits text over Telegram's length limit. */
export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  for (let i = 0; i < Math.max(text.length, 1); i += TELEGRAM_MAX_LENGTH) {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(i, i + TELEGRAM_MAX_LENGTH) || " " }),
    });
    if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status} ${await res.text()}`);
  }
}
