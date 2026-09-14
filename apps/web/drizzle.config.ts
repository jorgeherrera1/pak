import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  dbCredentials: { url: process.env.WORKFLOW_POSTGRES_URL! },
});
