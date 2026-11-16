import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

// Annotated so the return type names `Pool` from `pg`, not a pnpm store path.
type Database = NodePgDatabase & { $client: Pool };

let database: Database | undefined;

// Opened on first use, not at import: `next build` loads route modules while collecting page data.
export function db(): Database {
  if (!database) {
    const connection = process.env.WORKFLOW_POSTGRES_URL;
    if (!connection) throw new Error("WORKFLOW_POSTGRES_URL is not set");
    database = drizzle({ connection });
  }
  return database;
}

export { jobs, operations } from "./schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Postgres throws on a malformed uuid; handlers check this first and answer 404 instead. */
export const isUuid = (s: string) => UUID.test(s);
