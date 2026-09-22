Langfuse/OpenTelemetry tracing for AI SDK calls (feature/agent-core).

- `ensureTracing()` starts OTel with the Langfuse span processor and registers the Langfuse AI SDK integration. The root `instrumentation.ts` calls it once per server process; `runAgent` calls it too, which is a no-op after that (it is guarded on globalThis).
- `withAgentTrace(name, ctx, fn)` wraps a run in one trace, with `userId`, `sessionId = chatId` and `channel` propagated to every child span.
- `telemetryFor(functionId, ctx)` is spread into each `generateText` call so model and tool observations carry `userId`, `chatId` and `channel` as metadata.
- `flushTracing()` exports spans via `after()` inside a request, and in the background otherwise.
