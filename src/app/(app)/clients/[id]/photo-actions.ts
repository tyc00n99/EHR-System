"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { canViewPerson } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { deleteFile, putFile } from "@/lib/storage";
import type { ActionState } from "@/lib/validation";

/**
 * The client's photo. Bytes go to `stored_files` like every other upload, so the app stays
 * stateless on Vercel, and the record only keeps the path — the image itself is never reachable
 * without going through the authenticated route that checks `canViewPerson`.
 */

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_BYTES = 5 * 1024 * 1024;

export async function setClientPhoto(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const personId = String(fd.get("personId") ?? "");
  const file = fd.get("photo");
  if (!personId || !(file instanceof File) || file.size === 0) return { error: "Choose an image first." };

  const user = await requireUser(["admin", "supervisor"]);
  if (!(await canViewPerson(user, personId))) return { error: "That client is not yours to edit." };

  const ext = TYPES[file.type];
  if (!ext) return { error: "Photos must be a JPEG, PNG or WebP." };
  if (file.size > MAX_BYTES) return { error: `That image is ${(file.size / 1_048_576).toFixed(1)}MB. The limit is 5MB.` };

  const db = await getDb();
  const [person] = await db.select({ photoPath: schema.people.photoPath }).from(schema.people).where(eq(schema.people.id, personId)).limit(1);
  if (!person) return { error: "That client no longer exists." };

  // A new path per upload, so a replaced photo cannot be served from a cached URL.
  const path = `clients/${personId}/photo-${randomUUID()}.${ext}`;
  await putFile(path, new Uint8Array(await file.arrayBuffer()), file.type);
  await audited(db, { userId: user.id }).update(schema.people, personId, { photoPath: path, photoUpdatedAt: new Date() });
  if (person.photoPath) await deleteFile(person.photoPath);

  revalidatePath(`/clients/${personId}`);
  return { ok: true, message: "Photo updated." };
}

export async function removeClientPhoto(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const personId = String(fd.get("personId") ?? "");
  if (!personId) return { error: "Missing which client to update." };
  const user = await requireUser(["admin", "supervisor"]);
  if (!(await canViewPerson(user, personId))) return { error: "That client is not yours to edit." };

  const db = await getDb();
  const [person] = await db.select({ photoPath: schema.people.photoPath }).from(schema.people).where(eq(schema.people.id, personId)).limit(1);
  if (!person?.photoPath) return { ok: true };

  await audited(db, { userId: user.id }).update(schema.people, personId, { photoPath: null, photoUpdatedAt: new Date() });
  await deleteFile(person.photoPath);
  revalidatePath(`/clients/${personId}`);
  return { ok: true, message: "Photo removed." };
}
