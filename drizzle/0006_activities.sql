ALTER TABLE "people" ADD COLUMN "activity_library" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "activities" text[] DEFAULT '{}'::text[] NOT NULL;