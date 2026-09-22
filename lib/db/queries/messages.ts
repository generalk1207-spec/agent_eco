import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages, type Message, type MessageRole } from "@/lib/db/schema";
import { getChat } from "./chats";
import { NotFoundError } from "./errors";

export type NewMessageInput = { chatId: string; role: MessageRole; content: string };

/** Most recent `limit` messages in the chat, returned oldest-first. */
export async function listMessages(
  userId: string,
  chatId: string,
  { limit = 50 }: { limit?: number } = {},
): Promise<Message[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.userId, userId), eq(messages.chatId, chatId)))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse();
}

export async function getMessage(userId: string, messageId: string): Promise<Message | undefined> {
  const [row] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.userId, userId), eq(messages.id, messageId)))
    .limit(1);
  return row;
}

/** Throws NotFoundError if the chat doesn't belong to the user. */
export async function addMessage(userId: string, input: NewMessageInput): Promise<Message> {
  if (!(await getChat(userId, input.chatId))) throw new NotFoundError("Chat", input.chatId);
  const [row] = await db
    .insert(messages)
    .values({ ...input, userId })
    .returning();
  return row;
}

/** Returns true if a row was deleted. */
export async function deleteMessage(userId: string, messageId: string): Promise<boolean> {
  const rows = await db
    .delete(messages)
    .where(and(eq(messages.userId, userId), eq(messages.id, messageId)))
    .returning({ id: messages.id });
  return rows.length > 0;
}
