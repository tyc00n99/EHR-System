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
  const passes = (v: Row["visit"], skip?: "client" | "staff" | "service") =>
    (skip === "client" || !fClient.length || fClient.includes(v.personId)) && (skip === "staff" || !fStaff.length || fStaff.includes(v.staffId)) && (skip === "service" || !fService.length || fService.includes(serviceKey(v))) && matchesState(v);
  const all = inRange.filter(({ visit: v }) => passes(v));

  const count = <K,>(skip: "client" | "staff" | "service", pick: (r: Row) => { k: K; label: string; hint?: string }): PillOption[] => {
    const m = new Map<K, { label: string; hint?: string; n: number }>();
    for (const r of inRange) { if (!passes(r.visit, skip)) continue; const { k, label, hint } = pick(r); const cur = m.get(k); if (cur) cur.n++; else m.set(k, { label, hint, n: 1 }); }
    // A chosen value stays listed even if the other filters leave it at zero, so it can be unticked.
    const chosen = skip === "client" ? fClient : skip === "staff" ? fStaff : fService;
    for (const r of inRange) { const { k, label, hint } = pick(r); if (chosen.includes(String(k)) && !m.has(k)) m.set(k, { label, hint, n: 0 }); }
    return [...m.entries()].map(([k, v]) => ({ value: String(k), label: v.label, hint: v.hint, count: v.n })).sort((x, y) => x.label.localeCompare(y.label));
  };
  const options = {
    clients: personId ? [] : count("client", (r) => ({ k: r.visit.personId, label: `${r.personFirst} ${r.personLast}` })),
    staff: staffId ? [] : count("staff", (r) => ({ k: r.visit.staffId, label: `${r.staffFirst} ${r.staffLast}` })),
    services: count("service", (r) => ({ k: serviceKey(r.visit), label: labelForCode(r.visit.serviceCode, r.visit.modifiers), hint: serviceKey(r.visit) })),
  };
  const cur = currentPayPeriod(), last = payPeriodByIndex(cur.index - 1);
  const today = isoDay(0);
  const at = (day: string) => ({ ...range, from: day, to: day });
  const weekAgo = isoDay(-7);
  const lastMonthDay = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10);
  const span = (r: VisitRange) => r.label;
  // The picker's rail (Sept 21, 2026, "A"): pay periods first, because that is how notes are
  // reviewed and billed; each preset carries its dates as a hint so the rail reads at a glance.
  // No headings and no "billing" windows (user, same day) — six entries, nothing to scan past.
  const presets = [
    { label: "This pay period", hint: cur.label, param: `period=${cur.startDate}` },
    { label: "Last pay period", hint: last.label, param: `period=${last.startDate}` },
    { label: "This week", hint: span(resolveVisitRange({ week: today })), param: rangeParamFor("week", at(today)) },
    { label: "Last week", hint: span(resolveVisitRange({ week: weekAgo })), param: rangeParamFor("week", at(weekAgo)) },
    { label: "This month", hint: span(resolveVisitRange({ month: today.slice(0, 7) })), param: rangeParamFor("month", at(today)) },
    { label: "Last month", hint: span(resolveVisitRange({ month: lastMonthDay.slice(0, 7) })), param: rangeParamFor("month", at(lastMonthDay)) },
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
