import { createHash, createHmac } from "node:crypto";
import { vi } from "vitest";
import { db } from "@/lib/db";
import * as q from "@/lib/db/queries";
import { users } from "@/lib/db/schema";

/** Test-only helpers for lib/heartbeat and its routes. */

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

/** Produces an `upstash-signature` JWT the way QStash does (HS256 over the body hash + URL). */
export function signQStash(body: string, url: string, key = process.env.QSTASH_CURRENT_SIGNING_KEY!) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: "Upstash",
      sub: url,
      iat: now,
      nbf: now,
      exp: now + 300,
      jti: crypto.randomUUID(),
      body: createHash("sha256").update(body).digest("base64url"),
    }),
  );
  const sig = createHmac("sha256", key).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export function qstashRequest(path: string, payload: unknown, opts: { signature?: string | null } = {}) {
  const url = new URL(path, process.env.APP_URL).toString();
  const body = JSON.stringify(payload);
  const signature = opts.signature === undefined ? signQStash(body, url) : opts.signature;
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(signature ? { "upstash-signature": signature } : {}) },
    body,
  });
}

/** In-memory stand-ins for the shared Redis and QStash clients (only the calls we use). */
export function createFakeUpstash() {
  const store = new Map<string, string>();
  const redis = {
    store,
    set: vi.fn(async (key: string, value: string, opts?: { nx?: boolean; ex?: number }) => {
      if (opts?.nx && store.has(key)) return null;
      store.set(key, value);
      return "OK" as const;
    }),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    // Only the compare-and-delete lock release script is supported.
    eval: vi.fn(async (_script: string, keys: string[], args: string[]) => {
      if (store.get(keys[0]) !== args[0]) return 0;
      store.delete(keys[0]);
      return 1;
    }),
  };
  const qstash = {
    publishJSON: vi.fn<(req: unknown) => Promise<{ messageId: string }>>(async () => ({ messageId: crypto.randomUUID() })),
  };
  // runAgent rate-limits every run; without this the limiter would reach for a real Redis.
  const limit = vi.fn(async () => ({ success: true, limit: 0, remaining: 0, reset: 0 }));
  const createRatelimit = vi.fn(() => ({ limit }));
  return { redis, qstash, limit, createRatelimit };
}

export async function seedUser(email: string, opts: { timezone?: string; telegramChatId?: string } = {}) {
  const [user] = await db
    .insert(users)
    .values({ email, timezone: opts.timezone ?? "America/New_York", telegramChatId: opts.telegramChatId })
    .returning();
  const agent = await q.ensurePrimaryAgent(user.id);
  return { user, agent };
}
