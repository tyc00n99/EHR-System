/**
 * Seeds sample data into the configured database (local PGlite, or DATABASE_URL). Run with `npm run db:seed`.
 *
 * Deliberately small: one organisation, one admin login (Mustafa Ali) and one caregiver (Sam
 * Nguyen, days; Amara Okafor, overnights), and one client (Harold Lindqvist, early-onset Alzheimer's)
 * whose record is complete in every section — contacts,
 * funding, locations with a geocoded home, availability, diagnoses, agreements, goals, medications,
 * documents, a signing code, six weeks of notes — plus the EVV records those notes produce, built
 * through the real EVV services so the queue, the compliance report and the integration screen all
 * have something honest to show. Sample data only. No real client information belongs in this file.
 *
 * The admin password is `changeme-245d` unless SEED_ADMIN_PASSWORD is set.
 *
 * SEED_REUSE=1 seeds into a database that already holds an organisation, the admin login and the
 * EVV configuration (after a targeted wipe of everything else): the organisation row, the EVV
 * provider profile/identifiers/policy/rules and the admin@example.com user and staff rows are kept
 * and everything else is created around them.
 */
import { existsSync, readFileSync } from "node:fs";
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db/index";
import { audited } from "../src/db/audited";
import { MockAggregatorAdapter, outcomes } from "../src/evv/adapters/mock";
import { ensureEvvDefaults, makeCtx } from "../src/evv/context";
import { correctVisit } from "../src/evv/corrections";
import { clockIn, clockOut } from "../src/evv/ingest";
import { derivedEventId } from "../src/evv/shared-care";
import { processQueue } from "../src/evv/submission";
import { utcOffsetMinutes } from "../src/evv/time";
import { createVisit } from "../src/evv/visits";
import { encryptField } from "../src/lib/crypto";
import { hashPassword } from "../src/lib/password";
import { putFile } from "../src/lib/storage";
import { activitiesFor, skillsFor } from "../src/lib/templates";

const { organizations, staff, users, people, sites, programs, serviceAgreements, assignments, staffCredentials, staffDocuments, staffAvailability, visits, goals, goalQuestions, goalResponses, shifts, medications, medicationAdministrations, clientContacts, clientFundingSources, clientLocations, clientAvailability, clientDiagnoses, clientDocuments } = schema;

const PASSWORD = process.env.SEED_ADMIN_PASSWORD?.trim() || "changeme-245d";
const HOME = { lat: 44.9778, lng: -93.265 }; // Harold's home, north Minneapolis (sample coordinates)
const CLIENT_CODE = "482113";

/** A tiny valid PDF so every filed document opens. */
const samplePdf = (title: string) => new TextEncoder().encode(`%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length ${title.length + 50}>>stream\nBT /F1 16 Tf 72 720 Td (${title.replace(/[()\\]/g, "")} - sample) Tj ET\nendstream\nendobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`);

const chicago = (iso: string, hour: number) => new Date(`${iso}T${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.round((hour % 1) * 60)).padStart(2, "0")}:00${utcOffsetMinutes(new Date(iso + "T12:00:00Z")) === -300 ? "-05:00" : "-06:00"}`);
const days = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function main() {
  const db = await getDb();
  const reuse = process.env.SEED_REUSE === "1";
  const [existingOrg] = await db.select().from(organizations).limit(1);
  if (existingOrg && !reuse) { console.log("Database already seeded. Run `npm run db:reset` to start over, or SEED_REUSE=1 after a targeted wipe."); return; }
  if (reuse && (await db.select().from(people).limit(1)).length) { console.log("SEED_REUSE=1 needs an empty client table. Wipe first."); process.exit(1); }
  const w = audited(db, { userId: null });
  const today = todayIso();

  /* ---------- organisation ---------- */
  const org = existingOrg ?? (await w.insert(organizations, {
    name: "Sonder Homecare",
    taxId: "41-0000000",         // sample EIN — replace with the real one in Settings
    umpi: "A100000000",          // sample UMPI — replace with the MHCP-enrolled identifier
    licenseNumber: "1234567",
    address1: "100 Main St", city: "Minneapolis", zip: "55401", phone: "612-555-0100",
  }));
  await ensureEvvDefaults(db, org.id);
  if (!existingOrg) {
    const [profile] = await db.select().from(schema.evvProviderProfiles).where(eq(schema.evvProviderProfiles.organizationId, org.id));
    await w.update(schema.evvProviderProfiles, profile.id, { medicaidProviderId: org.umpi, legalName: "Sonder Homecare LLC" });
  }

  /* ---------- staff: the admin login, one daytime caregiver, one overnight caregiver ---------- */
  const ssn = (digits: string) => ({ ssnEncrypted: encryptField(digits), ssnLast4: digits.slice(-4) });
  const [keptAdminUser] = reuse ? await db.select().from(users).where(eq(users.email, "admin@example.com")) : [];
  const [keptAdmin] = keptAdminUser?.staffId ? await db.select().from(staff).where(eq(staff.id, keptAdminUser.staffId)) : [];
  const admin = keptAdmin ?? (await w.insert(staff, {
    firstName: "Mustafa", lastName: "Ali", dob: "1988-05-14", gender: "male", ...ssn("123456789"), payRate: "38.00",
    address1: "100 Main St", city: "Minneapolis", zip: "55401", umpi: "A100000001", hireDate: "2024-01-15", title: "Program director",
    email: "admin@example.com", phone: "612-555-0101",
  }));
  const sam = await w.insert(staff, {
    firstName: "Sam", lastName: "Nguyen", dob: "1999-03-22", gender: "nonbinary", ...ssn("345678901"), payRate: "19.75",
    address1: "2600 Nicollet Ave", address2: "Apt 3", city: "Minneapolis", zip: "55408", umpi: "A100000003", hireDate: "2025-06-10", title: "Direct support professional",
    email: "dsp@example.com", phone: "612-555-0103",
  });
  // Overnight staff: night supervision cannot be worked by the same person who does the days.
  const amara = await w.insert(staff, {
    firstName: "Amara", lastName: "Okafor", dob: "1994-11-30", gender: "female", ...ssn("456789012"), payRate: "21.00",
    address1: "77 Snelling Ave N", city: "St. Paul", zip: "55104", umpi: "A100000004", hireDate: "2025-09-01", title: "Direct support professional, overnight",
    email: "night@example.com", phone: "651-555-0104",
  });
  const hash = await hashPassword(PASSWORD);
  const adminUser = keptAdminUser ?? (await w.insert(users, { email: "admin@example.com", passwordHash: hash, role: "admin", staffId: admin.id }));
  const samUser = await w.insert(users, { email: "dsp@example.com", passwordHash: hash, role: "dsp", staffId: sam.id });
  const amaraUser = await w.insert(users, { email: "night@example.com", passwordHash: hash, role: "dsp", staffId: amara.id });
  for (const d of [1, 2, 3, 4, 5]) await w.insert(staffAvailability, { staffId: sam.id, weekday: d, startTime: "08:00", endTime: "17:00", startDate: "2026-01-01" });
  await w.insert(staffAvailability, { staffId: sam.id, weekday: 6, startTime: "09:00", endTime: "15:00", startDate: "2026-01-01" });
  for (const d of [0, 1, 2, 3, 4, 5, 6]) await w.insert(staffAvailability, { staffId: amara.id, weekday: d, startTime: "21:00", endTime: "23:59", startDate: "2026-01-01", notes: "Overnights; available until 7:00 the next morning" });

  /* ---------- personnel files: the licensor's thirteen items, each with its document ---------- */
  type CredType = (typeof staffCredentials.$inferInsert)["type"];
  const ITEMS: { type: CredType; title: string; category: (typeof staffDocuments.$inferInsert)["category"]; monthsAfterHire: number; instructor?: string; hours?: string; renewMonths?: number; expiresYears?: number; note?: string }[] = [
    { type: "application", title: "Completed employment application", category: "employment_form", monthsAfterHire: -1 },
    { type: "duties_acknowledgment", title: "Job description and duties acknowledgment", category: "policy_acknowledgment", monthsAfterHire: 0 },
    { type: "position_requirements", title: "Meets position requirements", category: "employment_form", monthsAfterHire: 0, note: "High school diploma on file; two years' experience per application" },
    { type: "qualifications", title: "Staff qualifications documentation", category: "employment_form", monthsAfterHire: 0 },
    { type: "orientation", title: "245D orientation to program requirements", category: "orientation", monthsAfterHire: 0, instructor: "Mustafa Ali", hours: "8.0" },
    { type: "maltreatment_reporting", title: "Vulnerable Adults Act and maltreatment reporting", category: "training_certificate", monthsAfterHire: 0, instructor: "Mustafa Ali", hours: "1.5", renewMonths: 12 },
    { type: "annual_training", title: "Dementia care, person-centered practices and positive supports", category: "training_certificate", monthsAfterHire: 4, instructor: "North Star Training Cooperative", hours: "12.0", renewMonths: 12 },
    { type: "evaluation", title: "Performance evaluation", category: "evaluation", monthsAfterHire: 12, renewMonths: 12 },
    { type: "background_study", title: "DHS NETStudy 2.0 submission", category: "background_study", monthsAfterHire: -1 },
    { type: "background_study_results", title: "DHS background study determination: cleared", category: "background_study", monthsAfterHire: 0 },
    { type: "first_supervised_contact", title: "First supervised direct contact", category: "orientation", monthsAfterHire: 0, note: "Harold Lindqvist · supervised by Mustafa Ali" },
    { type: "first_unsupervised_contact", title: "First unsupervised direct contact", category: "orientation", monthsAfterHire: 1, note: "Harold Lindqvist" },
    { type: "drivers_license", title: "MN Class D driver's licence", category: "license", monthsAfterHire: -12, expiresYears: 4 },
  ];
  const addMonths = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
  const personnelFile = async (row: typeof sam, uploadedBy: string) => {
    for (const it of ITEMS) {
      let completedOn = addMonths(row.hireDate, it.monthsAfterHire);
      if (it.renewMonths) { while (addMonths(completedOn, it.renewMonths) < today) completedOn = addMonths(completedOn, it.renewMonths); }
      if (completedOn > today) completedOn = today;
      const cred = await w.insert(staffCredentials, { staffId: row.id, type: it.type, title: it.title, completedOn, expiresOn: it.expiresYears ? addMonths(completedOn, it.expiresYears * 12) : null, hours: it.hours ?? null, instructor: it.instructor ?? null, renewMonths: it.renewMonths ?? null, note: it.note ?? null });
      const path = `staff/${row.id}/${cred.id}.pdf`;
      const bytes = samplePdf(`${it.title} - ${row.firstName} ${row.lastName}`);
      await putFile(path, bytes, "application/pdf");
      await w.insert(staffDocuments, { staffId: row.id, category: it.category, title: it.title, fileName: `${it.type}.pdf`, filePath: path, mimeType: "application/pdf", sizeBytes: bytes.byteLength, credentialId: cred.id, uploadedBy, extractedText: `${it.title}. ${row.firstName} ${row.lastName}. Completed ${completedOn}.${it.instructor ? ` Instructor: ${it.instructor}.` : ""}`, extractedAt: new Date(), extractionSummary: `${it.title} for ${row.firstName} ${row.lastName}, ${completedOn}.`, extractionModel: "seed" });
    }
  };
  await personnelFile(sam, adminUser.id);
  await personnelFile(amara, adminUser.id);
  await personnelFile(admin, adminUser.id);

  /* ---------- sites and programs ---------- */
  await w.insert(sites, { name: "Main office", type: "office", address1: "100 Main St", city: "Minneapolis", zip: "55401" });
  const home = await w.insert(sites, { name: "In-home services", type: "in_home", licenseNumber: "1234567" });
  const ihs = await w.insert(programs, { siteId: home.id, serviceTypeId: "ihs-without-training", name: "IHS without training" });
  const night = await w.insert(programs, { siteId: home.id, serviceTypeId: "night-supervision", name: "Night supervision" });
  const homemaker = await w.insert(programs, { siteId: home.id, serviceTypeId: "homemaker", name: "Homemaker with personal care" });
  const respite = await w.insert(programs, { siteId: home.id, serviceTypeId: "respite-in-home", name: "In-home respite" });

  /* ---------- the client: early-onset Alzheimer's, complete in every section ---------- */
  const harold = await w.insert(people, {
    firstName: "Harold", lastName: "Lindqvist", preferredName: "Hal", dob: "1963-02-08", sexAtBirth: "male", pmi: "12345678",
    waiverProgram: "CADI", county: "Hennepin", status: "active", serviceStartDate: "2026-07-01", medicationSupport: true,
    caseManagerName: "Dana Whitfield", caseManagerPhone: "612-555-0142", caseManagerEmail: "dwhitfield@hennepin.example",
    guardianName: "Ingrid Lindqvist", guardianRelationship: "Spouse · health care agent and POA", guardianPhone: "612-555-0177", guardianEmail: "ingrid.lindqvist@example.com",
    emergencyContactName: "Ingrid Lindqvist", emergencyContactRelationship: "Spouse", emergencyContactPhone: "612-555-0177", emergencyContactEmail: "ingrid.lindqvist@example.com",
    consultProviderName: "North Star Consultation Services", consultContactName: "Priya Raman", consultPhone: "651-555-0133", consultEmail: "praman@northstar.example",
    address1: "1420 Girard Ave N", city: "Minneapolis", state: "MN", zip: "55411", phone: "612-555-0150", email: "ingrid.lindqvist@example.com",
    smsConsent: true, smsConsentAt: new Date("2026-07-01T15:00:00Z"),
    signatureCodeHash: await hashPassword(CLIENT_CODE), signatureCodeEncrypted: encryptField(CLIENT_CODE), signatureCodeSetAt: new Date(),
    activityLibrary: [
      "Sorted and set up the weekly pill organizer with {name}, checking each dose against the MAR",
      "Cued {name} through the morning routine with the picture schedule: toileting, wash, dress, breakfast",
      "Walked the block with {name} after lunch; practiced the route home with landmarks",
      "Folded laundry together; {name} matched socks and named colours",
      "Looked through the family photo album and talked about the lake cabin",
      "Prepared lunch with {name} choosing between two options shown on plates",
      "Checked the door alarm and the stove knob covers before leaving",
      "Redirected {name} during a sundowning episode with music from the 1970s and a warm drink",
      "Reoriented {name} to the day and the calendar on the whiteboard",
      "Assisted {name} with a shower using the step-by-step cue cards",
    ],
  });
  await w.insert(clientContacts, { personId: harold.id, name: "Ingrid Lindqvist", relationship: "Spouse · health care agent and POA", phone: "(612) 555-0177", email: "ingrid.lindqvist@example.com", isPrimary: true, isLegalRepresentative: true, notes: "Manages the pharmacy refills; call her about any refused dose" });
  await w.insert(clientContacts, { personId: harold.id, name: "Erik Lindqvist", relationship: "Son", phone: "(612) 555-0163", email: "erik.lindqvist@example.com", isPrimary: false, isLegalRepresentative: false, notes: "Lives ten minutes away; covers Sunday nights" });
  await w.insert(clientFundingSources, { personId: harold.id, payer: "Minnesota Health Care Programs (MA)", waiver: "CADI", memberId: "12345678", priority: "primary", startDate: "2026-07-01", notes: "Waiver renewal due June 2027; 24-hour emergency assistance under review" });
  await w.insert(clientLocations, { personId: harold.id, type: "home", posCode: "12", label: "Home", address1: "1420 Girard Ave N", city: "Minneapolis", state: "MN", zip: "55411", isDefault: true, lat: HOME.lat, lng: HOME.lng, ivrPhone: "612-555-0150" });
  await w.insert(clientLocations, { personId: harold.id, type: "day_program", posCode: "99", label: "Lyngblomsten adult day program", address1: "1415 Almond Ave", city: "St. Paul", state: "MN", zip: "55108", isDefault: false, lat: 44.9724, lng: -93.1594 });
  for (const d of [1, 2, 3, 4, 5]) await w.insert(clientAvailability, { personId: harold.id, weekday: d, startTime: "08:00", endTime: "13:00", startDate: "2026-07-01", notes: "Adult day program Tue and Thu afternoons" });
  for (const d of [0, 1, 2, 3, 4, 5, 6]) await w.insert(clientAvailability, { personId: harold.id, weekday: d, startTime: "21:30", endTime: "23:59", startDate: "2026-07-01", notes: "Overnight supervision through 6:00" });
  await w.insert(clientAvailability, { personId: harold.id, weekday: 6, startTime: "10:00", endTime: "15:00", startDate: "2026-07-01" });
  await w.insert(clientDiagnoses, { personId: harold.id, icdCode: "G30.0", description: "Alzheimer's disease with early onset", diagnosedOn: "2024-09-18", isPrimary: true });
  await w.insert(clientDiagnoses, { personId: harold.id, icdCode: "F02.81", description: "Dementia in Alzheimer's disease with behavioral disturbance (wandering, sundowning)", diagnosedOn: "2025-11-04", isPrimary: false });
  await w.insert(clientDiagnoses, { personId: harold.id, icdCode: "I10", description: "Essential hypertension", diagnosedOn: "2019-03-02", isPrimary: false });
  await w.insert(clientDiagnoses, { personId: harold.id, icdCode: "E11.9", description: "Type 2 diabetes mellitus without complications", diagnosedOn: "2020-06-15", isPrimary: false });

  const sa = (programId: string, agreementNumber: string, serviceCode: string, modifiers: string[], authorizedUnits: number, unitRate: string) =>
    w.insert(serviceAgreements, { personId: harold.id, programId, agreementNumber, serviceCode, modifiers, authorizedUnits, unitRate, unitMinutes: 15, startDate: "2026-07-01", endDate: "2027-06-30", authorizingCounty: "Hennepin" });
  const saIhs = await sa(ihs.id, "SA-2026-00101", "S5135", ["UC"], 4200, "5.95");          // IHS without training, weekday mornings
  const saNight = await sa(night.id, "SA-2026-00102", "S5135", ["UA"], 12000, "2.10");       // night supervision, six nights a week
  const saHomemaker = await sa(homemaker.id, "SA-2026-00103", "S5130", ["TG"], 700, "4.95"); // homemaker with personal care, Tue/Thu
  const saRespite = await sa(respite.id, "SA-2026-00104", "S5150", [], 900, "5.10");         // in-home respite, Saturdays
  await w.insert(assignments, { staffId: sam.id, personId: harold.id, orientedOn: "2026-07-01" });
  await w.insert(assignments, { staffId: amara.id, personId: harold.id, orientedOn: "2026-09-02" });
  await w.insert(assignments, { staffId: admin.id, personId: harold.id, orientedOn: "2026-07-01" });

  for (const [category, title, effectiveOn, text] of [
    ["support_plan", "CSSP 2026–2027", "2026-07-01", "Coordinated services and support plan for Harold Lindqvist. Early-onset Alzheimer's disease. Services: IHS without training, night supervision, homemaker with personal care, in-home respite. Goals: medication taken as prescribed, morning routine with cueing, safe nights, meals and hydration, home kept safe, staying engaged. Case manager Dana Whitfield."],
    ["iapp", "IAPP signed 7/1/26", "2026-07-01", "Individual abuse prevention plan. Vulnerabilities: memory loss, wandering after dark, may refuse or double-take medications, cannot manage money or the stove safely. Supports: door alarm, stove knob covers, locked medication box with staff-managed MAR, staff present overnight."],
    ["treatment_goals", "Support plan goals, Q3 2026", "2026-07-01", "Medication management, personal care with cueing, night safety, nutrition and hydration, homemaking, engagement and orientation, spouse respite."],
    ["other", "Medication administration plan", "2026-07-01", "Donepezil 10 mg at bedtime; memantine 10 mg twice daily; metformin 500 mg with breakfast and dinner; lisinopril 10 mg each morning. Staff administer from the locked box and record every dose, refusal and hold. Hold metformin and call Ingrid if Harold has not eaten. Call the prescriber for two refusals of donepezil in a row."],
  ] as const) {
    const path = `clients/${harold.id}/${category}.pdf`;
    const bytes = samplePdf(title);
    await putFile(path, bytes, "application/pdf");
    await w.insert(clientDocuments, { personId: harold.id, category, title, fileName: `${category}.pdf`, filePath: path, mimeType: "application/pdf", sizeBytes: bytes.byteLength, effectiveOn, uploadedBy: adminUser.id, extractedText: text, extractedAt: new Date(), extractionSummary: title, extractionModel: "seed" });
  }

  /* ---------- goals: one per support area. Some carry yes/no questions staff answer on every note; ---------- */
  /* ---------- others are outcome-only and are judged at the supervisor's review.                  ---------- */
  const { goalReviews } = schema;
  const mkGoal = async (title: string, outcome: string, description: string, category: string, prompts: string[], targetDate: string | null = null) => {
    const g = await w.insert(goals, { personId: harold.id, title, outcome, description, category, status: "active", startDate: "2026-07-01", targetDate, createdBy: adminUser.id });
    const qs: { id: string; prompt: string; area: string }[] = [];
    for (const [i, prompt] of prompts.entries()) qs.push({ id: (await w.insert(goalQuestions, { goalId: g.id, prompt, sortOrder: i })).id, prompt, area: category });
    return { id: g.id, qs };
  };
  const review = (goalId: string, daysAgo: number, assessment: "on_track" | "needs_attention" | "met" | "not_met", note: string) =>
    w.insert(goalReviews, { goalId, reviewedBy: adminUser.id, reviewedAt: chicago(days(today, -daysAgo), 16), assessment, note });

  const gMeds = await mkGoal("Take every medication as prescribed", "Fewer than two refused doses a week, every week, by December", "Harold takes donepezil, memantine, metformin and lisinopril from the locked box at the scheduled times, with staff administering and recording each dose.", "health", ["Did Harold take every scheduled dose during this visit?", "Was any dose refused, missed or held? (No means every dose went as planned)", "Did staff check the pill organizer against the MAR?"], "2026-12-31");
  await review(gMeds.id, 35, "on_track", "Locked box and staff-administered MAR are working; one refusal in the past two weeks.");
  await review(gMeds.id, 7, "needs_attention", "Refusals are concentrated at bedtime — four of the last six were donepezil. Asked the memory clinic whether donepezil can move to the morning.");
  const gRoutine = await mkGoal("Complete the morning routine with cueing", "Morning routine finished with verbal cues only, no hands-on help, five days a week", "Toileting, washing, dressing and breakfast following the picture schedule, working toward needing fewer physical prompts.", "daily_living", ["Did Harold complete the morning routine with verbal cues only?", "Did Harold need hands-on help with any step?"]);
  await review(gRoutine.id, 21, "on_track", "Hands-on help now mostly limited to shaving and buttons. Keep the picture schedule where it is.");
  const gNight = await mkGoal("Stay safe through the night", "No unaccompanied exits; back in bed within fifteen minutes of getting up", "Harold sleeps through the night or, when he gets up, is redirected back to bed without leaving the house.", "safety", ["Did Harold stay inside the house all night?", "Did Harold get up more than twice?", "Was the door alarm armed and the stove secured at the start of the shift?"]);
  await review(gNight.id, 7, "on_track", "Two door-alarm events since overnight staff started, both redirected within minutes. No exits.");
  const gMeals = await mkGoal("Eat three meals and drink enough water", "Three meals and at least six glasses of water a day", "Staff offer choices between two options shown on plates; hydration prompted every hour.", "nutrition", ["Did Harold eat a full meal during this visit?", "Did Harold drink at least two glasses of water?"]);
  const gHome = await mkGoal("Keep the home safe and clean", "Kitchen, bathroom and bedroom clean; hazards, expired food and loose medications removed on every homemaker visit", "Cleaning products and medications locked away at the end of each visit.", "homemaking", ["Was the kitchen cleaned and hazards removed?", "Were medications and cleaning products locked away at the end of the visit?"]);
  await review(gHome.id, 14, "on_track", "Loose lisinopril tablets found in a kitchen drawer on Sep 1 and moved to the locked box; nothing since.");
  const gEngaged = await mkGoal("Stay oriented and engaged", "A familiar activity on every visit, and reorientation to the day and place with the whiteboard", "Music, the photo album or a walk; the whiteboard calendar is updated each morning.", "social", ["Did Harold take part in a familiar activity?", "Was Harold reoriented to the day and place?", "Was there a sundowning or agitation episode?"]);
  // Outcome-only goals: no questions on the notes; the supervisor judges them at review.
  const gRespite = await mkGoal("Give Ingrid a break every week", "Ingrid has four hours away from caregiving every Saturday", "Saturday in-home respite so Harold's wife can leave the house; judged from the respite notes at each review.", "family", []);
  await review(gRespite.id, 28, "on_track", "Respite delivered four of four Saturdays; Ingrid used two of them to see her sister.");
  await review(gRespite.id, 3, "on_track", "Five of the last six Saturdays. The missed one was Harold's clinic appointment, rescheduled to the Sunday.");
  const gSundown = await mkGoal("Reduce sundowning episodes", "Fewer than two agitation episodes a week by the end of November", "Evening routine starts at 6:30 with lights up, music from the 1970s and a warm drink; agitation is logged in the evening and overnight notes.", "behavioral", [], "2026-11-30");
  await review(gSundown.id, 20, "needs_attention", "Nine episodes in the last four weeks, most between 5 and 7pm. Starting the evening routine earlier and closing the blinds before dusk.");
  await review(gSundown.id, 4, "needs_attention", "Down to five episodes in the last two weeks since the earlier routine. Continue and review in two weeks.");
  const gMailbox = await mkGoal("Walk to the mailbox and back on his own", "Harold walks to the mailbox and returns without prompting, three times a week", "Practiced daily with staff a step behind, then from the porch, then from the window.", "community", []);
  await review(gMailbox.id, 26, "met", "Three unprompted trips this week and last. Moving to maintenance — staff watch from the window.");
  const questions = [gMeds, gRoutine, gNight, gMeals, gHome, gEngaged].flatMap((g) => g.qs);

  /* ---------- notes: six weeks of IHS mornings, six nights a week, homemaker Tue/Thu, respite Saturdays ---------- */
  const NOTES = {
    ihs: [
      "Morning routine with the picture schedule. Harold needed verbal cues for each step and hands-on help with shaving. Breakfast eaten fully. Morning meds: lisinopril and memantine taken; metformin taken after breakfast. Checked the pill organizer against the MAR — Ingrid had refilled Thursday's box twice, corrected it with her.",
      "Harold was anxious on arrival and asked for his mother three times. Reoriented with the whiteboard and the family photo album; settled by 9:40. Refused memantine at first, accepted it twenty minutes later with juice. Short walk around the block; Harold named the neighbour's dog. Lunch prepared together, ate about two-thirds.",
      "Good morning. Harold completed washing and dressing with cues only, no hands-on help. All morning medications taken on the first offer. Sorted the weekly pill organizer with Harold watching and naming the days. Practiced the route to the mailbox and back. Reminded Ingrid the donepezil refill is due Monday.",
      "Harold had been up at 3am (per overnight note) and was tired. Slower routine, needed help with buttons. Took lisinopril and memantine; metformin held because Harold ate only two bites of breakfast — called Ingrid per the medication plan, she agreed. Offered a second breakfast at 11:00 and he ate half a sandwich; metformin given then and recorded.",
      "Found two loose metformin tablets in Harold's shirt pocket from yesterday's dinner dose. Recorded as missed, told Ingrid, and moved the evening dose to the locked box with overnight staff administering. Morning routine completed with cues. Music from the 1970s during lunch prep; Harold sang along and was calm.",
    ],
    night: [
      "Arrived 10:00pm. Door alarm armed, stove knobs covered, medication box locked. Bedtime donepezil and memantine given at 10:15 and swallowed with water. Harold up once at 1:40am looking for the bathroom; guided there and back to bed. Slept until 5:50. No attempt to leave the house.",
      "Harold refused donepezil at bedtime, saying he had already taken it. Checked the MAR (he had not), waited fifteen minutes, offered again with a cup of tea; taken at 10:35. Up at 12:30 and again at 3:15, second time dressed and heading for the front door; door alarm sounded, redirected with music and a warm drink, back to bed by 3:45.",
      "Quiet night. Bedtime medications taken on the first offer. Harold slept 10:40pm to 5:30am without getting up. Ingrid slept in the guest room and reported she got her first full night in a week.",
      "Sundowning on arrival: Harold agitated, pacing, insisting he had to get to work. Sat with him on the porch for twenty minutes, then the photo album. Bedtime meds given at 11:05 after he settled. Up three times; guided back each time. Reported the pattern to Sam for the morning handoff.",
      "Harold had a mild hypoglycaemia symptom at 2am (sweaty, confused beyond baseline). Gave juice per the diabetes plan, rechecked at 2:30 and he was back to baseline. Recorded and texted Ingrid in the morning. Otherwise slept.",
    ],
    homemaker: [
      "Homemaker with personal care. Shower with the step-by-step cue cards; Harold managed washing with cues, staff helped with hair. Cleaned the bathroom and kitchen, discarded expired yoghurt and a mouldy loaf, ran and folded laundry. Locked the cleaning products and medication box before leaving.",
      "Bathing completed; Harold resisted stepping into the tub until the water was warmer, then fine. Changed bed linens, vacuumed, wiped the fridge shelves. Found lisinopril tablets in the kitchen drawer — moved them to the locked box and noted it for Ingrid and the MAR.",
      "Personal care and homemaking. Nail care and shave, then meal prep: portioned five lunches into labelled containers with a picture of the contents on each. Kitchen cleaned. Checked the smoke detector; battery replaced.",
    ],
    respite: [
      "Saturday respite so Ingrid could go to her sister's. Harold and staff walked to the park, looked at the photo album, and made grilled cheese for lunch. Noon meds (memantine) taken. One episode of asking for Ingrid, reassured with the note she left on the whiteboard. Ingrid back at 2:00.",
      "Respite while Ingrid was at church and lunch with friends. Music and a puzzle. Harold napped for an hour. Lunch eaten fully; drank three glasses of water. Calm handoff.",
    ],
  };
  type Sa = typeof saIhs;
  const seeded: { id: string; start: Date; end: Date; n: number; manual: boolean; community: boolean; offline: boolean; sa: Sa; staffRow: typeof sam; userId: string }[] = [];
  let n = 0;
  const seedVisit = async (sa: Sa, staffRow: typeof sam, userId: string, serviceTypeId: string, start: Date, minutes: number, note: string, flags: { manual?: boolean; offline?: boolean; unsigned?: boolean } = {}) => {
    const end = new Date(start.getTime() + minutes * 60000);
    const units = Math.floor(minutes / 15) + (minutes % 15 >= 8 ? 1 : 0);
    const pool = skillsFor(serviceTypeId);
    const jitter = () => (Math.random() - 0.5) * 0.0006; // ± ~30 m
    const activities = activitiesFor("Harold", harold.activityLibrary);
    const isNight = sa.id === saNight.id;
    const inserted = await w.insert(visits, {
      personId: harold.id, staffId: staffRow.id, serviceAgreementId: sa.id, programId: sa.programId,
      providerTaxId: org.taxId, pmi: harold.pmi, serviceCode: sa.serviceCode, modifiers: sa.modifiers, renderingIdType: "umpi", renderingId: staffRow.umpi!,
      placeOfService: "12", units, clockInAt: start, clockOutAt: end,
      clockInLat: HOME.lat + jitter(), clockInLng: HOME.lng + jitter(), clockInAccuracyM: 9, clockOutLat: HOME.lat + jitter(), clockOutLng: HOME.lng + jitter(), clockOutAccuracyM: 12,
      manualEntry: Boolean(flags.manual), manualEntryReason: flags.manual ? "Phone died at the door; times confirmed with Ingrid" : null,
      tasks: isNight ? [{ code: "safety", label: "Door alarm and stove secured", completed: true }, { code: "meds", label: "Bedtime medications", completed: true }] : [{ code: "adl", label: "Personal care / ADLs", completed: true }, { code: "meds", label: "Medication administration", completed: true }],
      shiftNote: note, interactionLevel: (["medium", "high", "high"] as const)[n % 3],
      skills: pool.length ? [pool[n % pool.length], pool[(n + 2) % pool.length]].filter((v, i, a) => a.indexOf(v) === i) : [],
      activities: isNight ? [activities[6], activities[n % 2 === 0 ? 7 : 8]] : [activities[n % 6], activities[(n * 7 + 3) % activities.length]].filter((x, i, a) => a.indexOf(x) === i),
      clientSignedAt: flags.unsigned || isNight ? null : new Date(end.getTime() + 60000), clientUnsignedReason: isNight ? "Asleep at end of shift; Ingrid signs the weekly summary" : flags.unsigned ? "Unable to sign today; spouse notified" : null,
      staffSignedAt: new Date(end.getTime() + 120000), noteSavedAt: new Date(end.getTime() + 120000), noteSavedBy: flags.manual ? adminUser.id : userId, noteSavedLat: HOME.lat, noteSavedLng: HOME.lng,
      approvedAt: new Date(end.getTime() + 120000), status: "completed", createdBy: flags.manual ? adminUser.id : userId, updatedBy: flags.manual ? adminUser.id : userId,
    });
    seeded.push({ id: inserted.id, start, end, n, manual: Boolean(flags.manual), community: false, offline: Boolean(flags.offline), sa, staffRow, userId });
    // Goal responses: each goal is answered on the visits where it applies, with medication misses showing up.
    for (const [i, q] of questions.entries()) {
      const applies = q.area === "safety" ? isNight : q.area === "homemaking" ? sa.id === saHomemaker.id || sa.id === saIhs.id : q.area === "family" ? sa.id === saRespite.id : !isNight || q.area === "health";
      if (!applies) continue;
      const bad = (n + i) % 6 === 0;
      const negativeIsGood = /refused|hands-on|more than twice|sundowning/i.test(q.prompt);
      await w.insert(goalResponses, { visitId: inserted.id, questionId: q.id, response: (n + i) % 13 === 0 ? "na" : negativeIsGood ? (bad ? "yes" : "no") : (bad ? "no" : "yes") });
    }
    n++;
  };
  const firstDay = days(today, -42);
  for (let d = 0; d <= 42; d++) {
    const day = days(firstDay, d);
    if (day >= today) break;
    const dow = new Date(day + "T12:00:00Z").getUTCDay();
    if (dow >= 1 && dow <= 5) await seedVisit(saIhs, sam, samUser.id, "ihs-without-training", chicago(day, 8), 240 + (n % 3) * 15, NOTES.ihs[n % NOTES.ihs.length], { manual: n % 13 === 7, offline: n % 9 === 5, unsigned: n % 17 === 11 });
    if (dow === 2 || dow === 4) await seedVisit(saHomemaker, sam, samUser.id, "homemaker", chicago(day, 13.5), 90, NOTES.homemaker[n % NOTES.homemaker.length]);
    if (dow === 6) await seedVisit(saRespite, sam, samUser.id, "respite-in-home", chicago(day, 10), 240, NOTES.respite[n % NOTES.respite.length]);
    if (dow !== 0 && day >= "2026-09-02") await seedVisit(saNight, amara, amaraUser.id, "night-supervision", chicago(day, 22), 480, NOTES.night[n % NOTES.night.length], { offline: n % 11 === 4 });
  }

  /* ---------- medications (245D.05) with a MAR that shows the management problem ---------- */
  const med = (name: string, dose: string, frequency: string, times: string[], instructions: string) => w.insert(medications, { personId: harold.id, name, dose, route: "oral", frequency, times, instructions, prescriber: "Dr. Okonkwo, Hennepin Healthcare Memory Clinic", startDate: "2026-07-01" });
  const donepezil = await med("Donepezil", "10 mg", "Once daily at bedtime", ["22:15"], "Give from the locked box; watch him swallow. Two refusals in a row: call the prescriber.");
  const memantine = await med("Memantine", "10 mg", "Twice daily", ["08:30", "22:15"], "May take with food. Do not double up after a missed dose.");
  const metformin = await med("Metformin", "500 mg", "Twice daily with meals", ["08:30", "18:00"], "Hold and call Ingrid if Harold has not eaten. Watch for sweating and confusion beyond baseline.");
  const lisinopril = await med("Lisinopril", "10 mg", "Every morning", ["08:30"], "Check he has not already taken one from an old bottle; report any loose tablets found.");
  const scheduleFor = (m: typeof donepezil) => m.times.map((t) => ({ t, who: Number(t.slice(0, 2)) >= 20 ? amara : sam, by: Number(t.slice(0, 2)) >= 20 ? amaraUser.id : samUser.id }));
  for (let i = 30; i >= 1; i--) {
    const date = days(today, -i);
    for (const [k, m] of [donepezil, memantine, metformin, lisinopril].entries()) {
      for (const { t, who, by } of scheduleFor(m)) {
        const x = i * 11 + k * 3 + Number(t.slice(0, 2));
        const status = x % 9 === 0 ? "refused" : x % 14 === 0 ? "missed" : x % 19 === 0 ? "held" : "given";
        const note = status === "refused" ? (m.id === donepezil.id ? "Said he had already taken it; offered again after 15 min, still refused" : "Refused, accepted 20 min later — recorded as refused per plan") : status === "missed" ? "Tablets found in shirt pocket the next morning" : status === "held" ? "Held: had not eaten; Ingrid called" : null;
        await w.insert(medicationAdministrations, { medicationId: m.id, personId: harold.id, scheduledDate: date, scheduledTime: t, status, givenAt: status === "given" ? chicago(date, Number(t.slice(0, 2)) + Number(t.slice(3)) / 60) : null, recordedBy: by, staffId: who.id, note });
      }
    }
  }

  /* ---------- shifts: last week completed, this and next week scheduled ---------- */
  for (let d = -7; d < 14; d++) {
    const date = days(today, d);
    const dow = new Date(date + "T12:00:00Z").getUTCDay();
    const past = date < today;
    const status = past ? "completed" : "scheduled";
    if (dow >= 1 && dow <= 5) await w.insert(shifts, { personId: harold.id, staffId: sam.id, serviceAgreementId: saIhs.id, startAt: chicago(date, 8), endAt: chicago(date, 12), status, createdBy: adminUser.id });
    if (dow === 2 || dow === 4) await w.insert(shifts, { personId: harold.id, staffId: sam.id, serviceAgreementId: saHomemaker.id, startAt: chicago(date, 13.5), endAt: chicago(date, 15), status, createdBy: adminUser.id });
    if (dow === 6) await w.insert(shifts, { personId: harold.id, staffId: sam.id, serviceAgreementId: saRespite.id, startAt: chicago(date, 10), endAt: chicago(date, 14), status, createdBy: adminUser.id });
    if (dow !== 0) await w.insert(shifts, { personId: harold.id, staffId: amara.id, serviceAgreementId: saNight.id, startAt: chicago(date, 22), endAt: new Date(chicago(date, 22).getTime() + 8 * 3_600_000), status, createdBy: adminUser.id });
  }

  /* ---------- EVV: the same notes, through the real services ---------- */
  const ev = (visitId: string, kind: "clock_in" | "clock_out", at: Date, v: (typeof seeded)[number]) => ({
    eventId: derivedEventId(visitId, kind), idempotencyKey: `web:${visitId}:${kind}`, deviceCapturedAt: at.toISOString(), deviceUtcOffsetMinutes: utcOffsetMinutes(at),
    latitude: HOME.lat + (Math.random() - 0.5) * 0.0006, longitude: HOME.lng + (Math.random() - 0.5) * 0.0006, accuracyMeters: kind === "clock_in" ? 9 : 12,
    locationSource: "gps" as const, locationType: "home" as const, verificationMethod: v.manual ? ("manual" as const) : ("mobile" as const),
    offline: v.offline, deviceId: `${v.staffRow.firstName.toLowerCase()}-phone`, metadata: { channel: "seed" }, manualReason: v.manual ? "Phone died at the door; times confirmed with Ingrid" : undefined,
  });
  for (const v of seeded) {
    const actor = { userId: v.userId, staffId: v.staffRow.id, role: "dsp" as const };
    const receiveIn = v.offline ? new Date(v.start.getTime() + 3 * 3_600_000) : new Date(v.start.getTime() + 20_000);
    const receiveOut = v.offline ? new Date(v.end.getTime() + 2 * 3_600_000) : new Date(v.end.getTime() + 15_000);
    await createVisit(makeCtx(db, org.id, v.manual ? adminUser.id : v.userId, () => v.start), { id: v.id, personId: harold.id, staffId: v.staffRow.id, serviceAgreementId: v.sa.id, visitId: v.id, manualEntry: v.manual });
    await clockIn(makeCtx(db, org.id, v.userId, () => receiveIn), v.id, ev(v.id, "clock_in", v.start, v), v.manual ? { ...actor, userId: adminUser.id, role: "admin" } : actor);
    await clockOut(makeCtx(db, org.id, v.userId, () => receiveOut), v.id, ev(v.id, "clock_out", v.end, v), v.manual ? { ...actor, userId: adminUser.id, role: "admin" } : actor);
  }
  // The aggregator (mock) accepts everything except one visit, which it rejects for review; the
  // most recent few stay queued so the integration screen shows work in flight.
  const rejectId = seeded[Math.floor(seeded.length / 2)]?.id;
  const mock = new MockAggregatorAdapter((payload) => (payload.visitId === rejectId ? outcomes.validation("V210", "Service authorization not found for member") : outcomes.accept()));
  const cutoff = seeded.at(-4)?.end ?? new Date();
  await processQueue(makeCtx(db, org.id, null, () => cutoff), mock, 500);
  const fix = seeded.find((v) => !v.manual && !v.offline && v.id !== rejectId && v.end < cutoff && v.sa.id === saIhs.id);
  if (fix) await correctVisit(makeCtx(db, org.id, adminUser.id, () => new Date(fix.end.getTime() + 86_400_000)), fix.id, { reasonCode: "FORGOT_CLOCK_OUT", explanation: "Sam forgot to clock out; the end time was confirmed with Ingrid by phone the next morning.", changes: { clockOutAt: new Date(fix.end.getTime() + 20 * 60000).toISOString() } });

  console.log(`Seeded "${org.name}": 3 staff (admin, daytime caregiver, overnight caregiver) with complete personnel files, 1 client (Harold Lindqvist, early-onset Alzheimer's) complete in every section with 9 goals (3 outcome-only, 11 reviews), ${seeded.length} notes over six weeks, ${seeded.length} EVV visits (mock aggregator: accepted, one rejected, one corrected), 4 medications with a 30-day MAR, and three weeks of shifts.`);
  console.log(keptAdminUser ? `Kept the existing admin@example.com login and organisation. dsp@example.com / night@example.com password: ${PASSWORD}` : `Log in with admin@example.com, dsp@example.com or night@example.com. Password: ${PASSWORD === "changeme-245d" ? PASSWORD : "(from SEED_ADMIN_PASSWORD)"}`);
  console.log(`Harold Lindqvist's signing code: ${CLIENT_CODE}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
