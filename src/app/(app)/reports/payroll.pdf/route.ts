import { renderToBuffer } from "@react-pdf/renderer";
import { getOrganization, periodLines } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { payPeriodFromParam } from "@/lib/pay-period";
import { ReportPdf } from "../report-pdf";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Payroll hours by caregiver for one pay period. Pay rates are admin-only, so supervisors get hours and units without cost columns. */
export async function GET(req: Request) {
  const user = await requireUser(["admin", "supervisor"]);
  const period = payPeriodFromParam(new URL(req.url).searchParams.get("period") ?? undefined);
  const [lines, org] = await Promise.all([periodLines(period.start, period.end), getOrganization()]);
  const by = Object.values(lines.reduce<Record<string, { name: string; visits: number; minutes: number; units: number; rate: number; unsigned: number }>>((acc, l) => {
    const r = (acc[l.staffId] ??= { name: l.staffName, visits: 0, minutes: 0, units: 0, rate: l.payRate, unsigned: 0 });
    r.visits++; r.minutes += l.minutes; r.units += l.units; if (!l.signed) r.unsigned++;
    return acc;
  }, {})).sort((a, b) => a.name.localeCompare(b.name));
  const admin = user.role === "admin";
  const hours = (m: number) => (m / 60).toFixed(2);
  const totalMinutes = by.reduce((n, r) => n + r.minutes, 0);
  const totalCost = by.reduce((n, r) => n + (r.minutes / 60) * r.rate, 0);
  const columns = [
    { key: "name", label: "Caregiver", width: 170 },
    { key: "visits", label: "Visits", width: 60, align: "right" as const, mono: true },
    { key: "hours", label: "Hours", width: 70, align: "right" as const, mono: true },
    { key: "units", label: "Units", width: 60, align: "right" as const, mono: true },
    ...(admin ? [{ key: "rate", label: "Hourly rate", width: 80, align: "right" as const, mono: true }, { key: "cost", label: "Labor cost", width: 90, align: "right" as const, mono: true }] : []),
    { key: "unsigned", label: "Unsigned", width: 70, align: "right" as const, mono: true },
  ];
  const buffer = await renderToBuffer(ReportPdf({
    title: `Payroll hours · ${period.label}`,
    org: org.name,
    subtitle: `Completed visits ${period.label} · ${by.length} caregivers`,
    summary: [
      { label: "Caregivers", value: String(by.length) },
      { label: "Hours", value: hours(totalMinutes) },
      { label: "Units", value: by.reduce((n, r) => n + r.units, 0).toLocaleString() },
      ...(admin ? [{ label: "Labor cost", value: money(totalCost) }] : []),
    ],
    columns,
    rows: by.map((r) => ({ name: r.name, visits: r.visits, hours: hours(r.minutes), units: r.units, rate: money(r.rate), cost: money((r.minutes / 60) * r.rate), unsigned: r.unsigned })),
    totals: { name: "Total", visits: by.reduce((n, r) => n + r.visits, 0), hours: hours(totalMinutes), units: by.reduce((n, r) => n + r.units, 0), rate: "", cost: money(totalCost), unsigned: by.reduce((n, r) => n + r.unsigned, 0) },
  }));
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="payroll-${period.startDate}.pdf"` } });
}
