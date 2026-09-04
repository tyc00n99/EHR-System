import Link from "next/link";
import { Card, PageHeader } from "@/components/kit";
import { Icon } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { currentPayPeriod, payPeriodByIndex } from "@/lib/pay-period";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireUser(["admin", "supervisor"]);
  const periods = Array.from({ length: 6 }, (_, i) => payPeriodByIndex(currentPayPeriod().index - i));
  const reports = [
    { key: "visits", title: "Visit detail", desc: "Every completed visit with PMI, code, modifiers, units, rate, amount, rendering ID, GPS, signature and EVV status. The aggregator and claim source of truth.", file: "visits" },
    { key: "payroll", title: "Payroll hours", desc: "Hours, units, and labor cost by caregiver, with unsigned counts. Hand to payroll at the end of each period.", file: "payroll" },
  ];
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Reports" meta={<span>Exports by pay period. PDF for printing or sending to the county; CSV for Excel and your biller.</span>} />
      <div className="grid gap-4 md:grid-cols-2">
        {reports.map((r) => (
          <Card key={r.key} title={r.title} description={r.desc}>
            <ul className="divide-y divide-line-soft">
              {periods.map((p, i) => (
                <li key={p.index} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="text-[13px]">{i === 0 ? "Current period" : "Pay period"} <span className="text-muted-foreground">· {p.label}</span></span>
                  <span className="flex items-center gap-1">
                    <Link href={`/reports/${r.file}.pdf?period=${p.startDate}`} className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-btn)] bg-primary-soft px-2.5 text-[12.5px] font-medium text-primary hover:bg-blue-300/40"><Icon.doc size={13} />PDF</Link>
                    <Link href={`/reports/${r.file}.csv?period=${p.startDate}`} className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-btn)] border border-line px-2.5 text-[12.5px] font-medium text-text hover:bg-hover"><Icon.download size={13} />CSV</Link>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
