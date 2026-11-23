import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import type { ParsedDocument } from "@dark-factory/parse";
import { readDocument, readLatestGraph } from "@dark-factory/knowledge-graph";
import { entityTypes, statementTypes } from "@dark-factory/srs";

const env = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);
const base = "http://localhost:3001";
const fixtures = new URL(
  "../../../packages/parse/test/fixtures/",
  import.meta.url,
);
const golden: ParsedDocument = JSON.parse(
  readFileSync(new URL("parsed.json", fixtures), "utf8"),
);

test(
  "a posted PDF runs parse, engineer and check",
  { timeout: 1_200_000 },
  async () => {
    const form = new FormData();
    form.set(
      "file",
      new File(
        [readFileSync(new URL("prd-competencies.pdf", fixtures))],
        "prd-competencies.pdf",
      ),
    );
    const created = await fetch(`${base}/api/jobs`, {
      method: "POST",
      body: form,
    });
    expect(created.status).toBe(202);
    const { id } = (await created.json()) as { id: string };

    let job: {
      status: string;
      error: string | null;
      operations: { step: string; name: string; status: string }[];
    };
    do {
      await new Promise((r) => setTimeout(r, 2000));
      job = await (await fetch(`${base}/api/jobs/${id}`)).json();
    } while (job.status === "queued" || job.status === "running");

    expect(job.error).toBeNull();
    expect(job.status).toBe("done");
    expect(job.operations.map((o) => [o.step, o.name, o.status])).toEqual([
      ["parse", "upload", "done"],
      ["parse", "parse", "done"],
      ["engineer", "engineer", "done"],
      ["engineer", "check", "done"],
    ]);

    const parsed = await readDocument(id);
    expect(parsed?.source.pages).toBe(golden.source.pages);
    expect(parsed?.elements.length).toBe(golden.elements.length);
    expect(parsed?.source.sha256).toBe(golden.source.sha256);

    const graph = await readLatestGraph(id);
    expect(graph).not.toBeNull();
    const statements = new Set(statementTypes().map((type) => type.slug));
    const entities = new Set(entityTypes().map((type) => type.slug));
    for (const node of graph!.statements) {
      expect(statements.has(node.type)).toBe(true);
      expect(entities.has(node.type)).toBe(false);
    }
    for (const node of graph!.entities) {
      expect(entities.has(node.type)).toBe(true);
      expect(statements.has(node.type)).toBe(false);
    }
    expect(graph!.statements.some((node) => node.type === "feature")).toBe(true);
    expect(
      graph!.statements.some((node) => node.type === "functional-requirement"),
    ).toBe(true);
  },
);

test("rejects a non-PDF", async () => {
  const form = new FormData();
  form.set("file", new File([new TextEncoder().encode("hello")], "a.pdf"));
  const res = await fetch(`${base}/api/jobs`, { method: "POST", body: form });
  expect(res.status).toBe(400);
});
