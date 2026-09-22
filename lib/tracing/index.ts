import { LangfuseSpanProcessor } from "@langfuse/otel";
import { propagateAttributes, startActiveObservation } from "@langfuse/tracing";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { registerTelemetry } from "ai";
import { after } from "next/server";
import { env } from "@/lib/env";

/** Who a trace belongs to. Attached to every agent run, delegation, model call and tool call. */
export type TraceContext = {
  userId: string;
  chatId: string;
  channel: string;
};

// Kept on globalThis so dev-mode module reloads don't start a second OTel SDK.
const globalForTracing = globalThis as { __agentTracing?: LangfuseSpanProcessor };

/**
 * Idempotent. Starts OpenTelemetry with the Langfuse span processor and registers the
 * Langfuse integration with the AI SDK, so every generateText call and tool execution is traced.
 */
export function ensureTracing(): void {
  if (globalForTracing.__agentTracing) return;

  const spanProcessor = new LangfuseSpanProcessor({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_HOST,
    environment: env.NODE_ENV,
  });
  new NodeSDK({ spanProcessors: [spanProcessor] }).start();
  registerTelemetry(new LangfuseVercelAiSdkIntegration());

  globalForTracing.__agentTracing = spanProcessor;
}

/**
 * Runs `fn` as one Langfuse trace. userId, chatId and channel propagate to every span created
 * inside it (model calls, tool calls, delegations).
 */
export function withAgentTrace<T>(name: string, ctx: TraceContext, fn: () => Promise<T>): Promise<T> {
  return propagateAttributes(
    {
      userId: ctx.userId,
      sessionId: ctx.chatId,
      traceName: name,
      tags: [ctx.channel],
      metadata: { userId: ctx.userId, chatId: ctx.chatId, channel: ctx.channel },
    },
    () => startActiveObservation(name, () => fn(), { asType: "agent" }),
  );
}

/**
 * Spread into a generateText call so its observations carry the trace context as metadata:
 * `generateText({ ..., ...telemetryFor("primary-agent", ctx) })`.
 */
export function telemetryFor<C extends TraceContext>(functionId: string, ctx: C) {
  const runtimeContext = { userId: ctx.userId, chatId: ctx.chatId, channel: ctx.channel };
  return {
    runtimeContext,
    telemetry: {
      functionId,
      includeRuntimeContext: { userId: true, chatId: true, channel: true },
    },
  } as const;
}

/**
 * Exports pending spans without delaying the response: inside a request it runs after the
 * response via `after()`; elsewhere (scripts, tests) it flushes in the background.
 */
export function flushTracing(): void {
  const spanProcessor = globalForTracing.__agentTracing;
  if (!spanProcessor) return;

  const flush = () =>
    spanProcessor.forceFlush().catch((err) => console.error("[tracing] flush failed", err));
  try {
    after(flush);
  } catch {
    void flush();
  }
}
