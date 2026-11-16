// Early warning. Denies a direct edit of a tracked test or fixture.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";

const file = fileFromStdin();
const blocked = existingProtected(file);
const decision = { permission: blocked ? "deny" : "allow" };
if (blocked) {
  const reason = `${file} is an existing test or fixture. Add a new test file instead of editing this one.`;
  decision.user_message = reason;
  decision.agent_message = reason;
}
process.stdout.write(JSON.stringify(decision));

function fileFromStdin() {
  try {
    const input = JSON.parse(readFileSync(0, "utf8"));
    const raw = input.tool_input;
    const tool = typeof raw === "string" ? JSON.parse(raw) : (raw ?? {});
    return tool.file_path || tool.path || tool.notebook_path;
  } catch {
    return undefined;
  }
}

function existingProtected(file) {
  if (typeof file !== "string" || !isProtected(file)) return false;
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: dirname(file),
    encoding: "utf8",
  });
  const cwd = top.status === 0 ? top.stdout.trim() : process.cwd();
  return (
    spawnSync("git", ["ls-files", "--error-unmatch", "--", file], {
      cwd,
      encoding: "utf8",
    }).status === 0
  );
}

function isProtected(file) {
  const path = file.replaceAll("\\", "/");
  return (
    /(?:^|\/)test\/fixtures(?:\/|$)/.test(path) || /\.test\.tsx?$/.test(path)
  );
}
