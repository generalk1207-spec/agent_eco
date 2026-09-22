import { Client as QStashClient, Receiver } from "@upstash/qstash";
import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

/** Shared Upstash clients. Feature branches import these instead of constructing their own. */

export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

/** Sliding-window limiter; key it by userId, e.g. `limiter.limit(userId)`. */
export function createRatelimit(prefix: string, requests: number, window: Duration): Ratelimit {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `ratelimit:${prefix}`,
    analytics: false,
  });
}

export const qstash = new QStashClient({ token: env.QSTASH_TOKEN });

/** Verifies QStash signatures on /api/jobs/* and /api/cron/* handlers. */
export const qstashReceiver = new Receiver({
  currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
  nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});
