import { listVisits } from "@/db/queries";
import { requireAbility } from "@/lib/auth";
import { resolveVisitRange } from "@/lib/visit-range";
import { getPayRules } from "@/db/pay-queries";
import { buildNotesPdfForVisits } from "../../clients/[id]/notes.pdf/build";
import { pdfDisposition } from "@/lib/pdf-names";

// A pay period of notes is many pages; give the render room.
export const maxDuration = 60;

/**
 * The Notes list's Export PDF: the printed Daily Service Notes themselves, one per page in date order,
 * for the visits whose ids are passed (the table's selection) or every completed note in the range
 * (Sept 29, 2026, user: "I want to see the PDF of all the session notes, not a table"). The CSV stays
 * the table for anyone who wants one.
 */
export async function GET(req: Request) {
  await requireAbility("review");
  const sp = new URL(req.url).searchParams;
  const range = resolveVisitRange(sp, await getPayRules());
  const ids = new Set((sp.get("ids") ?? "").split(",").filter((s) => /^[0-9a-f-]{36}$/.test(s)));
  const rows = await listVisits({ from: range.start, to: range.end, limit: 5000 });
  const picked = ids.size ? rows.filter((r) => ids.has(r.visit.id)) : rows;
  // Ticked rows are named by the notes they hold; a whole range by the range that was chosen.
  const built = await buildNotesPdfForVisits(picked, ids.size ? undefined : { from: range.from, to: range.to });
  if (!built) return new Response("No finished notes in this selection.", { status: 404 });
  return new Response(new Uint8Array(built.buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": pdfDisposition("attachment", built.name), "Cache-Control": "no-store" } });
}
