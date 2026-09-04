ALTER TABLE "visits" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "returned_by" uuid;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "return_reason" text;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_returned_by_users_id_fk" FOREIGN KEY ("returned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;