import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { test } from "node:test";
import { decision } from "./protect-tests.mjs";
import { isProtectedPath } from "./protected-path.mjs";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

test("protects test files and fixtures, including eval answer keys", () => {
  assert.equal(isProtectedPath("apps/web/test/blob.test.ts"), true);
  assert.equal(
    isProtectedPath("packages/ui/src/components/edge.test.tsx"),
    true,
  );
  assert.equal(
    isProtectedPath("packages/parse/test/fixtures/parsed.json"),
    true,
  );
  assert.equal(
    isProtectedPath("packages/parse/test/fixtures/prd-competencies.pdf"),
    true,
  );
  assert.equal(
    isProtectedPath("packages/annotate/test/fixtures/annotate.json"),
    true,
  );
  assert.equal(
    isProtectedPath(
      "packages/resolve/test/fixtures/resolve-responses/entities.json",
    ),
    true,
  );
  assert.equal(isProtectedPath("packages/parse/test/fixtures"), true);
  assert.equal(isProtectedPath("apps/web/lib/blob.ts"), false);
  assert.equal(isProtectedPath("packages/annotate/tsconfig.test.json"), false);
  assert.equal(
    isProtectedPath("apps/web/drizzle/20260914040057_init/snapshot.json"),
    false,
  );
});

test("flags edits, deletions, and renames of existing tests, not additions", () => {
  const diff = [
    "M\tapps/web/lib/blob.ts",
    "M\tapps/web/test/blob.test.ts",
    "A\tapps/web/test/new.test.ts",
    "A\tpackages/parse/test/fixtures/extra.json",
    "D\tpackages/ui/src/components/node.test.tsx",
    "R100\tpackages/parse/test/fixtures/parsed.json\tpackages/parse/test/fixtures/parsed-v2.json",
    "C100\tpackages/annotate/test/fixtures/annotate.json\tnotes/annotate.json",
    "M\tpackages/resolve/test/fixtures/resolve.json",
  ].join("\n");
  const bad = decision(diff, []).bad;
  assert.deepEqual(bad, [
    "M\tapps/web/test/blob.test.ts",
    "D\tpackages/ui/src/components/node.test.tsx",
    "R100\tpackages/parse/test/fixtures/parsed.json\tpackages/parse/test/fixtures/parsed-v2.json",
    "M\tpackages/resolve/test/fixtures/resolve.json",
  ]);
  assert.equal(decision(diff, ["tests-approved"]).ok, true);
  assert.equal(decision("A\tapps/web/test/new.test.ts\n", []).ok, true);
  assert.equal(decision("", []).ok, true);
});

function hook(script, tool_input) {
  return spawnSync(process.execPath, [script], {
    cwd: root,
    input: JSON.stringify({ tool_input }),
    encoding: "utf8",
  });
}

test("Claude hook denies an existing test and allows a new one", () => {
  const denied = hook(".claude/hooks/protect-tests.mjs", {
    file_path: `${root}/apps/web/test/blob.test.ts`,
  });
  assert.equal(denied.status, 0, denied.stderr);
  const deny = JSON.parse(denied.stdout);
  assert.equal(deny.hookSpecificOutput.permissionDecision, "deny");

  const allowed = hook(".claude/hooks/protect-tests.mjs", {
    file_path: `${root}/apps/web/test/brand-new.test.ts`,
  });
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(
    JSON.parse(allowed.stdout).hookSpecificOutput.permissionDecision,
    "allow",
  );

  const source = hook(".claude/hooks/protect-tests.mjs", {
    file_path: `${root}/apps/web/lib/blob.ts`,
  });
  assert.equal(
    JSON.parse(source.stdout).hookSpecificOutput.permissionDecision,
    "allow",
  );
});

test("Cursor hook denies an existing fixture and allows a new test file", () => {
  const denied = hook(".cursor/hooks/protect-tests.mjs", {
    path: `${root}/packages/parse/test/fixtures/parsed.json`,
  });
  assert.equal(denied.status, 0, denied.stderr);
  const deny = JSON.parse(denied.stdout);
  assert.equal(deny.permission, "deny");
  assert.match(deny.agent_message, /tests-approved/);

  const allowed = hook(".cursor/hooks/protect-tests.mjs", {
    path: `${root}/apps/web/test/brand-new.test.ts`,
  });
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.deepEqual(JSON.parse(allowed.stdout), { permission: "allow" });
});
