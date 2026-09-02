"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { requireUser } from "@/lib/auth";
import { fieldErrors, formToObject, programSchema, siteSchema, type ActionState } from "@/lib/validation";

export async function createSite(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const parsed = siteSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const db = await getDb();
  const site = await audited(db, { userId: user.id }).insert(schema.sites, parsed.data);
  revalidatePath("/sites");
  redirect(`/sites/${site.id}`);
}

export async function createProgram(siteId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "supervisor"]);
  const parsed = programSchema.safeParse({ ...formToObject(fd), siteId });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const db = await getDb();
  await audited(db, { userId: user.id }).insert(schema.programs, parsed.data);
  revalidatePath(`/sites/${siteId}`);
  revalidatePath("/sites");
  return {};
}

export async function toggleProgram(id: string, siteId: string, active: boolean) {
  const user = await requireUser(["admin", "supervisor"]);
  const db = await getDb();
  await audited(db, { userId: user.id }).update(schema.programs, id, { active });
  revalidatePath(`/sites/${siteId}`);
  revalidatePath("/sites");
}
