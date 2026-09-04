ALTER TABLE "visits" ADD COLUMN "manual_evidence_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "manual_evidence_by" uuid;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_manual_evidence_by_users_id_fk" FOREIGN KEY ("manual_evidence_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;