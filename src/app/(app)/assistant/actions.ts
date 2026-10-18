"use server";

import { randomUUID } from "node:crypto";
import { renderToBuffer } from "@react-pdf/renderer";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { canViewPerson, getOrganization, getPerson } from "@/db/queries";
import { ReportPdf } from "@/lib/ai/assistant/report-pdf";
import { DRAFT_LABEL } from "@/lib/ai/assistant/types";
import { requireAbility } from "@/lib/auth";
import { textLayerFrom } from "@/lib/document-text";
import { putFile } from "@/lib/storage";

const Input = z.object({
  personId: z.uuid(),
  kind: z.enum(["progress_summary", "incident_report", "message", "other"]),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(20).max(12000),
  reviewed: z.literal(true),
});

/**
 * Files an assistant draft in the client's Documents, after the person ticked that they reviewed it
 * (Oct 18, 2026). Only this step writes: the assistant itself never does. The text saved is exactly
 * what the reviewer approved — their edits included — as a PDF with an approval line, filed under
 * "Other file" so it never counts toward a required checklist item. Same rule as uploading a file:
 * `manage_people`, and the person must be on the reviewer's caseload. Audited like any upload.
 */
export async function saveDraftToDocuments(input: z.input<typeof Input>): Promise<{ ok?: true; message: string }> {
  const user = await requireAbility("manage_people");
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { message: parsed.error.issues.some((i) => i.path[0] === "reviewed") ? "Tick that you reviewed the draft first." : "The draft needs a title and some text." };
  const d = parsed.data;
  if (!(await canViewPerson(user, d.personId))) return { message: "This person is not on your caseload." };
  const [person, org] = await Promise.all([getPerson(d.personId), getOrganization()]);
  if (!person) return { message: "Client not found." };
  const db = await getDb();
  const [type] = await db.select().from(schema.documentTypes).where(eq(schema.documentTypes.key, "other")).limit(1);
  if (!type) return { message: "The 'Other file' document type is missing. Check Settings → Client documents." };

  const approvedAt = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "long", day: "numeric", year: "numeric" });
  const approvedBy = user.staffName ?? user.email;
  const pdf = new Uint8Array(await renderToBuffer(ReportPdf({ r: { org: org.name, title: d.title, kindLabel: DRAFT_LABEL[d.kind], client: { name: `${person.firstName} ${person.lastName}`, pmi: person.pmi }, body: d.body, approvedBy, approvedAt } })));
  const rel = `clients/${person.id}/${randomUUID()}.pdf`;
  await putFile(rel, pdf, "application/pdf");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  await audited(db, { userId: user.id }).insert(schema.clientDocuments, {
    ...(textLayerFrom(d.body, `${DRAFT_LABEL[d.kind]} drafted with the assistant, approved by ${approvedBy}`) ?? {}),
    personId: person.id,
    documentTypeId: type.id,
    category: "other",
    title: d.title,
    fileName: `${d.title.replace(/[^\w .-]+/g, "").slice(0, 80) || "Assistant draft"}.pdf`,
    filePath: rel,
    mimeType: "application/pdf",
    sizeBytes: pdf.byteLength,
    effectiveOn: today,
    note: `Drafted with the assistant; reviewed and approved by ${approvedBy}.`,
    uploadedBy: user.id,
  });
  revalidatePath(`/clients/${person.id}`);
  return { ok: true, message: `Saved to ${person.firstName}'s Documents.` };
}
