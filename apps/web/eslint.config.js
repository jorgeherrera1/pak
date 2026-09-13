import { nextJsConfig } from "@dark-factory/eslint-config/next-js";

/** @type {import("eslint").Linter.Config} */
export default [
  // SDK-generated at build; gitignored, not source.
  { ignores: ["app/.well-known/**"] },
  ...nextJsConfig,
];
