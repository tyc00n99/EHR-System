"use server";

import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { ownsProfileRow } from "@/db/profile-queries";
import { canViewPerson } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import {
  availabilitySchema, contactSchema, diagnosisSchema, fieldErrors, formToObject, fundingSchema,
  locationSchema, type ActionState,
} from "@/lib/validation";

/**
 * Writes for the Profile tab. One shape for all five sections: the drawer posts a form, the row is
 * created or updated, the tab revalidates. Every write goes through `audited`, and every edit and
 * delete first checks the row actually belongs to the person named in the URL — the row id comes
 * from the client, so it cannot be trusted on its own.
 */

const SECTIONS = {
  contacts: { table: schema.clientContacts, schema: contactSchema, flags: ["isPrimary", "isLegalRepresentative"] },
  funding: { table: schema.clientFundingSources, schema: fundingSchema, flags: [] },
  locations: { table: schema.clientLocations, schema: locationSchema, flags: ["isDefault"] },
  availability: { table: schema.clientAvailability, schema: availabilitySchema, flags: [] },
  diagnoses: { table: schema.clientDiagnoses, schema: diagnosisSchema, flags: ["isPrimary"] },
} as const;

export type SectionKey = keyof typeof SECTIONS;

const isSection = (v: unknown): v is SectionKey => typeof v === "string" && v in SECTIONS;

async function authorize(personId: string) {
  const user = await requireUser(["admin", "supervisor"]);
  if (!(await canViewPerson(user, personId))) throw new Error("Not your client.");
  return user;
}

/** Create or update one row. `id` present means update. */
export async function saveProfileRow(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const personId = String(fd.get("personId") ?? "");
  const section = fd.get("section");
  if (!personId || !isSection(section)) return { error: "That form is missing which record it belongs to." };
  const user = await authorize(personId);

  const { table, schema: shape, flags } = SECTIONS[section];
  const raw = formToObject(fd);
  for (const f of flags) raw[f] = fd.get(f) === "true";
  const parsed = shape.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const db = await getDb();
  const id = typeof raw.id === "string" ? raw.id : null;
  if (id && !(await ownsProfileRow(section, id, personId))) return { error: "That record belongs to a different client." };

  const w = audited(db, { userId: user.id });
  const values = { ...parsed.data, personId } as never;
  if (id) await w.update(table, id, parsed.data as never);
  else await w.insert(table, values);

  // Only one row per person can be the default location, the primary contact, or the primary
  // diagnosis. The parsed union hides those fields, so read them off the raw form instead.
  const exclusive = section === "locations" ? "isDefault" : "isPrimary";
  if ((section === "locations" || section === "contacts" || section === "diagnoses") && raw[exclusive] === true) {
    await clearFlag(db, user.id, section, personId, id);
  }

  revalidatePath(`/clients/${personId}`);
  return { ok: true };
}

/** Turns the exclusive flag off on every other row, so "default" and "primary" mean one row. */
async function clearFlag(db: Awaited<ReturnType<typeof getDb>>, userId: string, section: SectionKey, personId: string, keepId: string | null) {
  const { eq, and, ne } = await import("drizzle-orm");
  const t = SECTIONS[section].table;
  const field = section === "locations" ? "isDefault" : "isPrimary";
  const col = section === "locations" ? schema.clientLocations.isDefault
    : section === "contacts" ? schema.clientContacts.isPrimary
    : schema.clientDiagnoses.isPrimary;
  const idCol = section === "locations" ? schema.clientLocations.id
    : section === "contacts" ? schema.clientContacts.id
    : schema.clientDiagnoses.id;
  const personCol = section === "locations" ? schema.clientLocations.personId
    : section === "contacts" ? schema.clientContacts.personId
    : schema.clientDiagnoses.personId;
  const rows = await db.select({ id: idCol }).from(t)
    .where(and(eq(personCol, personId), eq(col, true), ...(keepId ? [ne(idCol, keepId)] : [])));
  const w = audited(db, { userId });
  for (const r of rows) await w.update(t, r.id, { [field]: false } as never);
}

export async function deleteProfileRow(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const personId = String(fd.get("personId") ?? "");
  const section = fd.get("section");
  const id = String(fd.get("id") ?? "");
  if (!personId || !id || !isSection(section)) return { error: "That form is missing which record to remove." };
  const user = await authorize(personId);
  if (!(await ownsProfileRow(section, id, personId))) return { error: "That record belongs to a different client." };

  const db = await getDb();
  await audited(db, { userId: user.id }).delete(SECTIONS[section].table, id);
  revalidatePath(`/clients/${personId}`);
  return { ok: true };
}
