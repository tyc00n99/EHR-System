"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { getOrganization } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { fieldErrors, formToObject, type ActionState } from "@/lib/validation";
import { eq } from "drizzle-orm";

const orgSchema = z.object({
  name: z.string().min(1, "Required").max(200),
  taxId: z.string().regex(/^\d{2}-?\d{7}$/, "EIN like 41-1234567"),
  npi: z.string().regex(/^\d{10}$/, "10 digits").optional(),
  umpi: z.string().regex(/^[A-Z0-9]{10}$/i, "10 characters").optional(),
  licenseNumber: z.string().max(50).optional(),
  address1: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().length(2).default("MN"),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, "5-digit ZIP").optional(),
  phone: z.string().max(30).optional(),
});

export async function updateOrganization(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin"]);
  const parsed = orgSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const org = await getOrganization();
  const db = await getDb();
  const values = Object.fromEntries(Object.keys(orgSchema.shape).map((k) => [k, (parsed.data as Record<string, unknown>)[k] ?? null]));
  await audited(db, { userId: user.id }).update(schema.organizations, org.id, values);
  revalidatePath("/", "layout");
  return { message: "Saved." };
}

const typeRows = z.array(z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1, "Name every document").max(120),
  required: z.boolean(),
  renewMonths: z.number().int().positive().max(120).nullable(),
  remove: z.boolean().optional(),
})).max(60);

const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "type";

/** Saves the agency's client document list: order, names, required ticks and renewal. Locked (245D) types stay required. */
export async function saveDocumentTypes(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin"]);
  let raw: unknown;
  try { raw = JSON.parse(String(fd.get("types") ?? "[]")); } catch { return { message: "The list could not be read." }; }
  const parsed = typeRows.safeParse(raw);
  if (!parsed.success) return { errors: { types: "Check the list" }, message: parsed.error.issues[0]?.message ?? "Check the list." };
  const db = await getDb();
  const existing = await db.select().from(schema.documentTypes);
  const keys = new Set(existing.map((t) => t.key));
  const actor = audited(db, { userId: user.id });
  let order = 1;
  for (const row of parsed.data) {
    const cur = row.id ? existing.find((t) => t.id === row.id) : undefined;
    if (row.id && !cur) continue;
    if (cur) {
      const required = cur.locked ? true : row.required;
      const active = cur.locked ? true : !row.remove;
      await actor.update(schema.documentTypes, cur.id, { label: row.label, required, renewMonths: row.renewMonths, active, sortOrder: active ? order : cur.sortOrder });
    } else if (!row.remove) {
      let key = slug(row.label);
      while (keys.has(key)) key = `${slug(row.label)}_${Math.random().toString(16).slice(2, 6)}`;
      keys.add(key);
      await actor.insert(schema.documentTypes, { key, label: row.label, required: row.required, locked: false, renewMonths: row.renewMonths, sortOrder: order, active: true });
    }
    if (!row.remove) order++;
  }
  void eq;
  revalidatePath("/settings");
  revalidatePath("/clients", "layout");
  return { ok: true };
}
