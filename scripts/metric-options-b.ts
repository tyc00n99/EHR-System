/** Dev aid: numbers behind the second set of candidate dashboard metrics. */
import { existsSync, readFileSync } from "node:fs";
if (existsSync(".env.local")) for (const line of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
import Module from "node:module";
const mod = Module as unknown as { _load: (id: string, ...rest: unknown[]) => unknown };
const origLoad = mod._load;
mod._load = function (id: string, ...rest: unknown[]) { return id === "server-only" ? {} : origLoad.call(this, id, ...rest); };
import { currentPayPeriod } from "../src/lib/pay-period";
import { labelForCode } from "../src/lib/hcpcs";
import { evaluateCompliance } from "../src/lib/credentials";
import { deadlinesFromServiceStart } from "../src/lib/compliance";
import { getServiceType } from "../src/lib/services";

async function main() {
  const { listStaff, listCredentials, listPeople, listVisits, periodLines, listAgreementsForPerson } = await import("../src/db/queries");
  const p = currentPayPeriod();

  // A. service gaps: how long since each active client last received each authorized service
  const recent = await listVisits({ from: new Date(Date.now() - 120 * 86_400_000), limit: 4000 });
  const gaps: { client: string; service: string; code: string; lastDate: string | null; days: number | null; perWeek: number }[] = [];
  const activePeople = (await listPeople()).filter((x) => x.status === "active");
  for (const person of activePeople) {
    for (const a of await listAgreementsForPerson(person.id)) {
      if (a.agreement.status !== "active") continue;
      const mine = recent.filter((r) => r.visit.personId === person.id && r.visit.serviceCode === a.agreement.serviceCode && r.visit.status === "completed");
      const last = mine[0]?.visit.clockInAt ?? null;
      const days = last ? Math.floor((Date.now() - last.getTime()) / 86_400_000) : null;
      const weeks = 120 / 7;
      gaps.push({ client: `${person.firstName} ${person.lastName}`, service: labelForCode(a.agreement.serviceCode, a.agreement.modifiers), code: a.agreement.serviceCode, lastDate: last ? last.toISOString().slice(0, 10) : null, days, perWeek: Math.round((mine.length / weeks) * 10) / 10 });
    }
  }
  gaps.sort((x, y) => (y.days ?? 999) - (x.days ?? 999));

  // documentation turnaround, by caregiver, over the period
  const visits = await listVisits({ from: p.start, to: p.end, limit: 3000 });
  const byStaff = new Map<string, { name: string; lags: number[]; late: number; approved: number; total: number }>();
  for (const { visit: v, staffFirst, staffLast } of visits) {
    if (v.status !== "completed" || !v.clockOutAt) continue;
    const name = `${staffFirst} ${staffLast}`;
    const r = byStaff.get(name) ?? { name, lags: [], late: 0, approved: 0, total: 0 };
    r.total++;
    if (v.approvedAt) r.approved++;
    if (v.staffSignedAt) { const h = (v.staffSignedAt.getTime() - v.clockOutAt.getTime()) / 3_600_000; r.lags.push(h); if (h > 24) r.late++; }
    byStaff.set(name, r);
  }
  const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const turnaround = [...byStaff.values()].map((r) => ({ name: r.name, medianHours: Math.round(median(r.lags) * 10) / 10, late: r.late, total: r.total, approvedPct: r.total ? Math.round((r.approved / r.total) * 100) : 0 })).sort((a, b) => b.medianHours - a.medianHours);

  // B. compliance runway: what expires or comes due in the next 60 days
  const today = new Date();
  const in60 = new Date(today.getTime() + 60 * 86_400_000);
  const staff = await listStaff(true);
  const runway: { who: string; item: string; cite: string; due: string; status: string }[] = [];
  for (const s of staff) {
    const creds = await listCredentials(s.id);
    for (const it of evaluateCompliance(s.hireDate, creds)) {
      if (it.status === "ok" || !it.due) continue;
      runway.push({ who: `${s.firstName} ${s.lastName}`, item: it.label, cite: it.cite, due: it.due, status: it.status });
    }
  }
  const people = await listPeople();
  for (const person of people) {
    if (person.status !== "active" || !person.serviceStartDate) continue;
    const ags = await listAgreementsForPerson(person.id);
    const tracks = ags.map((a) => (a.serviceTypeId ? getServiceType(a.serviceTypeId).planningTrack : null)).filter(Boolean);
    const track = tracks.includes("245D.071") ? "245D.071" : tracks.length ? "245D.07" : null;
    if (!track) continue;
    for (const d of deadlinesFromServiceStart(track as "245D.07" | "245D.071", new Date(person.serviceStartDate + "T12:00:00"))) {
      const due = d.due instanceof Date ? d.due : new Date(String(d.due));
      if (due > in60) continue;
      runway.push({ who: `${person.firstName} ${person.lastName}`, item: d.label, cite: d.cite, due: due.toISOString().slice(0, 10), status: due < today ? "overdue" : "due" });
    }
  }
  runway.sort((a, b) => a.due.localeCompare(b.due));

  // C. margin by service line
  const lines = await periodLines(p.start, p.end);
  const byCode = new Map<string, { code: string; label: string; units: number; revenue: number; labor: number; visits: number }>();
  for (const l of lines) {
    const r = byCode.get(l.serviceCode) ?? { code: l.serviceCode, label: labelForCode(l.serviceCode, []), units: 0, revenue: 0, labor: 0, visits: 0 };
    r.units += l.units; r.revenue += l.units * l.unitRate; r.labor += (l.minutes / 60) * l.payRate; r.visits++;
    byCode.set(l.serviceCode, r);
  }
  const margin = [...byCode.values()].map((r) => ({ ...r, revenue: Math.round(r.revenue * 100) / 100, labor: Math.round(r.labor * 100) / 100, marginPct: r.revenue ? Math.round(((r.revenue - r.labor) / r.revenue) * 100) : 0 })).sort((a, b) => b.revenue - a.revenue);

  console.log(JSON.stringify({ period: p.label, gaps, turnaround, runway: runway.slice(0, 8), runwayTotal: runway.length, margin }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
