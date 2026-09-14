-- Reverses drizzle/0022_evv.sql. Destructive: drops every EVV table. Run only if the tables hold
-- nothing you need, then remove the "0022_evv" entry from drizzle/meta/_journal.json.
DROP TABLE IF EXISTS "evv_audit_events", "evv_submission_attempts", "evv_submissions", "evv_visit_comments", "evv_exceptions", "evv_corrections", "evv_events", "evv_visit_versions", "evv_visits", "evv_shared_care_groups", "evv_live_in_relationships", "evv_service_rules", "evv_policies", "evv_payers", "evv_provider_identifiers", "evv_provider_profiles" CASCADE;
ALTER TABLE "client_locations" DROP COLUMN IF EXISTS "lat", DROP COLUMN IF EXISTS "lng", DROP COLUMN IF EXISTS "protected_address", DROP COLUMN IF EXISTS "ivr_phone";
DROP TYPE IF EXISTS "evv_visit_status", "evv_compliance_status", "evv_billing_readiness", "evv_verification_method", "evv_location_type", "evv_location_state", "evv_event_type", "evv_exception_status", "evv_submission_status", "evv_rejection_category", "evv_unit_type";
