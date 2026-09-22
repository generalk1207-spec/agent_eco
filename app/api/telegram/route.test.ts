import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetExceededError, RateLimitError, runAgent } from "@/lib/agents";
import { db } from "@/lib/db";
import { getUser } from "@/lib/db/queries";
import { users, type UserStatus } from "@/lib/db/schema";
import { createLinkCode } from "@/lib/telegram/linking";
import * as msg from "@/lib/telegram/messages";
import type { TelegramUpdate } from "@/lib/telegram/types";
import { POST } from "./route";

const h = vi.hoisted(() => {
  type Entry = { value: unknown; expiresAt?: number };
  const store = new Map<string, Entry>();
  const live = (key: string) => {
    const entry = store.get(key);
    if (entry?.expiresAt !== undefined && Date.now() >= entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry;
  };

  /** In-memory stand-in for the Upstash commands the bot uses. TTLs follow Date.now(). */
  const redis = {
    store,
    async get(key: string) {
      return live(key)?.value ?? null;
    },
    async set(key: string, value: unknown, opts?: { nx?: boolean; ex?: number }) {
      if (opts?.nx && live(key)) return null;
      store.set(key, { value, expiresAt: opts?.ex ? Date.now() + opts.ex * 1000 : undefined });
      return "OK";
    },
    async getdel(key: string) {
      const value = live(key)?.value ?? null;
      store.delete(key);
      return value;
    },
    async del(...keys: string[]) {
      return keys.filter((k) => store.delete(k)).length;
    },
  };

  return { redis, pending: [] as Promise<unknown>[], linkAllowed: true };
});

vi.mock("@/lib/db", async () => (await import("@/test/db")).createTestDbModule());
vi.mock("@/lib/upstash", () => ({
  redis: h.redis,
  createRatelimit: () => ({ limit: async () => ({ success: h.linkAllowed }) }),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    h.pending.push(Promise.resolve().then(task));
  },
}));
vi.mock("@/lib/agents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agents")>()),
  runAgent: vi.fn(),
}));

const runAgentMock = vi.mocked(runAgent);
const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
  async () =>
    new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 }),
);

let nextUpdateId = 1;
let nextChatId = 1000;

const textUpdate = (
  chatId: number,
  text: string | undefined,
  type: "private" | "group" = "private",
): TelegramUpdate => ({
  update_id: nextUpdateId++,
  message: { message_id: 1, chat: { id: chatId, type }, text },
});

/** POSTs to the webhook and waits for the after() work to finish. */
async function post(update: unknown, secret: string | null = "test-secret") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-telegram-bot-api-secret-token"] = secret;
  const res = await POST(
    new Request("http://localhost/api/telegram", {
      method: "POST",
      headers,
      body: JSON.stringify(update),
    }),
  );
  await Promise.all(h.pending.splice(0));
  return res;
}

function calls(method: string) {
  return fetchMock.mock.calls
    .filter(([url]) => url.endsWith(`/${method}`))
    .map(([, init]) => JSON.parse(String(init.body)) as Record<string, unknown>);
}
const sentTexts = (chatId: number) =>
  calls("sendMessage")
    .filter((b) => b.chat_id === chatId)
    .map((b) => b.text as string);

async function seedUser(opts: { status?: UserStatus; telegramChatId?: number } = {}) {
  const [user] = await db
    .insert(users)
    .values({
      email: `user${nextChatId++}@example.com`,
      status: opts.status ?? "active",
      telegramChatId: opts.telegramChatId === undefined ? null : String(opts.telegramChatId),
      telegramLinkedAt: opts.telegramChatId === undefined ? null : new Date(),
    })
    .returning();
  return user;
}

beforeEach(() => {
  fetchMock.mockClear();
  runAgentMock.mockReset();
  runAgentMock.mockImplementation(async ({ message, chatId }) => ({
    text: `echo: ${message}`,
    chatId: chatId!,
  }));
  h.linkAllowed = true;
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("POST /api/telegram: request handling", () => {
  it("rejects a missing or wrong secret token without doing any work", async () => {
    const chatId = nextChatId++;
    for (const secret of [null, "wrong-secret", "test-secret-but-longer"]) {
      const res = await post(textUpdate(chatId, "hi"), secret);
      expect(res.status).toBe(401);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.redis.store.has(`tg:update:${nextUpdateId - 1}`)).toBe(false);
  });

  it("processes a duplicate update_id only once", async () => {
    const chatId = nextChatId++;
    await seedUser({ telegramChatId: chatId });
    const update = textUpdate(chatId, "hello");

    expect((await post(update)).status).toBe(200);
    expect((await post(update)).status).toBe(200);

    expect(runAgentMock).toHaveBeenCalledTimes(1);
    expect(sentTexts(chatId)).toEqual(["echo: hello"]);
    const entry = h.redis.store.get(`tg:update:${update.update_id}`);
    expect(entry?.expiresAt).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
  });

  it("answers 200 to malformed bodies so Telegram doesn't retry them", async () => {
    expect((await post({ nope: true })).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("linking", () => {
  it("links the chat with a valid /start code and confirms", async () => {
    const user = await seedUser();
    const chatId = nextChatId++;
    const { code, deepLink } = await createLinkCode(user.id);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(deepLink).toBe(`https://t.me/test_bot?start=${code}`);

    await post(textUpdate(chatId, `/start ${code}`));

    const linked = await getUser(user.id);
    expect(linked?.telegramChatId).toBe(String(chatId));
    expect(linked?.telegramLinkedAt).toBeInstanceOf(Date);
    expect(sentTexts(chatId)).toEqual([msg.LINK_SUCCESS]);
  });

  it("links with /link and accepts lower-case codes", async () => {
    const user = await seedUser();
    const chatId = nextChatId++;
    const { code } = await createLinkCode(user.id);

    await post(textUpdate(chatId, `/link ${code.toLowerCase()}`));

    expect((await getUser(user.id))?.telegramChatId).toBe(String(chatId));
  });

  it("rejects an expired code", async () => {
    const user = await seedUser();
    const chatId = nextChatId++;
    const { code } = await createLinkCode(user.id);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 10 * 60 * 1000 + 1);
    await post(textUpdate(chatId, `/start ${code}`));

    expect((await getUser(user.id))?.telegramChatId).toBeNull();
    expect(sentTexts(chatId)).toEqual([msg.LINK_INVALID_CODE]);
  });

  it("rejects a code that was already used", async () => {
    const user = await seedUser();
    const { code } = await createLinkCode(user.id);
    const firstChat = nextChatId++;
    const secondChat = nextChatId++;

    await post(textUpdate(firstChat, `/link ${code}`));
    await post(textUpdate(secondChat, `/link ${code}`));

    expect((await getUser(user.id))?.telegramChatId).toBe(String(firstChat));
    expect(sentTexts(secondChat)).toEqual([msg.LINK_INVALID_CODE]);
  });

  it("invalidates the previous code when a new one is generated", async () => {
    const user = await seedUser();
    const chatId = nextChatId++;
    const { code: oldCode } = await createLinkCode(user.id);
    await createLinkCode(user.id);

    await post(textUpdate(chatId, `/link ${oldCode}`));

    expect(sentTexts(chatId)).toEqual([msg.LINK_INVALID_CODE]);
  });

  it("won't link a chat that already belongs to another user", async () => {
    const chatId = nextChatId++;
    const owner = await seedUser({ telegramChatId: chatId });
    const other = await seedUser();
    const { code } = await createLinkCode(other.id);

    await post(textUpdate(chatId, `/link ${code}`));

    expect((await getUser(owner.id))?.telegramChatId).toBe(String(chatId));
    expect((await getUser(other.id))?.telegramChatId).toBeNull();
    expect(sentTexts(chatId)).toEqual([msg.LINK_CHAT_TAKEN]);
  });

  it("refuses to link group chats", async () => {
    const user = await seedUser();
    const chatId = -nextChatId++;
    const { code } = await createLinkCode(user.id);

    await post(textUpdate(chatId, `/link ${code}`, "group"));

    expect((await getUser(user.id))?.telegramChatId).toBeNull();
    expect(sentTexts(chatId)).toEqual([msg.LINK_PRIVATE_ONLY]);
  });

  it("throttles repeated link attempts", async () => {
    const chatId = nextChatId++;
    h.linkAllowed = false;

    await post(textUpdate(chatId, "/link ABCDEF"));

    expect(sentTexts(chatId)).toEqual([msg.LINK_TOO_MANY_ATTEMPTS]);
  });
});

describe("messages", () => {
  it("sends linking instructions to unlinked chats", async () => {
    const chatId = nextChatId++;

    await post(textUpdate(chatId, "hello?"));

    expect(runAgentMock).not.toHaveBeenCalled();
    const [text] = sentTexts(chatId);
    expect(text).toBe(msg.LINK_INSTRUCTIONS());
    expect(text).toContain("http://localhost:3000/settings/telegram");
  });

  it("tells waitlisted users they're on the waitlist", async () => {
    const chatId = nextChatId++;
    await seedUser({ status: "waitlist", telegramChatId: chatId });

    await post(textUpdate(chatId, "hello"));

    expect(runAgentMock).not.toHaveBeenCalled();
    expect(sentTexts(chatId)).toEqual([msg.WAITLIST]);
  });

  it("shows typing, runs the agent on the telegram channel, and replies in HTML", async () => {
    const chatId = nextChatId++;
    const user = await seedUser({ telegramChatId: chatId });
    runAgentMock.mockResolvedValueOnce({ text: "**Done** <ok>", chatId: "ignored" });

    await post(textUpdate(chatId, "do it"));

    expect(calls("sendChatAction")[0]).toEqual({ chat_id: chatId, action: "typing" });
    expect(runAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, message: "do it", channel: "telegram" }),
    );
    expect(calls("sendMessage")).toEqual([
      expect.objectContaining({ chat_id: chatId, text: "<b>Done</b> &lt;ok&gt;", parse_mode: "HTML" }),
    ]);
  });

  it("keeps one ongoing chat per user and /new starts a fresh one", async () => {
    const chatId = nextChatId++;
    await seedUser({ telegramChatId: chatId });

    await post(textUpdate(chatId, "one"));
    await post(textUpdate(chatId, "two"));
    await post(textUpdate(chatId, "/new"));
    await post(textUpdate(chatId, "three"));

    const chatIds = runAgentMock.mock.calls.map(([input]) => input.chatId);
    expect(chatIds[0]).toBeTruthy();
    expect(chatIds[1]).toBe(chatIds[0]);
    expect(chatIds[2]).toBeTruthy();
    expect(chatIds[2]).not.toBe(chatIds[0]);
    expect(sentTexts(chatId)).toContain(msg.NEW_CHAT);
  });

  it("sends the friendly message when the user is rate limited", async () => {
    const chatId = nextChatId++;
    await seedUser({ telegramChatId: chatId });
    const err = new RateLimitError(30);
    runAgentMock.mockRejectedValueOnce(err);

    await post(textUpdate(chatId, "hi"));

    expect(sentTexts(chatId)).toEqual([err.userMessage]);
  });

  it("sends the friendly message when the budget is exceeded", async () => {
    const chatId = nextChatId++;
    await seedUser({ telegramChatId: chatId });
    const err = new BudgetExceededError();
    runAgentMock.mockRejectedValueOnce(err);

    await post(textUpdate(chatId, "hi"));

    expect(sentTexts(chatId)).toEqual([err.userMessage]);
  });

  it("sends a generic message for unexpected errors", async () => {
    const chatId = nextChatId++;
    await seedUser({ telegramChatId: chatId });
    runAgentMock.mockRejectedValueOnce(new Error("db exploded: secret details"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await post(textUpdate(chatId, "hi"));

    expect(sentTexts(chatId)).toEqual([msg.GENERIC_ERROR]);
    consoleError.mockRestore();
  });

  it("splits long replies into multiple messages under 4096 characters", async () => {
    const chatId = nextChatId++;
    await seedUser({ telegramChatId: chatId });
    const long = "word ".repeat(2000); // 10,000 chars
    runAgentMock.mockResolvedValueOnce({ text: long, chatId: "x" });

    await post(textUpdate(chatId, "long please"));

    const texts = sentTexts(chatId);
    expect(texts.length).toBe(3);
    for (const t of texts) expect(t.length).toBeLessThanOrEqual(4096);
    expect(texts.join(" ").trim()).toBe(long.trim());
  });

  it("falls back to plain text if Telegram rejects the HTML", async () => {
    const chatId = nextChatId++;
    await seedUser({ telegramChatId: chatId });
    runAgentMock.mockResolvedValueOnce({ text: "**bold**", chatId: "x" });
    fetchMock.mockImplementation(async (url, init) => {
      const body = JSON.parse(String(init.body));
      const rejected = url.endsWith("/sendMessage") && body.parse_mode === "HTML";
      return new Response(
        JSON.stringify(
          rejected
            ? { ok: false, error_code: 400, description: "Bad Request: can't parse entities" }
            : { ok: true, result: {} },
        ),
        { status: rejected ? 400 : 200 },
      );
    });

    await post(textUpdate(chatId, "hi"));

    expect(sentTexts(chatId)).toEqual(["<b>bold</b>", "bold"]);
    fetchMock.mockReset();
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 }),
    );
  });

  it("asks for text when a linked user sends something else", async () => {
    const chatId = nextChatId++;
    await seedUser({ telegramChatId: chatId });

    await post(textUpdate(chatId, undefined));

    expect(runAgentMock).not.toHaveBeenCalled();
    expect(sentTexts(chatId)).toEqual([msg.TEXT_ONLY]);
  });
});
