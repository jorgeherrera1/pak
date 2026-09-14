import {
  integer,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/** Our tables live in their own schema; the Workflow SDK owns `workflow` and `graphile_worker`. */
const darkFactory = pgSchema("dark_factory");

export const jobs = darkFactory.table("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  status: text("status", { enum: ["queued", "running", "done", "failed"] })
    .notNull()
    .default("queued"),
  error: text("error"),
  workflowRunId: text("workflow_run_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const operations = darkFactory.table(
  "operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    step: text("step").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    status: text("status", { enum: ["pending", "running", "done", "failed"] })
      .notNull()
      .default("pending"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [unique().on(t.jobId, t.step, t.name)],
);
