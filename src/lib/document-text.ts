import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { aiConfigured } from "@/lib/ai/extract-agreement";
import { MODEL, readable, transcribeDocument } from "@/lib/ai/read-document";
import { getFile } from "@/lib/storage";

/**
 * The text layer behind every uploaded document. Reading happens once, at upload or on request,
 * and the text is stored on the document row under the same access rules as the file — it is
 * PHI and never leaves the row for an index elsewhere. A failed read never fails an upload: the
 * file is the record, the text is a convenience.
 */

export interface TextLayer { extractedText: string; extractedAt: Date; extractionSummary: string; extractionModel: string }

/** Reads an uploaded file for its text layer. Returns null when reading is off, unsupported, or fails. */
export async function textLayerFor(file: File): Promise<TextLayer | null> {
  if (!aiConfigured() || !readable(file.type, file.name)) return null;
  try {
    const read = await transcribeDocument(new Uint8Array(await file.arrayBuffer()), file.type || "application/pdf", file.name);
    return { extractedText: read.text, extractedAt: new Date(), extractionSummary: read.summary, extractionModel: MODEL };
  } catch (e) {
    console.warn("document text layer skipped:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** A text layer carried over from a read that already happened on the same file (the personnel-file form). */
export function textLayerFrom(text: string | null | undefined, summary: string | null | undefined): TextLayer | null {
  if (!text?.trim()) return null;
  return { extractedText: text, extractedAt: new Date(), extractionSummary: summary?.trim() || "", extractionModel: MODEL };
}

/** Reads a document that is already stored and writes its text layer. For files uploaded before reading existed. */
export async function indexStoredDocument(kind: "client" | "staff", id: string, userId: string): Promise<{ ok?: true; error?: string }> {
  if (!aiConfigured()) return { error: "Document reading is off. An admin can turn it on by adding ANTHROPIC_API_KEY to the app's environment settings." };
  const db = await getDb();
  const table = kind === "client" ? schema.clientDocuments : schema.staffDocuments;
  const [doc] = await db.select({ filePath: table.filePath, mimeType: table.mimeType, fileName: table.fileName }).from(table).where(eq(table.id, id)).limit(1);
  if (!doc) return { error: "That document is no longer on file." };
  if (!readable(doc.mimeType, doc.fileName)) return { error: "Only PDFs and photos can be read. Word documents and HEIC images are stored as they are." };
  const stored = await getFile(doc.filePath);
  if (!stored) return { error: "The file's bytes are missing." };
  try {
    const read = await transcribeDocument(stored.bytes, doc.mimeType, doc.fileName);
    const layer: TextLayer = { extractedText: read.text, extractedAt: new Date(), extractionSummary: read.summary, extractionModel: MODEL };
    if (kind === "client") await audited(db, { userId }).update(schema.clientDocuments, id, layer);
    else await audited(db, { userId }).update(schema.staffDocuments, id, layer);
    return { ok: true };
  } catch (e) {
    const { explainAiError } = await import("@/lib/ai/extract-agreement");
    return { error: explainAiError(e) };
  }
}
