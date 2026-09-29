/**
 * The manual note (Sept 29, 2026, the user's pick "2"): one page shaped like the printed Daily Service
 * Note, entered by an administrator or supervisor — never by the caregiver who worked the visit — for a
 * visit electronic visit verification did not capture. Shared, client-safe pieces live here because a
 * "use server" file may only export async functions.
 */

/** Why EVV did not capture it. The category and the details together become the manual-entry reason. */
export const MANUAL_REASONS = [
  ["device", "Phone or app problem"],
  ["signal", "No signal or no internet at the visit"],
  ["forgot_in", "Caregiver forgot to clock in"],
  ["forgot_out", "Caregiver forgot to clock out"],
  ["wrong", "Clocked in under the wrong client or service"],
  ["paper", "Recorded on paper during an outage"],
  ["other", "Something else"],
] as const;
export type ManualReason = (typeof MANUAL_REASONS)[number][0];

export interface ManualLocation { id: string; label: string; address: string; posCode: string; isDefault: boolean }
export interface ManualContext {
  personName: string; pmi: string; dob: string | null; first: string;
  unitMinutes: number;
  skills: string[];
  activities: string[];
  goals: { id: string; title: string; questions: { id: string; prompt: string }[] }[];
  meds: { id: string; name: string; dose: string; time: string }[];
  locations: ManualLocation[];
}

/** Clock-out earlier than clock-in on the same date means the shift ran past midnight. */
export function shiftTimes(date: string, inTime: string, outTime: string): { clockIn: string; clockOut: string; overnight: boolean } {
  const overnight = outTime <= inTime;
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const outDate = overnight ? next.toISOString().slice(0, 10) : date;
  return { clockIn: `${date}T${inTime}`, clockOut: `${outDate}T${outTime}`, overnight };
}

/** Minutes between two "HH:MM" times, rolling past midnight. */
export function shiftMinutes(inTime: string, outTime: string): number {
  const m = (t: string) => { const [h, mm] = t.split(":").map(Number); return h * 60 + mm; };
  const d = m(outTime) - m(inTime);
  return d <= 0 ? d + 1440 : d;
}
