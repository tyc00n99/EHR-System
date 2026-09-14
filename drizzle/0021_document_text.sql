ALTER TABLE "client_documents" ADD COLUMN "extracted_text" text;--> statement-breakpoint
ALTER TABLE "client_documents" ADD COLUMN "extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_documents" ADD COLUMN "extraction_summary" text;--> statement-breakpoint
ALTER TABLE "client_documents" ADD COLUMN "extraction_model" text;--> statement-breakpoint
ALTER TABLE "staff_documents" ADD COLUMN "extracted_text" text;--> statement-breakpoint
ALTER TABLE "staff_documents" ADD COLUMN "extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_documents" ADD COLUMN "extraction_summary" text;--> statement-breakpoint
ALTER TABLE "staff_documents" ADD COLUMN "extraction_model" text;