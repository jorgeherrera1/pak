import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { protectedChanges } from "./protected-path.mjs";

/** `labels` is the pull request's label names. `nameStatus` is `git diff --name-status`. */
export function decision(nameStatus, labels) {
  if (labels.includes("tests-approved")) return { ok: true, bad: [] };
  const bad = protectedChanges(nameStatus);
  return { ok: bad.length === 0, bad };
}

function main() {
  const [base, head, labelList = ""] = process.argv.slice(2);
  const labels = labelList
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
  if (labels.includes("tests-approved")) {
    console.log(
      "tests-approved is set; existing tests and fixtures may change.",
    );
    return;
  }
  if (!base || !head) {
    console.error("usage: protect-tests.mjs <base-sha> <head-sha> [labels]");
    process.exit(1);
  }

  let diff;
  try {
    diff = execFileSync(
      "git",
      ["diff", "--name-status", "--find-renames", `${base}...${head}`],
      { encoding: "utf8" },
    );
  } catch (err) {
    console.error(err.stderr || err.message);
    process.exit(1);
  }
  const result = decision(diff, labels);
  if (result.ok) {
    console.log("No existing tests or fixtures changed.");
    return;
  }
  console.error(
    "Existing tests or fixtures changed. Jorge adds the tests-approved label to approve it:",
  );
  for (const line of result.bad) console.error(line);
  process.exit(1);
}

const invoked = process.argv[1] && realpathSync(process.argv[1]);
if (invoked === fileURLToPath(import.meta.url)) main();
