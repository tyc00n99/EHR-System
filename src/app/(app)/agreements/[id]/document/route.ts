import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { getAgreement } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/uploads";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser(["admin", "supervisor"]);
  const { id } = await params;
  const a = await getAgreement(id);
  if (!a?.documentPath) notFound();
  const file = await readFile(path.join(UPLOAD_DIR, a.documentPath));
  return new Response(new Uint8Array(file), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${(a.documentName ?? "service-agreement.pdf").replace(/"/g, "")}"` } });
}
