const dt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" });
const d = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/Chicago" });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function fmtDateTime(v: Date | string | null | undefined): string {
  if (!v) return "";
  return dt.format(typeof v === "string" ? new Date(v) : v);
}

/** For ISO date-only strings (YYYY-MM-DD) avoid timezone shifting. */
export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, dd] = v.split("-").map(Number);
    return d.format(new Date(Date.UTC(y, m - 1, dd, 12)));
  }
  return d.format(typeof v === "string" ? new Date(v) : v);
}

export function fmtMoney(v: string | number): string {
  return money.format(typeof v === "string" ? Number(v) : v);
}

export function fullName(p: { firstName: string; lastName: string; preferredName?: string | null }): string {
  return p.preferredName ? `${p.preferredName} ${p.lastName}` : `${p.firstName} ${p.lastName}`;
}

/** Local datetime-input value (YYYY-MM-DDTHH:MM) in America/Chicago. */
export function toLocalInput(v: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(v);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
}

/** Parse a datetime-local value as America/Chicago wall time. */
export function fromLocalInput(v: string): Date {
  const probe = new Date(v + ":00Z");
  const tzOffsetMin = (() => {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", timeZoneName: "shortOffset" }).formatToParts(probe);
    const name = f.find((p) => p.type === "timeZoneName")?.value ?? "GMT-6";
    const m = /GMT([+-]\d+)/.exec(name);
    return m ? Number(m[1]) * 60 : -360;
  })();
  return new Date(probe.getTime() - tzOffsetMin * 60000);
}

/** Today, and dates relative to it, as ISO day strings — the shape every date-only column uses. */
export function isoDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/** MM/DD/YYYY — the compact form for chart columns, where a spelled month wraps. */
export function fmtDateNum(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

/** MM/DD 3:30p — one line, always, for dense note lists. */
export function fmtDayTime(at: Date): string {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("month")}/${g("day")} ${g("hour")}:${g("minute")}${g("dayPeriod").toLowerCase()[0]}`;
}

/** "June 5, 2017" — the long form the client profile prints, in the sans face, not the mono one. */
export function fmtLongDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
}

/** "Sep 12, 2026 · 3:43 PM" — the stamp the profile history prints. */
export function fmtHistoryAt(v: Date): string {
  const d = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" }).format(v);
  const t = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(v);
  return `${d} · ${t}`;
}
