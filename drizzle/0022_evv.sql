CREATE TYPE "public"."evv_billing_readiness" AS ENUM('not_ready', 'ready', 'ready_with_warnings', 'hold');--> statement-breakpoint
CREATE TYPE "public"."evv_compliance_status" AS ENUM('COMPLIANT', 'NONCOMPLIANT', 'INCOMPLETE', 'EXEMPT_LIVE_IN', 'PENDING_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."evv_event_type" AS ENUM('clock_in', 'clock_out', 'correction', 'submission', 'acknowledgment', 'void', 'review');--> statement-breakpoint
CREATE TYPE "public"."evv_exception_status" AS ENUM('open', 'acknowledged', 'resolved', 'waived');--> statement-breakpoint
CREATE TYPE "public"."evv_location_state" AS ENUM('captured', 'inside_geofence', 'outside_geofence', 'community', 'unavailable', 'permission_denied', 'accuracy_insufficient', 'protected_address', 'registered_location', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."evv_location_type" AS ENUM('home', 'community', 'alternate', 'protected');--> statement-breakpoint
CREATE TYPE "public"."evv_rejection_category" AS ENUM('transient', 'authentication', 'validation', 'duplicate', 'not_found', 'configuration', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."evv_submission_status" AS ENUM('queued', 'transmitting', 'submitted', 'accepted', 'accepted_with_warning', 'rejected', 'retry_scheduled', 'correction_required', 'resubmitted', 'permanently_failed', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."evv_unit_type" AS ENUM('fifteen_minute', 'hourly', 'daily', 'per_visit');--> statement-breakpoint
CREATE TYPE "public"."evv_verification_method" AS ENUM('mobile', 'ivr', 'fob', 'live_in', 'manual', 'imported', 'other');--> statement-breakpoint
CREATE TYPE "public"."evv_visit_status" AS ENUM('planned', 'in_progress', 'awaiting_clock_in', 'completed', 'voided');--> statement-breakpoint
CREATE TABLE "evv_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"evv_visit_id" uuid,
	"action" text NOT NULL,
	"actor_user_id" uuid,
	"details" jsonb,
	"previous_hash" text,
	"hash" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"seq" bigserial NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evv_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"evv_visit_id" uuid NOT NULL,
	"prior_version" integer NOT NULL,
	"resulting_version" integer NOT NULL,
	"changes" jsonb NOT NULL,
	"reason_code" text NOT NULL,
	"explanation" text NOT NULL,
	"corrected_by" uuid NOT NULL,
	"corrected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"makes_noncompliant" boolean DEFAULT true NOT NULL,
	"resubmission_required" boolean DEFAULT true NOT NULL,
	"event_id" uuid
);
--> statement-breakpoint
CREATE TABLE "evv_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"evv_visit_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"type" "evv_event_type" NOT NULL,
	"device_captured_at" timestamp with time zone,
	"device_utc_offset_minutes" integer,
	"server_received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_at" timestamp with time zone,
	"location_encrypted" text,
	"accuracy_meters" double precision,
	"location_source" text,
	"location_type" "evv_location_type",
	"location_state" "evv_location_state" DEFAULT 'not_applicable' NOT NULL,
	"distance_from_home_meters" double precision,
	"registered_location_ref" text,
	"verification_method" "evv_verification_method" NOT NULL,
	"device_id" text,
	"offline" boolean DEFAULT false NOT NULL,
	"delayed" boolean DEFAULT false NOT NULL,
	"actor_user_id" uuid,
	"actor_staff_id" uuid,
	"metadata" jsonb,
	"integrity_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evv_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"evv_visit_id" uuid NOT NULL,
	"type" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"detail" text,
	"status" "evv_exception_status" DEFAULT 'open' NOT NULL,
	"assigned_to" uuid,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evv_live_in_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"documentation_ref" text NOT NULL,
	"approved_by" uuid,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evv_live_in_date_order" CHECK ("evv_live_in_relationships"."effective_to" is null or "evv_live_in_relationships"."effective_to" >= "evv_live_in_relationships"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "evv_payers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'medicaid_ffs' NOT NULL,
	"external_payer_id" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evv_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"state" text DEFAULT 'MN' NOT NULL,
	"geofence_meters" integer DEFAULT 500 NOT NULL,
	"max_accuracy_meters" integer DEFAULT 200 NOT NULL,
	"real_time_tolerance_minutes" integer DEFAULT 60 NOT NULL,
	"max_future_skew_minutes" integer DEFAULT 10 NOT NULL,
	"max_visit_minutes" integer DEFAULT 1440 NOT NULL,
	"min_visit_minutes" integer DEFAULT 1 NOT NULL,
	"submission_deadline_day" integer DEFAULT 14 NOT NULL,
	"deadline_warning_days" integer DEFAULT 5 NOT NULL,
	"live_in_non_real_time_allowed" boolean DEFAULT true NOT NULL,
	"billing_hold_on_noncompliant" boolean DEFAULT false NOT NULL,
	"max_submission_attempts" integer DEFAULT 8 NOT NULL,
	"retry_base_seconds" integer DEFAULT 60 NOT NULL,
	"retry_max_seconds" integer DEFAULT 21600 NOT NULL,
	"ack_timeout_hours" integer DEFAULT 48 NOT NULL,
	"source_url" text,
	"source_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evv_provider_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" "staff_id_type" NOT NULL,
	"value" text NOT NULL,
	"label" text,
	"effective_from" date,
	"effective_to" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evv_provider_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"federal_tax_id" text NOT NULL,
	"medicaid_provider_id" text,
	"hhax_provider_id" text,
	"evv_system" text DEFAULT 'third_party' NOT NULL,
	"production_enabled" boolean DEFAULT false NOT NULL,
	"time_zone" text DEFAULT 'America/Chicago' NOT NULL,
	"state" text DEFAULT 'MN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evv_service_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"state" text DEFAULT 'MN' NOT NULL,
	"payer_id" uuid,
	"service_code" text NOT NULL,
	"required_modifiers" text[] DEFAULT '{}'::text[] NOT NULL,
	"excluded_modifiers" text[] DEFAULT '{}'::text[] NOT NULL,
	"allow_additional_modifiers" boolean DEFAULT true NOT NULL,
	"label" text NOT NULL,
	"requires_evv" boolean DEFAULT true NOT NULL,
	"unit_type" "evv_unit_type" DEFAULT 'fifteen_minute' NOT NULL,
	"shared_care" boolean DEFAULT false NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"source_url" text,
	"source_label" text,
	"source_effective_date" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evv_shared_care_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"allocation_method" text DEFAULT 'equal' NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evv_submission_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" text NOT NULL,
	"transport_result" text,
	"rejection_category" "evv_rejection_category",
	"vendor_code" text,
	"message" text,
	"payload_hash" text
);
--> statement-breakpoint
CREATE TABLE "evv_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"evv_visit_id" uuid NOT NULL,
	"aggregator" text NOT NULL,
	"environment" text NOT NULL,
	"visit_version" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "evv_submission_status" DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"external_reference_id" text,
	"transport_result" text,
	"rejection_category" "evv_rejection_category",
	"vendor_rejection_code" text,
	"rejection_message" text,
	"warnings" jsonb,
	"resubmission_of" uuid,
	"operation" text DEFAULT 'create' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evv_visit_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"evv_visit_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evv_visit_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"evv_visit_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"cause" text NOT NULL,
	"caused_by_event_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evv_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"provider_medicaid_id" text,
	"provider_tax_id" text NOT NULL,
	"billing_id_type" "staff_id_type",
	"billing_id" text,
	"person_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"staff_id" uuid NOT NULL,
	"service_agreement_id" uuid,
	"shift_id" uuid,
	"visit_id" uuid,
	"shared_care_group_id" uuid,
	"shared_care_units_allocated" integer,
	"service_code" text NOT NULL,
	"modifiers" text[] DEFAULT '{}'::text[] NOT NULL,
	"payer_id" uuid,
	"service_rule_id" uuid,
	"evv_required" boolean DEFAULT true NOT NULL,
	"scheduled_start_at" timestamp with time zone,
	"scheduled_end_at" timestamp with time zone,
	"clock_in_at" timestamp with time zone,
	"clock_out_at" timestamp with time zone,
	"clock_in_event_id" uuid,
	"clock_out_event_id" uuid,
	"service_date" date,
	"time_zone" text DEFAULT 'America/Chicago' NOT NULL,
	"duration_minutes" integer,
	"units" integer,
	"unit_type" "evv_unit_type",
	"location_type" "evv_location_type",
	"verification_method" "evv_verification_method",
	"live_in" boolean DEFAULT false NOT NULL,
	"live_in_relationship_id" uuid,
	"shared_care" boolean DEFAULT false NOT NULL,
	"manual_entry" boolean DEFAULT false NOT NULL,
	"corrected" boolean DEFAULT false NOT NULL,
	"imported" boolean DEFAULT false NOT NULL,
	"status" "evv_visit_status" DEFAULT 'planned' NOT NULL,
	"compliance_status" "evv_compliance_status" DEFAULT 'INCOMPLETE' NOT NULL,
	"compliance_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"compliance_evaluated_at" timestamp with time zone,
	"billing_readiness" "evv_billing_readiness" DEFAULT 'not_ready' NOT NULL,
	"billing_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"submission_status" "evv_submission_status",
	"external_reference_id" text,
	"resubmission_required" boolean DEFAULT false NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evv_visits_clock_order" CHECK ("evv_visits"."clock_out_at" is null or "evv_visits"."clock_in_at" is null or "evv_visits"."clock_out_at" >= "evv_visits"."clock_in_at"),
	CONSTRAINT "evv_visits_void_reason" CHECK ("evv_visits"."status" <> 'voided' or "evv_visits"."void_reason" is not null)
);
--> statement-breakpoint
ALTER TABLE "client_locations" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "client_locations" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "client_locations" ADD COLUMN "protected_address" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client_locations" ADD COLUMN "ivr_phone" text;--> statement-breakpoint
ALTER TABLE "evv_audit_events" ADD CONSTRAINT "evv_audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_audit_events" ADD CONSTRAINT "evv_audit_events_evv_visit_id_evv_visits_id_fk" FOREIGN KEY ("evv_visit_id") REFERENCES "public"."evv_visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_audit_events" ADD CONSTRAINT "evv_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_corrections" ADD CONSTRAINT "evv_corrections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_corrections" ADD CONSTRAINT "evv_corrections_evv_visit_id_evv_visits_id_fk" FOREIGN KEY ("evv_visit_id") REFERENCES "public"."evv_visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_corrections" ADD CONSTRAINT "evv_corrections_corrected_by_users_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_events" ADD CONSTRAINT "evv_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_events" ADD CONSTRAINT "evv_events_evv_visit_id_evv_visits_id_fk" FOREIGN KEY ("evv_visit_id") REFERENCES "public"."evv_visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_events" ADD CONSTRAINT "evv_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_events" ADD CONSTRAINT "evv_events_actor_staff_id_staff_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_exceptions" ADD CONSTRAINT "evv_exceptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_exceptions" ADD CONSTRAINT "evv_exceptions_evv_visit_id_evv_visits_id_fk" FOREIGN KEY ("evv_visit_id") REFERENCES "public"."evv_visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_exceptions" ADD CONSTRAINT "evv_exceptions_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_exceptions" ADD CONSTRAINT "evv_exceptions_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_live_in_relationships" ADD CONSTRAINT "evv_live_in_relationships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_live_in_relationships" ADD CONSTRAINT "evv_live_in_relationships_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_live_in_relationships" ADD CONSTRAINT "evv_live_in_relationships_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_live_in_relationships" ADD CONSTRAINT "evv_live_in_relationships_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_payers" ADD CONSTRAINT "evv_payers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_policies" ADD CONSTRAINT "evv_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_provider_identifiers" ADD CONSTRAINT "evv_provider_identifiers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_provider_profiles" ADD CONSTRAINT "evv_provider_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_service_rules" ADD CONSTRAINT "evv_service_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_service_rules" ADD CONSTRAINT "evv_service_rules_payer_id_evv_payers_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."evv_payers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_service_rules" ADD CONSTRAINT "evv_service_rules_supersedes_id_evv_service_rules_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."evv_service_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_service_rules" ADD CONSTRAINT "evv_service_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_shared_care_groups" ADD CONSTRAINT "evv_shared_care_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_shared_care_groups" ADD CONSTRAINT "evv_shared_care_groups_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_shared_care_groups" ADD CONSTRAINT "evv_shared_care_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_submission_attempts" ADD CONSTRAINT "evv_submission_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_submission_attempts" ADD CONSTRAINT "evv_submission_attempts_submission_id_evv_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."evv_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_submissions" ADD CONSTRAINT "evv_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_submissions" ADD CONSTRAINT "evv_submissions_evv_visit_id_evv_visits_id_fk" FOREIGN KEY ("evv_visit_id") REFERENCES "public"."evv_visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_submissions" ADD CONSTRAINT "evv_submissions_resubmission_of_evv_submissions_id_fk" FOREIGN KEY ("resubmission_of") REFERENCES "public"."evv_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visit_comments" ADD CONSTRAINT "evv_visit_comments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visit_comments" ADD CONSTRAINT "evv_visit_comments_evv_visit_id_evv_visits_id_fk" FOREIGN KEY ("evv_visit_id") REFERENCES "public"."evv_visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visit_comments" ADD CONSTRAINT "evv_visit_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visit_versions" ADD CONSTRAINT "evv_visit_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visit_versions" ADD CONSTRAINT "evv_visit_versions_evv_visit_id_evv_visits_id_fk" FOREIGN KEY ("evv_visit_id") REFERENCES "public"."evv_visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visit_versions" ADD CONSTRAINT "evv_visit_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visits" ADD CONSTRAINT "evv_visits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visits" ADD CONSTRAINT "evv_visits_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visits" ADD CONSTRAINT "evv_visits_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visits" ADD CONSTRAINT "evv_visits_service_agreement_id_service_agreements_id_fk" FOREIGN KEY ("service_agreement_id") REFERENCES "public"."service_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visits" ADD CONSTRAINT "evv_visits_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visits" ADD CONSTRAINT "evv_visits_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visits" ADD CONSTRAINT "evv_visits_shared_care_group_id_evv_shared_care_groups_id_fk" FOREIGN KEY ("shared_care_group_id") REFERENCES "public"."evv_shared_care_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visits" ADD CONSTRAINT "evv_visits_payer_id_evv_payers_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."evv_payers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visits" ADD CONSTRAINT "evv_visits_service_rule_id_evv_service_rules_id_fk" FOREIGN KEY ("service_rule_id") REFERENCES "public"."evv_service_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visits" ADD CONSTRAINT "evv_visits_live_in_relationship_id_evv_live_in_relationships_id_fk" FOREIGN KEY ("live_in_relationship_id") REFERENCES "public"."evv_live_in_relationships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visits" ADD CONSTRAINT "evv_visits_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visits" ADD CONSTRAINT "evv_visits_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_visits" ADD CONSTRAINT "evv_visits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evv_audit_events_visit_idx" ON "evv_audit_events" USING btree ("evv_visit_id","seq");--> statement-breakpoint
CREATE INDEX "evv_audit_events_org_idx" ON "evv_audit_events" USING btree ("organization_id","at");--> statement-breakpoint
CREATE INDEX "evv_corrections_visit_idx" ON "evv_corrections" USING btree ("evv_visit_id");--> statement-breakpoint
CREATE INDEX "evv_corrections_org_idx" ON "evv_corrections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evv_events_org_event_idx" ON "evv_events" USING btree ("organization_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evv_events_org_idem_idx" ON "evv_events" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "evv_events_visit_idx" ON "evv_events" USING btree ("evv_visit_id");--> statement-breakpoint
CREATE INDEX "evv_events_org_staff_idx" ON "evv_events" USING btree ("organization_id","actor_staff_id");--> statement-breakpoint
CREATE INDEX "evv_exceptions_org_status_idx" ON "evv_exceptions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "evv_exceptions_visit_idx" ON "evv_exceptions" USING btree ("evv_visit_id");--> statement-breakpoint
CREATE INDEX "evv_exceptions_assigned_idx" ON "evv_exceptions" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "evv_live_in_org_person_staff_idx" ON "evv_live_in_relationships" USING btree ("organization_id","person_id","staff_id");--> statement-breakpoint
CREATE INDEX "evv_payers_org_idx" ON "evv_payers" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evv_policies_org_state_idx" ON "evv_policies" USING btree ("organization_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "evv_provider_identifiers_unique" ON "evv_provider_identifiers" USING btree ("organization_id","type","value");--> statement-breakpoint
CREATE INDEX "evv_provider_identifiers_org_idx" ON "evv_provider_identifiers" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evv_provider_profiles_org_idx" ON "evv_provider_profiles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "evv_service_rules_org_code_idx" ON "evv_service_rules" USING btree ("organization_id","service_code");--> statement-breakpoint
CREATE INDEX "evv_service_rules_active_idx" ON "evv_service_rules" USING btree ("organization_id","active");--> statement-breakpoint
CREATE INDEX "evv_shared_care_org_idx" ON "evv_shared_care_groups" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "evv_submission_attempts_submission_idx" ON "evv_submission_attempts" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evv_submissions_idem_idx" ON "evv_submissions" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "evv_submissions_visit_idx" ON "evv_submissions" USING btree ("evv_visit_id");--> statement-breakpoint
CREATE INDEX "evv_submissions_org_status_idx" ON "evv_submissions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "evv_submissions_due_idx" ON "evv_submissions" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "evv_submissions_external_idx" ON "evv_submissions" USING btree ("organization_id","external_reference_id");--> statement-breakpoint
CREATE INDEX "evv_visit_comments_visit_idx" ON "evv_visit_comments" USING btree ("evv_visit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evv_visit_versions_unique" ON "evv_visit_versions" USING btree ("evv_visit_id","version");--> statement-breakpoint
CREATE INDEX "evv_visit_versions_org_idx" ON "evv_visit_versions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "evv_visits_org_idx" ON "evv_visits" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "evv_visits_org_service_date_idx" ON "evv_visits" USING btree ("organization_id","service_date");--> statement-breakpoint
CREATE INDEX "evv_visits_org_staff_idx" ON "evv_visits" USING btree ("organization_id","staff_id");--> statement-breakpoint
CREATE INDEX "evv_visits_org_person_idx" ON "evv_visits" USING btree ("organization_id","person_id");--> statement-breakpoint
CREATE INDEX "evv_visits_org_compliance_idx" ON "evv_visits" USING btree ("organization_id","compliance_status");--> statement-breakpoint
CREATE INDEX "evv_visits_org_submission_idx" ON "evv_visits" USING btree ("organization_id","submission_status");--> statement-breakpoint
CREATE INDEX "evv_visits_external_ref_idx" ON "evv_visits" USING btree ("organization_id","external_reference_id");--> statement-breakpoint
CREATE INDEX "evv_visits_visit_idx" ON "evv_visits" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "evv_visits_status_idx" ON "evv_visits" USING btree ("organization_id","status");