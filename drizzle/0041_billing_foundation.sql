CREATE TYPE "public"."authorization_unit_state" AS ENUM('reserved', 'billed', 'released');--> statement-breakpoint
CREATE TABLE "authorization_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"service_agreement_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"claim_version_id" uuid,
	"units" integer NOT NULL,
	"state" "authorization_unit_state" DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"tax_id" text NOT NULL,
	"npi" text,
	"umpi" text,
	"taxonomy" text,
	"address1" text,
	"address2" text,
	"city" text,
	"state" text,
	"zip" text,
	"phone" text,
	"pay_to_address1" text,
	"pay_to_city" text,
	"pay_to_state" text,
	"pay_to_zip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"frequency_code" text DEFAULT '1' NOT NULL,
	"replaces_version_id" uuid,
	"payer_id" uuid,
	"profile_key" text NOT NULL,
	"profile_version" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"snapshot_hash" text NOT NULL,
	"total_cents" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_addenda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"body" text NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"reason" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"hash" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"profile_key" text NOT NULL,
	"profile_version" text NOT NULL,
	"clearinghouse_payer_id" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_lines" ADD COLUMN "claim_version_id" uuid;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "current_version_id" uuid;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "payer_id" uuid;--> statement-breakpoint
ALTER TABLE "client_funding_sources" ADD COLUMN "payer_id" uuid;--> statement-breakpoint
ALTER TABLE "client_funding_sources" ADD COLUMN "relationship_to_subscriber" text DEFAULT '18' NOT NULL;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "locked_by" uuid;--> statement-breakpoint
ALTER TABLE "authorization_units" ADD CONSTRAINT "authorization_units_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_units" ADD CONSTRAINT "authorization_units_service_agreement_id_service_agreements_id_fk" FOREIGN KEY ("service_agreement_id") REFERENCES "public"."service_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_units" ADD CONSTRAINT "authorization_units_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_units" ADD CONSTRAINT "authorization_units_claim_version_id_claim_versions_id_fk" FOREIGN KEY ("claim_version_id") REFERENCES "public"."claim_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_providers" ADD CONSTRAINT "billing_providers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_versions" ADD CONSTRAINT "claim_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_versions" ADD CONSTRAINT "claim_versions_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_versions" ADD CONSTRAINT "claim_versions_payer_id_payers_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."payers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_versions" ADD CONSTRAINT "claim_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_addenda" ADD CONSTRAINT "note_addenda_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_addenda" ADD CONSTRAINT "note_addenda_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payers" ADD CONSTRAINT "payers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "authorization_units_agreement_idx" ON "authorization_units" USING btree ("service_agreement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "authorization_units_live_visit_idx" ON "authorization_units" USING btree ("visit_id") WHERE "authorization_units"."state" <> 'released';--> statement-breakpoint
CREATE UNIQUE INDEX "billing_providers_org_idx" ON "billing_providers" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_versions_claim_no_idx" ON "claim_versions" USING btree ("claim_id","version_no");--> statement-breakpoint
CREATE INDEX "note_addenda_visit_idx" ON "note_addenda" USING btree ("visit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "note_versions_visit_no_idx" ON "note_versions" USING btree ("visit_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "payers_org_key_idx" ON "payers" USING btree ("organization_id","key");--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- A note approved for billing cannot change: only the lock columns may move (to unlock a claim
-- taken back before it left EVVora). Later changes are rows in note_addenda.
CREATE OR REPLACE FUNCTION visits_guard_locked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.locked_at IS NOT NULL THEN RAISE EXCEPTION 'note % is locked for billing', OLD.id USING ERRCODE = 'P0001'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.locked_at IS NOT NULL AND
     (to_jsonb(NEW) - 'locked_at' - 'locked_by' - 'updated_at' - 'updated_by') IS DISTINCT FROM
     (to_jsonb(OLD) - 'locked_at' - 'locked_by' - 'updated_at' - 'updated_by') THEN
    RAISE EXCEPTION 'note % is locked for billing; add an addendum instead', OLD.id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER visits_guard_locked BEFORE UPDATE OR DELETE ON "visits" FOR EACH ROW EXECUTE FUNCTION visits_guard_locked();
--> statement-breakpoint
-- Snapshots and addenda are the record; they are written once.
CREATE OR REPLACE FUNCTION billing_insert_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are insert-only', TG_TABLE_NAME USING ERRCODE = 'P0001';
END $$;
--> statement-breakpoint
CREATE TRIGGER note_versions_insert_only BEFORE UPDATE OR DELETE ON "note_versions" FOR EACH ROW EXECUTE FUNCTION billing_insert_only();
--> statement-breakpoint
CREATE TRIGGER note_addenda_insert_only BEFORE UPDATE OR DELETE ON "note_addenda" FOR EACH ROW EXECUTE FUNCTION billing_insert_only();
--> statement-breakpoint
CREATE TRIGGER claim_versions_insert_only BEFORE UPDATE OR DELETE ON "claim_versions" FOR EACH ROW EXECUTE FUNCTION billing_insert_only();
