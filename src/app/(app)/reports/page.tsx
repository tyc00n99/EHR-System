import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { currentPayPeriod, payPeriodByIndex } from "@/lib/pay-period";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireUser(["admin", "supervisor"]);
  const periods = Array.from({ length: 6 }, (_, i) => payPeriodByIndex(currentPayPeriod().index - i));
  const reports = [
    { key: "visits", title: "Visit detail", desc: "Every completed visit with PMI, code, modifiers, units, rate, amount, rendering ID, GPS, signature and EVV status. The aggregator and claim source of truth.", file: "visits.csv" },
    { key: "payroll", title: "Payroll hours", desc: "Hours, units, and labor cost by caregiver, with unsigned counts. Hand to payroll at the end of each period.", file: "payroll.csv" },
  ];
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Reports" meta={<span>Exports by pay period. Open in Excel or send to your biller.</span>} />
      <div className="grid gap-4 md:grid-cols-2">
        {reports.map((r) => (
          <Card key={r.key} title={r.title} description={r.desc}>
            <ul className="divide-y divide-line-soft">
              {periods.map((p, i) => (
                <li key={p.index}><Link href={`/reports/${r.file}?period=${p.startDate}`} className="flex items-center justify-between px-5 py-2.5 hover:bg-hover"><span className="text-[13px]">{i === 0 ? "Current period" : "Pay period"} <span className="text-muted">· {p.label}</span></span><span className="flex items-center gap-1 text-[13px] font-medium text-accent"><Icon.download size={14} />CSV</span></Link></li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
