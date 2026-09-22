/**
 * Creates (or updates) the QStash schedule that calls APP_URL/api/cron/heartbeat every 5 minutes.
 *
 *   node scripts/create-qstash-schedule.ts
 *
 * Reads APP_URL and QSTASH_TOKEN from .env.local (or the environment). It's safe to re-run
 * because the fixed scheduleId makes QStash overwrite the existing schedule.
 */
import { Client } from "@upstash/qstash";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const SCHEDULE_ID = "agent-eco-heartbeat";
const CRON = "*/5 * * * *";

async function main() {
  const { APP_URL, QSTASH_TOKEN } = process.env;
  if (!APP_URL || !QSTASH_TOKEN) {
    throw new Error("APP_URL and QSTASH_TOKEN must be set (see .env.example).");
  }
  const destination = new URL("/api/cron/heartbeat", APP_URL).toString();
  if (new URL(destination).hostname === "localhost") {
    console.warn("Warning: QStash cannot reach localhost. Use a public APP_URL or a tunnel.");
  }

  const client = new Client({ token: QSTASH_TOKEN });
  const { scheduleId } = await client.schedules.create({
    scheduleId: SCHEDULE_ID,
    destination,
    cron: CRON,
    method: "POST",
  });
  console.log(`Schedule ${scheduleId}: POST ${destination} on "${CRON}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
