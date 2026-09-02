import Link from "next/link";
import { Badge, Card, Crumb, CrumbSep, Empty, LinkButton, PageHeader, Table, Td, Th, Thead, Toolbar, Tr } from "@/components/ui";
import { getPerson, listVisits } from "@/db/queries";
import { can, requireUser } from "@/lib/auth";
import { fmtDateTime, fullName } from "@/lib/format";
import { currentPayPeriod, payPeriodByIndex, payPeriodFromParam } from "@/lib/pay-period";
import { minutesBetween } from "@/lib/units";

export const metadata = { title: "Visits" };

const evvTone = { pending: "neutral", exported: "accent", accepted: "ok", rejected: "danger" } as const;

export default async function VisitsPage({ searchParams }: PageProps<"/visits">) {
  const user = await requireUser();
  const sp = await searchParams;
  const personId = typeof sp.person === "string" ? sp.person : undefined;
  const period = payPeriodFromParam(typeof sp.period === "string" ? sp.period : undefined);
  const isCurrent = period.index === currentPayPeriod().index;
  const prev = payPeriodByIndex(period.index - 1), next = payPeriodByIndex(period.index + 1);
  const person = personId ? await getPerson(personId) : null;
  const all = await listVisits({ personId, staffId: user.role === "dsp" ? (user.staffId ?? undefined) : undefined, from: period.start, to: period.end, limit: 1000 });
  const q = (typeof sp.q === "string" ? sp.q : "").trim().toLowerCase();
  const flag = typeof sp.flag === "string" ? sp.flag : "";
  const rows = all.filter((r) => (flag === "unsigned" ? r.visit.status === "completed" && !r.visit.clientSignedAt : flag === "manual" ? r.visit.manualEntry : flag === "open" ? r.visit.status === "in_progress" : true) && (!q || [r.personFirst, r.personLast, r.staffFirst, r.staffLast, r.visit.serviceCode].some((f) => f.toLowerCase().includes(q))));
  const chip = (key: string, label: string) => ({ key, label, href: `/visits?${new URLSearchParams({ period: period.startDate, ...(personId ? { person: personId } : {}), ...(q ? { q } : {}), ...(key ? { flag: key } : {}) })}`, active: flag === key });
  const completed = all.filter((r) => r.visit.status === "completed");
  const units = completed.reduce((n, r) => n + r.visit.units, 0);
  const minutes = completed.reduce((n, r) => n + (r.visit.clockOutAt ? minutesBetween(r.visit.clockInAt, r.visit.clockOutAt) : 0), 0);
  const periodHref = (p: { startDate: string }) => `/visits?period=${p.startDate}${personId ? `&person=${personId}` : ""}`;
  const title = person ? `Visits with ${fullName(person)}` : user.role === "dsp" ? "My visits" : "Visits";

  return (
    <div>
      <PageHeader
        eyebrow={person && <><Crumb href="/clients">Clients</Crumb><CrumbSep /><Crumb href={`/clients/${person.id}`}>{fullName(person)}</Crumb><CrumbSep /><Crumb>Visits</Crumb></>}
        title={title}
        actions={can(user, "edit_visits") && <LinkButton href="/visits/new" variant="outline">Enter a visit manually</LinkButton>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-sidebar px-3 py-2">
        <Link href={periodHref(prev)} aria-label="Previous pay period" className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover">‹</Link>
        <div className="min-w-56">
          <div className="text-[13px] font-medium text-text-strong">{isCurrent ? "Current pay period" : "Pay period"} <span className="font-normal text-muted">· {period.label}</span></div>
        </div>
        <Link href={periodHref(next)} aria-label="Next pay period" className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover">›</Link>
        {!isCurrent && <Link href={periodHref(currentPayPeriod())} className="text-[13px] text-accent hover:underline">Jump to current</Link>}
        <div className="ml-auto flex gap-5 text-[13px] tabular-nums text-muted">
          <span><span className="font-medium text-text-strong">{all.length}</span> visits</span>
          <span><span className="font-medium text-text-strong">{units}</span> units</span>
          <span><span className="font-medium text-text-strong">{Math.round(minutes / 6) / 10}</span> hours</span>
          {all.some((r) => r.visit.manualEntry) && <span><span className="font-medium text-warn">{all.filter((r) => r.visit.manualEntry).length}</span> manual</span>}
          {all.some((r) => r.visit.status === "completed" && !r.visit.clientSignedAt) && <span><span className="font-medium text-danger">{all.filter((r) => r.visit.status === "completed" && !r.visit.clientSignedAt).length}</span> unsigned</span>}
        </div>
      </div>

      <Card>
        <Toolbar action="/visits" q={q} placeholder="Search client, caregiver, code" hidden={{ period: period.startDate, ...(personId ? { person: personId } : {}), ...(flag ? { flag } : {}) }} chips={[chip("", "All"), chip("unsigned", "Unsigned"), chip("manual", "Manual"), chip("open", "In progress")]} count={`${rows.length} shown`}>
          {can(user, "edit_visits") && <a href={`/reports/visits.csv?period=${period.startDate}`} className="inline-flex h-8 items-center rounded-md border border-line bg-page px-3 text-[13px] font-medium hover:bg-hover">Export CSV</a>}
        </Toolbar>
        {rows.length === 0 ? <Empty icon="clock" title={q || flag ? "No visits match" : "No visits in this pay period"} action={user.staffId && isCurrent && <LinkButton href="/clock" variant="primary">Clock in</LinkButton>} /> : (
          <Table>
            <Thead><Th>Clock in</Th><Th>Duration</Th><Th>Client</Th><Th>Staff</Th><Th>Service</Th><Th align="right">Units</Th><Th>Status</Th><Th>EVV</Th></Thead>
            <tbody>
              {rows.map(({ visit: v, personFirst, personLast, staffFirst, staffLast, editCount }) => (
                <Tr key={v.id} muted={v.status === "void"}>
                  <Td strong><Link href={`/visits/${v.id}`} className="hover:underline">{fmtDateTime(v.clockInAt)}</Link></Td>
                  <Td className="tabular-nums text-muted">{v.clockOutAt ? `${minutesBetween(v.clockInAt, v.clockOutAt)} min` : <span className="text-accent">in progress</span>}</Td>
                  <Td><Link href={`/clients/${v.personId}`} className="hover:underline">{personFirst} {personLast}</Link></Td>
                  <Td>{staffFirst} {staffLast}</Td>
                  <Td className="tabular-nums">{v.serviceCode}{v.modifiers.length ? <span className="text-muted"> {v.modifiers.join(" ")}</span> : ""}</Td>
                  <Td align="right">{v.units}</Td>
                  <Td>
                    <span className="flex gap-1">
                      <Badge tone={v.status === "completed" ? "ok" : v.status === "void" ? "neutral" : "accent"}>{v.status.replace("_", " ")}</Badge>
                      {v.manualEntry && <Badge tone="warn">manual</Badge>}
                      {editCount > 0 && <Badge tone="warn">{editCount} edit{editCount === 1 ? "" : "s"}</Badge>}
                      {v.status === "completed" && !v.clientSignedAt && <Badge tone="danger">unsigned</Badge>}
                    </span>
                  </Td>
                  <Td><Badge tone={evvTone[v.evvStatus]}>{v.evvStatus}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
