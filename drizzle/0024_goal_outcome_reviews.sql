CREATE TABLE "goal_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assessment" text NOT NULL,
	"note" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "goal_reviews" ADD CONSTRAINT "goal_reviews_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_reviews" ADD CONSTRAINT "goal_reviews_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_reviews_goal_idx" ON "goal_reviews" USING btree ("goal_id","reviewed_at");