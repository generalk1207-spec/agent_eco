import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chats, type Chat, type ChatChannel } from "@/lib/db/schema";
import { getAgent } from "./agents";
import { NotFoundError } from "./errors";

export type NewChatInput = { agentId: string; channel: ChatChannel };

export async function listChats(
  userId: string,
  filter: { agentId?: string; channel?: ChatChannel } = {},
): Promise<Chat[]> {
  return db
    .select()
    .from(chats)
    .where(
      and(
        eq(chats.userId, userId),
        filter.agentId ? eq(chats.agentId, filter.agentId) : undefined,
        filter.channel ? eq(chats.channel, filter.channel) : undefined,
      ),
    )
    .orderBy(desc(chats.createdAt));
}

export async function getChat(userId: string, chatId: string): Promise<Chat | undefined> {
  const [row] = await db
    .select()
    .from(chats)
    .where(and(eq(chats.userId, userId), eq(chats.id, chatId)))
    .limit(1);
  return row;
}

/** Throws NotFoundError if the agent doesn't belong to the user. */
export async function createChat(userId: string, input: NewChatInput): Promise<Chat> {
  if (!(await getAgent(userId, input.agentId))) throw new NotFoundError("Agent", input.agentId);
  const [row] = await db
    .insert(chats)
    .values({ ...input, userId })
    .returning();
  return row;
}

/** Returns the most recent chat for this agent + channel, creating one if none exists. */
export async function getOrCreateChat(userId: string, input: NewChatInput): Promise<Chat> {
  const [latest] = await listChats(userId, input);
  return latest ?? createChat(userId, input);
}

/** Returns true if a row was deleted. */
export async function deleteChat(userId: string, chatId: string): Promise<boolean> {
  const rows = await db
    .delete(chats)
    .where(and(eq(chats.userId, userId), eq(chats.id, chatId)))
    .returning({ id: chats.id });
  return rows.length > 0;
}
