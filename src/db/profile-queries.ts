import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * Reads for the Profile tab. Everything a person's administrative record is made of, fetched in
 * one round trip so the section list can show its counts without the page waiting on eight
 * separate queries.
 */

export interface ProfileRecord {
  contacts: schema.ClientContact[];
  funding: schema.ClientFundingSource[];
  locations: schema.ClientLocation[];
  availability: schema.ClientAvailability[];
  diagnoses: schema.ClientDiagnosis[];
}

/**
 * Every client's weekly availability in one read, for the schedule grid. The grid needs to mark
 * days nobody is available on across the whole caseload, and one query per client would be a
 * query per row per week.
 */
export async function listAllAvailability(): Promise<schema.ClientAvailability[]> {
  const db = await getDb();
  return db.select().from(schema.clientAvailability).orderBy(asc(schema.clientAvailability.weekday));
}

export async function getClientProfile(personId: string): Promise<ProfileRecord> {
  const db = await getDb();
  const [contacts, funding, locations, availability, diagnoses] = await Promise.all([
    db.select().from(schema.clientContacts).where(eq(schema.clientContacts.personId, personId))
      // Whoever you ring first sorts first.
      .orderBy(asc(schema.clientContacts.isPrimary), asc(schema.clientContacts.name)),
    db.select().from(schema.clientFundingSources).where(eq(schema.clientFundingSources.personId, personId))
      .orderBy(asc(schema.clientFundingSources.priority), asc(schema.clientFundingSources.startDate)),
    db.select().from(schema.clientLocations).where(eq(schema.clientLocations.personId, personId))
      .orderBy(asc(schema.clientLocations.type)),
    db.select().from(schema.clientAvailability).where(eq(schema.clientAvailability.personId, personId))
      .orderBy(asc(schema.clientAvailability.weekday), asc(schema.clientAvailability.startTime)),
    db.select().from(schema.clientDiagnoses).where(eq(schema.clientDiagnoses.personId, personId))
      .orderBy(asc(schema.clientDiagnoses.icdCode)),
  ]);
  // isPrimary sorts false-first in Postgres, so reverse to put the primary contact at the top.
  contacts.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name));
  return { contacts, funding, locations, availability, diagnoses };
}

/** Confirms a row belongs to the person named in the URL before any edit or delete touches it. */
export async function ownsProfileRow(
  table: "contacts" | "funding" | "locations" | "availability" | "diagnoses",
  id: string,
  personId: string,
): Promise<boolean> {
  const db = await getDb();
  const t = {
    contacts: schema.clientContacts,
    funding: schema.clientFundingSources,
    locations: schema.clientLocations,
    availability: schema.clientAvailability,
    diagnoses: schema.clientDiagnoses,
  }[table];
  const rows = await db.select({ id: t.id }).from(t).where(and(eq(t.id, id), eq(t.personId, personId))).limit(1);
  return rows.length > 0;
}

export interface ProfileEvent { id: string; at: Date; actor: string; event: string }

/** Tables whose rows belong to one person, keyed by the label the history should print. */
const OWNED: Record<string, string> = {
  client_contacts: "emergency contact",
  client_funding_sources: "funding source",
  client_locations: "care location",
  client_availability: "availability",
  client_diagnoses: "diagnosis",
  assignments: "care team",
  service_agreements: "authorization",
  goals: "support plan goal",
  medications: "medication",
  client_documents: "document",
};

const VERB: Record<string, string> = { insert: "added", update: "updated", delete: "removed" };

/**
 * Everything that has been done to this person's record, newest first.
 *
 * Built from the audit log rather than a second history table, so it cannot drift from what was
 * actually written. Rows belonging to a person are found through `personId` in the audit snapshot,
 * which is why `audited()` stores the whole row.
 */
export async function listProfileHistory(personId: string, limit = 50): Promise<ProfileEvent[]> {
  const db = await getDb();
  const { and, desc, eq, inArray, or, sql } = await import("drizzle-orm");
  const owner = sql`coalesce(${schema.auditLog.after} ->> 'personId', ${schema.auditLog.before} ->> 'personId')`;
  const rows = await db
    .select({
      id: schema.auditLog.id,
      at: schema.auditLog.at,
      action: schema.auditLog.action,
      tableName: schema.auditLog.tableName,
      email: schema.users.email,
      first: schema.staff.firstName,
      last: schema.staff.lastName,
    })
    .from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.auditLog.actorUserId, schema.users.id))
    .leftJoin(schema.staff, eq(schema.users.staffId, schema.staff.id))
    .where(
      or(
        and(eq(schema.auditLog.tableName, "people"), eq(schema.auditLog.recordId, personId)),
        and(inArray(schema.auditLog.tableName, Object.keys(OWNED)), sql`${owner} = ${personId}`),
      ),
    )
    .orderBy(desc(schema.auditLog.at))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    actor: r.first ? `${r.first} ${r.last}` : (r.email ?? "System"),
    event:
      r.tableName === "people"
        ? r.action === "insert" ? "created new client"
          : r.action === "reveal" ? "viewed the signing code"
          : "updated client details"
        : `${VERB[r.action] ?? r.action} ${OWNED[r.tableName] ?? r.tableName}`,
  }));
}
