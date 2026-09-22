import { env } from "@/lib/env";

/** User-facing bot replies (HTML parse mode). */

export const settingsUrl = () => `${env.APP_URL}/settings/telegram`;

export const LINK_INSTRUCTIONS = () =>
  [
    "Hi! This chat isn't linked to an account yet.",
    "",
    `1. Open <a href="${settingsUrl()}">Settings → Telegram</a> and click <b>Connect Telegram</b>.`,
    "2. Tap the link it gives you, or send <code>/link CODE</code> here.",
  ].join("\n");

export const LINK_USAGE = "Send <code>/link CODE</code> using the 6-character code from Settings → Telegram.";

export const LINK_INVALID_CODE =
  "That code is invalid or has expired. Codes work once and last 10 minutes. Generate a new one in Settings → Telegram.";

export const LINK_TOO_MANY_ATTEMPTS = "Too many linking attempts. Please wait a few minutes and try again.";

export const LINK_PRIVATE_ONLY = "For your privacy, accounts can only be linked in a private chat with the bot.";

export const LINK_CHAT_TAKEN =
  "This Telegram chat is already linked to another account. Unlink it from that account's settings first.";

export const LINK_ALREADY_LINKED = "This chat is already linked to your account. Just send me a message!";

export const LINK_SUCCESS =
  "✅ Your Telegram is now linked. Send me a message to get started, or /new to start a fresh conversation.";

export const WAITLIST =
  "You're on the waitlist. We're letting people in gradually and will email you as soon as your account is ready.";

export const NEW_CHAT = "🆕 Started a new conversation.";

export const TEXT_ONLY = "Sorry, I can only read text messages right now.";

export const GENERIC_ERROR = "Sorry, something went wrong. Please try again in a moment.";
