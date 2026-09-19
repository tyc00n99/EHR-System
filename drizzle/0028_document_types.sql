CREATE TABLE "document_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"renew_months" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "client_documents" ADD COLUMN "document_type_id" uuid;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_document_type_id_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."document_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "document_types" ("key", "label", "required", "locked", "renew_months", "sort_order") VALUES
	('support_plan', 'Support plan (CSSP / support plan addendum)', true, true, 12, 1),
	('iapp', 'Individual abuse prevention plan', true, true, 12, 2),
	('treatment_goals', 'Support plan goals and outcomes', true, true, 3, 3),
	('rights', 'Service recipient rights notice', true, true, NULL, 4),
	('release', 'Release of information / consent', true, true, NULL, 5),
	('medical', 'Medical (orders, medication plan, physician notes)', false, false, NULL, 6),
	('other', 'Other file', false, false, NULL, 7);--> statement-breakpoint
UPDATE "client_documents" SET "document_type_id" = dt."id" FROM "document_types" dt WHERE dt."key" = "client_documents"."category"::text AND "client_documents"."document_type_id" IS NULL;
