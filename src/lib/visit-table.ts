import "server-only";
import { listVisits } from "@/db/queries";
import type { VisitFilters, VisitRow } from "@/app/(app)/visits/visits-table";
import type { PillOption } from "@/components/filter-pill";
import { fmtDate, fmtDateTime, isoDay } from "./format";
import { labelForCode } from "./hcpcs";
import { currentPayPeriod, payPeriodByIndex } from "./pay-period";
import { minutesBetween } from "./units";
import { rangeParamFor, resolveVisitRange, type VisitRange } from "./visit-range";

const fmtTime = (d: Date) => new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "America/Chicago" }).format(d);
const serviceKey = (v: { serviceCode: string; modifiers: string[] }) => `${v.serviceCode}${v.modifiers.length ? " " + v.modifiers.join(" ") : ""}`;
type Params = Record<string, string | string[] | undefined>;
const list = (sp: Params, k: string) => (typeof sp[k] === "string" ? String(sp[k]).split(",").filter(Boolean) : []);

/**
 * Everything the notes table needs, for any scope: the whole agency, one client, or one caregiver.
 * The range comes from the URL (pay period by default, or `defaultParam` for pages that prefer
 * another window); client, caregiver, service and status filters narrow the rows in that range;
 * the pill options carry counts from the whole range so a filter never hides its own choices.
 */
export async function buildVisitTable({ sp, personId, staffId, defaultParam }: { sp: Params; personId?: string; staffId?: string; defaultParam?: string }) {
  const hasRange = ["period", "week", "month", "from"].some((k) => typeof sp[k] === "string");
  const range: VisitRange = resolveVisitRange(hasRange || !defaultParam ? sp : Object.fromEntries(new URLSearchParams(defaultParam)));
  const fClient = personId ? [] : list(sp, "client"), fStaff = staffId ? [] : list(sp, "staff"), fService = list(sp, "service");
  const state = typeof sp.state === "string" && ["unsigned", "returned", "manual", "open"].includes(sp.state) ? sp.state : "";
  const inRange = await listVisits({ personId, staffId, from: range.start, to: range.end, limit: 1000 });
  type Row = (typeof inRange)[number];
  const matchesState = (v: Row["visit"]) => state === "unsigned" ? v.status === "completed" && !v.clientSignedAt : state === "returned" ? Boolean(v.returnedAt) : state === "manual" ? v.manualEntry : state === "open" ? v.status === "in_progress" : true;
  const all = inRange.filter(({ visit: v }) => (!fClient.length || fClient.includes(v.personId)) && (!fStaff.length || fStaff.includes(v.staffId)) && (!fService.length || fService.includes(serviceKey(v))) && matchesState(v));

  const count = <K,>(pick: (r: Row) => { k: K; label: string; hint?: string }): PillOption[] => {
    const m = new Map<K, { label: string; hint?: string; n: number }>();
    for (const r of inRange) { const { k, label, hint } = pick(r); const cur = m.get(k); if (cur) cur.n++; else m.set(k, { label, hint, n: 1 }); }
    return [...m.entries()].map(([k, v]) => ({ value: String(k), label: v.label, hint: v.hint, count: v.n })).sort((x, y) => x.label.localeCompare(y.label));
  };
  const options = {
    clients: personId ? [] : count((r) => ({ k: r.visit.personId, label: `${r.personFirst} ${r.personLast}` })),
    staff: staffId ? [] : count((r) => ({ k: r.visit.staffId, label: `${r.staffFirst} ${r.staffLast}` })),
    services: count((r) => ({ k: serviceKey(r.visit), label: labelForCode(r.visit.serviceCode, r.visit.modifiers), hint: serviceKey(r.visit) })),
  };
  const cur = currentPayPeriod(), last = payPeriodByIndex(cur.index - 1);
  const today = isoDay(0), ago90 = isoDay(-90);
  const presets = [
    { label: `Current pay period · ${cur.label}`, param: `period=${cur.startDate}` },
    { label: `Last pay period · ${last.label}`, param: `period=${last.startDate}` },
    { label: "This week", param: rangeParamFor("week", { ...range, from: today, to: today }) },
    { label: "This month", param: rangeParamFor("month", { ...range, from: today, to: today }) },
    { label: "Last 90 days", param: `from=${ago90}&to=${today}` },
  ];
  const rows: VisitRow[] = all.map(({ visit: v, personFirst, personLast, staffFirst, staffLast, editCount }) => ({
    id: v.id, clockIn: fmtDateTime(v.clockInAt), day: fmtDate(v.clockInAt), time: `${fmtTime(v.clockInAt)}${v.clockOutAt ? ` – ${fmtTime(v.clockOutAt)}` : ""}`, clockInIso: v.clockInAt.toISOString(),
    minutes: v.clockOutAt ? minutesBetween(v.clockInAt, v.clockOutAt) : null, client: `${personFirst} ${personLast}`, personId: v.personId, staff: `${staffFirst} ${staffLast}`, staffId: v.staffId,
    serviceLabel: labelForCode(v.serviceCode, v.modifiers), serviceKey: serviceKey(v), serviceCode: v.serviceCode, units: v.units, status: v.status, manual: v.manualEntry, returned: Boolean(v.returnedAt), edits: editCount, signed: Boolean(v.clientSignedAt), evv: v.evvStatus,
  }));
  const filters: VisitFilters = { client: fClient, staff: fStaff, service: fService, state, rangeParam: range.param, rangeLabel: range.label, from: range.from, to: range.to };
  const completed = all.filter((r) => r.visit.status === "completed");
  const totals = { visits: all.length, units: completed.reduce((n, r) => n + r.visit.units, 0), minutes: completed.reduce((n, r) => n + (r.visit.clockOutAt ? minutesBetween(r.visit.clockInAt, r.visit.clockOutAt) : 0), 0), unsigned: completed.filter((r) => !r.visit.clientSignedAt).length };
  return { rows, filters, options, presets, range, totals, single: { staff: fStaff.length === 1 ? fStaff[0] : staffId ?? null, service: fService.length === 1 ? all[0]?.visit.serviceCode ?? null : null } };
}
