import { spawnSync } from "node:child_process";
import { dirname } from "node:path";

/**
 * A test file (`*.test.ts`, `*.test.tsx`) or a golden fixture.
 * Fixtures live under `test/fixtures/`, including the annotate and resolve
 * eval answer keys and the recorded model responses.
 */
export function isProtectedPath(file) {
  const path = String(file).replaceAll("\\", "/");
  return (
    /(?:^|\/)test\/fixtures(?:\/|$)/.test(path) || /\.test\.tsx?$/.test(path)
  );
}

/**
 * Lines from `git diff --name-status --find-renames` that modify, rename, or
 * delete an existing test or fixture. Additions and copies are not changes to
 * an existing file.
 */
export function protectedChanges(nameStatus) {
  const bad = [];
  for (const line of nameStatus.split("\n")) {
    if (!line) continue;
    const [status, ...paths] = line.split("\t");
    const kind = status[0];
    if (kind === "A" || kind === "C") continue;
    const existing = kind === "R" ? paths.slice(0, 1) : paths;
    if (existing.some((p) => isProtectedPath(p))) bad.push(line);
  }
  return bad;
}

/** Tracked in this checkout. An untracked new test file is not existing yet. */
export function isExistingProtected(file) {
  if (typeof file !== "string" || file === "" || !isProtectedPath(file)) {
    return false;
  }
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: dirname(file),
    encoding: "utf8",
  });
  const cwd = top.status === 0 ? top.stdout.trim() : process.cwd();
  const listed = spawnSync("git", ["ls-files", "--error-unmatch", "--", file], {
    cwd,
    encoding: "utf8",
  });
  return listed.status === 0;
}
