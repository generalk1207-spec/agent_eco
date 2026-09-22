import { randomInt } from "node:crypto";
import { env } from "@/lib/env";
import { redis } from "@/lib/upstash";

/** No 0/O or 1/I, so codes are easy to read and type. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LINK_CODE_LENGTH = 6;
export const LINK_CODE_TTL_SECONDS = 10 * 60;

const codeKey = (code: string) => `tg:link:${code}`;
/** The user's current code, so generating a new one invalidates the old one. */
const userKey = (userId: string) => `tg:link-user:${userId}`;

export type LinkCode = { code: string; deepLink: string; expiresAt: Date };

function randomCode(): string {
  return Array.from({ length: LINK_CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join(
    "",
  );
}

export function normalizeLinkCode(input: string): string | undefined {
  const code = input.trim().toUpperCase();
  return code.length === LINK_CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c))
    ? code
    : undefined;
}

export async function createLinkCode(userId: string): Promise<LinkCode> {
  const previous = await redis.get<string>(userKey(userId));
  if (previous) await redis.del(codeKey(previous));

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const stored = await redis.set(codeKey(code), userId, { nx: true, ex: LINK_CODE_TTL_SECONDS });
    if (stored === null) continue; // collision with a live code
    await redis.set(userKey(userId), code, { ex: LINK_CODE_TTL_SECONDS });
    return {
      code,
      deepLink: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${code}`,
      expiresAt: new Date(Date.now() + LINK_CODE_TTL_SECONDS * 1000),
    };
  }
  throw new Error("Could not allocate a unique Telegram link code");
}

/** Consumes the code atomically (single use). Returns the userId it was issued to, if valid. */
export async function redeemLinkCode(code: string): Promise<string | undefined> {
  const userId = await redis.getdel<string>(codeKey(code));
  if (!userId) return undefined;
  await redis.del(userKey(userId));
  return userId;
}
