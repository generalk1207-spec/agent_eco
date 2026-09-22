/**
 * Runs once per server process, before any request. Starting tracing here means the
 * Langfuse span processor is ready for the first agent run instead of being set up inside it.
 * ensureTracing() is idempotent, so runAgent's own call is a no-op after this.
 */
export async function register(): Promise<void> {
  // NodeSDK is Node-only; the edge runtime has no OTel SDK to start.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureTracing } = await import("@/lib/tracing");
  ensureTracing();
}
