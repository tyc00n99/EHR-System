CREATE TABLE "evv_caregiver_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"aggregator" text NOT NULL,
	"environment" text NOT NULL,
	"external_id" text NOT NULL,
	"payload_hash" text,
	"status" text NOT NULL,
	"transaction_id" text,
	"vendor_code" text,
	"message" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evv_corrections" ADD COLUMN "dhs_reason_code" text;--> statement-breakpoint
ALTER TABLE "evv_corrections" ADD COLUMN "dhs_action_code" text;--> statement-breakpoint
ALTER TABLE "evv_provider_profiles" ADD COLUMN "office_qualifier" text DEFAULT 'FederalTaxID' NOT NULL;--> statement-breakpoint
ALTER TABLE "evv_provider_profiles" ADD COLUMN "office_identifier" text;--> statement-breakpoint
ALTER TABLE "evv_submissions" ADD COLUMN "transaction_id" text;--> statement-breakpoint
ALTER TABLE "evv_visits" ADD COLUMN "aggregator_visit_id" text;--> statement-breakpoint
ALTER TABLE "evv_visits" ADD COLUMN "edit_reason_code" text;--> statement-breakpoint
ALTER TABLE "evv_visits" ADD COLUMN "edit_action_code" text;--> statement-breakpoint
ALTER TABLE "evv_visits" ADD COLUMN "edit_note" text;--> statement-breakpoint
ALTER TABLE "evv_caregiver_syncs" ADD CONSTRAINT "evv_caregiver_syncs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evv_caregiver_syncs" ADD CONSTRAINT "evv_caregiver_syncs_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evv_caregiver_syncs_unique" ON "evv_caregiver_syncs" USING btree ("organization_id","staff_id","aggregator","environment");--> statement-breakpoint
-- Appendix B of the HHAX Minnesota specification: Waiver Services fee-for-service is payer "MIWS".
UPDATE "evv_payers" SET "external_payer_id" = 'MIWS' WHERE "kind" = 'medicaid_ffs' AND "external_payer_id" IS NULL;
