import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/lib/db/schema";

/**
 * In-memory Postgres with the real migrations applied. Use it to replace @/lib/db:
 *
 *   vi.mock("@/lib/db", async () => (await import("@/test/db")).createTestDbModule());
 */
export async function createTestDbModule() {
  const db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, schema };
}
