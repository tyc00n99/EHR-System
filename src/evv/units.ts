/**
 * Units from actual duration, by the rule's unit type. Fifteen-minute units keep the host app's
 * rounding (`computeUnits`: a remainder of 8+ minutes rounds up), so the EVV visit and the 245D
 * note never disagree about how many units a clock pair is worth.
 */
import type { EvvServiceRule } from "@/db/schema";
import { computeUnits } from "@/lib/units";

export function unitsFor(unitType: EvvServiceRule["unitType"], clockIn: Date, clockOut: Date): number {
  const minutes = Math.max(0, Math.round((clockOut.getTime() - clockIn.getTime()) / 60000));
  switch (unitType) {
    case "fifteen_minute": return computeUnits(clockIn, clockOut, 15);
    case "hourly": return Math.floor(minutes / 60) + (minutes % 60 >= 30 ? 1 : 0);
    case "daily": return minutes > 0 ? 1 : 0;
    case "per_visit": return minutes > 0 ? 1 : 0;
  }
}

/** Splits units across shared-care clients. Equal split; remainders go to the earliest client. */
export function allocateShared(total: number, clientIds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!clientIds.length) return out;
  const base = Math.floor(total / clientIds.length);
  let remainder = total - base * clientIds.length;
  for (const id of clientIds) { out[id] = base + (remainder > 0 ? 1 : 0); if (remainder > 0) remainder--; }
  return out;
}
