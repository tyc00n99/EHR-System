import { listVisits } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { resolveVisitRange } from "@/lib/visit-range";

const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function GET(req: Request) {
  await requireUser(["admin", "supervisor"]);
  const sp = new URL(req.url).searchParams;
  const range = resolveVisitRange(sp);
  // ?ids= narrows the export to the rows ticked in the table.
  const ids = new Set((sp.get("ids") ?? "").split(",").filter((s) => /^[0-9a-f-]{36}$/.test(s)));
  const rows = (await listVisits({ from: range.start, to: range.end, limit: 5000 })).filter((r) => !ids.size || ids.has(r.visit.id));
  const header = ["visit_id", "status", "client", "pmi", "staff", "rendering_id_type", "rendering_id", "service_code", "modifiers", "place_of_service", "clock_in", "clock_out", "minutes", "units", "manual_entry", "manual_reason", "client_signed_at", "unsigned_reason", "evv_status", "clock_in_lat", "clock_in_lng", "clock_out_lat", "clock_out_lng", "shift_note"];
  const lines = rows.map(({ visit: v, personFirst, personLast, staffFirst, staffLast }) => [v.id, v.status, `${personFirst} ${personLast}`, v.pmi, `${staffFirst} ${staffLast}`, v.renderingIdType, v.renderingId, v.serviceCode, v.modifiers.join(" "), v.placeOfService, v.clockInAt.toISOString(), v.clockOutAt?.toISOString() ?? "", v.clockOutAt ? Math.round((v.clockOutAt.getTime() - v.clockInAt.getTime()) / 60000) : "", v.units, v.manualEntry ? "yes" : "no", v.manualEntryReason ?? "", v.clientSignedAt?.toISOString() ?? "", v.clientUnsignedReason ?? "", v.evvStatus, v.clockInLat, v.clockInLng, v.clockOutLat ?? "", v.clockOutLng ?? "", v.shiftNote ?? ""].map(esc).join(","));
  const csv = [header.join(","), ...lines].join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="visits-${range.slug}.csv"` } });
}
