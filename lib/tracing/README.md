Langfuse/OpenTelemetry tracing for AI SDK calls (feature/agent-core).

- `ensureTracing()` lazily starts OTel with the Langfuse span processor and registers the Langfuse AI SDK integration. `runAgent` calls it, so there is no root `instrumentation.ts`. If one is added later, start the SDK there and drop the lazy setup so it isn't registered twice.
- `withAgentTrace(name, ctx, fn)` wraps a run in one trace, with `userId`, `sessionId = chatId` and `channel` propagated to every child span.
- `telemetryFor(functionId, ctx)` is spread into each `generateText` call so model and tool observations carry `userId`, `chatId` and `channel` as metadata.
- `flushTracing()` exports spans via `after()` inside a request, and in the background otherwise.
