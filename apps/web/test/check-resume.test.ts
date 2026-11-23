import { beforeEach, expect, test, vi } from "vitest";
import type { ParsedDocument } from "@dark-factory/parse";
import { emptyGraph } from "@dark-factory/srs";

const getBlob = vi.fn();
const putBlob = vi.fn();

vi.mock("@/lib/blob", () => ({
  getBlob: (...args: unknown[]) => getBlob(...args),
  putBlob: (...args: unknown[]) => putBlob(...args),
}));

const doc: ParsedDocument = {
  source: { sha256: "s", pages: 1 },
  content: "",
  warnings: [],
  elements: [],
};

const record = {
  runId: "run",
  jobId: "job",
  sha256: "s",
  sessionId: "ses",
  continuationToken: "tok",
  streamIndex: 0,
  turn: "running" as const,
  checkAttempts: 1,
  status: "open" as const,
};

const calls: { url: string; method: string }[] = [];

beforeEach(() => {
  calls.length = 0;
  getBlob.mockReset();
  putBlob.mockReset();
  getBlob.mockResolvedValue(Buffer.from(JSON.stringify(record)));
  putBlob.mockResolvedValue(undefined);
  vi.stubGlobal(
    "fetch",
    async (url: string | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url: String(url), method });
      if (String(url).includes("/stream")) {
        return new Response(
          `${JSON.stringify({ type: "turn.completed", index: 4 })}\n`,
        );
      }
      if (String(url).includes("/artifacts")) {
        return Response.json({
          artifacts: [{ key: "run", data: emptyGraph("run") }],
        });
      }
      if (String(url).includes("/cost")) return Response.json({ usd: 0 });
      if (method === "POST") {
        return Response.json({ continuationToken: "next" });
      }
      return new Response("missing", { status: 404 });
    },
  );
});

test("a crashed check resumes the running turn before it reads the artifact", async () => {
  const { checkDocument } = await import("@/lib/engineer");
  const { record: saved, graph } = await checkDocument("job", doc);
  const stream = calls.findIndex((call) => call.url.includes("/stream"));
  const artifact = calls.findIndex((call) => call.url.includes("/artifacts"));
  expect(stream).toBeGreaterThanOrEqual(0);
  expect(artifact).toBeGreaterThan(stream);
  expect(calls.some((call) => call.method === "POST")).toBe(false);
  expect(saved.status).toBe("open");
  expect(saved.checkAttempts).toBe(1);
  expect(graph?.runId).toBe("run");
  expect(
    putBlob.mock.calls.some((call) => String(call[0]).endsWith("graph.json")),
  ).toBe(false);
});

test("a finished turn gets one follow-up when the check finds gaps", async () => {
  getBlob.mockResolvedValue(
    Buffer.from(
      JSON.stringify({ ...record, turn: "completed", checkAttempts: 0 }),
    ),
  );
  vi.stubGlobal(
    "fetch",
    async (url: string | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url: String(url), method });
      if (String(url).includes("/artifacts")) {
        return Response.json({ artifacts: [{ key: "run", data: {} }] });
      }
      if (String(url).includes("/stream")) {
        return new Response(
          `${JSON.stringify({ type: "turn.completed", index: 1 })}\n`,
        );
      }
      if (method === "POST") return Response.json({ continuationToken: "next" });
      return new Response("missing", { status: 404 });
    },
  );
  const { checkDocument } = await import("@/lib/engineer");
  const { record: saved, graph } = await checkDocument("job", doc);
  expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  expect(saved.checkAttempts).toBe(1);
  expect(saved.status).toBe("rejected");
  expect(graph).toBeNull();
});
