import { and, like, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { putFile } from "@/lib/storage";
import { MAX_FILE_BYTES, PART_BYTES, pendingPrefix } from "./shared";

/**
 * Receives one part of a file being attached to a message. The composer uploads a file the moment
 * it is picked, in parts small enough for any host (a server action is capped at 1 MB and a single
 * request on Vercel at 4.5 MB, which is why a whole document used to fail), and the parts sit in
 * `stored_files` under a pending path owned by the uploader until `postMessage` joins them into the
 * attachment. Nothing here is readable by anyone else, and parts left behind are swept a day later.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  const id = req.headers.get("x-upload-id") ?? "";
  const part = Number(req.headers.get("x-upload-part") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Bad upload id", { status: 400 });
  if (!Number.isInteger(part) || part < 0 || part * PART_BYTES >= MAX_FILE_BYTES) return new Response("Bad part", { status: 400 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > PART_BYTES) return new Response("Bad part size", { status: 413 });
  const db = await getDb();
  // Sweep this person's parts from uploads that were never sent.
  await db.delete(schema.storedFiles).where(and(like(schema.storedFiles.path, `${pendingPrefix(user.id)}%`), lt(schema.storedFiles.createdAt, new Date(Date.now() - 24 * 3600_000))));
  await putFile(`${pendingPrefix(user.id)}${id}/${String(part).padStart(3, "0")}`, bytes, "application/octet-stream");
  return new Response(null, { status: 204 });
}

/** Forget a pending upload: the person removed the file before sending. */
export async function DELETE(req: Request) {
  const user = await requireUser();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Bad upload id", { status: 400 });
  const db = await getDb();
  await db.delete(schema.storedFiles).where(like(schema.storedFiles.path, `${pendingPrefix(user.id)}${id}/%`));
  return new Response(null, { status: 204 });
}
