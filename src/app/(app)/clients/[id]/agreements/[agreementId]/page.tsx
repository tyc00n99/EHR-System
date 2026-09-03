import { notFound } from "next/navigation";
import { Badge, Card, Crumb, CrumbSep, PageHeader, Properties } from "@/components/kit";
import { getAgreement, getPerson, listAuditForRecord, listVisits } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtMoney, fullName } from "@/lib/format";
import { labelForCode } from "@/lib/hcpcs";
import { updateAgreement } from "../../../actions";
import { AgreementEditForm } from "./edit-form";

export default async function AgreementPage({ params }: PageProps<"/clients/[id]/agreements/[agreementId]">) {
  const user = await requireUser(["admin", "supervisor"]);
  const { id, agreementId } = await params;
  const [person, a] = await Promise.all([getPerson(id), getAgreement(agreementId)]);
  if (!person || !a || a.personId !== id) notFound();
  const [visits, audit] = await Promise.all([listVisits({ personId: id, limit: 2000 }), listAuditForRecord("service_agreements", agreementId)]);
  const used = visits.filter((v) => v.visit.serviceAgreementId === agreementId && v.visit.status === "completed").reduce((n, v) => n + v.visit.units, 0);
  return (
    <div>
      <PageHeader eyebrow={<><Crumb href="/clients">Clients</Crumb><CrumbSep /><Crumb href={`/clients/${id}`}>{fullName(person)}</Crumb><CrumbSep /><Crumb href={`/clients/${id}?tab=authorizations`}>Authorizations</Crumb><CrumbSep /><Crumb>{a.agreementNumber}</Crumb></>} title={`Agreement ${a.agreementNumber}`} meta={<><Badge tone={a.status === "active" ? "ok" : a.status === "cancelled" ? "danger" : "neutral"}>{a.status}</Badge><span>{labelForCode(a.serviceCode, a.modifiers)}</span><span className="text-hint">·</span><span className="tabular-nums">{used.toLocaleString()} of {a.authorizedUnits.toLocaleString()} units used</span></>} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card title="On file" padded>
            <Properties labelWidth={110} items={[
              { icon: "code", label: "Claim line", value: <span className="tabular-nums">{a.serviceCode} {a.modifiers.join(" ")}</span> },
              { icon: "units", label: "Units", value: <span className="tabular-nums">{used.toLocaleString()} used · {(a.authorizedUnits - used).toLocaleString()} left</span> },
              { icon: "units", label: "Rate", value: <span className="tabular-nums">{fmtMoney(a.unitRate)} / 15 min</span> },
              { icon: "calendar", label: "Dates", value: `${fmtDate(a.startDate)} – ${fmtDate(a.endDate)}` },
              { icon: "building", label: "County", value: a.authorizingCounty },
              { icon: "doc", label: "Letter", value: a.documentPath ? <a href={`/agreements/${a.id}/document`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{a.documentName ?? "Open PDF"}</a> : null },
            ]} />
          </Card>
          {user.role === "admin" && audit.length > 0 && (
            <Card title="Change history"><ul className="divide-y divide-line-soft">{audit.map(({ entry, actorEmail }) => { const b = (entry.before ?? {}) as Record<string, unknown>, af = (entry.after ?? {}) as Record<string, unknown>; const changed = entry.action === "update" ? Object.keys(af).filter((k) => k !== "updatedAt" && JSON.stringify(b[k]) !== JSON.stringify(af[k])) : []; return <li key={entry.id} className="px-4 py-2 text-[12.5px]"><div className="flex justify-between text-muted-foreground"><span><span className="font-medium text-text">{entry.action}</span> by {actorEmail ?? "system"}</span><span className="tabular-nums">{fmtDateTime(entry.at)}</span></div>{changed.length > 0 && <div className="mt-0.5 text-muted-foreground">{changed.map((k) => `${k}: ${String(b[k] ?? "—")} → ${String(af[k] ?? "—")}`).join(" · ")}</div>}</li>; })}</ul></Card>
          )}
        </div>
        <Card title="Edit agreement" description="Counties amend units and dates. Every change is kept in the history." padded>
          <AgreementEditForm action={updateAgreement.bind(null, agreementId, id)} defaults={{ agreementNumber: a.agreementNumber, serviceCode: a.serviceCode, modifiers: a.modifiers, authorizedUnits: a.authorizedUnits, unitRate: a.unitRate, startDate: a.startDate, endDate: a.endDate, authorizingCounty: a.authorizingCounty, status: a.status }} cancelHref={`/clients/${id}?tab=authorizations`} />
        </Card>
      </div>
    </div>
  );
}
