import type { IconName } from "@/components/icons";
import { hasAbility } from "@/lib/abilities";

/**
 * The whole navigation, in one place, so the top bar, the section row, the gear menu and the
 * phone's tab bar can never disagree about what a role is allowed to open.
 *
 * Shape decided September 2026: a caregiver gets four destinations, a supervisor five, an admin
 * six (Team joined the rail on Sept 13; Today left it the same day — the logo is the way home). Everything an office user opens a few times a month lives behind the gear instead of
 * competing with Clients for the same glance.
 */

export type Role = "admin" | "supervisor" | "dsp";

/** Counts the section row shows. Every one is already computed for the bell; nothing new is queried. */
export interface NavCounts {
  review: number;
  unsigned: number;
  returned: number;
  manual: number;
  missed: number;
  compliance: number;
  authorizations: number;
}

export const NO_COUNTS: NavCounts = {
  review: 0, unsigned: 0, returned: 0, manual: 0, missed: 0, compliance: 0, authorizations: 0,
};

export interface Destination {
  href: string;
  label: string;
  icon: IconName;
  /** Red count on the tab itself. Only the review queue earns one. */
  badge?: keyof NavCounts;
  /** Other paths that should light this tab up. */
  also?: string[];
}

/** The destinations, in the order they are read. `abilities` is the signed-in role's list from Settings → Roles. */
export function primaryNav(abilities: readonly string[]): Destination[] {
  const has = (k: Parameters<typeof hasAbility>[1]) => hasAbility(abilities, k);
  if (!has("all_clients")) {
    return [
      { href: "/", label: "Today", icon: "home" },
      { href: "/clients", label: "My clients", icon: "clients" },
      { href: "/clock", label: "Clock in", icon: "clock" },
      { href: "/visits", label: "My notes", icon: "visits", also: ["/notes"] },
    ];
  }
  // No Today entry for office roles: the home screen is a greeting, and the logo tile already
  // links there. Caregivers keep theirs — their home is the clock-in screen, not a greeting.
  return [
    { href: "/clients", label: "Clients", icon: "clients", also: ["/agreements"] },
    ...(has("view_team") ? [{ href: "/staff", label: "Team", icon: "team" as IconName }] : []),
    { href: "/scheduling", label: "Schedule", icon: "calendar" },
    { href: "/visits", label: "Notes", icon: "visits", also: ["/notes", "/clock"] },
    ...(has("review") ? [{ href: "/evv", label: "EVV", icon: "shield" as IconName }] : []),
    ...(has("billing") ? [{ href: "/billing", label: "Billing", icon: "money" as IconName }] : []),
    ...(has("review") ? [{ href: "/attention", label: "Review", icon: "bell" as IconName, badge: "review" as const }] : []),
  ];
}

export interface GearGroup { label: string; items: { href: string; label: string; icon: IconName }[] }

/** The screens you open a few times a month. Caregivers get none of them. */
export function gearGroups(abilities: readonly string[]): GearGroup[] {
  const has = (k: Parameters<typeof hasAbility>[1]) => hasAbility(abilities, k);
  const runItems: GearGroup["items"] = [
    ...(has("billing") ? [{ href: "/owner", label: "Agency performance", icon: "trend" as IconName }] : []),
    ...(has("review") ? [
      { href: "/agreements", label: "Authorizations", icon: "doc" as IconName },
      { href: "/compliance", label: "Compliance", icon: "audit" as IconName },
      { href: "/reports", label: "Reports", icon: "chart" as IconName },
    ] : []),
  ];
  const setUpItems: GearGroup["items"] = [
    ...(has("manage_sites") ? [{ href: "/sites", label: "Sites & programs", icon: "sites" as IconName }, { href: "/services", label: "245D services", icon: "catalog" as IconName }] : []),
    ...(has("settings") ? [{ href: "/settings", label: "Settings", icon: "settings" as IconName }, { href: "/audit", label: "Audit log", icon: "history" as IconName }] : []),
  ];
  return [{ label: "Run the agency", items: runItems }, { label: "Set up", items: setUpItems }].filter((g) => g.items.length > 0);
}

export interface SectionEntry {
  href: string;
  label: string;
  count?: number;
  /** Draw the count in red: this is a number someone has to act on. */
  hot?: boolean;
  /** Matched against the full path + query to decide which entry is current. */
  match?: (path: string, params: URLSearchParams) => boolean;
}

const param = (key: string, value: string) => (_path: string, p: URLSearchParams) => p.get(key) === value;

/**
 * The second row: what belongs to the section you have open. Returns null where a section has no
 * depth worth a row — Today, Clients, Team, Schedule, Notes, Billing and every caregiver screen.
 * Only EVV has one now: its entries are different pages, not filters.
 */
export function sectionRow(pathname: string, abilities: readonly string[]): SectionEntry[] | null {
  if (!hasAbility(abilities, "review")) return null;

  // Notes has no section row (user, Sept 20, 2026): its Status filter pill offers the same four
  // states, so a row above the table said the same thing twice. `/visits?state=` still works.

  // The review queue has no section row: its own issue-type and priority menus do that job.

  if (pathname === "/evv") {
    return [
      { href: "/evv", label: "Review queue", match: (_p, p) => !p.get("tab") || p.get("tab") === "queue" },
      { href: "/evv?tab=compliance", label: "Compliance", match: param("tab", "compliance") },
      ...(hasAbility(abilities, "settings") ? [
        { href: "/evv?tab=settings", label: "Settings", match: param("tab", "settings") },
        { href: "/evv?tab=integration", label: "Integration", match: param("tab", "integration") },
      ] : []),
    ];
  }

  return null;
}
