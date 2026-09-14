import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CREDENTIAL_TYPE_VALUES, WAIVERS } from "@/lib/validation";

/**
 * Document reading (OCR) for the paper that enters the agency: training certificates, DHS
 * background-study letters, referral packets, support plans. The model looks at the page — a
 * real PDF, a scan, or a phone photo — and returns two things: the full text, which is stored
 * beside the file so it can be searched, and the fields a form would otherwise be retyped from.
 *
 * Nothing here writes to the database. A read produces a *draft*; a person confirms it and the
 * audit log records that person as the actor. Every field is nullable and the prompts say to
 * return null rather than guess, because a wrong date on a personnel file is worse than a blank.
 */

export const MODEL = "claude-opus-5";
/** Stored text is capped so one 80-page packet cannot bloat a row. Search covers the first part. */
export const TEXT_CAP = 60_000;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

/** Whether the model can look at this file at all. Word documents and HEIC photos cannot be sent. */
export function readable(mimeType: string, fileName = ""): boolean {
  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) return true;
  return (IMAGE_TYPES as readonly string[]).includes(mimeType);
}

function source(bytes: Uint8Array, mimeType: string, fileName: string): Anthropic.Messages.ContentBlockParam {
  const data = Buffer.from(bytes).toString("base64");
  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  return { type: "image", source: { type: "base64", media_type: mimeType as ImageType, data } };
}

function client() {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic({ defaultHeaders: workspace ? { "anthropic-workspace-id": workspace } : undefined });
}

const TRANSCRIPTION = `You transcribe documents for a Minnesota 245D home-care agency's records. Reproduce the text of the document faithfully, in reading order, keeping headings and table rows on their own lines. Include handwritten text where it is legible and mark anything you cannot read as [illegible]. Do not summarise inside the transcription and do not add anything that is not on the page.`;

/* ---------- plain transcription: the searchable text layer ---------- */

const Transcription = z.object({
  text: z.string().describe("The full text of the document, in reading order"),
  summary: z.string().describe("One sentence saying what the document is, e.g. 'Red Cross First Aid certificate for Sam Nguyen, valid to 2027-03-01'"),
  language: z.string().nullable().describe("Language of the document if not English"),
});
export type Transcription = z.infer<typeof Transcription>;

export async function transcribeDocument(bytes: Uint8Array, mimeType: string, fileName: string): Promise<Transcription> {
  const response = await client().messages.parse({
    model: MODEL,
    max_tokens: 16_000,
    system: TRANSCRIPTION,
    messages: [{ role: "user", content: [source(bytes, mimeType, fileName), { type: "text", text: "Transcribe this document and say in one sentence what it is." }] }],
    output_config: { format: zodOutputFormat(Transcription) },
  });
  if (!response.parsed_output) throw new Error("The document could not be read.");
  return { ...response.parsed_output, text: response.parsed_output.text.slice(0, TEXT_CAP) };
}

/* ---------- personnel file: a certificate, a DHS letter, a signed form ---------- */

export const CredentialRead = z.object({
  text: z.string().describe("The full text of the document, in reading order"),
  summary: z.string().describe("One sentence saying what the document is"),
  documentType: z.enum(CREDENTIAL_TYPE_VALUES).nullable().describe("Which personnel-file item this document is evidence for, or null if unclear"),
  personName: z.string().nullable().describe("The employee or trainee the document is about, as printed"),
  title: z.string().nullable().describe("The course, certificate or form name as printed, e.g. 'Vulnerable Adults Act training'"),
  completedOn: z.string().nullable().describe("Date the training was completed, the form was signed, the study was submitted, or the results were issued — YYYY-MM-DD"),
  expiresOn: z.string().nullable().describe("Expiry or 'valid through' date, YYYY-MM-DD, if printed"),
  hours: z.number().nullable().describe("Training hours or contact hours, if printed"),
  instructor: z.string().nullable().describe("Trainer, instructor, or signing supervisor, if named"),
  issuer: z.string().nullable().describe("The organisation that issued it, e.g. 'American Red Cross', 'Minnesota DHS'"),
  certificateNumber: z.string().nullable().describe("Certificate, licence, or study number, if printed"),
  backgroundResult: z.enum(["cleared", "disqualified", "set_aside", "pending", "other"]).nullable().describe("For a DHS background-study letter only: the determination"),
  notes: z.string().nullable().describe("Anything a reviewer should double-check: an unreadable date, two dates, a name that differs"),
});
export type CredentialRead = z.infer<typeof CredentialRead>;

const CREDENTIAL_SYSTEM = `${TRANSCRIPTION}

You also extract the facts a 245D personnel file records from this document. The file's items are:
application (completed employment application), duties_acknowledgment (signed job description or duties acknowledgment), position_requirements (proof the person meets the position's qualifications: diploma, resume, licence), qualifications (documentation of qualifications), orientation (orientation training record, 245D.09 subd. 4), maltreatment_reporting (Vulnerable Adults Act / maltreatment reporting training), annual_training (annual in-service training, 245D.09 subd. 5), evaluation (performance evaluation), background_study (background study consent or NETStudy submission), background_study_results (DHS background study determination letter), first_supervised_contact and first_unsupervised_contact (record of first direct contact with a person served), drivers_license, other.
Dates must be YYYY-MM-DD. Use null for anything that is not printed. Never infer an expiry date from a completion date.`;

export async function readCredentialDocument(bytes: Uint8Array, mimeType: string, fileName: string, expectedType?: string | null): Promise<CredentialRead> {
  const hint = expectedType ? ` The agency is recording it as "${expectedType}"; say in documentType what it actually appears to be.` : "";
  const response = await client().messages.parse({
    model: MODEL,
    max_tokens: 16_000,
    system: CREDENTIAL_SYSTEM,
    messages: [{ role: "user", content: [source(bytes, mimeType, fileName), { type: "text", text: `Transcribe this document and extract the personnel-file fields.${hint}` }] }],
    output_config: { format: zodOutputFormat(CredentialRead) },
  });
  if (!response.parsed_output) throw new Error("The document could not be read.");
  return { ...response.parsed_output, text: response.parsed_output.text.slice(0, TEXT_CAP) };
}

/* ---------- client intake: a referral packet, a support plan, a prior record ---------- */

// Structured outputs allow at most 16 nullable fields per schema, and intake has more than that,
// so its strings are plain — empty means "not printed" — and are turned into nulls after parsing.
const blank = (d: string) => z.string().describe(`${d}; empty if not printed`);
const IntakeRaw = z.object({
  text: z.string().describe("The full text of the document, in reading order"),
  summary: z.string().describe("One sentence saying what the document is"),
  firstName: blank("First name"),
  lastName: blank("Last name"),
  preferredName: blank("Preferred name or nickname"),
  dob: blank("Date of birth, YYYY-MM-DD"),
  sexAtBirth: z.enum(["", "female", "male", "nonbinary", "other", "undisclosed"]).describe("Sex at birth; empty if not printed"),
  pmi: blank("The 8-digit PMI / recipient ID, digits only"),
  waiverProgram: z.enum(["", ...WAIVERS]).describe("CADI, BI, DD, EW, CFSS or CAC if the waiver is named; empty otherwise"),
  county: blank("County of residence or the county issuing the referral"),
  serviceStartDate: blank("Requested or planned service start date, YYYY-MM-DD"),
  address1: blank("Street address"),
  address2: blank("Apartment or unit"),
  city: blank("City"),
  state: blank("Two-letter state"),
  zip: blank("ZIP code"),
  phone: blank("The person's phone"),
  email: blank("The person's email"),
  caseManagerName: blank("County or lead-agency case manager"),
  caseManagerPhone: blank("Case manager phone"),
  caseManagerEmail: blank("Case manager email"),
  guardianName: blank("Guardian or legal representative"),
  guardianRelationship: blank("Guardian's relationship to the person"),
  guardianPhone: blank("Guardian phone"),
  guardianEmail: blank("Guardian email"),
  emergencyContactName: blank("Emergency contact"),
  emergencyContactRelationship: blank("Emergency contact's relationship to the person"),
  emergencyContactPhone: blank("Emergency contact phone"),
  emergencyContactEmail: blank("Emergency contact email"),
  diagnoses: z.array(z.object({ code: blank("ICD-10 code"), description: z.string() })).describe("Diagnoses listed, for the Medical information section"),
  medications: z.array(z.string()).describe("Medications listed by name and dose, if any"),
  notes: blank("Anything a reviewer should double-check or that has no field: allergies, behaviours, a second address"),
});

type Raw = z.infer<typeof IntakeRaw>;
type Nulled<T> = { [K in keyof T]: T[K] extends string ? string | null : T[K] };
export type IntakeRead = Omit<Nulled<Raw>, "text" | "summary" | "diagnoses" | "sexAtBirth" | "waiverProgram"> & {
  text: string; summary: string;
  sexAtBirth: Exclude<Raw["sexAtBirth"], ""> | null;
  waiverProgram: Exclude<Raw["waiverProgram"], ""> | null;
  diagnoses: { code: string | null; description: string }[];
};

function nulled(raw: Raw): IntakeRead {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = typeof v === "string" && k !== "text" && k !== "summary" ? (v.trim() || null) : v;
  out.diagnoses = raw.diagnoses.map((d) => ({ code: d.code.trim() || null, description: d.description }));
  return out as IntakeRead;
}

const INTAKE_SYSTEM = `${TRANSCRIPTION}

You also extract the facts a Minnesota 245D provider records at intake from a referral packet, a coordinated services and support plan (CSSP), a county referral form, or a prior provider's record. The PMI (also printed as Recipient ID or MA number) is 8 digits. The case manager is the county or lead-agency worker. The guardian is the legal representative, if the person has one. Dates must be YYYY-MM-DD. Phone numbers as printed. Use null for anything that is not printed; never invent a value to fill a field.`;

export async function readIntakeDocument(bytes: Uint8Array, mimeType: string, fileName: string): Promise<IntakeRead> {
  const response = await client().messages.parse({
    model: MODEL,
    max_tokens: 16_000,
    system: INTAKE_SYSTEM,
    messages: [{ role: "user", content: [source(bytes, mimeType, fileName), { type: "text", text: "Transcribe this document and extract the intake fields." }] }],
    output_config: { format: zodOutputFormat(IntakeRaw) },
  });
  if (!response.parsed_output) throw new Error("The document could not be read.");
  const read = nulled(response.parsed_output);
  return { ...read, text: read.text.slice(0, TEXT_CAP) };
}

/** Does the name on a document plausibly belong to this person? Loose on purpose: "NGUYEN, SAM" vs "Sam Nguyen". */
export function nameMatches(onDocument: string | null | undefined, first: string, last: string): boolean | null {
  if (!onDocument?.trim()) return null;
  const words = onDocument.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  return words.includes(first.toLowerCase()) && words.includes(last.toLowerCase());
}
