import { JOB_RUN_PATH, jobMessageSchema } from "@/lib/heartbeat/fanout";
import { verifyQStashRequest } from "@/lib/heartbeat/qstash";
import { runScheduledJob } from "@/lib/heartbeat/run-job";

export const maxDuration = 300;

/**
 * QStash worker for a single scheduled job. Any 2xx response is final. Unexpected errors
 * return 500 so QStash retries.
 */
export async function POST(req: Request) {
  const body = await verifyQStashRequest(req, JOB_RUN_PATH);
  if (body === null) return Response.json({ error: "Invalid signature" }, { status: 401 });

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    json = undefined;
  }
  const parsed = jobMessageSchema.safeParse(json);
  // Malformed payloads will never succeed, so acknowledge rather than retry.
  if (!parsed.success) return Response.json({ error: "Invalid payload" }, { status: 400 });

  try {
    return Response.json(await runScheduledJob(parsed.data));
  } catch (err) {
    console.error(`[jobs/run] job ${parsed.data.jobId} failed`, err);
    return Response.json({ error: "Job failed" }, { status: 500 });
  }
}
