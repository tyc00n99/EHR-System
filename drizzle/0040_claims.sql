CREATE TYPE "public"."claim_batch_method" AS ENUM('clearinghouse', 'download');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('sent', 'accepted', 'rejected', 'paid', 'denied', 'void');--> statement-breakpoint
CREATE TABLE "claim_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"method" "claim_batch_method" NOT NULL,
	"clearinghouse" text NOT NULL,
	"control_number" integer NOT NULL,
	"usage" text NOT NULL,
	"file_text" text NOT NULL,
	"claim_count" integer NOT NULL,
	"line_count" integer NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"external_id" text,
	"message" text,
	"sent_by" uuid,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"service_code" text NOT NULL,
	"modifiers" text[] DEFAULT '{}'::text[] NOT NULL,
	"units" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"service_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"service_agreement_id" uuid NOT NULL,
	"patient_control_number" text NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"status" "claim_status" DEFAULT 'sent' NOT NULL,
	"status_message" text,
	"status_at" timestamp with time zone,
	"payer_claim_number" text,
	"paid_amount" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_batches" ADD CONSTRAINT "claim_batches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_batches" ADD CONSTRAINT "claim_batches_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_batches" ADD CONSTRAINT "claim_batches_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_lines" ADD CONSTRAINT "claim_lines_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_lines" ADD CONSTRAINT "claim_lines_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_batch_id_claim_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."claim_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_service_agreement_id_service_agreements_id_fk" FOREIGN KEY ("service_agreement_id") REFERENCES "public"."service_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "claim_batches_control_idx" ON "claim_batches" USING btree ("organization_id","control_number");--> statement-breakpoint
CREATE INDEX "claim_lines_claim_idx" ON "claim_lines" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "claim_lines_visit_idx" ON "claim_lines" USING btree ("visit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claims_pcn_idx" ON "claims" USING btree ("patient_control_number");--> statement-breakpoint
CREATE INDEX "claims_batch_idx" ON "claims" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "claims_person_idx" ON "claims" USING btree ("person_id");