/**
 * Core model for Month 1. Postgres via Drizzle. Every table that holds
 * protected health information is written only through `src/db/audited.ts`.
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

// ---------- enums ----------

export const userRole = pgEnum("user_role", ["admin", "supervisor", "dsp"]);

export const waiverProgram = pgEnum("waiver_program", ["CADI", "BI", "DD", "EW", "CFSS", "CAC"]);

export const personStatus = pgEnum("person_status", ["intake", "active", "discharged"]);

export const siteType = pgEnum("site_type", ["office", "community_residential", "day_services", "in_home"]);

export const agreementStatus = pgEnum("agreement_status", ["active", "exhausted", "expired", "cancelled"]);

export const staffIdType = pgEnum("staff_id_type", ["npi", "umpi"]);

export const visitStatus = pgEnum("visit_status", ["in_progress", "completed", "void"]);

export const evvStatus = pgEnum("evv_status", ["pending", "exported", "accepted", "rejected"]);

export const auditAction = pgEnum("audit_action", ["insert", "update", "delete", "login", "logout", "reveal"]);

export const gender = pgEnum("gender", ["female", "male", "nonbinary", "other", "undisclosed"]);

export const documentCategory = pgEnum("document_category", ["support_plan", "iapp", "treatment_goals", "rights", "release", "medical", "other"]);
export const staffDocumentCategory = pgEnum("staff_document_category", [
  "background_study",        // consent form, NETStudy clearance letter
  "training_certificate",    // certificates, training acknowledgments, the annual training record
  "orientation",             // the orientation record
  "license",                 // driver's license, auto insurance, professional licenses
  "identification",          // I-9 supporting documents, SSN card
  "employment_form",         // application, acceptance, I-9, direct deposit
  "tax_form",                // W-4, MN W-4
  "policy_acknowledgment",   // handbook receipt, confidentiality, roles and responsibilities
  "evaluation",              // performance evaluations
  "other",
]);

/** Where a person is served. The number is the CMS place-of-service code that rides on the claim. */
export const locationType = pgEnum("location_type", ["home", "community", "day_program", "residential", "school", "telehealth", "other"]);

/** Which payer pays first when a person has more than one. */
export const fundingPriority = pgEnum("funding_priority", ["primary", "secondary", "tertiary"]);

export const goalStatus = pgEnum("goal_status", ["active", "met", "discontinued"]);
export const goalResponse = pgEnum("goal_response", ["yes", "no", "na"]);
export const interactionLevel = pgEnum("interaction_level", ["low", "medium", "high"]);
export const shiftStatus = pgEnum("shift_status", ["scheduled", "in_progress", "completed", "cancelled", "missed"]);
export const medAdminStatus = pgEnum("med_admin_status", ["given", "refused", "held", "missed"]);

export const credentialType = pgEnum("credential_type", [
  // The personnel-record items a 245D licensor checks (245D.095 subd. 3), one type each, so every
  // item on that list is a dated row with a document behind it. Date of hire lives on the staff row.
  "application",
  "duties_acknowledgment",
  "position_requirements",
  "qualifications",
  "evaluation",
  "background_study_results",
  "first_supervised_contact",
  "first_unsupervised_contact",
  "background_study",
  "orientation",
  "maltreatment_reporting",
  "annual_training",
  "first_aid",
  "cpr",
  "drivers_license",
  "auto_insurance",
  "other",
]);

// ---------- shared columns ----------

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// ---------- organization (the license holder) ----------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Federal EIN. The aggregator API identifier. */
  taxId: text("tax_id").notNull(),
  npi: text("npi"),
  umpi: text("umpi"),
  licenseNumber: text("license_number"),
  address1: text("address1"),
  address2: text("address2"),
  city: text("city"),
  state: text("state").default("MN"),
  zip: text("zip"),
  phone: text("phone"),
  /** Calendar settings: the window the schedule draws, as whole hours in Central time. */
  scheduleStartHour: integer("schedule_start_hour").notNull().default(6),
  scheduleEndHour: integer("schedule_end_hour").notNull().default(21),
  /** 0 = Sunday. The weekdays the schedule shows at all. */
  scheduleDays: integer("schedule_days").array().notNull().default([0, 1, 2, 3, 4, 5, 6]),
  ...timestamps,
});

/**
 * Cancellation reasons, editable in Schedule settings. A fixed list in code would be simpler, but
 * an agency that keeps its own reasons is the reason the reference makes them editable, and the
 * reason is what shows up later when someone asks why the units were not delivered.
 */
export const cancellationReasons = pgTable("cancellation_reasons", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});
export type CancellationReason = typeof cancellationReasons.$inferSelect;

// ---------- staff ----------

export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    dob: date("dob").notNull(),
    gender: gender("gender").notNull(),
    /** AES-256-GCM ciphertext of the 9-digit SSN. Never logged or returned to the client except via `revealSsn`. */
    ssnEncrypted: text("ssn_encrypted").notNull(),
    ssnLast4: text("ssn_last4").notNull(),
    /** Hourly pay rate in dollars. Admin only. */
    payRate: numeric("pay_rate", { precision: 8, scale: 2 }).notNull(),
    address1: text("address1").notNull(),
    address2: text("address2"),
    city: text("city").notNull(),
    state: text("state").notNull().default("MN"),
    zip: text("zip").notNull(),
    email: text("email"),
    phone: text("phone"),
    npi: text("npi"),
    umpi: text("umpi"),
    hireDate: date("hire_date").notNull(),
    /** Job title. Access level lives on `users.role`. */
    title: text("title").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    check("staff_has_rendering_id", sql`${t.npi} is not null or ${t.umpi} is not null`),
    check("staff_ssn_last4", sql`${t.ssnLast4} ~ '^[0-9]{4}$'`),
    index("staff_last_name_idx").on(t.lastName),
  ],
);

// ---------- auth ----------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull(),
    staffId: uuid("staff_id").references(() => staff.id),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ---------- people served ----------

export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    preferredName: text("preferred_name"),
    dob: date("dob").notNull(),
    /** Sex recorded at birth. Nullable: rows created before this existed have none. */
    sexAtBirth: gender("sex_at_birth"),
    /** PMI number (PMI #), 8 digits. Goes to the aggregator and 837P loop 2010BA/NM109. */
    pmi: text("pmi").notNull(),
    waiverProgram: waiverProgram("waiver_program").notNull(),
    county: text("county").notNull(),
    caseManagerName: text("case_manager_name").notNull(),
    caseManagerPhone: text("case_manager_phone"),
    caseManagerEmail: text("case_manager_email"),
    guardianName: text("guardian_name"),
    guardianRelationship: text("guardian_relationship"),
    guardianPhone: text("guardian_phone"),
    guardianEmail: text("guardian_email"),
    /** Storage path of the client's photo, or null. The bytes live in stored_files. */
    photoPath: text("photo_path"),
    /** Bumped on every upload so a replaced photo is not served from cache. */
    photoUpdatedAt: timestamp("photo_updated_at", { withTimezone: true }),
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactRelationship: text("emergency_contact_relationship"),
    emergencyContactPhone: text("emergency_contact_phone"),
    emergencyContactEmail: text("emergency_contact_email"),
    /** Consultation Services provider (waiver service supporting self-directed plans). */
    consultProviderName: text("consult_provider_name"),
    consultContactName: text("consult_contact_name"),
    consultPhone: text("consult_phone"),
    consultEmail: text("consult_email"),
    /** Scrypt hash of the client's signing code. The person enters it to co-sign a shift note. */
    signatureCodeHash: text("signature_code_hash"),
    /**
     * The code, encrypted with DATA_ENCRYPTION_KEY, so an admin can read it back when the client
     * forgets. The hash above is still what verification uses. Never select this into a page;
     * go through `revealClientCode`, which is audited.
     */
    signatureCodeEncrypted: text("signature_code_encrypted"),
    signatureCodeSetAt: timestamp("signature_code_set_at", { withTimezone: true }),
    /** When the current code was last texted to the person, and where it went. */
    signatureCodeSentAt: timestamp("signature_code_sent_at", { withTimezone: true }),
    signatureCodeSentTo: text("signature_code_sent_to"),
    /** The person agreed to receive text messages. Required before the app texts a signing code. */
    smsConsent: boolean("sms_consent").notNull().default(false),
    smsConsentAt: timestamp("sms_consent_at", { withTimezone: true }),
    address1: text("address1"),
    address2: text("address2"),
    city: text("city"),
    state: text("state").default("MN"),
    zip: text("zip"),
    phone: text("phone"),
    email: text("email"),
    status: personStatus("status").notNull().default("intake"),
    serviceStartDate: date("service_start_date"),
    /** Staff administer or assist with medications for this person (245D.05). Shows the Medical tab. */
    medicationSupport: boolean("medication_support").notNull().default(false),
    /** Per-person activity statements staff can pick on a note. Empty means use the default library with the person's name. */
    activityLibrary: text("activity_library").array().notNull().default(sql`'{}'::text[]`),
    dischargedOn: date("discharged_on"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("people_pmi_idx").on(t.pmi),
    index("people_last_name_idx").on(t.lastName),
    check("people_pmi_format", sql`${t.pmi} ~ '^[0-9]{8}$'`),
  ],
);

// ---------- sites and programs ----------

export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: siteType("type").notNull(),
  licenseNumber: text("license_number"),
  address1: text("address1"),
  address2: text("address2"),
  city: text("city"),
  state: text("state").default("MN"),
  zip: text("zip"),
  phone: text("phone"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

/** A licensed service line delivered from a site. `serviceTypeId` is a key into src/lib/services.ts. */
export const programs = pgTable(
  "programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id),
    serviceTypeId: text("service_type_id").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("programs_site_idx").on(t.siteId)],
);

// ---------- service agreements (authorizations) ----------

export const serviceAgreements = pgTable(
  "service_agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    programId: uuid("program_id").references(() => programs.id),
    /** DHS service agreement / authorization number. */
    agreementNumber: text("agreement_number").notNull(),
    /** HCPCS procedure code, e.g. H2014. */
    serviceCode: text("service_code").notNull(),
    /** Up to four two-character modifiers, e.g. ["UC","U3"]. */
    modifiers: text("modifiers").array().notNull().default(sql`'{}'::text[]`),
    authorizedUnits: integer("authorized_units").notNull(),
    unitRate: numeric("unit_rate", { precision: 10, scale: 2 }).notNull(),
    /** Minutes per unit, e.g. 15. Drives unit computation from clock times. */
    unitMinutes: integer("unit_minutes").notNull().default(15),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    authorizingCounty: text("authorizing_county").notNull(),
    status: agreementStatus("status").notNull().default("active"),
    /** Uploaded service agreement PDF, relative to the uploads directory. */
    documentPath: text("document_path"),
    documentName: text("document_name"),
    /** Archived agreements are kept, and listed apart, so an old year's paperwork stops crowding the current one. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("agreements_person_idx").on(t.personId),
    check("agreements_units_positive", sql`${t.authorizedUnits} > 0`),
    check("agreements_date_order", sql`${t.endDate} >= ${t.startDate}`),
  ],
);

// ---------- visits ----------

export interface VisitTask {
  code: string;
  label: string;
  completed: boolean;
}

/**
 * The visit record is shaped for the HHAeXchange aggregator and the 837P claim
 * line from birth. Identifiers are snapshotted onto the row at clock-in so a
 * later change to a person or staff record never rewrites history.
 */
export const visits = pgTable(
  "visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    serviceAgreementId: uuid("service_agreement_id")
      .notNull()
      .references(() => serviceAgreements.id),
    programId: uuid("program_id").references(() => programs.id),

    // Snapshotted identifiers
    providerTaxId: text("provider_tax_id").notNull(),
    pmi: text("pmi").notNull(),
    serviceCode: text("service_code").notNull(),
    modifiers: text("modifiers").array().notNull().default(sql`'{}'::text[]`),
    renderingIdType: staffIdType("rendering_id_type").notNull(),
    renderingId: text("rendering_id").notNull(),

    /** CMS place-of-service code: 12 home, 99 other, 04 homeless shelter, 14 group home, etc. */
    placeOfService: text("place_of_service").notNull(),
    units: integer("units").notNull().default(0),

    clockInAt: timestamp("clock_in_at", { withTimezone: true }).notNull(),
    clockOutAt: timestamp("clock_out_at", { withTimezone: true }),
    clockInLat: doublePrecision("clock_in_lat").notNull(),
    clockInLng: doublePrecision("clock_in_lng").notNull(),
    clockInAccuracyM: doublePrecision("clock_in_accuracy_m"),
    clockOutLat: doublePrecision("clock_out_lat"),
    clockOutLng: doublePrecision("clock_out_lng"),
    clockOutAccuracyM: doublePrecision("clock_out_accuracy_m"),

    /** True when any timestamp or location was keyed in rather than captured live. */
    manualEntry: boolean("manual_entry").notNull().default(false),
    /** Set when someone confirms the paper or verbal evidence behind a manual entry is on file. */
    manualEvidenceAt: timestamp("manual_evidence_at", { withTimezone: true }),
    manualEvidenceBy: uuid("manual_evidence_by").references(() => users.id),
    manualEntryReason: text("manual_entry_reason"),

    tasks: jsonb("tasks").$type<VisitTask[]>().notNull().default([]),
    shiftNote: text("shift_note"),

    /** Structured documentation captured with the note. */
    interactionLevel: interactionLevel("interaction_level"),
    skills: text("skills").array().notNull().default(sql`'{}'::text[]`),
    /** Daily activities the caregiver selected from the person's activity library. */
    activities: text("activities").array().notNull().default(sql`'{}'::text[]`),
    /** Staff attestation and supervisor approval of the documentation. */
    staffSignedAt: timestamp("staff_signed_at", { withTimezone: true }),
    /** Set automatically when the caregiver submits. A supervisor can return the note instead. */
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    returnedBy: uuid("returned_by").references(() => users.id),
    returnReason: text("return_reason"),
    /** Scheduled shift this visit fulfilled, when one existed. */
    shiftId: uuid("shift_id"),
    /** When and where the note was last saved, from the device that saved it. */
    noteSavedAt: timestamp("note_saved_at", { withTimezone: true }),
    noteSavedBy: uuid("note_saved_by").references(() => users.id),
    noteSavedLat: doublePrecision("note_saved_lat"),
    noteSavedLng: doublePrecision("note_saved_lng"),

    /** Set when the person entered their signing code after reading the shift note. */
    clientSignedAt: timestamp("client_signed_at", { withTimezone: true }),
    /** Why the visit was closed without a client signature, when it was. */
    clientUnsignedReason: text("client_unsigned_reason"),

    status: visitStatus("status").notNull().default("in_progress"),
    evvStatus: evvStatus("evv_status").notNull().default("pending"),

    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("visits_person_idx").on(t.personId),
    index("visits_staff_idx").on(t.staffId),
    index("visits_agreement_idx").on(t.serviceAgreementId),
    index("visits_clock_in_idx").on(t.clockInAt),
    check("visits_manual_reason", sql`${t.manualEntry} = false or ${t.manualEntryReason} is not null`),
    check("visits_completed_has_clock_out", sql`${t.status} <> 'completed' or ${t.clockOutAt} is not null`),
    check("visits_clock_order", sql`${t.clockOutAt} is null or ${t.clockOutAt} >= ${t.clockInAt}`),
    check("visits_pos_format", sql`${t.placeOfService} ~ '^[0-9]{2}$'`),
  ],
);

/** Every change to a visit after creation. Exported to the aggregator alongside the visit. */
export const visitEdits = pgTable(
  "visit_edits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitId: uuid("visit_id")
      .notNull()
      .references(() => visits.id, { onDelete: "cascade" }),
    editedBy: uuid("edited_by")
      .notNull()
      .references(() => users.id),
    editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
    reason: text("reason").notNull(),
    /** { field: { from, to } } */
    changes: jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>().notNull(),
  },
  (t) => [index("visit_edits_visit_idx").on(t.visitId)],
);

// ---------- client documents ----------

/** Support plans, abuse prevention plans, treatment goals, and other files staff need while serving a person. */
export const clientDocuments = pgTable(
  "client_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    category: documentCategory("category").notNull(),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    filePath: text("file_path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    effectiveOn: date("effective_on"),
    note: text("note"),
    /** Archived files leave the checklist and the list but stay on the record and can be restored. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by").references(() => users.id),
    /** The document's text, read by the model at upload so the file can be searched. Null until read. */
    extractedText: text("extracted_text"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    /** One line saying what the model took the document to be, shown beside the file. */
    extractionSummary: text("extraction_summary"),
    extractionModel: text("extraction_model"),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [index("client_documents_person_idx").on(t.personId)],
);

// ---------- caregiver assignments and credentials ----------

/** Which caregivers serve which people. `orientedOn` records 245D.09, subd. 4a orientation to that person's needs. */
export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    active: boolean("active").notNull().default(true),
    orientedOn: date("oriented_on"),
    ...timestamps,
  },
  (t) => [uniqueIndex("assignments_pair_idx").on(t.staffId, t.personId), index("assignments_person_idx").on(t.personId)],
);

/** Training, certifications, and clearances per staff member (245D.09, 245C). */
/**
 * Files kept on a staff member: the background study, certificates, tax and employment forms.
 * A document can hang off one credential row so the certificate sits beside the training it proves.
 * Bytes live in stored_files, like every other upload; this row is the index.
 */
export const staffDocuments = pgTable(
  "staff_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    category: staffDocumentCategory("category").notNull(),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    filePath: text("file_path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** The credential this file is evidence for, when it is. Cleared, not cascaded, if that row goes. */
    credentialId: uuid("credential_id").references((): AnyPgColumn => staffCredentials.id, { onDelete: "set null" }),
    note: text("note"),
    /** The document's text, read by the model at upload so the file can be searched. Null until read. */
    extractedText: text("extracted_text"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    /** One line saying what the model took the document to be, shown beside the file. */
    extractionSummary: text("extraction_summary"),
    extractionModel: text("extraction_model"),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [index("staff_documents_staff_idx").on(t.staffId), index("staff_documents_credential_idx").on(t.credentialId)],
);
export type StaffDocument = typeof staffDocuments.$inferSelect;

export const staffCredentials = pgTable(
  "staff_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    type: credentialType("type").notNull(),
    title: text("title").notNull(),
    completedOn: date("completed_on").notNull(),
    expiresOn: date("expires_on"),
    hours: numeric("hours", { precision: 5, scale: 1 }),
    /** The trainer or instructor. A training record without one does not satisfy the licensor. */
    instructor: text("instructor"),
    /** Months until this record is due again, when the agency chooses (evaluations: 3 or 12). */
    renewMonths: integer("renew_months"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("credentials_staff_idx").on(t.staffId), check("credentials_date_order", sql`${t.expiresOn} is null or ${t.expiresOn} >= ${t.completedOn}`)],
);

// ---------- life plan goals ----------

/** Outcomes from the support plan, tracked with yes/no questions answered in every visit note. */
export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    /** Short category used for the icon: social, daily_living, health, community, employment, communication, other. */
    category: text("category").notNull().default("other"),
    /** The measurable outcome the support plan names, in one line: "Fewer than two refused doses a week". */
    outcome: text("outcome"),
    status: goalStatus("status").notNull().default("active"),
    startDate: date("start_date"),
    targetDate: date("target_date"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("goals_person_idx").on(t.personId)],
);

export const goalQuestions = pgTable(
  "goal_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("goal_questions_goal_idx").on(t.goalId)],
);

export const goalResponses = pgTable(
  "goal_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitId: uuid("visit_id")
      .notNull()
      .references(() => visits.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => goalQuestions.id, { onDelete: "cascade" }),
    response: goalResponse("response").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("goal_responses_visit_question_idx").on(t.visitId, t.questionId), index("goal_responses_question_idx").on(t.questionId)],
);

/**
 * A supervisor's periodic judgement of a goal. Goals without yes/no questions are measured only
 * this way; goals with questions get both. Insert-only: the history is the point.
 */
export const goalReviews = pgTable(
  "goal_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
    /** on_track | needs_attention | met | not_met */
    assessment: text("assessment").notNull(),
    note: text("note").notNull(),
  },
  (t) => [index("goal_reviews_goal_idx").on(t.goalId, t.reviewedAt)],
);
export type GoalReview = typeof goalReviews.$inferSelect;

// ---------- scheduling ----------

export const shifts = pgTable(
  "shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    serviceAgreementId: uuid("service_agreement_id")
      .notNull()
      .references(() => serviceAgreements.id),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: shiftStatus("status").notNull().default("scheduled"),
    note: text("note"),
    /** Why a cancelled shift was cancelled, and who called it off. The reference keeps a cancelled
     *  event on the schedule in red rather than deleting it, and so do we: the cancellation is the
     *  record, and a deleted row cannot answer "why was nobody there on Tuesday". */
    cancelledBy: text("cancelled_by"),
    cancelReasonId: uuid("cancel_reason_id"),
    cancelNote: text("cancel_note"),
    /** Shifts created together by "repeat weekly" share a series id. */
    seriesId: uuid("series_id"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("shifts_staff_start_idx").on(t.staffId, t.startAt), index("shifts_person_start_idx").on(t.personId, t.startAt), check("shifts_time_order", sql`${t.endAt} > ${t.startAt}`)],
);

// ---------- medications (245D.05) ----------

export const medications = pgTable(
  "medications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dose: text("dose").notNull(),
    route: text("route").notNull().default("oral"),
    /** Human frequency, e.g. "Twice daily". */
    frequency: text("frequency").notNull(),
    /** Scheduled clock times, 24h "HH:MM", one administration expected per time per day. */
    times: text("times").array().notNull().default(sql`'{}'::text[]`),
    instructions: text("instructions"),
    prescriber: text("prescriber"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("medications_person_idx").on(t.personId)],
);

export const medicationAdministrations = pgTable(
  "medication_administrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    medicationId: uuid("medication_id")
      .notNull()
      .references(() => medications.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    scheduledDate: date("scheduled_date").notNull(),
    scheduledTime: text("scheduled_time").notNull(),
    status: medAdminStatus("status").notNull(),
    givenAt: timestamp("given_at", { withTimezone: true }),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id),
    staffId: uuid("staff_id").references(() => staff.id),
    visitId: uuid("visit_id").references(() => visits.id),
    note: text("note"),
    ...timestamps,
  },
  (t) => [uniqueIndex("med_admin_slot_idx").on(t.medicationId, t.scheduledDate, t.scheduledTime), index("med_admin_person_date_idx").on(t.personId, t.scheduledDate)],
);

// ---------- audit log ----------

/** Postgres bytea. PGlite hands back Uint8Array, postgres-js hands back Buffer; storage.ts normalizes. */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({ dataType: () => "bytea" });

/** Uploaded files (service agreement letters, support plans). Stored in the database so every host is stateless and files are private behind login. */
export const storedFiles = pgTable(
  "stored_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    path: text("path").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    bytes: bytea("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("stored_files_path_idx").on(t.path)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: auditAction("action").notNull(),
    tableName: text("table_name").notNull(),
    recordId: text("record_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_record_idx").on(t.tableName, t.recordId), index("audit_at_idx").on(t.at)],
);

/**
 * The administrative record behind a person: the tables the Profile tab is a checklist of.
 *
 * Each one is a list rather than a column on `people`, because every one of them is genuinely
 * plural — a person has two emergency contacts, loses a waiver and gains another, is served at
 * home on weekdays and in the community at weekends.
 */

/** Emergency contacts. Replaces the single contact that used to live on `people`. */
export const clientContacts = pgTable(
  "client_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    relationship: text("relationship").notNull(),
    phone: text("phone"),
    email: text("email"),
    /** Ring this one first. */
    isPrimary: boolean("is_primary").notNull().default(false),
    /** True where the contact can make decisions, which changes who has to sign what. */
    isLegalRepresentative: boolean("is_legal_representative").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("client_contacts_person_idx").on(t.personId)],
);

/** Who pays, and in what order. */
export const clientFundingSources = pgTable(
  "client_funding_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    payer: text("payer").notNull(),
    waiver: waiverProgram("waiver"),
    memberId: text("member_id"),
    priority: fundingPriority("priority").notNull().default("primary"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("client_funding_person_idx").on(t.personId)],
);

/** Where this person is served, and the place-of-service code that goes on the claim. */
export const clientLocations = pgTable(
  "client_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    type: locationType("type").notNull().default("home"),
    label: text("label"),
    address1: text("address1"),
    address2: text("address2"),
    city: text("city"),
    state: text("state").notNull().default("MN"),
    zip: text("zip"),
    /** CMS place of service, e.g. 12 for the person's home. */
    posCode: text("pos_code").notNull().default("12"),
    isDefault: boolean("is_default").notNull().default(false),
    /** Geocoded point for the EVV geofence comparison. Null until someone sets it. */
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    /** Safe at Home / protected address: EVV records the visit without comparing coordinates. */
    protectedAddress: boolean("protected_address").notNull().default(false),
    /** Registered telephone line for IVR clock-ins from this location. */
    ivrPhone: text("ivr_phone"),
    ...timestamps,
  },
  (t) => [index("client_locations_person_idx").on(t.personId)],
);

/**
 * When a person is available to be scheduled. One row per weekday window, so a day can hold more
 * than one. The date range and time zone describe the whole schedule and are written identically
 * on every row, because the editor always saves the set together.
 */
/**
 * When a caregiver can work. Same shape as client availability, kept as its own table because the
 * two are edited from different records and the schedule reads them for different rows.
 */
export const staffAvailability = pgTable(
  "staff_availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    /** 0 = Sunday, matching Date.getDay() and the shift weekday picker. */
    weekday: integer("weekday").notNull(),
    /** 24h "HH:MM". */
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    timeZone: text("time_zone").notNull().default("America/Chicago"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("staff_availability_staff_idx").on(t.staffId)],
);
export type StaffAvailability = typeof staffAvailability.$inferSelect;

export const clientAvailability = pgTable(
  "client_availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    /** 0 = Sunday, matching Date.getDay() and the shift weekday picker. */
    weekday: integer("weekday").notNull(),
    /** 24h "HH:MM". */
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    /** The window these hours apply from and until. */
    startDate: date("start_date"),
    endDate: date("end_date"),
    /** IANA zone the times are written in. */
    timeZone: text("time_zone").notNull().default("America/Chicago"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("client_availability_person_idx").on(t.personId)],
);

/** Diagnoses, with the ICD-10 code a payer will ask for. */
export const clientDiagnoses = pgTable(
  "client_diagnoses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    icdCode: text("icd_code").notNull(),
    description: text("description").notNull(),
    diagnosedOn: date("diagnosed_on"),
    /** The one that justifies the service, printed first wherever diagnoses are listed. */
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("client_diagnoses_person_idx").on(t.personId)],
);

// ---------- inferred types ----------

export type Organization = typeof organizations.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type User = typeof users.$inferSelect;
export type Person = typeof people.$inferSelect;
export type Site = typeof sites.$inferSelect;
export type Program = typeof programs.$inferSelect;
export type ServiceAgreement = typeof serviceAgreements.$inferSelect;
export type Visit = typeof visits.$inferSelect;
export type VisitEdit = typeof visitEdits.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type ClientDocument = typeof clientDocuments.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type GoalQuestion = typeof goalQuestions.$inferSelect;
export type GoalResponse = typeof goalResponses.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type Medication = typeof medications.$inferSelect;
export type MedicationAdministration = typeof medicationAdministrations.$inferSelect;
export type DocumentCategory = (typeof documentCategory.enumValues)[number];
export type StaffCredential = typeof staffCredentials.$inferSelect;
export type CredentialType = (typeof credentialType.enumValues)[number];
export type ClientContact = typeof clientContacts.$inferSelect;
export type ClientFundingSource = typeof clientFundingSources.$inferSelect;
export type ClientLocation = typeof clientLocations.$inferSelect;
export type ClientAvailability = typeof clientAvailability.$inferSelect;
export type ClientDiagnosis = typeof clientDiagnoses.$inferSelect;
export type LocationType = (typeof locationType.enumValues)[number];
export type FundingPriority = (typeof fundingPriority.enumValues)[number];

// =====================================================================================
// Electronic Visit Verification (EVV) — canonical domain, isolated from the aggregator.
//
// Every table here carries `organization_id`: the host app is one organisation per database
// today, but the EVV domain is tenant-scoped on its own so a shared database later needs no
// restructuring and every query can be proven isolated. Nothing here uses HHAeXchange field
// names; the Minnesota adapter translates. The `visits` table (the 245D note) stays the source
// of truth for documentation; an EVV visit links to it and never replaces it.
// =====================================================================================

export const evvVisitStatus = pgEnum("evv_visit_status", ["planned", "in_progress", "awaiting_clock_in", "completed", "voided"]);
export const evvComplianceStatus = pgEnum("evv_compliance_status", ["COMPLIANT", "NONCOMPLIANT", "INCOMPLETE", "EXEMPT_LIVE_IN", "PENDING_REVIEW"]);
export const evvBillingReadiness = pgEnum("evv_billing_readiness", ["not_ready", "ready", "ready_with_warnings", "hold"]);
export const evvVerificationMethod = pgEnum("evv_verification_method", ["mobile", "ivr", "fob", "live_in", "manual", "imported", "other"]);
export const evvLocationType = pgEnum("evv_location_type", ["home", "community", "alternate", "protected"]);
export const evvLocationState = pgEnum("evv_location_state", ["captured", "inside_geofence", "outside_geofence", "community", "unavailable", "permission_denied", "accuracy_insufficient", "protected_address", "registered_location", "not_applicable"]);
export const evvEventType = pgEnum("evv_event_type", ["clock_in", "clock_out", "correction", "submission", "acknowledgment", "void", "review"]);
export const evvExceptionStatus = pgEnum("evv_exception_status", ["open", "acknowledged", "resolved", "waived"]);
export const evvSubmissionStatus = pgEnum("evv_submission_status", ["queued", "transmitting", "submitted", "accepted", "accepted_with_warning", "rejected", "retry_scheduled", "correction_required", "resubmitted", "permanently_failed", "blocked"]);
export const evvRejectionCategory = pgEnum("evv_rejection_category", ["transient", "authentication", "validation", "duplicate", "not_found", "configuration", "unknown"]);
export const evvUnitType = pgEnum("evv_unit_type", ["fifteen_minute", "hourly", "daily", "per_visit"]);

/** Per-tenant provider enrollment data the aggregator and DHS evaluate compliance against. */
export const evvProviderProfiles = pgTable(
  "evv_provider_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    legalName: text("legal_name").notNull(),
    federalTaxId: text("federal_tax_id").notNull(),
    /** Minnesota Medicaid (MHCP) provider ID. */
    medicaidProviderId: text("medicaid_provider_id"),
    /** Identifier HHAeXchange assigns the provider once enrolled. Null until onboarding completes. */
    hhaxProviderId: text("hhax_provider_id"),
    /** "third_party" (EVVora submits to the aggregator) or "hhax_direct" (provider uses HHAX's own tools). */
    evvSystem: text("evv_system").notNull().default("third_party"),
    /** Production submission is enabled only when this is true AND the environment is configured. */
    productionEnabled: boolean("production_enabled").notNull().default(false),
    timeZone: text("time_zone").notNull().default("America/Chicago"),
    state: text("state").notNull().default("MN"),
    ...timestamps,
  },
  (t) => [uniqueIndex("evv_provider_profiles_org_idx").on(t.organizationId)],
);
export type EvvProviderProfile = typeof evvProviderProfiles.$inferSelect;

/** Every NPI / UMPI the tax ID is associated with. DHS evaluates compliance across all of them. */
export const evvProviderIdentifiers = pgTable(
  "evv_provider_identifiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    type: staffIdType("type").notNull(),
    value: text("value").notNull(),
    label: text("label"),
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("evv_provider_identifiers_unique").on(t.organizationId, t.type, t.value), index("evv_provider_identifiers_org_idx").on(t.organizationId)],
);
export type EvvProviderIdentifier = typeof evvProviderIdentifiers.$inferSelect;

/** Payers and MCOs the provider bills; the aggregator wants the payer on every visit. */
export const evvPayers = pgTable(
  "evv_payers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** "medicaid_ffs" | "mco" | "other" */
    kind: text("kind").notNull().default("medicaid_ffs"),
    /** The payer's identifier at the aggregator, once known. */
    externalPayerId: text("external_payer_id"),
    isDefault: boolean("is_default").notNull().default(false),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("evv_payers_org_idx").on(t.organizationId)],
);
export type EvvPayer = typeof evvPayers.$inferSelect;

/**
 * State policy knobs. One row per (organisation, state). Nothing about compliance tolerance is
 * hardcoded: geofence distance, what "real time" means, the monthly deadline, and plausibility
 * bounds are all here so a DHS bulletin changes a row, not a release.
 */
export const evvPolicies = pgTable(
  "evv_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    state: text("state").notNull().default("MN"),
    geofenceMeters: integer("geofence_meters").notNull().default(500),
    /** GPS accuracy above this (metres) is treated as insufficient to place the caregiver. */
    maxAccuracyMeters: integer("max_accuracy_meters").notNull().default(200),
    /** Device time vs. server receipt beyond this many minutes is "not verified in real time". */
    realTimeToleranceMinutes: integer("real_time_tolerance_minutes").notNull().default(60),
    /** Device timestamps this far in the future relative to the server are implausible. */
    maxFutureSkewMinutes: integer("max_future_skew_minutes").notNull().default(10),
    /** Visits longer than this are implausible and go to review. */
    maxVisitMinutes: integer("max_visit_minutes").notNull().default(24 * 60),
    minVisitMinutes: integer("min_visit_minutes").notNull().default(1),
    /** Day of the month by which the previous month's visits and corrections must be submitted. */
    submissionDeadlineDay: integer("submission_deadline_day").notNull().default(14),
    /** How many days before the deadline the queue starts flagging visits. */
    deadlineWarningDays: integer("deadline_warning_days").notNull().default(5),
    /** Allow a live-in caregiver's daily entry to be captured outside real time. */
    liveInNonRealTimeAllowed: boolean("live_in_non_real_time_allowed").notNull().default(true),
    /** Hold billing (rather than warn) on noncompliant visits. */
    billingHoldOnNoncompliant: boolean("billing_hold_on_noncompliant").notNull().default(false),
    /** Retry schedule for aggregator submissions. */
    maxSubmissionAttempts: integer("max_submission_attempts").notNull().default(8),
    retryBaseSeconds: integer("retry_base_seconds").notNull().default(60),
    retryMaxSeconds: integer("retry_max_seconds").notNull().default(6 * 3600),
    /** Acknowledgments older than this without a result are "stuck". */
    ackTimeoutHours: integer("ack_timeout_hours").notNull().default(48),
    sourceUrl: text("source_url"),
    sourceNote: text("source_note"),
    ...timestamps,
  },
  (t) => [uniqueIndex("evv_policies_org_state_idx").on(t.organizationId, t.state)],
);
export type EvvPolicy = typeof evvPolicies.$inferSelect;

/**
 * Which service code + modifier combinations require EVV. Versioned: a change inserts a new row
 * with `supersedes_id` pointing at the old one rather than editing history.
 */
export const evvServiceRules = pgTable(
  "evv_service_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    state: text("state").notNull().default("MN"),
    /** Null = applies to every payer in the state. */
    payerId: uuid("payer_id").references(() => evvPayers.id, { onDelete: "set null" }),
    serviceCode: text("service_code").notNull(),
    /** Every modifier here must be present on the visit for the rule to match. */
    requiredModifiers: text("required_modifiers").array().notNull().default(sql`'{}'::text[]`),
    /** Any modifier here present on the visit means the rule does not match. */
    excludedModifiers: text("excluded_modifiers").array().notNull().default(sql`'{}'::text[]`),
    /** Whether "any modifiers" match (true) or the visit must carry exactly the required set (false). */
    allowAdditionalModifiers: boolean("allow_additional_modifiers").notNull().default(true),
    label: text("label").notNull(),
    requiresEvv: boolean("requires_evv").notNull().default(true),
    unitType: evvUnitType("unit_type").notNull().default("fifteen_minute"),
    sharedCare: boolean("shared_care").notNull().default(false),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    supersedesId: uuid("supersedes_id").references((): AnyPgColumn => evvServiceRules.id),
    sourceUrl: text("source_url"),
    sourceLabel: text("source_label"),
    sourceEffectiveDate: date("source_effective_date"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("evv_service_rules_org_code_idx").on(t.organizationId, t.serviceCode), index("evv_service_rules_active_idx").on(t.organizationId, t.active)],
);
export type EvvServiceRule = typeof evvServiceRules.$inferSelect;

/** A properly documented live-in caregiver relationship. Effective-dated; only this makes a visit EXEMPT_LIVE_IN. */
export const evvLiveInRelationships = pgTable(
  "evv_live_in_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    personId: uuid("person_id").notNull().references(() => people.id),
    staffId: uuid("staff_id").notNull().references(() => staff.id),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    /** Where the documentation lives (a staff document id, or a description). Required. */
    documentationRef: text("documentation_ref").notNull(),
    approvedBy: uuid("approved_by").references(() => users.id),
    note: text("note"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("evv_live_in_org_person_staff_idx").on(t.organizationId, t.personId, t.staffId), check("evv_live_in_date_order", sql`${t.effectiveTo} is null or ${t.effectiveTo} >= ${t.effectiveFrom}`)],
);
export type EvvLiveInRelationship = typeof evvLiveInRelationships.$inferSelect;

/** One shared-care service occurrence: one caregiver, several clients, explicit unit allocation. */
export const evvSharedCareGroups = pgTable(
  "evv_shared_care_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").notNull().references(() => staff.id),
    /** "equal" | "manual" — how units were split across the clients. */
    allocationMethod: text("allocation_method").notNull().default("equal"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("evv_shared_care_org_idx").on(t.organizationId)],
);

/**
 * The canonical EVV visit: the current projection of a visit's state. Every change to it is
 * also written as a row in evv_visit_versions, and the events that caused it live in
 * evv_events — this row is never the only record of what happened.
 */
export const evvVisits = pgTable(
  "evv_visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),

    // Provider identifiers, snapshotted so a later profile edit does not rewrite history.
    providerMedicaidId: text("provider_medicaid_id"),
    providerTaxId: text("provider_tax_id").notNull(),
    billingIdType: staffIdType("billing_id_type"),
    billingId: text("billing_id"),

    personId: uuid("person_id").notNull().references(() => people.id),
    memberId: text("member_id").notNull(),
    staffId: uuid("staff_id").notNull().references(() => staff.id),
    serviceAgreementId: uuid("service_agreement_id").references(() => serviceAgreements.id),
    shiftId: uuid("shift_id").references(() => shifts.id),
    /** The 245D note this visit documents, when one exists. Its signature state is not EVV state. */
    visitId: uuid("visit_id").references(() => visits.id),
    sharedCareGroupId: uuid("shared_care_group_id").references(() => evvSharedCareGroups.id),
    /** Units allotted to this client when part of a shared-care group. Null = not shared. */
    sharedCareUnitsAllocated: integer("shared_care_units_allocated"),

    serviceCode: text("service_code").notNull(),
    modifiers: text("modifiers").array().notNull().default(sql`'{}'::text[]`),
    payerId: uuid("payer_id").references(() => evvPayers.id),
    /** Which rule decided EVV is required (null when no rule matched → not required). */
    serviceRuleId: uuid("service_rule_id").references(() => evvServiceRules.id),
    evvRequired: boolean("evv_required").notNull().default(true),

    scheduledStartAt: timestamp("scheduled_start_at", { withTimezone: true }),
    scheduledEndAt: timestamp("scheduled_end_at", { withTimezone: true }),
    clockInAt: timestamp("clock_in_at", { withTimezone: true }),
    clockOutAt: timestamp("clock_out_at", { withTimezone: true }),
    clockInEventId: uuid("clock_in_event_id"),
    clockOutEventId: uuid("clock_out_event_id"),
    /** Minnesota date of service (the clock-in's local date), YYYY-MM-DD. */
    serviceDate: date("service_date"),
    timeZone: text("time_zone").notNull().default("America/Chicago"),
    durationMinutes: integer("duration_minutes"),
    units: integer("units"),
    unitType: evvUnitType("unit_type"),

    locationType: evvLocationType("location_type"),
    verificationMethod: evvVerificationMethod("verification_method"),
    liveIn: boolean("live_in").notNull().default(false),
    liveInRelationshipId: uuid("live_in_relationship_id").references(() => evvLiveInRelationships.id),
    sharedCare: boolean("shared_care").notNull().default(false),
    manualEntry: boolean("manual_entry").notNull().default(false),
    corrected: boolean("corrected").notNull().default(false),
    /** Set when the row was created by the backfill from historical `visits`; never treated as verified. */
    imported: boolean("imported").notNull().default(false),

    status: evvVisitStatus("status").notNull().default("planned"),
    complianceStatus: evvComplianceStatus("compliance_status").notNull().default("INCOMPLETE"),
    complianceReasons: text("compliance_reasons").array().notNull().default(sql`'{}'::text[]`),
    complianceEvaluatedAt: timestamp("compliance_evaluated_at", { withTimezone: true }),
    billingReadiness: evvBillingReadiness("billing_readiness").notNull().default("not_ready"),
    billingReasons: text("billing_reasons").array().notNull().default(sql`'{}'::text[]`),
    /** Rolled up from the latest submission so the queue can filter without a join. */
    submissionStatus: evvSubmissionStatus("submission_status"),
    externalReferenceId: text("external_reference_id"),
    /** Whether the aggregator still needs to hear about the latest version. */
    resubmissionRequired: boolean("resubmission_required").notNull().default(false),

    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => users.id),
    voidReason: text("void_reason"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id),

    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("evv_visits_org_idx").on(t.organizationId),
    index("evv_visits_org_service_date_idx").on(t.organizationId, t.serviceDate),
    index("evv_visits_org_staff_idx").on(t.organizationId, t.staffId),
    index("evv_visits_org_person_idx").on(t.organizationId, t.personId),
    index("evv_visits_org_compliance_idx").on(t.organizationId, t.complianceStatus),
    index("evv_visits_org_submission_idx").on(t.organizationId, t.submissionStatus),
    index("evv_visits_external_ref_idx").on(t.organizationId, t.externalReferenceId),
    index("evv_visits_visit_idx").on(t.visitId),
    index("evv_visits_status_idx").on(t.organizationId, t.status),
    check("evv_visits_clock_order", sql`${t.clockOutAt} is null or ${t.clockInAt} is null or ${t.clockOutAt} >= ${t.clockInAt}`),
    check("evv_visits_void_reason", sql`${t.status} <> 'voided' or ${t.voidReason} is not null`),
  ],
);
export type EvvVisit = typeof evvVisits.$inferSelect;

/** Immutable snapshot of an EVV visit at each version. Insert-only. */
export const evvVisitVersions = pgTable(
  "evv_visit_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    evvVisitId: uuid("evv_visit_id").notNull().references(() => evvVisits.id),
    version: integer("version").notNull(),
    /** The full visit row at this version, minus nothing: it is the record. */
    snapshot: jsonb("snapshot").notNull(),
    /** What produced this version: "clock_in" | "clock_out" | "correction" | "void" | "reconcile" | "import" | "evaluate". */
    cause: text("cause").notNull(),
    causedByEventId: uuid("caused_by_event_id"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("evv_visit_versions_unique").on(t.evvVisitId, t.version), index("evv_visit_versions_org_idx").on(t.organizationId)],
);

/**
 * Immutable EVV events: what a device or a person asserted, when. Insert-only; never updated,
 * never deleted. Coordinates are encrypted at rest (`location_encrypted`); the derived
 * classification next to them is what the compliance engine reads.
 */
export const evvEvents = pgTable(
  "evv_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    evvVisitId: uuid("evv_visit_id").notNull().references(() => evvVisits.id),
    /** Client-generated UUID for the event; the unit of idempotency across offline syncs. */
    eventId: uuid("event_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    type: evvEventType("type").notNull(),
    /** What the device's clock said when the caregiver pressed the button. Never overwritten. */
    deviceCapturedAt: timestamp("device_captured_at", { withTimezone: true }),
    /** The device's UTC offset at capture, in minutes (Central Daylight = -300). */
    deviceUtcOffsetMinutes: integer("device_utc_offset_minutes"),
    /** When the server received it. Differs from device time whenever the event was offline. */
    serverReceivedAt: timestamp("server_received_at", { withTimezone: true }).notNull().defaultNow(),
    /** The moment the event is taken to have happened, in UTC (device time unless implausible). */
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    /** AES-256-GCM of {lat,lng,accuracy}. Null when no fix was captured. */
    locationEncrypted: text("location_encrypted"),
    accuracyMeters: doublePrecision("accuracy_meters"),
    /** "gps" | "network" | "ivr" | "fob" | "manual" | "none" */
    locationSource: text("location_source"),
    locationType: evvLocationType("location_type"),
    locationState: evvLocationState("location_state").notNull().default("not_applicable"),
    distanceFromHomeMeters: doublePrecision("distance_from_home_meters"),
    /** Registered IVR line or FOB identifier, when those methods are used. */
    registeredLocationRef: text("registered_location_ref"),
    verificationMethod: evvVerificationMethod("verification_method").notNull(),
    deviceId: text("device_id"),
    offline: boolean("offline").notNull().default(false),
    /** True when the event reached the server later than the policy's real-time tolerance. */
    delayed: boolean("delayed").notNull().default(false),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorStaffId: uuid("actor_staff_id").references(() => staff.id),
    /** Non-PHI metadata the client sent (app version, OS, connectivity). Never coordinates. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    /** SHA-256 over the immutable fields, so tampering with a stored row is detectable. */
    integrityHash: text("integrity_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("evv_events_org_event_idx").on(t.organizationId, t.eventId),
    uniqueIndex("evv_events_org_idem_idx").on(t.organizationId, t.idempotencyKey),
    index("evv_events_visit_idx").on(t.evvVisitId),
    index("evv_events_org_staff_idx").on(t.organizationId, t.actorStaffId),
  ],
);
export type EvvEvent = typeof evvEvents.$inferSelect;

/** A correction to an EVV visit: original and corrected values kept side by side, forever. */
export const evvCorrections = pgTable(
  "evv_corrections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    evvVisitId: uuid("evv_visit_id").notNull().references(() => evvVisits.id),
    priorVersion: integer("prior_version").notNull(),
    resultingVersion: integer("resulting_version").notNull(),
    /** { field: { from, to } } for every changed field. */
    changes: jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>().notNull(),
    reasonCode: text("reason_code").notNull(),
    explanation: text("explanation").notNull(),
    correctedBy: uuid("corrected_by").notNull().references(() => users.id),
    correctedAt: timestamp("corrected_at", { withTimezone: true }).notNull().defaultNow(),
    makesNoncompliant: boolean("makes_noncompliant").notNull().default(true),
    resubmissionRequired: boolean("resubmission_required").notNull().default(true),
    eventId: uuid("event_id"),
  },
  (t) => [index("evv_corrections_visit_idx").on(t.evvVisitId), index("evv_corrections_org_idx").on(t.organizationId)],
);
export type EvvCorrection = typeof evvCorrections.$inferSelect;

/** Something a person needs to look at. Opened by the engine, closed by a reviewer, never deleted. */
export const evvExceptions = pgTable(
  "evv_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    evvVisitId: uuid("evv_visit_id").notNull().references(() => evvVisits.id),
    /** A reason code from the compliance engine or the ingestion service. */
    type: text("type").notNull(),
    /** "info" | "warning" | "error" */
    severity: text("severity").notNull().default("warning"),
    detail: text("detail"),
    status: evvExceptionStatus("status").notNull().default("open"),
    assignedTo: uuid("assigned_to").references(() => users.id),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    ...timestamps,
  },
  (t) => [index("evv_exceptions_org_status_idx").on(t.organizationId, t.status), index("evv_exceptions_visit_idx").on(t.evvVisitId), index("evv_exceptions_assigned_idx").on(t.assignedTo)],
);
export type EvvException = typeof evvExceptions.$inferSelect;

/** Internal reviewer comments on a visit. */
export const evvVisitComments = pgTable(
  "evv_visit_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    evvVisitId: uuid("evv_visit_id").notNull().references(() => evvVisits.id),
    authorUserId: uuid("author_user_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("evv_visit_comments_visit_idx").on(t.evvVisitId)],
);

/** One submission of one visit version to one aggregator. Resubmissions chain through `resubmission_of`. */
export const evvSubmissions = pgTable(
  "evv_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    evvVisitId: uuid("evv_visit_id").notNull().references(() => evvVisits.id),
    /** "hhax_mn" today; the adapter key. */
    aggregator: text("aggregator").notNull(),
    /** "mock" | "sandbox" | "production" */
    environment: text("environment").notNull(),
    visitVersion: integer("visit_version").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: evvSubmissionStatus("status").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    externalReferenceId: text("external_reference_id"),
    transportResult: text("transport_result"),
    rejectionCategory: evvRejectionCategory("rejection_category"),
    vendorRejectionCode: text("vendor_rejection_code"),
    rejectionMessage: text("rejection_message"),
    /** Warnings the aggregator returned with an acceptance. */
    warnings: jsonb("warnings").$type<string[]>(),
    resubmissionOf: uuid("resubmission_of").references((): AnyPgColumn => evvSubmissions.id),
    /** "create" | "update" | "void" */
    operation: text("operation").notNull().default("create"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("evv_submissions_idem_idx").on(t.organizationId, t.idempotencyKey),
    index("evv_submissions_visit_idx").on(t.evvVisitId),
    index("evv_submissions_org_status_idx").on(t.organizationId, t.status),
    index("evv_submissions_due_idx").on(t.status, t.nextAttemptAt),
    index("evv_submissions_external_idx").on(t.organizationId, t.externalReferenceId),
  ],
);
export type EvvSubmission = typeof evvSubmissions.$inferSelect;

/** Every attempt at delivery, whether or not it got through. Insert-only, no PHI. */
export const evvSubmissionAttempts = pgTable(
  "evv_submission_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id").notNull().references(() => evvSubmissions.id),
    attempt: integer("attempt").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    outcome: text("outcome").notNull(),
    transportResult: text("transport_result"),
    rejectionCategory: evvRejectionCategory("rejection_category"),
    vendorCode: text("vendor_code"),
    message: text("message"),
    /** SHA-256 of the outbound payload, so an attempt can be tied to bytes without storing PHI. */
    payloadHash: text("payload_hash"),
  },
  (t) => [index("evv_submission_attempts_submission_idx").on(t.submissionId)],
);

/**
 * Append-only EVV audit trail, hash-chained per visit: each row's hash covers the previous row's
 * hash, so a deleted or edited row breaks the chain. Details never carry coordinates or names.
 */
export const evvAuditEvents = pgTable(
  "evv_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    evvVisitId: uuid("evv_visit_id").references(() => evvVisits.id),
    action: text("action").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    details: jsonb("details").$type<Record<string, unknown>>(),
    previousHash: text("previous_hash"),
    hash: text("hash").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    /** Insertion order, so the chain is unambiguous even when two rows share a timestamp. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
  },
  (t) => [index("evv_audit_events_visit_idx").on(t.evvVisitId, t.seq), index("evv_audit_events_org_idx").on(t.organizationId, t.at)],
);
export type EvvAuditEvent = typeof evvAuditEvents.$inferSelect;
