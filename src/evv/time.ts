/** Time helpers. Minnesota is Central; the date of service is the clock-in's local date. */

/** YYYY-MM-DD of an instant in a zone, DST-aware. */
export function localDate(at: Date, timeZone = "America/Chicago"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** UTC offset of a zone at an instant, in minutes (Central Daylight = -300, Standard = -360). */
export function utcOffsetMinutes(at: Date, timeZone = "America/Chicago"): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

export const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60000);

/** The monthly submission deadline that applies to a service date: the Nth of the following month. */
export function submissionDeadlineFor(serviceDate: string, deadlineDay: number): string {
  const [y, m] = serviceDate.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1)); // first of the following month
  next.setUTCDate(Math.min(deadlineDay, 28));
  return next.toISOString().slice(0, 10);
}
