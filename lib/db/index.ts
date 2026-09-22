import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Neon HTTP driver: one round-trip per query, ideal for serverless.
 * No interactive transactions — use `db.batch([...])` for atomic multi-statement writes.
 *
 * Only lib/db/queries/ may import this for user-owned tables.
 */
export const db = drizzle({ client: neon(env.DATABASE_URL), schema });

export type Db = typeof db;
export { schema };
