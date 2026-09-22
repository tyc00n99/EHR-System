CREATE TABLE "goal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"visit_id" uuid,
	"body" text,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "supports" text;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "measurement" text;--> statement-breakpoint
ALTER TABLE "goal_entries" ADD CONSTRAINT "goal_entries_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_entries" ADD CONSTRAINT "goal_entries_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_entries" ADD CONSTRAINT "goal_entries_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_entries_goal_idx" ON "goal_entries" USING btree ("goal_id","recorded_at");--> statement-breakpoint
CREATE INDEX "goal_entries_visit_idx" ON "goal_entries" USING btree ("visit_id");--> statement-breakpoint
-- Goals written before Sept 22, 2026 had a one-line outcome and a "what this looks like" description;
-- the description is the closest thing to the supports paragraph, so it seeds that column.
UPDATE "goals" SET "supports" = "description" WHERE "supports" IS NULL AND "description" IS NOT NULL;
