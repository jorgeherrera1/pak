import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ParsedDocument } from "@dark-factory/parse";
import { type CheckResult, type SrsGraph, verify } from "@dark-factory/srs";
import { getBlob, putBlob } from "./blob";

const origin = () =>
  (process.env.AGENT_SDK_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const agent = () => `${origin()}/engineer`;

const TASK = `Build the requirements graph for the document in this workspace.
Walk it with read_document. Record only what the source states.
Cite element ids the tools return, and skip every paragraph, cell, and figure that states no requirement.
Call finish. If it reports failures, fix them and call finish again.`;

export type RunRecord = {
  runId: string;
  jobId: string;
  sha256: string;
  sessionId?: string;
  continuationToken?: string;
  streamIndex: number;
  turn: "new" | "running" | "completed" | "failed";
  followUps: number;
  checkAttempts: number;
  model?: unknown;
  sdkVersion?: string | null;
  repoSha?: string | null;
  engineerSha?: string | null;
  templateSha?: string | null;
  usage?: unknown;
  cost?: unknown;
  status: "open" | "accepted" | "rejected";
  check?: CheckResult;
};

type StreamEvent = {
  type: string;
  index?: number;
  data?: { usage?: unknown; result?: string };
};

const recordPath = (jobId: string) => `${jobId}/runs/current.json`;
const eventsPath = (record: RunRecord) =>
  `${record.jobId}/runs/${record.runId}/events.ndjson`;

const repoRoot = () => {
  const cwd = process.cwd();
  if (existsSync(join(cwd, "agents", "engineer"))) return cwd;
  return join(cwd, "..", "..");
};

const git = (args: string[]) => {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
};

const sdkVersion = () => {
  for (const path of [
    join(
      repoRoot(),
      "agents/engineer/node_modules/@grok/agent-sdk/package.json",
    ),
    join(repoRoot(), "node_modules/@grok/agent-sdk/package.json"),
  ]) {
    if (!existsSync(/*turbopackIgnore: true*/ path)) continue;
    return (
      JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, "utf8")) as {
        version: string;
      }
    ).version;
  }
  return null;
};

async function send(
  path: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${agent()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`agent ${res.status}: ${text.slice(0, 400)}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function readJson(path: string): Promise<unknown> {
  const res = await fetch(`${agent()}${path}`);
  if (!res.ok) throw new Error(`agent ${res.status} ${path}`);
  return res.json();
}

export async function loadRecord(jobId: string): Promise<RunRecord | null> {
  const blob = await getBlob(recordPath(jobId));
  return blob ? (JSON.parse(blob.toString()) as RunRecord) : null;
}

async function saveRecord(record: RunRecord) {
  await putBlob(
    recordPath(record.jobId),
    Buffer.from(JSON.stringify(record)),
    "application/json",
  );
}

const logFile = (record: RunRecord) => `/tmp/pak-${record.runId}.ndjson`;

async function uploadEvents(record: RunRecord) {
  const path = logFile(record);
  if (!existsSync(path)) return;
  await putBlob(eventsPath(record), readFileSync(path), "application/x-ndjson");
}

async function readStream(record: RunRecord): Promise<StreamEvent | null> {
  const res = await fetch(
    `${agent()}/v1/session/${record.sessionId}/stream?startIndex=${record.streamIndex}`,
    { signal: AbortSignal.timeout(25 * 60 * 1000) },
  );
  if (!res.ok || !res.body) throw new Error(`agent stream ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let terminal: StreamEvent | null = null;
  let sinceSave = 0;
  try {
    while (!terminal) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as StreamEvent;
        appendFileSync(logFile(record), `${line}\n`);
        if (typeof event.index === "number")
          record.streamIndex = event.index + 1;
        if (event.type === "turn.completed" || event.type === "turn.failed") {
          terminal = event;
        }
        sinceSave += 1;
        if (sinceSave >= 20 || terminal) {
          await saveRecord(record);
          sinceSave = 0;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return terminal;
}

async function drive(
  record: RunRecord,
  doc: ParsedDocument,
  message?: string,
): Promise<RunRecord> {
  if (!record.sessionId) {
    const info = (await readJson("/v1/info")) as { model?: unknown };
    record.model = info.model;
    record.sdkVersion = sdkVersion();
    record.repoSha = git(["rev-parse", "HEAD"]);
    record.engineerSha = git(["rev-parse", "HEAD:agents/engineer"]);
    record.templateSha = git(["rev-parse", "HEAD:docs/srs-template.html"]);
    const opened = await send("/v1/session", {
      message: message ?? TASK,
      title: record.runId,
      workspaceFiles: {
        "document.json": JSON.stringify(doc),
        "run.json": JSON.stringify({ runId: record.runId }),
      },
    });
    record.sessionId = String(opened.sessionId);
    record.continuationToken = String(opened.continuationToken);
    record.turn = "running";
    await saveRecord(record);
  } else if (message) {
    const next = await send(`/v1/session/${record.sessionId}`, {
      continuationToken: record.continuationToken,
      message,
    });
    record.continuationToken = String(next.continuationToken);
    record.turn = "running";
    await saveRecord(record);
  }
  if (record.turn === "completed" && !message) return record;
  const terminal = await readStream(record);
  if (!terminal)
    throw new Error("engineer stream ended before the turn finished");
  record.turn = terminal.type === "turn.completed" ? "completed" : "failed";
  if (terminal.data?.usage) record.usage = terminal.data.usage;
  await saveRecord(record);
  await uploadEvents(record);
  if (record.turn === "completed" && record.sessionId) {
    try {
      record.cost = await readJson(`/v1/session/${record.sessionId}/cost`);
      await saveRecord(record);
    } catch {
      // Cost is reported when the endpoint answers. The graph does not depend on it.
    }
  }
  return record;
}

export async function engineerDocument(
  jobId: string,
  doc: ParsedDocument,
): Promise<RunRecord> {
  let record =
    (await loadRecord(jobId)) ??
    ({
      runId: crypto.randomUUID(),
      jobId,
      sha256: doc.source.sha256,
      streamIndex: 0,
      turn: "new",
      followUps: 0,
      checkAttempts: 0,
      status: "open",
    } satisfies RunRecord);
  record = await drive(record, doc);
  if (record.turn === "failed" && record.followUps < 1) {
    record.followUps += 1;
    record = await drive(
      record,
      doc,
      "The turn stopped. Continue from get_progress and call finish when it reports no failures.",
    );
  }
  if (record.turn !== "completed") throw new Error("engineer turn failed");
  return record;
}

async function artifact(record: RunRecord): Promise<unknown> {
  const listed = (await readJson(
    `/v1/artifacts?sessionId=${record.sessionId}&kind=srs-graph`,
  )) as { artifacts?: { key?: string; data?: unknown }[] };
  const rows = listed.artifacts ?? [];
  return (rows.find((row) => row.key === record.runId) ?? rows[0])?.data;
}

const gapText = (result: CheckResult) => {
  const lines = result.failures.map(
    (failure) => `${failure.code}: ${failure.message}`,
  );
  const shown = lines.slice(0, 200);
  if (lines.length > shown.length) {
    shown.push(`and ${lines.length - shown.length} more`);
  }
  return shown.join("\n");
};

export async function checkDocument(
  jobId: string,
  doc: ParsedDocument,
): Promise<{ record: RunRecord; graph: SrsGraph | null; result: CheckResult }> {
  const record = await loadRecord(jobId);
  if (!record?.sessionId) throw new Error("engineer run is missing");
  let data = await artifact(record);
  let result = verify(data, doc);
  if (result.failures.length > 0 && record.checkAttempts < 1) {
    record.checkAttempts += 1;
    await saveRecord(record);
    await drive(
      record,
      doc,
      `The check found gaps. Fix every failure, then call finish.\n${gapText(result)}`,
    );
    data = await artifact(record);
    result = verify(data, doc);
  }
  record.check = result;
  if (result.failures.length > 0) {
    record.status = "rejected";
    await saveRecord(record);
    return { record, graph: null, result };
  }
  const graph = data as SrsGraph;
  record.status = "accepted";
  await saveRecord(record);
  await putBlob(
    `${jobId}/runs/${record.runId}/graph.json`,
    Buffer.from(JSON.stringify(graph)),
    "application/json",
  );
  await uploadEvents(record);
  return { record, graph, result };
}
