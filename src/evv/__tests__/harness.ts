/**
 * Test harness: an in-memory PGlite database with the real migrations applied, two tenants, and
 * deterministic fixtures. No network, no real PHI (names are invented), no real aggregator.
 */
import Module from "node:module";
import { randomUUID } from "node:crypto";

// `server-only` throws outside Next; the scripts stub it the same way.
const load = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (request: unknown, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return load.call(this, request, ...rest);
};
process.env.DATA_ENCRYPTION_KEY ??= "ab".repeat(32);
process.env.EVV_AGGREGATOR_ADAPTER ??= "mock";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { ensureEvvDefaults, makeCtx, type EvvCtx } from "@/evv/context";
import type { ClockEventInput } from "@/evv/ingest";

export interface Tenant {
  orgId: string;
  adminUserId: string;
  staffId: string;
  staffUserId: string;
  secondStaffId: string;
  personId: string;
  secondPersonId: string;
  agreementId: string;
  /** H2019 (positive support) — not an EVV service in Minnesota. */
  nonEvvAgreementId: string;
  home: { lat: number; lng: number };
}

export interface World { db: Db; a: Tenant; b: Tenant; now: () => Date; set: (iso: string) => void; advance: (minutes: number) => void; ctx: (t: Tenant, actorUserId?: string | null) => EvvCtx }

export const HOME = { lat: 44.9778, lng: -93.265 }; // downtown Minneapolis
const CLOCK = { value: new Date("2026-09-14T15:00:00Z") }; // 10:00 CDT

export async function createWorld(): Promise<World> {
  const client = new PGlite();
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as Db;
  await migrate(db as never, { migrationsFolder: `${process.cwd()}/drizzle` });
  const a = await tenant(db, "A", HOME);
  const b = await tenant(db, "B", { lat: 46.7867, lng: -92.1005 });
  return {
    db, a, b,
    now: () => CLOCK.value,
    set: (iso) => { CLOCK.value = new Date(iso); },
    advance: (minutes) => { CLOCK.value = new Date(CLOCK.value.getTime() + minutes * 60_000); },
    ctx: (t, actorUserId = t.adminUserId) => makeCtx(db, t.orgId, actorUserId, () => CLOCK.value),
  };
}

let pmiSeq = 10_000_000;
async function tenant(db: Db, tag: string, home: { lat: number; lng: number }): Promise<Tenant> {
  const [org] = await db.insert(schema.organizations).values({ name: `Org ${tag}`, taxId: `41-000000${tag === "A" ? 1 : 2}`, umpi: `A00000000${tag === "A" ? 1 : 2}`, npi: null }).returning();
  const [st] = await db.insert(schema.staff).values({ firstName: "Care", lastName: `Giver${tag}`, dob: "1990-01-01", gender: "female", ssnEncrypted: "x", ssnLast4: "1234", payRate: "20.00", address1: "1 St", city: "Minneapolis", zip: "55401", npi: `1${tag === "A" ? "111111111" : "222222222"}`, hireDate: "2025-01-01", title: "DSP" }).returning();
  const [st2] = await db.insert(schema.staff).values({ firstName: "Other", lastName: `Giver${tag}`, dob: "1990-01-01", gender: "male", ssnEncrypted: "x", ssnLast4: "5678", payRate: "20.00", address1: "1 St", city: "Minneapolis", zip: "55401", umpi: `B00000000${tag === "A" ? 1 : 2}`, hireDate: "2025-01-01", title: "DSP" }).returning();
  const [admin] = await db.insert(schema.users).values({ email: `admin-${tag}@example.test`, passwordHash: "x", role: "admin" }).returning();
  const [dspUser] = await db.insert(schema.users).values({ email: `dsp-${tag}@example.test`, passwordHash: "x", role: "dsp", staffId: st.id }).returning();
  const [p] = await db.insert(schema.people).values({ firstName: "Client", lastName: tag, dob: "1980-05-05", pmi: String(pmiSeq++), waiverProgram: "CADI", county: "Hennepin", caseManagerName: "CM", status: "active" }).returning();
  const [p2] = await db.insert(schema.people).values({ firstName: "Second", lastName: tag, dob: "1981-05-05", pmi: String(pmiSeq++), waiverProgram: "CADI", county: "Hennepin", caseManagerName: "CM", status: "active" }).returning();
  await db.insert(schema.clientLocations).values({ personId: p.id, type: "home", isDefault: true, lat: home.lat, lng: home.lng, posCode: "12" });
  await db.insert(schema.clientLocations).values({ personId: p2.id, type: "home", isDefault: true, lat: home.lat, lng: home.lng, posCode: "12" });
  const [ag] = await db.insert(schema.serviceAgreements).values({ personId: p.id, agreementNumber: `SA-${tag}-1`, serviceCode: "H2014", modifiers: ["UC", "U3"], authorizedUnits: 1000, unitRate: "6.85", unitMinutes: 15, startDate: "2026-01-01", endDate: "2026-12-31", authorizingCounty: "Hennepin", status: "active" }).returning();
  const [nonEvv] = await db.insert(schema.serviceAgreements).values({ personId: p.id, agreementNumber: `SA-${tag}-2`, serviceCode: "H2019", modifiers: [], authorizedUnits: 100, unitRate: "20.00", unitMinutes: 15, startDate: "2026-01-01", endDate: "2026-12-31", authorizingCounty: "Hennepin", status: "active" }).returning();
  await db.insert(schema.assignments).values([{ staffId: st.id, personId: p.id, active: true, orientedOn: "2026-01-02" }, { staffId: st.id, personId: p2.id, active: true, orientedOn: "2026-01-02" }, { staffId: st2.id, personId: p.id, active: true, orientedOn: "2026-01-02" }]);
  await ensureEvvDefaults(db, org.id, admin.id);
  return { orgId: org.id, adminUserId: admin.id, staffId: st.id, staffUserId: dspUser.id, secondStaffId: st2.id, personId: p.id, secondPersonId: p2.id, agreementId: ag.id, nonEvvAgreementId: nonEvv.id, home };
}

/** A well-formed mobile event at the client's home, now. */
export function event(w: World, overrides: Partial<ClockEventInput> = {}): ClockEventInput {
  return {
    eventId: randomUUID(), idempotencyKey: `k-${randomUUID()}`, deviceCapturedAt: w.now().toISOString(), deviceUtcOffsetMinutes: -300,
    latitude: HOME.lat, longitude: HOME.lng, accuracyMeters: 12, locationSource: "gps", locationType: "home", verificationMethod: "mobile", offline: false, deviceId: "test-device",
    ...overrides,
  };
}

export const dsp = (t: Tenant) => ({ userId: t.staffUserId, staffId: t.staffId, role: "dsp" as const });
export const admin = (t: Tenant) => ({ userId: t.adminUserId, staffId: t.staffId, role: "admin" as const });
export const newId = () => randomUUID();
