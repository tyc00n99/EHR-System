CREATE TYPE "public"."document_category" AS ENUM('support_plan', 'iapp', 'treatment_goals', 'other');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('female', 'male', 'nonbinary', 'other', 'undisclosed');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'reveal';--> statement-breakpoint
CREATE TABLE "client_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"category" "document_category" NOT NULL,
	"title" text NOT NULL,
	"file_name" text NOT NULL,
	"file_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"effective_on" date,
	"note" text,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff" ALTER COLUMN "dob" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "gender" "gender" NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "ssn_encrypted" text NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "ssn_last4" text NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "pay_rate" numeric(8, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "address1" text NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "address2" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "city" text NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "state" text DEFAULT 'MN' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "zip" text NOT NULL;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_documents_person_idx" ON "client_documents" USING btree ("person_id");--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_ssn_last4" CHECK ("staff"."ssn_last4" ~ '^[0-9]{4}$');