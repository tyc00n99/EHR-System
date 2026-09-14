/**
 * EVV permissions, mapped onto the host app's three roles. Caregivers act on their own visits
 * only; supervisors review and correct; only admins configure rules, policy and the integration.
 */
import type { Role } from "@/lib/auth";

export const EVV_PERMISSIONS = ["evv.clock_in", "evv.clock_out", "evv.view_own", "evv.view_all", "evv.review", "evv.correct", "evv.resubmit", "evv.configure", "evv.view_compliance", "evv.manage_integration"] as const;
export type EvvPermission = (typeof EVV_PERMISSIONS)[number];

const BY_ROLE: Record<Role, ReadonlySet<EvvPermission>> = {
  admin: new Set(EVV_PERMISSIONS),
  supervisor: new Set<EvvPermission>(["evv.clock_in", "evv.clock_out", "evv.view_own", "evv.view_all", "evv.review", "evv.correct", "evv.resubmit", "evv.view_compliance"]),
  dsp: new Set<EvvPermission>(["evv.clock_in", "evv.clock_out", "evv.view_own"]),
};

export function hasEvvPermission(user: { role: Role; staffId: string | null }, permission: EvvPermission): boolean {
  if (!BY_ROLE[user.role].has(permission)) return false;
  // Clocking needs a caregiver record: a login with no staff row has nobody to clock in as.
  if ((permission === "evv.clock_in" || permission === "evv.clock_out") && !user.staffId) return false;
  return true;
}
