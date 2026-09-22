import {
  addMessage,
  createChat,
  ensurePrimaryAgent,
  getAgent,
  getChat,
  getOrCreateChat,
  NotFoundError,
} from "@/lib/db/queries";
import type { ChatChannel } from "@/lib/db/schema";
import type { AgentChannel, RunAgent } from "./types";

export type { AgentChannel, RunAgent, RunAgentInput, RunAgentResult } from "./types";
export { AgentError, BudgetExceededError, RateLimitError, isAgentError } from "./errors";

// Scheduled runs are persisted as web chats (the chats.channel enum is web | telegram).
const toChatChannel = (channel: AgentChannel): ChatChannel =>
  channel === "telegram" ? "telegram" : "web";

/**
 * STUB: echoes the message back so other branches can integrate now.
 * The agent-core branch replaces the body; the signature is fixed by ./types.ts.
 */
export const runAgent: RunAgent = async ({ userId, chatId, agentId, message, channel }) => {
  const chat = await resolveChat(userId, { chatId, agentId, channel });

  await addMessage(userId, { chatId: chat.id, role: "user", content: message });
  const text = message;
  await addMessage(userId, { chatId: chat.id, role: "assistant", content: text });

  return { text, chatId: chat.id };
};

async function resolveChat(
  userId: string,
  { chatId, agentId, channel }: { chatId?: string; agentId?: string; channel: AgentChannel },
) {
  if (chatId) {
    const chat = await getChat(userId, chatId);
    if (!chat) throw new NotFoundError("Chat", chatId);
    return chat;
  }

  const agent = agentId ? await getAgent(userId, agentId) : await ensurePrimaryAgent(userId);
  if (!agent) throw new NotFoundError("Agent", agentId!);

  // Scheduled runs always start a fresh chat; interactive channels continue the latest one.
  const input = { agentId: agent.id, channel: toChatChannel(channel) };
  return channel === "scheduled" ? createChat(userId, input) : getOrCreateChat(userId, input);
}
