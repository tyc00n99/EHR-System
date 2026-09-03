/**
 * Seeds sample data into the configured database (local PGlite, or DATABASE_URL). Run with `npm run db:seed`.
 * Sample data only. No real client information belongs in this file.
 */
import { existsSync, readFileSync } from "node:fs";
// Load .env.local so DATA_ENCRYPTION_KEY is available outside Next.js.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
import { getDb, schema } from "../src/db/index";
import { encryptField } from "../src/lib/crypto";
import { audited } from "../src/db/audited";
import { hashPassword } from "../src/lib/password";

const { organizations, staff, users, people, sites, programs, serviceAgreements, assignments, staffCredentials, visits, goals, goalQuestions, goalResponses, shifts, medications, medicationAdministrations } = schema;

const PASSWORD = "changeme-245d";

async function main() {
  const db = await getDb();
  const existing = await db.select().from(organizations).limit(1);
  if (existing.length) {
    console.log("Database already seeded. Run `npm run db:reset` to start over.");
    return;
  }

  const w = audited(db, { userId: null });

  const org = await w.insert(organizations, {
    name: "Sensory Speech & OT",
    taxId: "41-0000000",
    umpi: "A000000000",
    licenseNumber: "1234567",
    address1: "100 Main St",
    city: "Minneapolis",
    zip: "55401",
    phone: "612-555-0100",
  });

  const ssn = (digits: string) => ({ ssnEncrypted: encryptField(digits), ssnLast4: digits.slice(-4) });
  const admin = await w.insert(staff, {
    firstName: "Ayub",
    lastName: "Sultan",
    dob: "1988-05-14",
    gender: "male",
    ...ssn("123456789"),
    payRate: "38.00",
    address1: "100 Main St",
    city: "Minneapolis",
    zip: "55401",
    umpi: "A100000001",
    hireDate: "2024-01-15",
    title: "Program director",
    email: "admin@example.com",
  });
  const sup = await w.insert(staff, {
    firstName: "Maria",
    lastName: "Peters",
    dob: "1991-11-02",
    gender: "female",
    ...ssn("234567890"),
    payRate: "27.50",
    address1: "412 Portland Ave",
    city: "Minneapolis",
    zip: "55415",
    npi: "1234567893",
    hireDate: "2024-03-01",
    title: "Designated coordinator",
    email: "supervisor@example.com",
  });
  const dsp1 = await w.insert(staff, {
    firstName: "Sam",
    lastName: "Nguyen",
    dob: "1999-03-22",
    gender: "nonbinary",
    ...ssn("345678901"),
    payRate: "19.75",
    address1: "2600 Nicollet Ave",
    address2: "Apt 3",
    city: "Minneapolis",
    zip: "55408",
    umpi: "A100000003",
    hireDate: "2025-06-10",
    title: "Direct support professional",
    email: "dsp@example.com",
  });
  const dsp2 = await w.insert(staff, {
    firstName: "Tobi",
    lastName: "Okafor",
    dob: "2001-08-09",
    gender: "male",
    ...ssn("456789012"),
    payRate: "18.50",
    address1: "77 Snelling Ave N",
    city: "St. Paul",
    zip: "55104",
    umpi: "A100000004",
    hireDate: "2025-09-01",
    title: "Direct support professional",
  });

  const hash = await hashPassword(PASSWORD);
  await w.insert(users, { email: "admin@example.com", passwordHash: hash, role: "admin", staffId: admin.id });
  await w.insert(users, { email: "supervisor@example.com", passwordHash: hash, role: "supervisor", staffId: sup.id });
  await w.insert(users, { email: "dsp@example.com", passwordHash: hash, role: "dsp", staffId: dsp1.id });

  const office = await w.insert(sites, {
    name: "Main office",
    type: "office",
    address1: "100 Main St",
    city: "Minneapolis",
    zip: "55401",
  });
  const home = await w.insert(sites, {
    name: "In-home services",
    type: "in_home",
    licenseNumber: "1234567",
  });
  const crs = await w.insert(sites, {
    name: "Elm Street residence",
    type: "community_residential",
    licenseNumber: "1234568",
    address1: "42 Elm St",
    city: "St. Paul",
    zip: "55102",
  });

  const ihsTraining = await w.insert(programs, { siteId: home.id, serviceTypeId: "ihs-with-training", name: "IHS with training" });
  const ihsNoTraining = await w.insert(programs, { siteId: home.id, serviceTypeId: "ihs-without-training", name: "IHS without training" });
  const respite = await w.insert(programs, { siteId: home.id, serviceTypeId: "respite-in-home", name: "In-home respite" });
  const crsProgram = await w.insert(programs, { siteId: crs.id, serviceTypeId: "crs", name: "Community residential services" });
  void office;

  const jordan = await w.insert(people, {
    firstName: "Jordan",
    lastName: "Abelard",
    dob: "1998-04-12",
    pmi: "12345678",
    email: "jordan.abelard@example.com",
    emergencyContactName: "Marcus Abelard",
    emergencyContactRelationship: "Brother",
    emergencyContactPhone: "612-555-0190",
    consultProviderName: "North Star Consultation Services",
    consultContactName: "Priya Raman",
    consultPhone: "651-555-0133",
    consultEmail: "praman@northstar.example",
    signatureCodeHash: await hashPassword("482113"),
    signatureCodeSetAt: new Date(),
    waiverProgram: "CADI",
    county: "Hennepin",
    caseManagerName: "Dana Whitfield",
    caseManagerPhone: "612-555-0142",
    caseManagerEmail: "dwhitfield@hennepin.example",
    guardianName: "Renee Abelard",
    guardianRelationship: "Mother",
    guardianPhone: "612-555-0177",
    address1: "2210 Lyndale Ave S",
    city: "Minneapolis",
    zip: "55405",
    status: "active",
    serviceStartDate: "2026-07-01",
  });
  const riley = await w.insert(people, {
    firstName: "Riley",
    lastName: "Bergstrom",
    dob: "2011-11-03",
    pmi: "23456789",
    emergencyContactName: "Karin Bergstrom",
    emergencyContactRelationship: "Mother",
    emergencyContactPhone: "651-555-0180",
    signatureCodeHash: await hashPassword("730924"),
    signatureCodeSetAt: new Date(),
    waiverProgram: "DD",
    county: "Ramsey",
    caseManagerName: "Luis Ortega",
    caseManagerPhone: "651-555-0119",
    guardianName: "Karin Bergstrom",
    guardianRelationship: "Mother",
    guardianPhone: "651-555-0180",
    address1: "880 Grand Ave",
    city: "St. Paul",
    zip: "55105",
    status: "active",
    serviceStartDate: "2026-08-15",
  });
  const casey = await w.insert(people, {
    firstName: "Casey",
    lastName: "Dahl",
    dob: "1975-02-20",
    pmi: "34567890",
    waiverProgram: "BI",
    county: "Hennepin",
    caseManagerName: "Dana Whitfield",
    caseManagerPhone: "612-555-0142",
    address1: "42 Elm St",
    city: "St. Paul",
    zip: "55102",
    status: "active",
    serviceStartDate: "2026-05-01",
  });
  await w.insert(people, {
    firstName: "Taylor",
    lastName: "Frey",
    dob: "2003-09-30",
    pmi: "45678901",
    waiverProgram: "CADI",
    county: "Dakota",
    caseManagerName: "Priya Raman",
    status: "intake",
  });

  const saJordan = await w.insert(serviceAgreements, {
    personId: jordan.id,
    programId: ihsTraining.id,
    agreementNumber: "SA-2026-00101",
    serviceCode: "H2014",
    modifiers: ["UC", "U3"],
    authorizedUnits: 1040,
    unitRate: "6.85",
    unitMinutes: 15,
    startDate: "2026-07-01",
    endDate: "2027-06-30",
    authorizingCounty: "Hennepin",
  });
  const saRileyRespite = await w.insert(serviceAgreements, {
    personId: riley.id,
    programId: respite.id,
    agreementNumber: "SA-2026-00117",
    serviceCode: "S5150",
    modifiers: [],
    authorizedUnits: 480,
    unitRate: "5.10",
    unitMinutes: 15,
    startDate: "2026-08-15",
    endDate: "2027-08-14",
    authorizingCounty: "Ramsey",
  });
  await w.insert(serviceAgreements, {
    personId: riley.id,
    programId: ihsNoTraining.id,
    agreementNumber: "SA-2026-00118",
    serviceCode: "H2014",
    modifiers: ["UC"],
    authorizedUnits: 720,
    unitRate: "5.95",
    unitMinutes: 15,
    startDate: "2026-08-15",
    endDate: "2027-08-14",
    authorizingCounty: "Ramsey",
  });
  const saCasey = await w.insert(serviceAgreements, {
    personId: casey.id,
    programId: crsProgram.id,
    agreementNumber: "SA-2026-00088",
    serviceCode: "S5135",
    modifiers: ["UC"],
    authorizedUnits: 960,
    unitRate: "6.10",
    unitMinutes: 15,
    startDate: "2026-05-01",
    endDate: "2027-04-30",
    authorizingCounty: "Hennepin",
  });
  // Six pay periods of completed visits so the owner view has history.
  const [adminUser] = await db.select().from(users).where((await import("drizzle-orm")).eq(users.email, "admin@example.com"));
  const dspUser = (await db.select().from(users).where((await import("drizzle-orm")).eq(users.email, "dsp@example.com")))[0];
  const seededVisits: { id: string; personId: string; start: Date; end: Date; n: number }[] = [];
  const seedVisit = async (opts: { person: typeof jordan; staffRow: typeof dsp1; sa: typeof saJordan; start: Date; minutes: number; note: string; signed?: boolean; manual?: boolean; createdBy: string }) => {
    const end = new Date(opts.start.getTime() + opts.minutes * 60000);
    const whole = Math.floor(opts.minutes / 15), rem = opts.minutes % 15;
    const units = whole + (rem >= 8 ? 1 : 0);
    const inserted = await w.insert(visits, {
      personId: opts.person.id,
      staffId: opts.staffRow.id,
      serviceAgreementId: opts.sa.id,
      programId: opts.sa.programId,
      providerTaxId: org.taxId,
      pmi: opts.person.pmi,
      serviceCode: opts.sa.serviceCode,
      modifiers: opts.sa.modifiers,
      renderingIdType: opts.staffRow.npi ? "npi" : "umpi",
      renderingId: (opts.staffRow.npi ?? opts.staffRow.umpi)!,
      placeOfService: "12",
      units,
      clockInAt: opts.start,
      clockOutAt: end,
      clockInLat: 44.9778 + Math.random() * 0.01,
      clockInLng: -93.265 + Math.random() * 0.01,
      clockInAccuracyM: 8,
      clockOutLat: 44.9778 + Math.random() * 0.01,
      clockOutLng: -93.265 + Math.random() * 0.01,
      clockOutAccuracyM: 10,
      manualEntry: opts.manual ?? false,
      manualEntryReason: opts.manual ? "Phone died; times confirmed with guardian" : null,
      tasks: [{ code: "adl", label: "Personal care / ADLs", completed: true }, { code: "skills", label: "Skill building per support plan", completed: true }],
      shiftNote: opts.note,
      clientSignedAt: opts.signed === false ? null : new Date(end.getTime() + 60000),
      clientUnsignedReason: opts.signed === false ? "Asleep at end of shift" : null,
      interactionLevel: (["low", "medium", "high"] as const)[n % 3],
      skills: opts.person.id === casey.id ? ["Household tasks", "Medication support"] : n % 2 ? ["Communication", "Daily living", "Community integration"] : ["Daily living", "Money management"],
      staffSignedAt: new Date(end.getTime() + 120000),
      noteSavedAt: new Date(end.getTime() + 120000),
      noteSavedBy: opts.createdBy,
      noteSavedLat: 44.9778 + Math.random() * 0.01,
      noteSavedLng: -93.265 + Math.random() * 0.01,
      approvedAt: opts.start < new Date("2026-08-23T00:00:00-05:00") ? new Date(end.getTime() + 86_400_000) : null,
      approvedBy: opts.start < new Date("2026-08-23T00:00:00-05:00") ? adminUser.id : null,
      status: "completed",
      createdBy: opts.createdBy,
      updatedBy: opts.createdBy,
    });
    seededVisits.push({ id: inserted.id, personId: opts.person.id, start: opts.start, end, n });
  };
  const chicago = (iso: string, hour: number) => new Date(`${iso}T${String(hour).padStart(2, "0")}:00:00-05:00`);
  const days = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const anchor = "2026-08-23"; // current pay period start
  let n = 0;
  for (let p = 5; p >= 0; p--) {
    const periodStart = days(anchor, -14 * p);
    for (let d = 0; d < 14; d++) {
      const day = days(periodStart, d);
      if (day > "2026-09-01") break;
      const dow = new Date(day + "T12:00:00Z").getUTCDay();
      if (dow === 0) continue;
      if (day >= "2026-07-01" && dow !== 6) await seedVisit({ person: jordan, staffRow: dsp1, sa: saJordan, start: chicago(day, 9), minutes: 180 + (n % 3) * 15, note: "Morning routine, meal prep, community outing. Worked on outcome 1.", signed: n % 9 !== 4, createdBy: dspUser.id });
      if (day >= "2026-08-15" && (dow === 2 || dow === 4 || dow === 6)) await seedVisit({ person: riley, staffRow: dsp1, sa: saRileyRespite, start: chicago(day, 15), minutes: 240, note: "Respite at home. Playground, dinner, bedtime routine.", manual: n % 7 === 3, createdBy: n % 7 === 3 ? adminUser.id : dspUser.id });
      if (day >= "2026-05-01" && dow !== 6) await seedVisit({ person: casey, staffRow: dsp2, sa: saCasey, start: chicago(day, 13), minutes: 120, note: "Household tasks and medication reminder. No concerns.", createdBy: adminUser.id });
      n++;
    }
  }

  // Life plan goals with yes/no questions, and responses on the seeded visits
  const mkGoal = async (personId: string, title: string, description: string, category: string, prompts: string[]) => {
    const g = await w.insert(goals, { personId, title, description, category, status: "active", startDate: "2026-07-01", createdBy: adminUser.id });
    const qs = [] as { id: string }[];
    for (const [i, prompt] of prompts.entries()) qs.push(await w.insert(goalQuestions, { goalId: g.id, prompt, sortOrder: i }));
    return qs;
  };
  const jq = await mkGoal(jordan.id, "Improve social skills", "Help Jordan build social skills by joining group activities and starting conversations.", "social", ["Did Jordan participate in a community outing?", "Did Jordan start a conversation with a peer or staff member today?"]);
  const jq2 = await mkGoal(jordan.id, "Cook two meals a week", "Jordan plans and cooks with staff support, working toward doing it alone.", "daily_living", ["Did Jordan help plan or cook a meal today?"]);
  const rq = await mkGoal(riley.id, "Bedtime routine", "Riley follows the bedtime routine with fewer prompts each week.", "daily_living", ["Did Riley complete the bedtime routine with two or fewer prompts?"]);
  const cq = await mkGoal(casey.id, "Take medications on schedule", "Casey self-administers with a reminder only.", "health", ["Did Casey take scheduled medications with a reminder only?"]);
  for (const v of seededVisits) {
    const qs = v.personId === jordan.id ? [...jq, ...jq2] : v.personId === riley.id ? rq : cq;
    for (const [i, q] of qs.entries()) await w.insert(goalResponses, { visitId: v.id, questionId: q.id, response: (v.n + i) % 5 === 0 ? "no" : (v.n + i) % 11 === 0 ? "na" : "yes" });
  }

  // Medications (245D.05) with a MAR history for the last 30 days
  const metformin = await w.insert(medications, { personId: casey.id, name: "Metformin", dose: "500 mg", route: "oral", frequency: "Twice daily with food", times: ["08:00", "20:00"], instructions: "Give with breakfast and dinner.", prescriber: "Dr. Halvorsen", startDate: "2026-05-01" });
  const lamictal = await w.insert(medications, { personId: casey.id, name: "Lamotrigine", dose: "100 mg", route: "oral", frequency: "Once daily", times: ["20:00"], prescriber: "Dr. Halvorsen", startDate: "2026-05-01" });
  const prilosec = await w.insert(medications, { personId: jordan.id, name: "Omeprazole", dose: "20 mg", route: "oral", frequency: "Every morning", times: ["09:15"], instructions: "30 minutes before breakfast.", prescriber: "Dr. Okonkwo", startDate: "2026-07-01" });
  for (let i = 30; i >= 1; i--) {
    const date = days("2026-09-02", -i);
    for (const [med, personId, staffRow] of [[metformin, casey.id, dsp2], [lamictal, casey.id, dsp2], [prilosec, jordan.id, dsp1]] as const) {
      for (const [ti, t] of med.times.entries()) {
        const k = i * 7 + ti;
        const status = k % 17 === 0 ? "refused" : k % 23 === 0 ? "missed" : "given";
        await w.insert(medicationAdministrations, { medicationId: med.id, personId, scheduledDate: date, scheduledTime: t, status, givenAt: status === "given" ? new Date(`${date}T${t}:00-05:00`) : null, recordedBy: dspUser.id, staffId: staffRow.id, note: status === "refused" ? "Refused, offered again 20 min later" : null });
      }
    }
  }

  // Shifts for this week and next (Sun–Sat), weekday mornings and afternoons
  for (let d = 0; d < 14; d++) {
    const date = days("2026-08-30", d);
    const dow = new Date(date + "T12:00:00Z").getUTCDay();
    if (dow === 0) continue;
    const past = date < "2026-09-02";
    if (dow !== 6) await w.insert(shifts, { personId: jordan.id, staffId: dsp1.id, serviceAgreementId: saJordan.id, startAt: chicago(date, 9), endAt: chicago(date, 12), status: past ? "completed" : "scheduled", createdBy: adminUser.id });
    if (dow === 2 || dow === 4 || dow === 6) await w.insert(shifts, { personId: riley.id, staffId: dsp1.id, serviceAgreementId: saRileyRespite.id, startAt: chicago(date, 15), endAt: chicago(date, 19), status: past ? "completed" : "scheduled", createdBy: adminUser.id });
    if (dow !== 6) await w.insert(shifts, { personId: casey.id, staffId: dsp2.id, serviceAgreementId: saCasey.id, startAt: chicago(date, 13), endAt: chicago(date, 15), status: past ? "completed" : "scheduled", createdBy: adminUser.id });
  }

  // Assignments (245D.09, subd. 4a orientation recorded where done)
  await w.insert(assignments, { staffId: dsp1.id, personId: jordan.id, orientedOn: "2026-07-01" });
  await w.insert(assignments, { staffId: dsp1.id, personId: riley.id, orientedOn: "2026-08-15" });
  await w.insert(assignments, { staffId: dsp2.id, personId: casey.id, orientedOn: "2026-05-01" });
  await w.insert(assignments, { staffId: admin.id, personId: jordan.id, orientedOn: "2026-07-01" });
  await w.insert(assignments, { staffId: sup.id, personId: jordan.id, orientedOn: "2026-07-01" });
  await w.insert(assignments, { staffId: sup.id, personId: riley.id, orientedOn: "2026-08-15" });

  // Credentials
  const cred = (staffId: string, type: (typeof staffCredentials.$inferInsert)["type"], title: string, completedOn: string, extra: Partial<typeof staffCredentials.$inferInsert> = {}) =>
    w.insert(staffCredentials, { staffId, type, title, completedOn, ...extra });
  await cred(dsp1.id, "background_study", "DHS NETStudy 2.0 clearance", "2025-06-05");
  await cred(dsp1.id, "orientation", "245D orientation to program requirements", "2025-06-20", { hours: "8.0" });
  await cred(dsp1.id, "maltreatment_reporting", "Vulnerable adult and child maltreatment reporting", "2025-06-11", { hours: "1.5" });
  await cred(dsp1.id, "annual_training", "Person-centered practices and positive supports", "2025-10-02", { hours: "12.0" });
  await cred(dsp1.id, "first_aid", "Red Cross Adult First Aid/CPR/AED", "2025-03-14", { expiresOn: "2027-03-14" });
  await cred(dsp1.id, "drivers_license", "MN Class D", "2023-01-10", { expiresOn: "2027-01-10" });
  await cred(dsp2.id, "background_study", "DHS NETStudy 2.0 clearance", "2025-08-28");
  await cred(sup.id, "background_study", "DHS NETStudy 2.0 clearance", "2024-02-20");
  await cred(sup.id, "orientation", "245D orientation to program requirements", "2024-03-05", { hours: "8.0" });
  await cred(sup.id, "maltreatment_reporting", "Maltreatment reporting refresher", "2025-09-01", { hours: "1.0" });
  await cred(sup.id, "annual_training", "Annual 245D training day", "2025-09-01", { hours: "8.0" });
  await cred(admin.id, "background_study", "DHS NETStudy 2.0 clearance", "2024-01-05");
  await cred(admin.id, "orientation", "245D orientation to program requirements", "2024-01-20");
  await cred(admin.id, "maltreatment_reporting", "Maltreatment reporting", "2025-09-10");
  await cred(admin.id, "annual_training", "Annual 245D training day", "2025-09-10", { hours: "8.0" });

  console.log(`Seeded org "${org.name}" with 4 staff, 3 users, 3 sites, 4 programs, 4 people, 4 agreements, 6 assignments, 15 credentials, six pay periods of visits, 4 life-plan goals, 3 medications with a 30-day MAR, and two weeks of shifts.`);
  console.log(`Log in with admin@example.com, supervisor@example.com, or dsp@example.com. Password: ${PASSWORD}`);
  console.log("Client signing codes: Jordan Abelard 482113, Riley Bergstrom 730924. Casey Dahl and Taylor Frey have none yet.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
