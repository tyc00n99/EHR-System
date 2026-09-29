ALTER TABLE "client_diagnoses" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_diagnoses" ADD COLUMN "archived_by" uuid;--> statement-breakpoint
ALTER TABLE "client_diagnoses" ADD CONSTRAINT "client_diagnoses_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;