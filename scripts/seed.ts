/**
 * Seeds sample data into the configured database (local PGlite, or DATABASE_URL). Run with `npm run db:seed`.
 *
 * Deliberately small: one organisation, one admin login (Mustafa Ali) and one caregiver (Sam
 * Nguyen), and one client (Jordan Abelard) whose record is complete in every section — contacts,
 * funding, locations with a geocoded home, availability, diagnoses, agreements, goals, medications,
 * documents, a signing code, six weeks of notes — plus the EVV records those notes produce, built
 * through the real EVV services so the queue, the compliance report and the integration screen all
 * have something honest to show. Sample data only. No real client information belongs in this file.
 *
 * The admin password is `changeme-245d` unless SEED_ADMIN_PASSWORD is set.
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
const HOME = { lat: 44.9778, lng: -93.265 }; // Jordan's home, downtown Minneapolis
const JORDAN_CODE = "482113";

/** A tiny valid PDF so every filed document opens. */
const samplePdf = (title: string) => new TextEncoder().encode(`%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length ${title.length + 50}>>stream\nBT /F1 16 Tf 72 720 Td (${title.replace(/[()\\]/g, "")} - sample) Tj ET\nendstream\nendobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`);

const chicago = (iso: string, hour: number) => new Date(`${iso}T${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.round((hour % 1) * 60)).padStart(2, "0")}:00${utcOffsetMinutes(new Date(iso + "T12:00:00Z")) === -300 ? "-05:00" : "-06:00"}`);
const days = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function main() {
  const db = await getDb();
  const existing = await db.select().from(organizations).limit(1);
  if (existing.length) { console.log("Database already seeded. Run `npm run db:reset` to start over."); return; }
  const w = audited(db, { userId: null });
  const today = todayIso();

  /* ---------- organisation ---------- */
  const org = await w.insert(organizations, {
    name: "Sonder Homecare",
    taxId: "41-0000000",         // sample EIN — replace with the real one in Settings
    umpi: "A100000000",          // sample UMPI — replace with the MHCP-enrolled identifier
    licenseNumber: "1234567",
    address1: "100 Main St", city: "Minneapolis", zip: "55401", phone: "612-555-0100",
  });
  await ensureEvvDefaults(db, org.id);
  const [profile] = await db.select().from(schema.evvProviderProfiles).where(eq(schema.evvProviderProfiles.organizationId, org.id));
  await w.update(schema.evvProviderProfiles, profile.id, { medicaidProviderId: "A100000000", legalName: "Sonder Homecare LLC" });

  /* ---------- staff: the admin login and one caregiver ---------- */
  const ssn = (digits: string) => ({ ssnEncrypted: encryptField(digits), ssnLast4: digits.slice(-4) });
  const admin = await w.insert(staff, {
    firstName: "Mustafa", lastName: "Ali", dob: "1988-05-14", gender: "male", ...ssn("123456789"), payRate: "38.00",
    address1: "100 Main St", city: "Minneapolis", zip: "55401", umpi: "A100000001", hireDate: "2024-01-15", title: "Program director",
    email: "admin@example.com", phone: "612-555-0101",
  });
  const sam = await w.insert(staff, {
    firstName: "Sam", lastName: "Nguyen", dob: "1999-03-22", gender: "nonbinary", ...ssn("345678901"), payRate: "19.75",
    address1: "2600 Nicollet Ave", address2: "Apt 3", city: "Minneapolis", zip: "55408", umpi: "A100000003", hireDate: "2025-06-10", title: "Direct support professional",
    email: "dsp@example.com", phone: "612-555-0103",
  });
  const hash = await hashPassword(PASSWORD);
  const adminUser = await w.insert(users, { email: "admin@example.com", passwordHash: hash, role: "admin", staffId: admin.id });
  const samUser = await w.insert(users, { email: "dsp@example.com", passwordHash: hash, role: "dsp", staffId: sam.id });
  for (const d of [1, 2, 3, 4, 5]) await w.insert(staffAvailability, { staffId: sam.id, weekday: d, startTime: "08:00", endTime: "17:00", startDate: "2026-01-01" });
  await w.insert(staffAvailability, { staffId: sam.id, weekday: 6, startTime: "09:00", endTime: "15:00", startDate: "2026-01-01" });

  /* ---------- personnel files: the licensor's thirteen items, each with its document ---------- */
  type CredType = (typeof staffCredentials.$inferInsert)["type"];
  const ITEMS: { type: CredType; title: string; category: (typeof staffDocuments.$inferInsert)["category"]; monthsAfterHire: number; instructor?: string; hours?: string; renewMonths?: number; expiresYears?: number; note?: string }[] = [
    { type: "application", title: "Completed employment application", category: "employment_form", monthsAfterHire: -1 },
    { type: "duties_acknowledgment", title: "Job description and duties acknowledgment", category: "policy_acknowledgment", monthsAfterHire: 0 },
    { type: "position_requirements", title: "Meets position requirements", category: "employment_form", monthsAfterHire: 0, note: "High school diploma on file; two years' experience per application" },
    { type: "qualifications", title: "Staff qualifications documentation", category: "employment_form", monthsAfterHire: 0 },
    { type: "orientation", title: "245D orientation to program requirements", category: "orientation", monthsAfterHire: 0, instructor: "Mustafa Ali", hours: "8.0" },
    { type: "maltreatment_reporting", title: "Vulnerable Adults Act and maltreatment reporting", category: "training_certificate", monthsAfterHire: 0, instructor: "Mustafa Ali", hours: "1.5", renewMonths: 12 },
    { type: "annual_training", title: "Person-centered practices and positive supports", category: "training_certificate", monthsAfterHire: 4, instructor: "North Star Training Cooperative", hours: "12.0", renewMonths: 12 },
    { type: "evaluation", title: "Performance evaluation", category: "evaluation", monthsAfterHire: 12, renewMonths: 12 },
    { type: "background_study", title: "DHS NETStudy 2.0 submission", category: "background_study", monthsAfterHire: -1 },
    { type: "background_study_results", title: "DHS background study determination: cleared", category: "background_study", monthsAfterHire: 0 },
    { type: "first_supervised_contact", title: "First supervised direct contact", category: "orientation", monthsAfterHire: 0, note: "Jordan Abelard · supervised by Mustafa Ali" },
    { type: "first_unsupervised_contact", title: "First unsupervised direct contact", category: "orientation", monthsAfterHire: 1, note: "Jordan Abelard" },
    { type: "drivers_license", title: "MN Class D driver's licence", category: "license", monthsAfterHire: -12, expiresYears: 4 },
  ];
  const addMonths = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
  const personnelFile = async (row: typeof sam, uploadedBy: string) => {
    // Recurring items are dated within the last year so they read as current, not overdue.
    for (const it of ITEMS) {
      let completedOn = addMonths(row.hireDate, it.monthsAfterHire);
      if (it.renewMonths) { while (addMonths(completedOn, it.renewMonths) < today) completedOn = addMonths(completedOn, it.renewMonths); }
      const cred = await w.insert(staffCredentials, { staffId: row.id, type: it.type, title: it.title, completedOn, expiresOn: it.expiresYears ? addMonths(completedOn, it.expiresYears * 12) : null, hours: it.hours ?? null, instructor: it.instructor ?? null, renewMonths: it.renewMonths ?? null, note: it.note ?? null });
      const path = `staff/${row.id}/${cred.id}.pdf`;
      const bytes = samplePdf(`${it.title} - ${row.firstName} ${row.lastName}`);
      await putFile(path, bytes, "application/pdf");
      await w.insert(staffDocuments, { staffId: row.id, category: it.category, title: it.title, fileName: `${it.type}.pdf`, filePath: path, mimeType: "application/pdf", sizeBytes: bytes.byteLength, credentialId: cred.id, uploadedBy, extractedText: `${it.title}. ${row.firstName} ${row.lastName}. Completed ${completedOn}.${it.instructor ? ` Instructor: ${it.instructor}.` : ""}`, extractedAt: new Date(), extractionSummary: `${it.title} for ${row.firstName} ${row.lastName}, ${completedOn}.`, extractionModel: "seed" });
    }
  };
  await personnelFile(sam, adminUser.id);
  await personnelFile(admin, adminUser.id);

  /* ---------- sites and programs ---------- */
  await w.insert(sites, { name: "Main office", type: "office", address1: "100 Main St", city: "Minneapolis", zip: "55401" });
  const home = await w.insert(sites, { name: "In-home services", type: "in_home", licenseNumber: "1234567" });
  const ihsTraining = await w.insert(programs, { siteId: home.id, serviceTypeId: "ihs-with-training", name: "IHS with training" });
  const respite = await w.insert(programs, { siteId: home.id, serviceTypeId: "respite-in-home", name: "In-home respite" });

  /* ---------- the client: complete in every section ---------- */
  const jordan = await w.insert(people, {
    firstName: "Jordan", lastName: "Abelard", preferredName: "Jo", dob: "1998-04-12", sexAtBirth: "male", pmi: "12345678",
    waiverProgram: "CADI", county: "Hennepin", status: "active", serviceStartDate: "2026-07-01", medicationSupport: true,
    caseManagerName: "Dana Whitfield", caseManagerPhone: "612-555-0142", caseManagerEmail: "dwhitfield@hennepin.example",
    guardianName: "Renee Abelard", guardianRelationship: "Mother", guardianPhone: "612-555-0177", guardianEmail: "renee.abelard@example.com",
    emergencyContactName: "Marcus Abelard", emergencyContactRelationship: "Father", emergencyContactPhone: "612-555-0163", emergencyContactEmail: "marcus.abelard@example.com",
    consultProviderName: "North Star Consultation Services", consultContactName: "Priya Raman", consultPhone: "651-555-0133", consultEmail: "praman@northstar.example",
    address1: "1420 Girard Ave N", address2: "Unit 2", city: "Minneapolis", state: "MN", zip: "55411", phone: "612-555-0150", email: "jordan.abelard@example.com",
    smsConsent: true, smsConsentAt: new Date("2026-07-01T15:00:00Z"),
    signatureCodeHash: await hashPassword(JORDAN_CODE), signatureCodeEncrypted: encryptField(JORDAN_CODE), signatureCodeSetAt: new Date(),
  });
  await w.insert(clientContacts, { personId: jordan.id, name: "Renee Abelard", relationship: "Mother · legal guardian", phone: "(612) 555-0177", email: "renee.abelard@example.com", isPrimary: true, isLegalRepresentative: true });
  await w.insert(clientContacts, { personId: jordan.id, name: "Marcus Abelard", relationship: "Father", phone: "(612) 555-0163", email: "marcus.abelard@example.com", isPrimary: false, isLegalRepresentative: false, notes: "Call first in an emergency; works nights" });
  await w.insert(clientFundingSources, { personId: jordan.id, payer: "Minnesota Health Care Programs (MA)", waiver: "CADI", memberId: "12345678", priority: "primary", startDate: "2026-07-01", notes: "Waiver renewal due June 2027" });
  await w.insert(clientLocations, { personId: jordan.id, type: "home", posCode: "12", label: "Home", address1: "1420 Girard Ave N", address2: "Unit 2", city: "Minneapolis", state: "MN", zip: "55411", isDefault: true, lat: HOME.lat, lng: HOME.lng, ivrPhone: "612-555-0150" });
  await w.insert(clientLocations, { personId: jordan.id, type: "community", posCode: "99", label: "Webber Park Library", address1: "4440 Humboldt Ave N", city: "Minneapolis", state: "MN", zip: "55412", isDefault: false, lat: 45.0357, lng: -93.298 });
  for (const d of [1, 2, 3, 4, 5]) await w.insert(clientAvailability, { personId: jordan.id, weekday: d, startTime: "09:00", endTime: "14:00", startDate: "2026-07-01", notes: "Day programme after 2:30pm" });
  await w.insert(clientAvailability, { personId: jordan.id, weekday: 6, startTime: "10:00", endTime: "15:00", startDate: "2026-07-01" });
  await w.insert(clientDiagnoses, { personId: jordan.id, icdCode: "F84.0", description: "Autism spectrum disorder", diagnosedOn: "2012-03-14", isPrimary: true });
  await w.insert(clientDiagnoses, { personId: jordan.id, icdCode: "F41.1", description: "Generalised anxiety disorder", diagnosedOn: "2019-11-02", isPrimary: false });

  const saIhs = await w.insert(serviceAgreements, { personId: jordan.id, programId: ihsTraining.id, agreementNumber: "SA-2026-00101", serviceCode: "H2014", modifiers: ["UC", "U3"], authorizedUnits: 1040, unitRate: "6.85", unitMinutes: 15, startDate: "2026-07-01", endDate: "2027-06-30", authorizingCounty: "Hennepin" });
  const saRespite = await w.insert(serviceAgreements, { personId: jordan.id, programId: respite.id, agreementNumber: "SA-2026-00102", serviceCode: "S5150", modifiers: [], authorizedUnits: 320, unitRate: "5.10", unitMinutes: 15, startDate: "2026-07-01", endDate: "2027-06-30", authorizingCounty: "Hennepin" });
  await w.insert(assignments, { staffId: sam.id, personId: jordan.id, orientedOn: "2026-07-01" });
  await w.insert(assignments, { staffId: admin.id, personId: jordan.id, orientedOn: "2026-07-01" });

  for (const [category, title, effectiveOn, text] of [
    ["support_plan", "CSSP 2026–2027", "2026-07-01", "Coordinated services and support plan for Jordan Abelard. Goals: community participation, meal planning, employment exploration. CADI waiver. Case manager Dana Whitfield."],
    ["iapp", "IAPP signed 7/1/26", "2026-07-01", "Individual abuse prevention plan. Vulnerabilities: anxiety in crowds, difficulty asking for help. Supports: visual schedule, staff nearby in community settings."],
    ["treatment_goals", "Support plan goals, Q3 2026", "2026-07-01", "Goal 1: join one community activity a week. Goal 2: plan and cook two meals a week with fading support."],
  ] as const) {
    const path = `clients/${jordan.id}/${category}.pdf`;
    const bytes = samplePdf(title);
    await putFile(path, bytes, "application/pdf");
    await w.insert(clientDocuments, { personId: jordan.id, category, title, fileName: `${category}.pdf`, filePath: path, mimeType: "application/pdf", sizeBytes: bytes.byteLength, effectiveOn, uploadedBy: adminUser.id, extractedText: text, extractedAt: new Date(), extractionSummary: title, extractionModel: "seed" });
  }

  /* ---------- goals ---------- */
  const mkGoal = async (title: string, description: string, category: string, prompts: string[]) => {
    const g = await w.insert(goals, { personId: jordan.id, title, description, category, status: "active", startDate: "2026-07-01", createdBy: adminUser.id });
    const qs: { id: string }[] = [];
    for (const [i, prompt] of prompts.entries()) qs.push(await w.insert(goalQuestions, { goalId: g.id, prompt, sortOrder: i }));
    return qs;
  };
  const questions = [
    ...(await mkGoal("Join one community activity a week", "Jordan chooses and attends a community activity, with staff nearby and prompting only when asked.", "social", ["Did Jordan participate in a community outing?", "Did Jordan start a conversation with a peer or staff member today?"])),
    ...(await mkGoal("Cook two meals a week", "Jordan plans and cooks with staff support, working toward doing it alone.", "daily_living", ["Did Jordan help plan or cook a meal today?"])),
  ];

  /* ---------- notes: six weeks of H2014 weekdays and S5150 Saturdays ---------- */
  const NOTES = {
    ihs: [
      "Jordan planned breakfast, wrote the grocery list, and paid at the register with staff nearby. Practiced counting change; needed one prompt. Walked to the library and checked out two books. Mood bright, no concerns.",
      "Worked on the laundry sequence from the support plan: sorted, loaded, and started the machine with verbal prompts only. Reviewed the bus schedule for Thursday's outing. Jordan asked to call a friend and did so independently.",
      "Community outing to Cub Foods. Jordan compared prices on two items and chose the cheaper one without prompting. Cooked pasta for lunch with staff supervising the stove. Reviewed tomorrow's plan on the whiteboard.",
      "Quiet morning. Jordan was tired and needed extra time to start; staff used the visual schedule and Jordan completed all three tasks. Practiced texting the case manager to confirm an appointment. No incidents.",
      "Webber Park Library programme. Jordan checked in at the desk alone, joined the group for forty minutes, and asked the librarian a question about the schedule. Walked back; discussed what went well.",
    ],
    respite: [
      "Respite at home while parents were out. Board game, snack, and a walk to the park. Jordan chose the evening film and made popcorn. Calm evening; parents returned at 2:00 and staff gave a handoff.",
      "Saturday respite. Practiced the bus route to the library and back. Lunch at home, then a quiet afternoon with music. No concerns.",
    ],
  };
  const dspUserId = samUser.id;
  const seeded: { id: string; start: Date; end: Date; n: number; manual: boolean; community: boolean; offline: boolean; unsigned: boolean; sa: typeof saIhs }[] = [];
  let n = 0;
  const seedVisit = async (sa: typeof saIhs, start: Date, minutes: number, note: string, flags: { manual?: boolean; community?: boolean; offline?: boolean; unsigned?: boolean } = {}) => {
    const end = new Date(start.getTime() + minutes * 60000);
    const units = Math.floor(minutes / 15) + (minutes % 15 >= 8 ? 1 : 0);
    const pool = skillsFor(sa.serviceCode === "H2014" ? "ihs-with-training" : "respite-in-home");
    const at = flags.community ? { lat: 45.0357, lng: -93.298 } : HOME;
    const jitter = () => (Math.random() - 0.5) * 0.0006; // ± ~30 m
    const activities = activitiesFor("Jordan", null);
    const inserted = await w.insert(visits, {
      personId: jordan.id, staffId: sam.id, serviceAgreementId: sa.id, programId: sa.programId,
      providerTaxId: org.taxId, pmi: jordan.pmi, serviceCode: sa.serviceCode, modifiers: sa.modifiers, renderingIdType: "umpi", renderingId: sam.umpi!,
      placeOfService: flags.community ? "99" : "12", units, clockInAt: start, clockOutAt: end,
      clockInLat: at.lat + jitter(), clockInLng: at.lng + jitter(), clockInAccuracyM: 9, clockOutLat: at.lat + jitter(), clockOutLng: at.lng + jitter(), clockOutAccuracyM: 12,
      manualEntry: Boolean(flags.manual), manualEntryReason: flags.manual ? "Phone died at the door; times confirmed with Jordan's mother" : null,
      tasks: [{ code: "adl", label: "Personal care / ADLs", completed: true }, { code: "skills", label: "Skill building per support plan", completed: true }],
      shiftNote: note, interactionLevel: (["low", "medium", "high"] as const)[n % 3],
      skills: pool.length ? [pool[n % pool.length], pool[(n + 2) % pool.length]].filter((v, i, a) => a.indexOf(v) === i) : [],
      activities: [activities[n % activities.length], activities[(n * 7 + 3) % activities.length]].filter((x, i, a) => a.indexOf(x) === i),
      clientSignedAt: flags.unsigned ? null : new Date(end.getTime() + 60000), clientUnsignedReason: flags.unsigned ? "Asleep at end of shift" : null,
      staffSignedAt: new Date(end.getTime() + 120000), noteSavedAt: new Date(end.getTime() + 120000), noteSavedBy: flags.manual ? adminUser.id : dspUserId, noteSavedLat: at.lat, noteSavedLng: at.lng,
      approvedAt: new Date(end.getTime() + 120000), status: "completed", createdBy: flags.manual ? adminUser.id : dspUserId, updatedBy: flags.manual ? adminUser.id : dspUserId,
    });
    seeded.push({ id: inserted.id, start, end, n, manual: Boolean(flags.manual), community: Boolean(flags.community), offline: Boolean(flags.offline), unsigned: Boolean(flags.unsigned), sa });
    for (const [i, q] of questions.entries()) await w.insert(goalResponses, { visitId: inserted.id, questionId: q.id, response: (n + i) % 5 === 0 ? "no" : (n + i) % 11 === 0 ? "na" : "yes" });
    n++;
  };
  const firstDay = days(today, -42);
  for (let d = 0; d <= 42; d++) {
    const day = days(firstDay, d);
    if (day >= today) break;
    const dow = new Date(day + "T12:00:00Z").getUTCDay();
    if (dow >= 1 && dow <= 5) await seedVisit(saIhs, chicago(day, 9), 180 + (n % 3) * 15, NOTES.ihs[n % NOTES.ihs.length], { community: n % 5 === 4, manual: n % 13 === 7, offline: n % 9 === 5, unsigned: n % 17 === 11 });
    if (dow === 6) await seedVisit(saRespite, chicago(day, 10), 240, NOTES.respite[n % NOTES.respite.length]);
  }

  /* ---------- medications (245D.05) with a MAR ---------- */
  const omeprazole = await w.insert(medications, { personId: jordan.id, name: "Omeprazole", dose: "20 mg", route: "oral", frequency: "Every morning", times: ["09:15"], instructions: "30 minutes before breakfast.", prescriber: "Dr. Okonkwo", startDate: "2026-07-01" });
  const sertraline = await w.insert(medications, { personId: jordan.id, name: "Sertraline", dose: "50 mg", route: "oral", frequency: "Once daily", times: ["09:15"], instructions: "Hold and call the prescriber if Jordan reports dizziness.", prescriber: "Dr. Okonkwo", startDate: "2026-07-01" });
  for (let i = 30; i >= 1; i--) {
    const date = days(today, -i);
    const dow = new Date(date + "T12:00:00Z").getUTCDay();
    if (dow === 0) continue;
    for (const [k, med] of [omeprazole, sertraline].entries()) {
      const status = (i * 7 + k) % 17 === 0 ? "refused" : (i * 7 + k) % 23 === 0 ? "missed" : "given";
      await w.insert(medicationAdministrations, { medicationId: med.id, personId: jordan.id, scheduledDate: date, scheduledTime: "09:15", status, givenAt: status === "given" ? chicago(date, 9.25) : null, recordedBy: dspUserId, staffId: sam.id, note: status === "refused" ? "Refused, offered again 20 min later" : null });
    }
  }

  /* ---------- shifts: last week completed, this and next week scheduled ---------- */
  for (let d = -7; d < 14; d++) {
    const date = days(today, d);
    const dow = new Date(date + "T12:00:00Z").getUTCDay();
    if (dow === 0) continue;
    const past = date < today;
    if (dow <= 5) await w.insert(shifts, { personId: jordan.id, staffId: sam.id, serviceAgreementId: saIhs.id, startAt: chicago(date, 9), endAt: chicago(date, 12), status: past ? "completed" : "scheduled", createdBy: adminUser.id });
    else await w.insert(shifts, { personId: jordan.id, staffId: sam.id, serviceAgreementId: saRespite.id, startAt: chicago(date, 10), endAt: chicago(date, 14), status: past ? "completed" : "scheduled", createdBy: adminUser.id });
  }

  /* ---------- EVV: the same notes, through the real services ---------- */
  const actor = { userId: samUser.id, staffId: sam.id, role: "dsp" as const };
  const ev = (visitId: string, kind: "clock_in" | "clock_out", at: Date, v: (typeof seeded)[number]) => ({
    eventId: derivedEventId(visitId, kind), idempotencyKey: `web:${visitId}:${kind}`, deviceCapturedAt: at.toISOString(), deviceUtcOffsetMinutes: utcOffsetMinutes(at),
    latitude: (v.community ? 45.0357 : HOME.lat) + (Math.random() - 0.5) * 0.0006, longitude: (v.community ? -93.298 : HOME.lng) + (Math.random() - 0.5) * 0.0006, accuracyMeters: kind === "clock_in" ? 9 : 12,
    locationSource: "gps" as const, locationType: v.community ? ("community" as const) : ("home" as const), verificationMethod: v.manual ? ("manual" as const) : ("mobile" as const),
    offline: v.offline, deviceId: "sam-phone", metadata: { channel: "seed" }, manualReason: v.manual ? "Phone died at the door; times confirmed with Jordan's mother" : undefined,
  });
  for (const v of seeded) {
    const receiveIn = v.offline ? new Date(v.start.getTime() + 3 * 3_600_000) : new Date(v.start.getTime() + 20_000);
    const receiveOut = v.offline ? new Date(v.end.getTime() + 2 * 3_600_000) : new Date(v.end.getTime() + 15_000);
    await createVisit(makeCtx(db, org.id, v.manual ? adminUser.id : samUser.id, () => v.start), { id: v.id, personId: jordan.id, staffId: sam.id, serviceAgreementId: v.sa.id, visitId: v.id, manualEntry: v.manual });
    await clockIn(makeCtx(db, org.id, samUser.id, () => receiveIn), v.id, ev(v.id, "clock_in", v.start, v), v.manual ? { ...actor, userId: adminUser.id, role: "admin" } : actor);
    await clockOut(makeCtx(db, org.id, samUser.id, () => receiveOut), v.id, ev(v.id, "clock_out", v.end, v), v.manual ? { ...actor, userId: adminUser.id, role: "admin" } : actor);
  }
  // The aggregator (mock) accepts everything except one visit, which it rejects for review; the
  // most recent two stay queued so the integration screen shows work in flight.
  const rejectId = seeded[Math.floor(seeded.length / 2)]?.id;
  const mock = new MockAggregatorAdapter((payload) => (payload.visitId === rejectId ? outcomes.validation("V210", "Service authorization not found for member") : outcomes.accept()));
  const cutoff = seeded.at(-3)?.end ?? new Date();
  await processQueue(makeCtx(db, org.id, null, () => cutoff), mock, 500);
  // One correction, so the history and resubmission chain have an example.
  const fix = seeded.find((v) => !v.manual && !v.offline && v.id !== rejectId && v.end < cutoff);
  if (fix) await correctVisit(makeCtx(db, org.id, adminUser.id, () => new Date(fix.end.getTime() + 86_400_000)), fix.id, { reasonCode: "FORGOT_CLOCK_OUT", explanation: "Sam forgot to clock out; the end time was confirmed with Jordan's mother by phone the next morning.", changes: { clockOutAt: new Date(fix.end.getTime() + 20 * 60000).toISOString() } });

  console.log(`Seeded "${org.name}": 2 staff (1 admin login, 1 caregiver login) with complete personnel files, 1 client complete in every section, ${seeded.length} notes over six weeks, ${seeded.length} EVV visits (mock aggregator: accepted, one rejected, one corrected), 2 medications with a 30-day MAR, and three weeks of shifts.`);
  console.log(`Log in with admin@example.com or dsp@example.com. Password: ${PASSWORD === "changeme-245d" ? PASSWORD : "(from SEED_ADMIN_PASSWORD)"}`);
  console.log(`Jordan Abelard's signing code: ${JORDAN_CODE}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
