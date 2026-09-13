CREATE TABLE "cancellation_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "schedule_start_hour" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "schedule_end_hour" integer DEFAULT 21 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "schedule_days" integer[] DEFAULT '{0,1,2,3,4,5,6}' NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "cancel_reason_id" uuid;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "cancel_note" text;--> statement-breakpoint
INSERT INTO "cancellation_reasons" ("label")
SELECT * FROM (VALUES ('Illness / Health issue'), ('Scheduling issue'), ('Transportation issue'), ('Other')) AS v(label)
WHERE NOT EXISTS (SELECT 1 FROM "cancellation_reasons");
