import Link from "next/link";
import { Card, PageHeader } from "@/components/kit";
import { Icon } from "@/components/icons";
import { listAgreementsWithUsage, listPeople } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { labelForCode } from "@/lib/hcpcs";
import { currentPayPeriod, payPeriodByIndex } from "@/lib/pay-period";
import { NotesReport, type NotesReportClient } from "./notes-report";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireUser(["admin", "supervisor"]);
  const periods = Array.from({ length: 6 }, (_, i) => payPeriodByIndex(currentPayPeriod().index - i));
  const [people, agreements] = await Promise.all([listPeople(), listAgreementsWithUsage()]);
  const clients: NotesReportClient[] = people.filter((p) => p.status !== "discharged" || agreements.some((a) => a.agreement.personId === p.id)).map((p) => {
    const codes = new Map<string, string>();
    for (const a of agreements) if (a.agreement.personId === p.id) codes.set(a.agreement.serviceCode, labelForCode(a.agreement.serviceCode, a.agreement.modifiers));
    return { id: p.id, name: `${p.lastName}, ${p.firstName}`, pmi: p.pmi, services: [...codes.entries()].map(([code, label]) => ({ code, label })) };
  });
  const chicago = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const todayLocal = chicago(new Date());
  const quarterStart = chicago(new Date(Date.now() - 91 * 86_400_000));
  const reports = [
    { key: "visits", title: "Visit detail", desc: "Every completed visit with PMI, code, modifiers, units, rate, amount, rendering ID, GPS, signature and EVV status. The aggregator and claim source of truth.", file: "visits" },
    { key: "payroll", title: "Payroll hours", desc: "Hours, units, and gross pay by caregiver, with unsigned counts. Hand to payroll at the end of each period.", file: "payroll" },
  ];
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Reports" meta={<span>Exports by pay period. PDF for printing or sending to the county; CSV for Excel and your biller.</span>} />
      <Card title="Progress notes" description="Every note for one client, filtered by service type and date range. The same document the client's Notes tab downloads." className="mb-4">
        <NotesReport clients={clients} defaultFrom={quarterStart} defaultTo={todayLocal} />
      </Card>
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
