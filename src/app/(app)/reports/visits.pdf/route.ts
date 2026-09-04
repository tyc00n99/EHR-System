import { renderToBuffer } from "@react-pdf/renderer";
import { getOrganization, periodLines } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { payPeriodFromParam } from "@/lib/pay-period";
import { ReportPdf } from "../report-pdf";

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Visit detail for one pay period as a landscape PDF: the claim source of truth in a form a county or auditor can read. */
export async function GET(req: Request) {
  await requireUser(["admin", "supervisor"]);
  const period = payPeriodFromParam(new URL(req.url).searchParams.get("period") ?? undefined);
  const [lines, org] = await Promise.all([periodLines(period.start, period.end), getOrganization()]);
  const sorted = [...lines].sort((a, b) => a.personName.localeCompare(b.personName) || a.clockInAt.getTime() - b.clockInAt.getTime());
  const rows = sorted.map((l) => ({
    client: l.personName,
    staff: l.staffName,
    when: `${day.format(l.clockInAt)} ${time.format(l.clockInAt)}${l.clockOutAt ? ` – ${time.format(l.clockOutAt)}` : ""}`,
    code: l.serviceCode,
    units: l.units,
    rate: money(l.unitRate),
    amount: money(l.units * l.unitRate),
    signed: l.signed ? "Yes" : "No",
    evv: l.manual ? `Manual · ${l.evvStatus}` : l.evvStatus,
  }));
  const units = lines.reduce((n, l) => n + l.units, 0);
  const amount = lines.reduce((n, l) => n + l.units * l.unitRate, 0);
  const unsigned = lines.filter((l) => !l.signed).length;
  const buffer = await renderToBuffer(ReportPdf({
    title: `Visit detail · ${period.label}`,
    org: org.name,
    subtitle: `Completed visits ${period.label} · ${lines.length} visits`,
    landscape: true,
    summary: [
      { label: "Visits", value: String(lines.length) },
      { label: "Units", value: units.toLocaleString() },
      { label: "Billable", value: money(amount) },
      { label: "Unsigned", value: String(unsigned) },
    ],
    columns: [
      { key: "client", label: "Client", width: 115 },
      { key: "staff", label: "Caregiver", width: 110 },
      { key: "when", label: "Date and time", width: 170, mono: true },
      { key: "code", label: "Code", width: 50, mono: true },
      { key: "units", label: "Units", width: 50, align: "right", mono: true },
      { key: "rate", label: "Rate", width: 60, align: "right", mono: true },
      { key: "amount", label: "Amount", width: 80, align: "right", mono: true },
      { key: "signed", label: "Signed", width: 60 },
      { key: "evv", label: "EVV", width: 110 },
    ],
    rows,
    totals: { client: "Total", staff: "", when: "", code: "", units, rate: "", amount: money(amount), signed: `${lines.length - unsigned}/${lines.length}`, evv: "" },
  }));
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="visits-${period.startDate}.pdf"` } });
}
