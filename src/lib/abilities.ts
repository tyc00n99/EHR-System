/**
 * What a role may do (Sept 28, 2026, user's request for a Roles page). Every permission check in
 * the app asks for one of these abilities, never for a role name, so the agency can move an
 * ability between Supervisor and Direct support under Settings → Roles. Administrator always has
 * every ability and cannot be edited: an agency must not be able to lock itself out.
 *
 * `DEFAULTS` is the shape the app shipped with; `role_abilities` rows override it one ability at
 * a time, so a new ability added here lands with its default until someone changes it.
 */
export const ABILITIES = [
  { key: "all_clients", label: "See every client", description: "The whole caseload. Without it, only the clients assigned to them, as \"My clients\"." },
  { key: "manage_people", label: "Add and edit clients", description: "Profile, programming, documents, medication and authorizations." },
  { key: "edit_visits", label: "Review and edit notes", description: "Return and accept notes, edit or void visits, enter notes by hand, see everyone's notes." },
  { key: "schedule", label: "Manage the schedule", description: "Create and cancel events for anyone." },
  { key: "manage_sites", label: "Sites, programs and services", description: "The places and programs services are delivered under." },
  { key: "view_team", label: "See team records", description: "Staff records and personnel files; file paperwork and manage assignments." },
  { key: "manage_staff", label: "Add and edit staff and logins", description: "Staff details, logins, roles and passwords." },
  { key: "view_pay", label: "See pay rates and SSNs", description: "Pay on staff records, the SSN reveal, and pay on the payroll export." },
  { key: "review", label: "Review queue, EVV, compliance and reports", description: "The office screens: Review queue, EVV, Compliance, Reports and exports, the authorizations list, search." },
  { key: "billing", label: "Billing and agency performance", description: "Claim-line prep and the revenue-against-labor view." },
  { key: "settings", label: "Settings and the audit log", description: "Organization, the required-documents list, roles, scheduling settings, EVV settings and the audit log." },
] as const;

export type Ability = (typeof ABILITIES)[number]["key"];
export const ABILITY_KEYS = ABILITIES.map((a) => a.key) as Ability[];

export type RoleKey = "admin" | "supervisor" | "dsp";
export const ROLE_LABELS: Record<RoleKey, string> = { admin: "Administrator", supervisor: "Supervisor", dsp: "Direct support" };

/** What each role could do before the Roles page existed, which is what a fresh agency gets. */
export const DEFAULTS: Record<RoleKey, readonly Ability[]> = {
  admin: ABILITY_KEYS,
  supervisor: ["all_clients", "manage_people", "edit_visits", "schedule", "manage_sites", "view_team", "review"],
  dsp: [],
};

export function hasAbility(abilities: readonly string[] | undefined, key: Ability): boolean {
  return Boolean(abilities?.includes(key));
}

/** Applies the stored overrides (`allowed` per role and ability) to the defaults. Administrator is always everything. */
export function resolveAbilities(role: RoleKey, overrides: { role: string; ability: string; allowed: boolean }[]): Ability[] {
  if (role === "admin") return [...ABILITY_KEYS];
  const on = new Set<Ability>(DEFAULTS[role]);
  for (const o of overrides) {
    if (o.role !== role || !ABILITY_KEYS.includes(o.ability as Ability)) continue;
    if (o.allowed) on.add(o.ability as Ability); else on.delete(o.ability as Ability);
  }
  return ABILITY_KEYS.filter((k) => on.has(k));
}
