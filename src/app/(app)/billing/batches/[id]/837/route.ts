import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { audited } from "@/db/audited";
import { claimBatches } from "@/db/schema";
import { requireAbility } from "@/lib/auth";

/** The 837P exactly as it was sent or handed over. PHI: billing ability only, never cached. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAbility("billing");
  const { id } = await params;
  const db = await getDb();
  const [batch] = await db.select({ id: claimBatches.id, fileText: claimBatches.fileText, controlNumber: claimBatches.controlNumber }).from(claimBatches).where(eq(claimBatches.id, id));
  if (!batch) return new Response("Not found", { status: 404 });
  await audited(db, { userId: user.id }).event("reveal", batch.id, "claim_batches", { field: "fileText" });
  return new Response(batch.fileText, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="EVVora-837P-${String(batch.controlNumber).padStart(9, "0")}.txt"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
