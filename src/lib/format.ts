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
