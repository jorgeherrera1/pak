import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

// Annotated so the exported type names `Pool` from `pg`, not from pnpm's store path.
export const db: NodePgDatabase & { $client: Pool } = drizzle({
  connection: process.env.WORKFLOW_POSTGRES_URL!,
});
export { jobs, operations } from "./schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Postgres throws on a malformed uuid; handlers check this first and answer 404 instead. */
export const isUuid = (s: string) => UUID.test(s);
