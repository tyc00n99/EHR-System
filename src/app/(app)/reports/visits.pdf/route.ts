import { renderToBuffer } from "@react-pdf/renderer";
import { getOrganization, listVisits } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { payPeriodFromParam } from "@/lib/pay-period";
import { registerPdfFonts } from "@/lib/pdf-fonts";
import { minutesBetween } from "@/lib/units";
import { ReportPdf } from "../report-pdf";

const TZ = "America/Chicago";
const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: TZ });
const time = new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: TZ });
const hours = (m: number) => (m / 60).toFixed(1).replace(/\.0$/, "");
const standing = (v: { returnedAt: Date | null; status: string; clientSignedAt: Date | null; manualEntry: boolean }) =>
  v.returnedAt ? "Returned" : v.status === "in_progress" ? "In progress" : v.status === "void" ? "Void" : !v.clientSignedAt ? "Unsigned" : v.manualEntry ? "Manual" : "Signed";

/**
 * The Notes list as a landscape table: one line per visit for the pay period, or for the visits
 * whose ids are passed (the table's selection). Same audience as the CSV.
 */
export async function GET(req: Request) {
  await requireUser(["admin", "supervisor"]);
  const sp = new URL(req.url).searchParams;
  const period = payPeriodFromParam(sp.get("period") ?? undefined);
  const ids = new Set((sp.get("ids") ?? "").split(",").filter((s) => /^[0-9a-f-]{36}$/.test(s)));
  const [rows, org] = await Promise.all([listVisits({ from: period.start, to: period.end, limit: 5000 }), getOrganization()]);
  const picked = (ids.size ? rows.filter((r) => ids.has(r.visit.id)) : rows).slice().sort((a, b) => a.visit.clockInAt.getTime() - b.visit.clockInAt.getTime());
  const completed = picked.filter((r) => r.visit.status === "completed");
  const minutes = completed.reduce((n, r) => n + (r.visit.clockOutAt ? minutesBetween(r.visit.clockInAt, r.visit.clockOutAt) : 0), 0);
  const units = completed.reduce((n, r) => n + r.visit.units, 0);
  const unsigned = completed.filter((r) => !r.visit.clientSignedAt).length;
  registerPdfFonts();
  const buffer = await renderToBuffer(ReportPdf({
    title: `Notes · ${period.label}`,
    org: org.name,
    subtitle: ids.size ? `${picked.length} selected visits` : `All visits in the pay period`,
    landscape: true,
    summary: [
      { label: "Visits", value: String(picked.length) },
      { label: "Hours", value: hours(minutes) },
      { label: "Units", value: units.toLocaleString("en-US") },
      { label: "Unsigned", value: String(unsigned) },
    ],
    columns: [
      { key: "date", label: "Date", width: 52 },
      { key: "in", label: "Clock in", width: 58, mono: true },
      { key: "out", label: "Clock out", width: 58, mono: true },
      { key: "hours", label: "Hours", width: 44, align: "right", mono: true },
      { key: "client", label: "Client", width: 120 },
      { key: "staff", label: "Caregiver", width: 110 },
      { key: "service", label: "Service", width: 72, mono: true },
      { key: "units", label: "Units", width: 40, align: "right", mono: true },
      { key: "status", label: "Status", width: 62 },
      { key: "evv", label: "EVV", width: 52 },
      { key: "note", label: "Progress review", width: 250 },
    ],
    rows: picked.map(({ visit: v, personFirst, personLast, staffFirst, staffLast }) => ({
      date: day.format(v.clockInAt),
      in: time.format(v.clockInAt),
      out: v.clockOutAt ? time.format(v.clockOutAt) : "",
      hours: v.clockOutAt ? hours(minutesBetween(v.clockInAt, v.clockOutAt)) : "",
      client: `${personFirst} ${personLast}`,
      staff: `${staffFirst} ${staffLast}`,
      service: `${v.serviceCode}${v.modifiers.length ? " " + v.modifiers.join(" ") : ""}`,
      units: v.units,
      status: standing(v),
      evv: v.evvStatus,
      note: v.shiftNote ?? "",
    })),
    totals: { date: "Total", in: "", out: "", hours: hours(minutes), client: `${picked.length} visits`, staff: "", service: "", units, status: unsigned ? `${unsigned} unsigned` : "", evv: "", note: "" },
  }));
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="notes-${period.startDate}${ids.size ? "-selected" : ""}.pdf"` } });
}
