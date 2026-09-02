"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { getOrganization } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { fieldErrors, formToObject, type ActionState } from "@/lib/validation";

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
