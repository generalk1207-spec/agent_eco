import { fanOutDueJobs, HEARTBEAT_PATH } from "@/lib/heartbeat/fanout";
import { verifyQStashRequest } from "@/lib/heartbeat/qstash";

/** Called by the QStash schedule every 5 minutes. Enqueues one /api/jobs/run message per due job. */
export async function POST(req: Request) {
  if ((await verifyQStashRequest(req, HEARTBEAT_PATH)) === null) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  const result = await fanOutDueJobs();
  return Response.json(result);
}
