import { notFound } from "next/navigation";
import { getAgreement } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { getFile } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser(["admin", "supervisor"]);
  const { id } = await params;
  const a = await getAgreement(id);
  if (!a?.documentPath) notFound();
  const file = await getFile(a.documentPath);
  if (!file) notFound();
  return new Response(new Uint8Array(file.bytes) as unknown as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${(a.documentName ?? "service-agreement.pdf").replace(/"/g, "")}"` } });
}
