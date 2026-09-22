import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spanProcessor: vi.fn(),
  sdkStart: vi.fn(),
  registerTelemetry: vi.fn(),
  propagateAttributes: vi.fn((_params: unknown, fn: () => unknown) => fn()),
  startActiveObservation: vi.fn((_name: string, fn: () => unknown) => fn()),
}));

vi.mock("@langfuse/otel", () => ({
  LangfuseSpanProcessor: class {
    constructor(opts: unknown) {
      mocks.spanProcessor(opts);
    }
    forceFlush = vi.fn(async () => {});
  },
}));
vi.mock("@opentelemetry/sdk-node", () => ({ NodeSDK: class { start = mocks.sdkStart } }));
vi.mock("@langfuse/vercel-ai-sdk", () => ({ LangfuseVercelAiSdkIntegration: class {} }));
vi.mock("@langfuse/tracing", () => ({
  propagateAttributes: mocks.propagateAttributes,
  startActiveObservation: mocks.startActiveObservation,
}));
vi.mock("ai", () => ({ registerTelemetry: mocks.registerTelemetry }));

const { ensureTracing, telemetryFor, withAgentTrace } = await import("./index");

const ctx = { userId: "user_1", chatId: "chat_1", channel: "telegram" };

beforeEach(() => vi.clearAllMocks());

describe("tracing", () => {
  it("ensureTracing starts OTel with Langfuse once, using LANGFUSE_HOST as baseUrl", () => {
    ensureTracing();
    ensureTracing();
    expect(mocks.sdkStart).toHaveBeenCalledTimes(1);
    expect(mocks.registerTelemetry).toHaveBeenCalledTimes(1);
    expect(mocks.spanProcessor).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: process.env.LANGFUSE_HOST }),
    );
  });

  it("withAgentTrace attributes the whole trace to the user, chat and channel", async () => {
    await expect(withAgentTrace("agent-run", ctx, async () => "done")).resolves.toBe("done");
    expect(mocks.propagateAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        sessionId: "chat_1",
        metadata: { userId: "user_1", chatId: "chat_1", channel: "telegram" },
      }),
      expect.any(Function),
    );
    expect(mocks.startActiveObservation).toHaveBeenCalledWith("agent-run", expect.any(Function), {
      asType: "agent",
    });
  });

  it("telemetryFor includes userId, chatId and channel on each AI SDK call", () => {
    const extra = { ...ctx, usage: { inputTokens: 1, outputTokens: 1 } };
    expect(telemetryFor("primary-agent", extra)).toEqual({
      runtimeContext: ctx,
      telemetry: {
        functionId: "primary-agent",
        includeRuntimeContext: { userId: true, chatId: true, channel: true },
      },
    });
  });
});
