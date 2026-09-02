import { periodLines } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { payPeriodFromParam } from "@/lib/pay-period";

export async function GET(req: Request) {
  await requireUser(["admin", "supervisor"]);
  const period = payPeriodFromParam(new URL(req.url).searchParams.get("period") ?? undefined);
  const lines = await periodLines(period.start, period.end);
  const by = Object.values(lines.reduce<Record<string, { name: string; visits: number; minutes: number; units: number; rate: number; unsigned: number }>>((acc, l) => { const r = (acc[l.staffId] ??= { name: l.staffName, visits: 0, minutes: 0, units: 0, rate: l.payRate, unsigned: 0 }); r.visits++; r.minutes += l.minutes; r.units += l.units; if (!l.signed) r.unsigned++; return acc; }, {}));
  const rows = by.map((r) => [r.name, r.visits, (r.minutes / 60).toFixed(2), r.units, r.rate.toFixed(2), ((r.minutes / 60) * r.rate).toFixed(2), r.unsigned].join(","));
  const csv = ["caregiver,visits,hours,units,hourly_rate,labor_cost,unsigned_visits", ...rows].join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="payroll-${period.startDate}.csv"` } });
}
