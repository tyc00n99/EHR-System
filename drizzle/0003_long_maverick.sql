CREATE TYPE "public"."goal_response" AS ENUM('yes', 'no', 'na');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('active', 'met', 'discontinued');--> statement-breakpoint
CREATE TYPE "public"."interaction_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."med_admin_status" AS ENUM('given', 'refused', 'held', 'missed');--> statement-breakpoint
CREATE TYPE "public"."shift_status" AS ENUM('scheduled', 'in_progress', 'completed', 'cancelled', 'missed');--> statement-breakpoint
CREATE TABLE "goal_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"response" "goal_response" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'other' NOT NULL,
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"start_date" date,
	"target_date" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_administrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medication_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"scheduled_date" date NOT NULL,
	"scheduled_time" text NOT NULL,
	"status" "med_admin_status" NOT NULL,
	"given_at" timestamp with time zone,
	"recorded_by" uuid NOT NULL,
	"staff_id" uuid,
	"visit_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"name" text NOT NULL,
	"dose" text NOT NULL,
	"route" text DEFAULT 'oral' NOT NULL,
	"frequency" text NOT NULL,
	"times" text[] DEFAULT '{}'::text[] NOT NULL,
	"instructions" text,
	"prescriber" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"service_agreement_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" "shift_status" DEFAULT 'scheduled' NOT NULL,
	"note" text,
	"series_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shifts_time_order" CHECK ("shifts"."end_at" > "shifts"."start_at")
);
--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "interaction_level" "interaction_level";--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "skills" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "staff_signed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "shift_id" uuid;--> statement-breakpoint
ALTER TABLE "goal_questions" ADD CONSTRAINT "goal_questions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_responses" ADD CONSTRAINT "goal_responses_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_responses" ADD CONSTRAINT "goal_responses_question_id_goal_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."goal_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_administrations" ADD CONSTRAINT "medication_administrations_medication_id_medications_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_administrations" ADD CONSTRAINT "medication_administrations_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_administrations" ADD CONSTRAINT "medication_administrations_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_administrations" ADD CONSTRAINT "medication_administrations_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_administrations" ADD CONSTRAINT "medication_administrations_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_service_agreement_id_service_agreements_id_fk" FOREIGN KEY ("service_agreement_id") REFERENCES "public"."service_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_questions_goal_idx" ON "goal_questions" USING btree ("goal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_responses_visit_question_idx" ON "goal_responses" USING btree ("visit_id","question_id");--> statement-breakpoint
CREATE INDEX "goal_responses_question_idx" ON "goal_responses" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "goals_person_idx" ON "goals" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "med_admin_slot_idx" ON "medication_administrations" USING btree ("medication_id","scheduled_date","scheduled_time");--> statement-breakpoint
CREATE INDEX "med_admin_person_date_idx" ON "medication_administrations" USING btree ("person_id","scheduled_date");--> statement-breakpoint
CREATE INDEX "medications_person_idx" ON "medications" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "shifts_staff_start_idx" ON "shifts" USING btree ("staff_id","start_at");--> statement-breakpoint
CREATE INDEX "shifts_person_start_idx" ON "shifts" USING btree ("person_id","start_at");--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;