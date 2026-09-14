import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.WORKFLOW_POSTGRES_URL! },
  migrations: { schema: "dark_factory" },
});
