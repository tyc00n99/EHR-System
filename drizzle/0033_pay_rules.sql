CREATE TYPE "public"."pay_frequency" AS ENUM('weekly', 'biweekly', 'semimonthly', 'monthly');--> statement-breakpoint
CREATE TABLE "pay_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"effective_from" date NOT NULL,
	"frequency" "pay_frequency" NOT NULL,
	"anchor_date" date NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_pay_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"rate" numeric(8, 2) NOT NULL,
	"effective_from" date NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "ot_weekly_hours" numeric(5, 2) DEFAULT '48' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "ot_daily_hours" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "ot_multiplier" numeric(4, 2) DEFAULT '1.5' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "workweek_start_day" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "overtime_exempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pay_schedules" ADD CONSTRAINT "pay_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pay_rates" ADD CONSTRAINT "staff_pay_rates_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_pay_rates" ADD CONSTRAINT "staff_pay_rates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_pay_rates_staff_idx" ON "staff_pay_rates" USING btree ("staff_id","effective_from");--> statement-breakpoint
-- The schedule the app has always used: biweekly, Sunday to Saturday, counted from 2026-08-23.
INSERT INTO "pay_schedules" ("effective_from", "frequency", "anchor_date") VALUES ('2000-01-01', 'biweekly', '2026-08-23');--> statement-breakpoint
-- Every staff member's current rate becomes their first rate, effective from their hire date.
INSERT INTO "staff_pay_rates" ("staff_id", "rate", "effective_from", "note") SELECT "id", "pay_rate", "hire_date", 'Rate on record when pay history began' FROM "staff";
