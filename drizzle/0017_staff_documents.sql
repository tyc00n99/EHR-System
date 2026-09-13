CREATE TYPE "public"."staff_document_category" AS ENUM('background_study', 'training_certificate', 'orientation', 'license', 'identification', 'employment_form', 'tax_form', 'policy_acknowledgment', 'evaluation', 'other');--> statement-breakpoint
CREATE TABLE "staff_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"category" "staff_document_category" NOT NULL,
	"title" text NOT NULL,
	"file_name" text NOT NULL,
	"file_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"credential_id" uuid,
	"note" text,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_credential_id_staff_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."staff_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_documents_staff_idx" ON "staff_documents" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "staff_documents_credential_idx" ON "staff_documents" USING btree ("credential_id");