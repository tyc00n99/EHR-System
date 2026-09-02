import "server-only";
import { countOpenVisits, listAgreementsWithUsage, listAllCredentials, listPeople, listStaff, listVisits, listAssignmentsForStaff } from "@/db/queries";
import { complianceSummary, evaluateCompliance } from "./credentials";
import { currentPayPeriod } from "./pay-period";

export interface AttentionItem {
  kind: "unsigned" | "manual" | "compliance" | "code" | "authorization" | "orientation" | "open";
  severity: "danger" | "warn" | "accent";
  title: string;
  detail: string;
  href: string;
}

/** Everything an office user should act on, across the whole business. */
export async function attentionItems(): Promise<AttentionItem[]> {
  const period = currentPayPeriod();
  const today = new Date().toISOString().slice(0, 10);
  const in60 = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const [visits, people, staffRows, creds, agreements, open] = await Promise.all([
    listVisits({ from: period.start, to: period.end, limit: 1000 }),
    listPeople(),
    listStaff(true),
    listAllCredentials(),
    listAgreementsWithUsage(),
    countOpenVisits(),
  ]);
  const items: AttentionItem[] = [];

  for (const v of visits) {
    if (v.visit.status !== "completed") continue;
    if (!v.visit.clientSignedAt) items.push({ kind: "unsigned", severity: "danger", title: `Unsigned visit · ${v.personFirst} ${v.personLast}`, detail: `${v.staffFirst} ${v.staffLast} · ${v.visit.units} units · ${v.visit.clientUnsignedReason ?? "no reason recorded"}`, href: `/visits/${v.visit.id}` });
    if (v.visit.manualEntry && v.visit.evvStatus === "pending") items.push({ kind: "manual", severity: "warn", title: `Manual visit pending EVV evidence · ${v.personFirst} ${v.personLast}`, detail: v.visit.manualEntryReason ?? "", href: `/visits/${v.visit.id}` });
  }
  for (const s of staffRows) {
    const c = complianceSummary(evaluateCompliance(s.hireDate, creds.get(s.id) ?? []));
    if (c.overdue) items.push({ kind: "compliance", severity: "danger", title: `${s.firstName} ${s.lastName} · ${c.overdue} compliance item${c.overdue === 1 ? "" : "s"} overdue`, detail: "Licensing exposure until resolved", href: `/staff/${s.id}` });
    else if (c.dueSoon) items.push({ kind: "compliance", severity: "warn", title: `${s.firstName} ${s.lastName} · training due within 30 days`, detail: `${c.dueSoon} item${c.dueSoon === 1 ? "" : "s"}`, href: `/staff/${s.id}` });
    const unoriented = (await listAssignmentsForStaff(s.id)).filter((a) => a.assignment.active && !a.assignment.orientedOn);
    for (const a of unoriented) items.push({ kind: "orientation", severity: "warn", title: `${s.firstName} ${s.lastName} not oriented to ${a.person.firstName} ${a.person.lastName}`, detail: "Required before unsupervised contact (245D.09, subd. 4a). Blocks clock-in.", href: `/staff/${s.id}` });
  }
  for (const p of people) if (p.status === "active" && !p.signatureCodeHash) items.push({ kind: "code", severity: "danger", title: `${p.firstName} ${p.lastName} has no signing code`, detail: "Visits cannot be signed until one is generated", href: `/clients/${p.id}` });
  for (const a of agreements) {
    if (a.agreement.status !== "active" || a.agreement.endDate < today) continue;
    const pct = Math.round((a.unitsUsed / a.agreement.authorizedUnits) * 100);
    if (pct >= 90) items.push({ kind: "authorization", severity: "danger", title: `${a.personFirst} ${a.personLast} · authorization ${pct}% used`, detail: `${a.agreement.agreementNumber} · ${a.agreement.serviceCode} · ends ${a.agreement.endDate}`, href: `/clients/${a.agreement.personId}` });
    else if (pct >= 75 || a.agreement.endDate <= in60) items.push({ kind: "authorization", severity: "warn", title: `${a.personFirst} ${a.personLast} · authorization ${a.agreement.endDate <= in60 ? "ends soon" : `${pct}% used`}`, detail: `${a.agreement.agreementNumber} · ${a.agreement.serviceCode} · ends ${a.agreement.endDate}`, href: `/clients/${a.agreement.personId}` });
  }
  for (const o of open) {
    const hours = (Date.now() - o.visit.clockInAt.getTime()) / 3_600_000;
    if (hours > 12) items.push({ kind: "open", severity: "danger", title: `Visit open ${Math.round(hours)} hours · ${o.staffFirst} ${o.staffLast} with ${o.personFirst} ${o.personLast}`, detail: "Probably a missed clock-out. Have the caregiver close it or a supervisor correct it.", href: `/visits/${o.visit.id}` });
  }
  const rank = { danger: 0, warn: 1, accent: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
