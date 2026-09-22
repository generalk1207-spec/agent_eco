import { beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetExceededError, RateLimitError } from "@/lib/agents/errors";
import { NotFoundError } from "@/lib/db/queries";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), runAgent: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/agents", () => ({ runAgent: mocks.runAgent }));

const ACTIVE = { user: { id: "user-1", status: "active" } };

const post = (body: unknown) =>
  POST(
    new Request("https://example.com/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  mocks.auth.mockReset().mockResolvedValue(ACTIVE);
  mocks.runAgent.mockReset().mockResolvedValue({ text: "hello back", chatId: "chat-1" });
});

describe("POST /api/chat", () => {
  it("runs the agent on the web channel and returns the reply", async () => {
    const res = await post({ message: "hi", chatId: "chat-1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "hello back", chatId: "chat-1" });
    expect(mocks.runAgent).toHaveBeenCalledWith({
      userId: "user-1",
      chatId: "chat-1",
      message: "hi",
      channel: "web",
    });
  });

  it("passes no chatId when starting fresh", async () => {
    await post({ message: "hi" });
    expect(mocks.runAgent).toHaveBeenCalledWith(expect.objectContaining({ chatId: undefined }));
  });

  it("rejects signed-out callers", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await post({ message: "hi" })).status).toBe(401);
    expect(mocks.runAgent).not.toHaveBeenCalled();
  });

  it("rejects waitlisted users", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1", status: "waitlist" } });
    expect((await post({ message: "hi" })).status).toBe(403);
    expect(mocks.runAgent).not.toHaveBeenCalled();
  });

  it("rejects empty and oversized messages", async () => {
    expect((await post({ message: "   " })).status).toBe(400);
    expect((await post({ message: "x".repeat(8001) })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect(mocks.runAgent).not.toHaveBeenCalled();
  });

  it("maps rate limits to 429 with the user-facing message", async () => {
    const err = new RateLimitError(30);
    mocks.runAgent.mockRejectedValue(err);
    const res = await post({ message: "hi" });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: err.userMessage });
  });

  it("maps a budget cap to 402", async () => {
    mocks.runAgent.mockRejectedValue(new BudgetExceededError());
    expect((await post({ message: "hi" })).status).toBe(402);
  });

  it("maps a missing chat to 404", async () => {
    mocks.runAgent.mockRejectedValue(new NotFoundError("Chat", "gone"));
    expect((await post({ message: "hi", chatId: "gone" })).status).toBe(404);
  });

  it("hides unexpected errors behind a generic 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.runAgent.mockRejectedValue(new Error("model exploded"));
    const res = await post({ message: "hi" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("exploded");
  });
});
