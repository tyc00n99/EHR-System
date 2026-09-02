CREATE TYPE "public"."agreement_status" AS ENUM('active', 'exhausted', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('insert', 'update', 'delete', 'login', 'logout');--> statement-breakpoint
CREATE TYPE "public"."evv_status" AS ENUM('pending', 'exported', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."person_status" AS ENUM('intake', 'active', 'discharged');--> statement-breakpoint
CREATE TYPE "public"."site_type" AS ENUM('office', 'community_residential', 'day_services', 'in_home');--> statement-breakpoint
CREATE TYPE "public"."staff_id_type" AS ENUM('npi', 'umpi');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'supervisor', 'dsp');--> statement-breakpoint
CREATE TYPE "public"."visit_status" AS ENUM('in_progress', 'completed', 'void');--> statement-breakpoint
CREATE TYPE "public"."waiver_program" AS ENUM('CADI', 'BI', 'DD', 'EW', 'CFSS', 'CAC');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" "audit_action" NOT NULL,
	"table_name" text NOT NULL,
	"record_id" text,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tax_id" text NOT NULL,
	"npi" text,
	"umpi" text,
	"license_number" text,
	"address1" text,
	"address2" text,
	"city" text,
	"state" text DEFAULT 'MN',
	"zip" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"preferred_name" text,
	"dob" date NOT NULL,
	"pmi" text NOT NULL,
	"waiver_program" "waiver_program" NOT NULL,
	"county" text NOT NULL,
	"case_manager_name" text NOT NULL,
	"case_manager_phone" text,
	"case_manager_email" text,
	"guardian_name" text,
	"guardian_relationship" text,
	"guardian_phone" text,
	"guardian_email" text,
	"emergency_contact_name" text,
	"emergency_contact_relationship" text,
	"emergency_contact_phone" text,
	"emergency_contact_email" text,
	"consult_provider_name" text,
	"consult_contact_name" text,
	"consult_phone" text,
	"consult_email" text,
	"signature_code_hash" text,
	"signature_code_set_at" timestamp with time zone,
	"address1" text,
	"address2" text,
	"city" text,
	"state" text DEFAULT 'MN',
	"zip" text,
	"phone" text,
	"email" text,
	"status" "person_status" DEFAULT 'intake' NOT NULL,
	"service_start_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_pmi_format" CHECK ("people"."pmi" ~ '^[0-9]{8}$')
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"service_type_id" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"program_id" uuid,
	"agreement_number" text NOT NULL,
	"service_code" text NOT NULL,
	"modifiers" text[] DEFAULT '{}'::text[] NOT NULL,
	"authorized_units" integer NOT NULL,
	"unit_rate" numeric(10, 2) NOT NULL,
	"unit_minutes" integer DEFAULT 15 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"authorizing_county" text NOT NULL,
	"status" "agreement_status" DEFAULT 'active' NOT NULL,
	"document_path" text,
	"document_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreements_units_positive" CHECK ("service_agreements"."authorized_units" > 0),
	CONSTRAINT "agreements_date_order" CHECK ("service_agreements"."end_date" >= "service_agreements"."start_date")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "site_type" NOT NULL,
	"license_number" text,
	"address1" text,
	"address2" text,
	"city" text,
	"state" text DEFAULT 'MN',
	"zip" text,
	"phone" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"dob" date,
	"email" text,
	"phone" text,
	"npi" text,
	"umpi" text,
	"hire_date" date NOT NULL,
	"title" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_has_rendering_id" CHECK ("staff"."npi" is not null or "staff"."umpi" is not null)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"staff_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visit_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"edited_by" uuid NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"changes" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"service_agreement_id" uuid NOT NULL,
	"program_id" uuid,
	"provider_tax_id" text NOT NULL,
	"pmi" text NOT NULL,
	"service_code" text NOT NULL,
	"modifiers" text[] DEFAULT '{}'::text[] NOT NULL,
	"rendering_id_type" "staff_id_type" NOT NULL,
	"rendering_id" text NOT NULL,
	"place_of_service" text NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"clock_in_at" timestamp with time zone NOT NULL,
	"clock_out_at" timestamp with time zone,
	"clock_in_lat" double precision NOT NULL,
	"clock_in_lng" double precision NOT NULL,
	"clock_in_accuracy_m" double precision,
	"clock_out_lat" double precision,
	"clock_out_lng" double precision,
	"clock_out_accuracy_m" double precision,
	"manual_entry" boolean DEFAULT false NOT NULL,
	"manual_entry_reason" text,
	"tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"shift_note" text,
	"client_signed_at" timestamp with time zone,
	"client_unsigned_reason" text,
	"status" "visit_status" DEFAULT 'in_progress' NOT NULL,
	"evv_status" "evv_status" DEFAULT 'pending' NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visits_manual_reason" CHECK ("visits"."manual_entry" = false or "visits"."manual_entry_reason" is not null),
	CONSTRAINT "visits_completed_has_clock_out" CHECK ("visits"."status" <> 'completed' or "visits"."clock_out_at" is not null),
	CONSTRAINT "visits_clock_order" CHECK ("visits"."clock_out_at" is null or "visits"."clock_out_at" >= "visits"."clock_in_at"),
	CONSTRAINT "visits_pos_format" CHECK ("visits"."place_of_service" ~ '^[0-9]{2}$')
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_edits" ADD CONSTRAINT "visit_edits_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_edits" ADD CONSTRAINT "visit_edits_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_service_agreement_id_service_agreements_id_fk" FOREIGN KEY ("service_agreement_id") REFERENCES "public"."service_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_record_idx" ON "audit_log" USING btree ("table_name","record_id");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "people_pmi_idx" ON "people" USING btree ("pmi");--> statement-breakpoint
CREATE INDEX "people_last_name_idx" ON "people" USING btree ("last_name");--> statement-breakpoint
CREATE INDEX "programs_site_idx" ON "programs" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "agreements_person_idx" ON "service_agreements" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "staff_last_name_idx" ON "staff" USING btree ("last_name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "visit_edits_visit_idx" ON "visit_edits" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "visits_person_idx" ON "visits" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "visits_staff_idx" ON "visits" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "visits_agreement_idx" ON "visits" USING btree ("service_agreement_id");--> statement-breakpoint
CREATE INDEX "visits_clock_in_idx" ON "visits" USING btree ("clock_in_at");