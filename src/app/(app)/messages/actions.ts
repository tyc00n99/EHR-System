"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { requireUser } from "@/lib/auth";

const MAX_BODY = 4000;

/**
 * Send a direct message. A caregiver may only write to management (admins and supervisors);
 * office roles may write to anyone with an active login. The body can name a client, so the
 * insert is audited like every other PHI write.
 */
export async function sendMessage(recipientId: string, body: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const text = body.trim();
  if (!text) return { error: "Write a message first." };
  if (text.length > MAX_BODY) return { error: `Keep a message under ${MAX_BODY} characters.` };
  if (recipientId === user.id) return { error: "That is you." };
  const db = await getDb();
  const [recipient] = await db.select({ id: schema.users.id, role: schema.users.role, active: schema.users.active }).from(schema.users).where(eq(schema.users.id, recipientId));
  if (!recipient || !recipient.active) return { error: "That person no longer has a login." };
  if (user.role === "dsp" && recipient.role === "dsp") return { error: "Caregivers message management, not each other." };
  await audited(db, { userId: user.id }).insert(schema.messages, { senderId: user.id, recipientId, body: text });
  revalidatePath("/messages");
  return { ok: true };
}

/** Mark everything the other person sent me as read. Audited per row, like every write to a PHI table. */
export async function markThreadRead(otherId: string): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const unread = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(and(eq(schema.messages.senderId, otherId), eq(schema.messages.recipientId, user.id), isNull(schema.messages.readAt)));
  if (unread.length === 0) return;
  const writer = audited(db, { userId: user.id });
  const at = new Date();
  for (const m of unread) await writer.update(schema.messages, m.id, { readAt: at });
  revalidatePath("/messages");
}
