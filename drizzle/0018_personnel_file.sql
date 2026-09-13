ALTER TYPE "public"."credential_type" ADD VALUE 'application' BEFORE 'background_study';--> statement-breakpoint
ALTER TYPE "public"."credential_type" ADD VALUE 'duties_acknowledgment' BEFORE 'background_study';--> statement-breakpoint
ALTER TYPE "public"."credential_type" ADD VALUE 'position_requirements' BEFORE 'background_study';--> statement-breakpoint
ALTER TYPE "public"."credential_type" ADD VALUE 'qualifications' BEFORE 'background_study';--> statement-breakpoint
ALTER TYPE "public"."credential_type" ADD VALUE 'evaluation' BEFORE 'background_study';--> statement-breakpoint
ALTER TYPE "public"."credential_type" ADD VALUE 'background_study_results' BEFORE 'background_study';--> statement-breakpoint
ALTER TYPE "public"."credential_type" ADD VALUE 'first_supervised_contact' BEFORE 'background_study';--> statement-breakpoint
ALTER TYPE "public"."credential_type" ADD VALUE 'first_unsupervised_contact' BEFORE 'background_study';--> statement-breakpoint
ALTER TABLE "staff_credentials" ADD COLUMN "instructor" text;