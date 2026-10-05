/**
 * Needs local Postgres with AGE preloaded and the `knowledge_graph` graph
 * (apps/web's migration). Reads WORKFLOW_POSTGRES_URL from the repo-root .env.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { expect, test } from "vitest";
import {
  ENTITY_KINDS,
  isEntityKind,
  type AnnotateResult,
} from "@dark-factory/annotate";
import type { ParsedDocument } from "@dark-factory/parse";
import type { Link, ResolveResult } from "@dark-factory/resolve";
import {
  readDocument,
  readEntities,
  readLinks,
  readRequirements,
  writeDocument,
  writeEntities,
  writeLinks,
  writeRequirements,
} from "../src/index.ts";

const env = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);

const packages = new URL("../../", import.meta.url);
const doc: ParsedDocument = JSON.parse(
  readFileSync(new URL("parse/test/fixtures/parsed.json", packages), "utf8"),
);
const golden: AnnotateResult = JSON.parse(
  readFileSync(
    new URL("annotate/test/fixtures/annotate.json", packages),
    "utf8",
  ),
);
const resolved: ResolveResult & { links: Link[] } = JSON.parse(
  readFileSync(new URL("resolve/test/fixtures/resolve.json", packages), "utf8"),
);

/** Fixed ids, so re-runs overwrite instead of piling up. */
const jobId = "fixture-round-trip";
const escapes: ParsedDocument = {
  source: { sha256: "x", pages: 1 },
  content: "$$ 'q' \"r\"\nend",
  elements: [
    {
      id: "paragraphs/0",
      parent: null,
      kind: "paragraph",
      text: "$$ 'q' \"r\"",
      region: [],
      span: [{ offset: 0, length: 10 }],
    },
  ],
  warnings: ["w"],
};

test("the recorded document survives a round trip", async () => {
  await writeDocument(jobId, doc);
  await writeDocument(jobId, doc); // a retried step must not duplicate
  expect(await readDocument(jobId)).toEqual(doc);

  await writeDocument("fixture-escapes", escapes);
  expect(await readDocument("fixture-escapes")).toEqual(escapes);

  expect(await readDocument("no-such-job")).toBeNull();
});

test("the recorded requirements survive a round trip", async () => {
  await writeDocument(jobId, doc);
  await writeRequirements(jobId, golden.classifications);
  await writeRequirements(jobId, golden.classifications); // a retried step must not duplicate
  expect(await readRequirements(jobId)).toEqual(golden.classifications);
});

test("a classification of an entity kind is stored as a Description, and the kind's own label stays free", async () => {
  await writeDocument(jobId, doc);
  await writeRequirements(jobId, golden.classifications);
  const pool = new pg.Pool({
    connectionString: process.env.WORKFLOW_POSTGRES_URL,
  });
  const { rows } = await pool.query<{ label: string; kind: string | null }>(
    `SELECT * FROM cypher('knowledge_graph', $$ MATCH (r {jobId: '${jobId}'})-[:FROM]->() RETURN label(r), r.kind $$) AS (label agtype, kind agtype)`,
  );
  await pool.end();
  const stored = rows.map((r) => ({
    label: JSON.parse(r.label) as string,
    kind: r.kind === null ? null : (JSON.parse(r.kind) as string | null),
  }));

  const kinds = golden.classifications.map((c) => c.type).filter(isEntityKind);
  expect(kinds.length).toBeGreaterThan(0);
  expect(
    stored
      .filter((s) => s.label === "Description")
      .map((s) => s.kind)
      .sort(),
  ).toEqual(kinds.sort());
  // "user-class" → "UserClass": the labels the entities themselves will carry.
  const entityLabels = ENTITY_KINDS.map((kind) =>
    kind.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase()),
  );
  expect(stored.filter((s) => entityLabels.includes(s.label))).toEqual([]);
});

test(
  "the recorded entities and links survive a round trip",
  { timeout: 30_000 },
  async () => {
    const { entities, links } = resolved;
    // The recorded run reported no doubt, so the pairs are made here from its own entities.
    const possiblySameAs: [string, string][] = [
      [entities[0]!.id, entities[1]!.id],
      [entities[0]!.id, entities[2]!.id],
    ];
    await writeDocument(jobId, doc);
    await writeRequirements(jobId, golden.classifications);

    await writeEntities(jobId, { entities, possiblySameAs });
    await writeEntities(jobId, { entities, possiblySameAs }); // a retried step must not duplicate
    expect(await readEntities(jobId)).toEqual({ entities, possiblySameAs });

    await writeLinks(jobId, links);
    await writeLinks(jobId, links); // a retried step must not duplicate
    expect(await readLinks(jobId)).toEqual(links);

    // Resolving again replaces the entities; a link to an old one must not survive it.
    await writeEntities(jobId, { entities, possiblySameAs });
    expect(await readLinks(jobId)).toEqual([]);
    expect(await readRequirements(jobId)).toEqual(golden.classifications);
  },
);
