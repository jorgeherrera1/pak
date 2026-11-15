# Pak

Pak turns a requirements document into verified software. Requirements become a knowledge graph. Later work traces back to that graph.

This repository is the scaffold. PDF ingest is the next change. It is not in this tree.

## Stack

Node 26.13.1, pnpm 12.21.0, Turborepo 2.11.11, TypeScript 7.0.2 with `strict`, Biome 2.6.8, and Vitest 5.1.0.

## Commands

Install with `pnpm install --frozen-lockfile`.

Check the repo with `pnpm turbo typecheck lint test`.

## Tests

Do not modify or delete an existing test file. You may create a new test file.

Jorge is the only person who can approve an edit to an existing test. He creates `.cursor/jorge-approves-test-edits` himself, outside the agent, and deletes it when the edit is done. The file is gitignored.

Never create, write, or delete `.cursor/jorge-approves-test-edits`. Never edit `.cursor/hooks.json` or `.cursor/hooks/protect-tests.ts` to get past this rule.

The hook denies the edit when that file is absent. It allows the edit when the file is present. Cloud agents run this hook. The approval file is not in git, so a cloud agent starts blocked.

## Ingest

Ingest is deterministic. It must not call an LLM.

## Later AI

Future AI features build on the Cursor Agent SDK. The SDK is not installed.

## Draft code

Treat the code you find as a draft. Delete and rewrite a bad design. Do not add a compatibility shim. If the architecture is wrong, say so.
