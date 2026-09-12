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
