// Early warning only. CI rejects the pull request; this does not parse shell commands.
import { readFileSync } from "node:fs";
import { isExistingProtected } from "../../scripts/protected-path.mjs";

const file = fileFromStdin();
const blocked = isExistingProtected(file);
const decision = { permission: blocked ? "deny" : "allow" };
if (blocked) {
  const reason = `${file} is an existing test or fixture. New test files are fine. Jorge's tests-approved label is what approves a change to this one.`;
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
