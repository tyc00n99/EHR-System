/** Dev aid: pulls the numbers behind the three candidate dashboard metrics and prints them as JSON. */
import { existsSync, readFileSync } from "node:fs";
if (existsSync(".env.local")) for (const line of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
// queries.ts is server-only; stub that guard so this dev script can import it.
import Module from "node:module";
const mod = Module as unknown as { _load: (id: string, ...rest: unknown[]) => unknown };
const origLoad = mod._load;
mod._load = function (id: string, ...rest: unknown[]) { return id === "server-only" ? {} : origLoad.call(this, id, ...rest); };
import { currentPayPeriod } from "../src/lib/pay-period";
import { labelForCode } from "../src/lib/hcpcs";

const chicago = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const label = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" }).format(d);

async function main() {
  const { listAgreementsWithUsage, listShifts, periodLines } = await import("../src/db/queries");
  const p = currentPayPeriod();
  const [ags, shifts, lines] = await Promise.all([listAgreementsWithUsage(), listShifts(p.start, p.end), periodLines(p.start, p.end)]);

  // 1. authorization pace
  const today = new Date();
  const pace = ags.filter((a) => a.agreement.status === "active").map((a) => {
    const start = new Date(a.agreement.startDate + "T12:00:00-05:00").getTime();
    const end = new Date(a.agreement.endDate + "T12:00:00-05:00").getTime();
    const frac = Math.min(1, Math.max(0, (today.getTime() - start) / (end - start)));
    return { client: `${a.personFirst} ${a.personLast}`, service: labelForCode(a.agreement.serviceCode, a.agreement.modifiers), code: a.agreement.serviceCode, used: a.unitsUsed, authorized: a.agreement.authorizedUnits, expected: Math.round(a.agreement.authorizedUnits * frac), endDate: a.agreement.endDate, rate: Number(a.agreement.unitRate) };
  });

  // 2. scheduled vs delivered, by day
  const days: Record<string, { label: string; scheduled: number; delivered: number }> = {};
  for (let t = p.start.getTime(); t <= p.end.getTime(); t += 86_400_000) { const d = new Date(t); days[chicago(d)] = { label: label(d), scheduled: 0, delivered: 0 }; }
  for (const s of shifts) { const k = days[chicago(s.shift.startAt)]; if (k && s.shift.status !== "cancelled") k.scheduled += (s.shift.endAt.getTime() - s.shift.startAt.getTime()) / 3_600_000; }
  for (const l of lines) { const k = days[chicago(l.clockInAt)]; if (k) k.delivered += l.minutes / 60; }

  // 3. revenue at risk
  const risk = { ready: 0, approval: 0, unsigned: 0, manual: 0 };
  for (const l of lines) {
    const money = l.units * l.unitRate;
    if (!l.signed) risk.unsigned += money;
    else if (l.manual && l.evvStatus === "pending") risk.manual += money;
    else risk.ready += money;
  }
  const approvals = lines.filter((l) => l.signed).reduce((n, l) => n + l.units * l.unitRate, 0);
  risk.approval = Math.round((approvals - risk.ready) * 100) / 100;

  console.log(JSON.stringify({ period: p.label, pace, days: Object.values(days), risk, totals: { units: lines.reduce((n, l) => n + l.units, 0), revenue: lines.reduce((n, l) => n + l.units * l.unitRate, 0) } }, null, 0));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
