ALTER TABLE "client_availability" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "client_availability" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "client_availability" ADD COLUMN "time_zone" text DEFAULT 'America/Chicago' NOT NULL;