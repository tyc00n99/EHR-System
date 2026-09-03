ALTER TABLE "people" ADD COLUMN "medication_support" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "discharged_on" date;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "note_saved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "note_saved_by" uuid;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "note_saved_lat" double precision;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "note_saved_lng" double precision;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_note_saved_by_users_id_fk" FOREIGN KEY ("note_saved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;