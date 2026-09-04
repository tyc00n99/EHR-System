/** Dev aid: numbers behind the third set of candidate dashboard metrics. */
import { existsSync, readFileSync } from "node:fs";
if (existsSync(".env.local")) for (const line of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
import Module from "node:module";
const mod = Module as unknown as { _load: (id: string, ...rest: unknown[]) => unknown };
const origLoad = mod._load;
mod._load = function (id: string, ...rest: unknown[]) { return id === "server-only" ? {} : origLoad.call(this, id, ...rest); };
import { currentPayPeriod } from "../src/lib/pay-period";
import { labelForCode } from "../src/lib/hcpcs";

const tm = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });

async function main() {
  const { listShifts, periodLines, listVisits } = await import("../src/db/queries");
  const p = currentPayPeriod();
  const now = new Date();
  const dayStart = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now) + "T00:00:00-05:00");
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  // A. today's board
  const todays = await listShifts(dayStart, dayEnd);
  const openVisits = (await listVisits({ from: dayStart, to: dayEnd, limit: 200 })).filter((r) => r.visit.status === "in_progress");
  const board = todays.map((s) => ({
    staff: `${s.staffFirst} ${s.staffLast}`, client: `${s.personFirst} ${s.personLast}`,
    service: labelForCode(s.serviceCode, s.modifiers), start: tm.format(s.shift.startAt), end: tm.format(s.shift.endAt),
    startPct: Math.round((((s.shift.startAt.getTime() - dayStart.getTime()) / 3_600_000) / 24) * 1000) / 10,
    widthPct: Math.round((((s.shift.endAt.getTime() - s.shift.startAt.getTime()) / 3_600_000) / 24) * 1000) / 10,
    status: s.shift.status,
    late: s.shift.status === "scheduled" && s.shift.startAt < now,
  }));

  // B. caregiver workload this period
  const lines = await periodLines(p.start, p.end);
  const byStaff = new Map<string, { name: string; minutes: number; visits: number; clients: Set<string>; pay: number }>();
  for (const l of lines) {
    const r = byStaff.get(l.staffId) ?? { name: l.staffName, minutes: 0, visits: 0, clients: new Set<string>(), pay: 0 };
    r.minutes += l.minutes; r.visits++; r.clients.add(l.personId); r.pay += (l.minutes / 60) * l.payRate;
    byStaff.set(l.staffId, r);
  }
  const upcoming = await listShifts(now, p.end);
  const scheduled = new Map<string, number>();
  for (const s of upcoming) if (s.shift.status === "scheduled") scheduled.set(`${s.staffFirst} ${s.staffLast}`, (scheduled.get(`${s.staffFirst} ${s.staffLast}`) ?? 0) + (s.shift.endAt.getTime() - s.shift.startAt.getTime()) / 3_600_000);
  const workload = [...byStaff.values()].map((r) => ({ name: r.name, hours: Math.round((r.minutes / 60) * 10) / 10, booked: Math.round((scheduled.get(r.name) ?? 0) * 10) / 10, visits: r.visits, clients: r.clients.size, pay: Math.round(r.pay) })).sort((a, b) => b.hours + b.booked - (a.hours + a.booked));

  // C. unbilled work aging
  const all = (await listVisits({ from: new Date(Date.now() - 120 * 86_400_000), limit: 5000 })).filter((r) => r.visit.status === "completed" && r.visit.evvStatus === "pending");
  const rate = new Map(lines.map((l) => [l.serviceCode, l.unitRate]));
  const buckets = [{ label: "0 to 7 days", max: 7, amount: 0, visits: 0 }, { label: "8 to 14 days", max: 14, amount: 0, visits: 0 }, { label: "15 to 30 days", max: 30, amount: 0, visits: 0 }, { label: "over 30 days", max: 9999, amount: 0, visits: 0 }];
  for (const r of all) {
    const age = Math.floor((Date.now() - r.visit.clockInAt.getTime()) / 86_400_000);
    const money = r.visit.units * (rate.get(r.visit.serviceCode) ?? 6);
    const b = buckets.find((x) => age <= x.max)!;
    b.amount += money; b.visits++;
  }
  console.log(JSON.stringify({ period: p.label, board, workload, buckets: buckets.map((b) => ({ ...b, amount: Math.round(b.amount) })), openVisits: openVisits.length }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
