CREATE TYPE "public"."funding_priority" AS ENUM('primary', 'secondary', 'tertiary');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('home', 'community', 'day_program', 'residential', 'school', 'telehealth', 'other');--> statement-breakpoint
CREATE TABLE "client_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relationship" text NOT NULL,
	"phone" text,
	"email" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_legal_representative" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_diagnoses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"icd_code" text NOT NULL,
	"description" text NOT NULL,
	"diagnosed_on" date,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_funding_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"payer" text NOT NULL,
	"waiver" "waiver_program",
	"member_id" text,
	"priority" "funding_priority" DEFAULT 'primary' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"type" "location_type" DEFAULT 'home' NOT NULL,
	"label" text,
	"address1" text,
	"address2" text,
	"city" text,
	"state" text DEFAULT 'MN' NOT NULL,
	"zip" text,
	"pos_code" text DEFAULT '12' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_availability" ADD CONSTRAINT "client_availability_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_diagnoses" ADD CONSTRAINT "client_diagnoses_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_funding_sources" ADD CONSTRAINT "client_funding_sources_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_locations" ADD CONSTRAINT "client_locations_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_availability_person_idx" ON "client_availability" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "client_contacts_person_idx" ON "client_contacts" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "client_diagnoses_person_idx" ON "client_diagnoses" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "client_funding_person_idx" ON "client_funding_sources" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "client_locations_person_idx" ON "client_locations" USING btree ("person_id");

--> statement-breakpoint
-- Carry the single emergency contact that lived on `people` into the new list, so nobody's
-- contact disappears the moment the Profile tab replaces the old field.
INSERT INTO "client_contacts" ("person_id", "name", "relationship", "phone", "email", "is_primary")
SELECT "id", "emergency_contact_name", COALESCE(NULLIF("emergency_contact_relationship", ''), 'Emergency contact'),
       "emergency_contact_phone", "emergency_contact_email", true
FROM "people"
WHERE "emergency_contact_name" IS NOT NULL AND "emergency_contact_name" <> '';
