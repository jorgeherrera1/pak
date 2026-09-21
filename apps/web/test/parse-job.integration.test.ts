import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import type { ParsedDocument } from "@dark-factory/parse";

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
  "a posted PDF runs Parse and Annotate and yields the recorded parse",
  { timeout: 300_000 },
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
      ["parse", "analyze", "done"],
      ["parse", "build", "done"],
      ["annotate", "classify", "done"],
      ["annotate", "mentions", "done"],
      ["annotate", "ground", "done"],
    ]);

    const parsed: ParsedDocument = await (
      await fetch(`${base}/api/jobs/${id}/artifacts/parsed.json`)
    ).json();
    // Azure OCR is not byte-stable (stray glyphs differ between calls), so exact text
    // is parse's integration test's concern; here the structure and identity must match.
    expect(parsed.source.pages).toBe(golden.source.pages);
    expect(parsed.elements.length).toBe(golden.elements.length);
    expect(parsed.source.sha256).toBe(golden.source.sha256);

    const annotated = (await (
      await fetch(`${base}/api/jobs/${id}/artifacts/annotate.json`)
    ).json()) as { classifications: unknown[]; mentions: unknown[] };
    expect(annotated.classifications.length).toBeGreaterThan(0);
    expect(annotated.mentions.length).toBeGreaterThan(0);
  },
);

test("rejects a non-PDF", async () => {
  const form = new FormData();
  form.set("file", new File([new TextEncoder().encode("hello")], "a.pdf"));
  const res = await fetch(`${base}/api/jobs`, { method: "POST", body: form });
  expect(res.status).toBe(400);
});
