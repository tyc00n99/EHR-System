/**
 * Core model for Month 1. Postgres via Drizzle. Every table that holds
 * protected health information is written only through `src/db/audited.ts`.
 */
import { sql } from "drizzle-orm";
import {
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

export const documentCategory = pgEnum("document_category", ["support_plan", "iapp", "treatment_goals", "other"]);

export const goalStatus = pgEnum("goal_status", ["active", "met", "discontinued"]);
export const goalResponse = pgEnum("goal_response", ["yes", "no", "na"]);
export const interactionLevel = pgEnum("interaction_level", ["low", "medium", "high"]);
export const shiftStatus = pgEnum("shift_status", ["scheduled", "in_progress", "completed", "cancelled", "missed"]);
export const medAdminStatus = pgEnum("med_admin_status", ["given", "refused", "held", "missed"]);

export const credentialType = pgEnum("credential_type", [
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
  ...timestamps,
});

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
    signatureCodeSetAt: timestamp("signature_code_set_at", { withTimezone: true }),
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
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id),
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
