import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { threadFor } from "@/db/message-queries";
import { requireUser } from "@/lib/auth";
import { getFile } from "@/lib/storage";

/** Raster images, PDFs and voice notes open in the browser; anything else (an SVG included) downloads. */
const INLINE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/aac"]);

/**
 * Serves a file sent in Messages, only to someone who can read the message it came with: either
 * end of a direct message, or anyone the thread's channel is open to. Never cached by a shared cache.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const bytes = new Uint8Array(file.bytes);
  const headers: Record<string, string> = {
    "Content-Type": inline ? row.contentType : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  // Safari plays audio only from a server that answers byte ranges, so a voice note needs them.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const size = bytes.byteLength;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    return new Response(bytes.slice(start, end + 1) as unknown as BodyInit, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}` } });
  }
  return new Response(bytes as unknown as BodyInit, { headers });
}
