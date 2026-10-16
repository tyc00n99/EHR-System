import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { threadFor } from "@/db/message-queries";
import { requireUser } from "@/lib/auth";
import { getFile } from "@/lib/storage";

/** Raster images and PDFs open in the browser; anything else (an SVG included) downloads. */
const INLINE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);

/**
 * Serves a file sent in Messages, only to someone who can read the message it came with: either
 * end of a direct message, or anyone the thread's channel is open to. Never cached by a shared cache.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const db = await getDb();
  const [row] = await db
    .select({ path: schema.messageAttachments.path, fileName: schema.messageAttachments.fileName, contentType: schema.messageAttachments.contentType, senderId: schema.messages.senderId, recipientId: schema.messages.recipientId, threadId: schema.messages.threadId })
    .from(schema.messageAttachments)
    .innerJoin(schema.messages, eq(schema.messageAttachments.messageId, schema.messages.id))
    .where(eq(schema.messageAttachments.id, id))
    .limit(1);
  if (!row) notFound();
  const allowed = row.threadId
    ? Boolean(await threadFor({ userId: user.id, role: user.role, abilities: user.abilities, staffId: user.staffId }, row.threadId))
    : row.senderId === user.id || row.recipientId === user.id;
  if (!allowed) notFound();
  const file = await getFile(row.path);
  if (!file) notFound();
  const inline = INLINE.has(row.contentType);
  const ascii = row.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return new Response(new Uint8Array(file.bytes) as unknown as BodyInit, {
    headers: {
      "Content-Type": inline ? row.contentType : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
