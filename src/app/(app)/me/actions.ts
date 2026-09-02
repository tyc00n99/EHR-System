"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { requireUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { fieldErrors, formToObject, passwordChangeSchema, type ActionState } from "@/lib/validation";

export async function changePassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = passwordChangeSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const db = await getDb();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  if (!row || !(await verifyPassword(parsed.data.current, row.passwordHash))) return { errors: { current: "Current password is not correct" } };
  await audited(db, { userId: user.id }).update(schema.users, user.id, { passwordHash: await hashPassword(parsed.data.next) });
  return { message: "Password changed." };
}
