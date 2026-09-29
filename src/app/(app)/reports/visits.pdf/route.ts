import { listVisits } from "@/db/queries";
import { requireAbility } from "@/lib/auth";
import { resolveVisitRange } from "@/lib/visit-range";
import { getPayRules } from "@/db/pay-queries";
import { buildNotesPdfForVisits } from "../../clients/[id]/notes.pdf/build";

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
  const buffer = await buildNotesPdfForVisits(picked);
  if (!buffer) return new Response("No finished notes in this selection.", { status: 404 });
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="notes-${range.slug}${ids.size ? "-selected" : ""}.pdf"`, "Cache-Control": "no-store" } });
}
