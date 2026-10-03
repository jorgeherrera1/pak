import { drizzle } from "drizzle-orm/node-postgres";

export const db = drizzle({ connection: process.env.WORKFLOW_POSTGRES_URL! });
export { jobs, operations } from "./schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Postgres throws on a malformed uuid; handlers check this first and answer 404 instead. */
export const isUuid = (s: string) => UUID.test(s);
