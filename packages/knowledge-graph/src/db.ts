import pg from "pg";

/** The one AGE graph; created by apps/web's migration. */
export const GRAPH = "knowledge_graph";

let pool: pg.Pool | undefined;
// Opened on first use, not at import: tests load .env after importing this module.
export const db = () =>
  (pool ??= new pg.Pool({
    connectionString: process.env.WORKFLOW_POSTGRES_URL,
  }));

export type Row = Record<string, unknown>;

/**
 * Runs one Cypher query whose `$name` parameters come from `params` and
 * returns each row as the listed columns, decoded from agtype. Maps, lists,
 * strings and numbers print as JSON, so JSON.parse is the whole decoder.
 */
export async function cypher<T extends unknown[]>(
  client: pg.ClientBase,
  query: string,
  params: Row,
  columns: string[] = ["v"],
): Promise<T[]> {
  // Quoted, or Postgres lowercases the alias and the row key no longer matches.
  const shape = columns.map((c) => `"${c}" agtype`).join(", ");
  const { rows } = await client.query<Record<string, string | null>>(
    `SELECT * FROM cypher('${GRAPH}', $$ ${query} $$, $1) AS (${shape})`,
    [JSON.stringify(params)],
  );
  return rows.map(
    (r) => columns.map((c) => (r[c] === null ? null : JSON.parse(r[c]!))) as T,
  );
}

export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
