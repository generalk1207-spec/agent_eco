import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { usage, type Usage } from "@/lib/db/schema";

/** Current month as YYYY-MM in UTC. */
export function currentMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export async function getUsage(userId: string, month: string): Promise<Usage | undefined> {
  const [row] = await db
    .select()
    .from(usage)
    .where(and(eq(usage.userId, userId), eq(usage.month, month)))
    .limit(1);
  return row;
}

export async function listUsage(userId: string): Promise<Usage[]> {
  return db.select().from(usage).where(eq(usage.userId, userId)).orderBy(usage.month);
}

/** Atomically adds to the user's usage row for `month`, creating it if needed. */
export async function incrementUsage(
  userId: string,
  month: string,
  {
    inputTokens = 0,
    outputTokens = 0,
    messageCount = 1,
  }: { inputTokens?: number; outputTokens?: number; messageCount?: number },
): Promise<Usage> {
  const [row] = await db
    .insert(usage)
    .values({ userId, month, inputTokens, outputTokens, messageCount })
    .onConflictDoUpdate({
      target: [usage.userId, usage.month],
      set: {
        inputTokens: sql`${usage.inputTokens} + ${inputTokens}`,
        outputTokens: sql`${usage.outputTokens} + ${outputTokens}`,
        messageCount: sql`${usage.messageCount} + ${messageCount}`,
      },
    })
    .returning();
  return row;
}
