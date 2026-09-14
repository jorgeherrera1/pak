CREATE SCHEMA IF NOT EXISTS "dark_factory";
--> statement-breakpoint
CREATE TABLE "dark_factory"."jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"workflow_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dark_factory"."operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"step" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "operations_job_id_step_name_unique" UNIQUE("job_id","step","name")
);
--> statement-breakpoint
ALTER TABLE "dark_factory"."operations" ADD CONSTRAINT "operations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "dark_factory"."jobs"("id") ON DELETE cascade ON UPDATE no action;