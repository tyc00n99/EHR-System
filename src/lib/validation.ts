import { z } from "zod";

/** FormData → plain object. Empty strings become undefined so optional fields validate. */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string") continue;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      const arr = (out[key] as string[] | undefined) ?? [];
      arr.push(v);
      out[key] = arr;
    } else {
      out[k] = v.trim() === "" ? undefined : v;
    }
  }
  return out;
}

export type FieldErrors = Record<string, string>;

export function fieldErrors(err: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export interface ActionState {
  errors?: FieldErrors;
  message?: string;
}

const optionalText = z.string().max(200).optional();
const phone = z.string().regex(/^[0-9()\-.\s+]{7,20}$/, "Enter a valid phone number").optional();
const email = z.email("Enter a valid email").optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date");

export const WAIVERS = ["CADI", "BI", "DD", "EW", "CFSS", "CAC"] as const;
export const PERSON_STATUS = ["intake", "active", "discharged"] as const;
export const SITE_TYPES = ["office", "community_residential", "day_services", "in_home"] as const;

export const personSchema = z.object({
  firstName: z.string().min(1, "Required").max(100),
  lastName: z.string().min(1, "Required").max(100),
  preferredName: optionalText,
  dob: isoDate,
  pmi: z.string().regex(/^\d{8}$/, "PMI number is 8 digits"),
  waiverProgram: z.enum(WAIVERS),
  county: z.string().min(1, "Required"),
  caseManagerName: z.string().min(1, "Required"),
  caseManagerPhone: phone,
  caseManagerEmail: email,
  guardianName: optionalText,
  guardianRelationship: optionalText,
  guardianPhone: phone,
  guardianEmail: email,
  emergencyContactName: optionalText,
  emergencyContactRelationship: optionalText,
  emergencyContactPhone: phone,
  emergencyContactEmail: email,
  consultProviderName: optionalText,
  consultContactName: optionalText,
  consultPhone: phone,
  consultEmail: email,
  address1: optionalText,
  address2: optionalText,
  city: optionalText,
  state: z.string().length(2).default("MN"),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit ZIP").optional(),
  phone,
  email,
  status: z.enum(PERSON_STATUS).default("intake"),
  serviceStartDate: isoDate.optional(),
});

export const GENDERS = [
  ["female", "Female"],
  ["male", "Male"],
  ["nonbinary", "Non-binary"],
  ["other", "Other"],
  ["undisclosed", "Prefer not to say"],
] as const;

export const staffSchema = z
  .object({
    firstName: z.string().min(1, "Required").max(100),
    lastName: z.string().min(1, "Required").max(100),
    dob: isoDate,
    gender: z.enum(GENDERS.map((g) => g[0]) as ["female", "male", "nonbinary", "other", "undisclosed"], { message: "Required" }),
    /** Optional on edit (blank keeps the stored value); required on create, enforced in the action. */
    ssn: z
      .string()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v.length === 0 || v.length === 9, "SSN is 9 digits")
      .refine((v) => v.length === 0 || (!v.startsWith("000") && !v.startsWith("666") && !v.startsWith("9") && v.slice(3, 5) !== "00" && v.slice(5) !== "0000"), "That is not a valid SSN")
      .optional(),
    payRate: z.coerce.number().positive("Required").max(999.99),
    address1: z.string().min(1, "Required").max(200),
    address2: optionalText,
    city: z.string().min(1, "Required").max(100),
    state: z.string().length(2, "Two letters").default("MN"),
    zip: z.string().regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit ZIP"),
    email,
    phone,
    npi: z.string().regex(/^\d{10}$/, "NPI is 10 digits").optional(),
    umpi: z.string().regex(/^[A-Z0-9]{10}$/i, "UMPI is 10 characters").optional(),
    hireDate: isoDate,
    title: z.string().min(1, "Required"),
    active: z.coerce.boolean().default(true),
  })
  .refine((s) => s.npi || s.umpi, { message: "Enter an NPI or a UMPI", path: ["npi"] });

export const DOCUMENT_CATEGORIES = [
  ["support_plan", "Support plan (CSSP / support plan addendum)"],
  ["iapp", "Individual abuse prevention plan (IAPP)"],
  ["treatment_goals", "Treatment goals and outcomes"],
  ["other", "Other file"],
] as const;

export const clientDocumentSchema = z.object({
  category: z.enum(["support_plan", "iapp", "treatment_goals", "other"]),
  title: z.string().min(1, "Required").max(200),
  effectiveOn: isoDate.optional(),
  note: z.string().max(1000).optional(),
});

export const siteSchema = z.object({
  name: z.string().min(1, "Required"),
  type: z.enum(SITE_TYPES),
  licenseNumber: optionalText,
  address1: optionalText,
  address2: optionalText,
  city: optionalText,
  state: z.string().length(2).default("MN"),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit ZIP").optional(),
  phone,
});

export const programSchema = z.object({
  siteId: z.uuid(),
  serviceTypeId: z.string().min(1, "Choose a service type"),
  name: z.string().min(1, "Required"),
});

const modifier = z.string().regex(/^[A-Z0-9]{2}$/, "Modifiers are 2 characters");

export const agreementSchema = z
  .object({
    personId: z.uuid(),
    programId: z.uuid().optional(),
    agreementNumber: z.string().min(1, "Required"),
    serviceCode: z.string().trim().toUpperCase().regex(/^[A-Z]\d{4}$/, "Choose a service code"),
    modifiers: z.array(modifier).max(4, "At most four modifiers").default([]),
    authorizedUnits: z.coerce.number().int().positive("Must be more than 0"),
    unitRate: z.coerce.number().positive("Must be more than 0"),
    startDate: isoDate,
    endDate: isoDate,
    authorizingCounty: z.string().min(1, "Required"),
    documentPath: z.string().optional(),
    documentName: z.string().optional(),
  })
  .refine((a) => a.endDate >= a.startDate, { message: "End date must be on or after start", path: ["endDate"] });

const coord = z.coerce.number();

export const clockInSchema = z.object({
  personId: z.uuid(),
  serviceAgreementId: z.uuid(),
  placeOfService: z.string().regex(/^\d{2}$/, "Two-digit place of service"),
  lat: coord,
  lng: coord,
  accuracy: coord.optional(),
  tasks: z.array(z.string()).default([]),
});

export const clockOutSchema = z
  .object({
    visitId: z.uuid(),
    lat: coord,
    lng: coord,
    accuracy: coord.optional(),
    completedTasks: z.array(z.string()).default([]),
    shiftNote: z.string().min(1, "A shift note is required").max(4000),
    clientCode: z.string().regex(/^\d{6}$/, "The client code is 6 digits").optional(),
    unableToSign: z.coerce.boolean().default(false),
    unableReason: z.string().max(500).optional(),
  })
  .refine((v) => v.unableToSign || v.clientCode, { message: "Ask the client to enter their signing code, or mark them unable to sign.", path: ["clientCode"] })
  .refine((v) => !v.unableToSign || (v.unableReason && v.unableReason.trim().length >= 5), { message: "Explain why the client could not sign.", path: ["unableReason"] });

const isoDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Use a date and time");

export const manualVisitSchema = z
  .object({
    personId: z.uuid(),
    staffId: z.uuid(),
    serviceAgreementId: z.uuid(),
    placeOfService: z.string().regex(/^\d{2}$/, "Two-digit place of service"),
    clockInAt: isoDateTime,
    clockOutAt: isoDateTime,
    clockInLat: coord,
    clockInLng: coord,
    clockOutLat: coord,
    clockOutLng: coord,
    manualEntryReason: z.string().min(5, "Explain why this visit is being entered manually").max(1000),
    shiftNote: z.string().min(1, "A shift note is required").max(4000),
  })
  .refine((v) => v.clockOutAt > v.clockInAt, { message: "Clock-out must be after clock-in", path: ["clockOutAt"] });

export const visitEditSchema = z
  .object({
    visitId: z.uuid(),
    clockInAt: isoDateTime,
    clockOutAt: isoDateTime,
    placeOfService: z.string().regex(/^\d{2}$/, "Two-digit place of service"),
    shiftNote: z.string().min(1, "A shift note is required").max(4000),
    reason: z.string().min(5, "Explain why this visit is being edited").max(1000),
  })
  .refine((v) => v.clockOutAt > v.clockInAt, { message: "Clock-out must be after clock-in", path: ["clockOutAt"] });

export const PLACES_OF_SERVICE = [
  { code: "12", label: "Home" },
  { code: "14", label: "Group home" },
  { code: "99", label: "Other / community" },
  { code: "11", label: "Office" },
  { code: "04", label: "Homeless shelter" },
  { code: "33", label: "Custodial care facility" },
  { code: "03", label: "School" },
] as const;

export const DEFAULT_TASKS = [
  { code: "adl", label: "Personal care / ADLs" },
  { code: "meds", label: "Medication support" },
  { code: "meal", label: "Meal preparation" },
  { code: "community", label: "Community integration" },
  { code: "skills", label: "Skill building per support plan" },
  { code: "transport", label: "Transportation" },
  { code: "household", label: "Household tasks" },
] as const;

export const CREDENTIAL_TYPE_VALUES = ["background_study", "orientation", "maltreatment_reporting", "annual_training", "first_aid", "cpr", "drivers_license", "auto_insurance", "other"] as const;

export const credentialSchema = z
  .object({
    staffId: z.uuid(),
    type: z.enum(CREDENTIAL_TYPE_VALUES),
    title: z.string().min(1, "Required").max(200),
    completedOn: isoDate,
    expiresOn: isoDate.optional(),
    hours: z.coerce.number().min(0).max(999).optional(),
    note: z.string().max(1000).optional(),
  })
  .refine((c) => !c.expiresOn || c.expiresOn >= c.completedOn, { message: "Expiry must be after completion", path: ["expiresOn"] });

export const loginSchema = z.object({
  staffId: z.uuid(),
  email: z.email("Enter a valid email"),
  role: z.enum(["admin", "supervisor", "dsp"]),
  password: z.string().min(10, "Use at least 10 characters"),
});

export const passwordChangeSchema = z
  .object({
    current: z.string().min(1, "Required"),
    next: z.string().min(10, "Use at least 10 characters").max(200),
    confirm: z.string(),
  })
  .refine((p) => p.next === p.confirm, { message: "Passwords do not match", path: ["confirm"] });

export const documentationSchema = z.object({
  visitId: z.uuid(),
  interactionLevel: z.enum(["low", "medium", "high"]).optional(),
  skills: z.array(z.string().max(60)).max(20).default([]),
  shiftNote: z.string().max(6000).default(""),
  staffSign: z.coerce.boolean().default(false),
});

export const goalSchema = z.object({
  title: z.string().min(1, "Required").max(200),
  description: z.string().max(1000).optional(),
  category: z.string().min(1).max(40).default("other"),
  startDate: isoDate.optional(),
  targetDate: isoDate.optional(),
  questions: z.array(z.string().min(3).max(300)).min(1, "Add at least one yes/no question").max(8),
});

export const shiftSchema = z
  .object({
    personId: z.uuid(),
    staffId: z.uuid(),
    serviceAgreementId: z.uuid(),
    date: isoDate,
    start: z.string().regex(/^\d{2}:\d{2}$/, "Start time"),
    end: z.string().regex(/^\d{2}:\d{2}$/, "End time"),
    repeatWeeks: z.coerce.number().int().min(1).max(26).default(1),
    note: z.string().max(500).optional(),
  })
  .refine((s) => s.end > s.start, { message: "End must be after start", path: ["end"] });

export const medicationSchema = z
  .object({
    name: z.string().min(1, "Required").max(120),
    dose: z.string().min(1, "Required").max(80),
    route: z.string().min(1).max(40).default("oral"),
    frequency: z.string().min(1, "Required").max(80),
    times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1, "Add at least one time").max(6),
    instructions: z.string().max(500).optional(),
    prescriber: z.string().max(120).optional(),
    startDate: isoDate,
    endDate: isoDate.optional(),
  })
  .refine((m) => !m.endDate || m.endDate >= m.startDate, { message: "End must be after start", path: ["endDate"] });

export const medAdminSchema = z.object({
  medicationId: z.uuid(),
  personId: z.uuid(),
  scheduledDate: isoDate,
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/),
  status: z.enum(["given", "refused", "held", "missed"]),
  note: z.string().max(500).optional(),
  visitId: z.uuid().optional(),
});
