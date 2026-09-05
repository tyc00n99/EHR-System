ALTER TABLE "people" ADD COLUMN "sms_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "sms_consent_at" timestamp with time zone;