/**
 * Unit computation from clock times.
 * For 15-minute units MHCP follows the CMS "8-minute rule": a partial unit of
 * 8 or more minutes bills as a full unit. Daily units (1440 minutes) bill as 1.
 */
export function computeUnits(clockIn: Date, clockOut: Date, unitMinutes: number): number {
  const minutes = Math.max(0, Math.round((clockOut.getTime() - clockIn.getTime()) / 60000));
  if (unitMinutes >= 1440) return minutes > 0 ? 1 : 0;
  const whole = Math.floor(minutes / unitMinutes);
  const remainder = minutes % unitMinutes;
  return whole + (remainder >= 8 ? 1 : 0);
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}
