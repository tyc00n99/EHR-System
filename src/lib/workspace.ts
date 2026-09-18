/**
 * Two ways of looking at the same records. Clinical is the caregiver's and QIDP's side: notes,
 * goals, medications, the schedule. Practice Management is the office side: personnel files,
 * client documents and profiles, EVV, billing, the review queue. The switch only changes what is
 * shown; nothing about the data or the rules changes with it.
 */
export type Workspace = "clinical" | "practice";

export const WORKSPACE_COOKIE = "ehr.workspace";
export const WORKSPACE_LABEL: Record<Workspace, string> = { clinical: "Clinical", practice: "Practice Management" };

export const isWorkspace = (v: unknown): v is Workspace => v === "clinical" || v === "practice";

/** Rail destinations (by href) that belong to each side; anything not listed shows in both. */
const RAIL: Record<Workspace, Set<string>> = {
  clinical: new Set(["/", "/clients", "/scheduling", "/visits", "/clock"]),
  practice: new Set(["/", "/clients", "/staff", "/evv", "/billing", "/attention", "/clock"]),
};
export const railAllows = (ws: Workspace, href: string) => RAIL[ws].has(href);

/** Record tabs (by key) on each side. Overview is on both so the landing page never moves. */
export const RECORD_TABS: Record<"client" | "staff", Record<Workspace, string[]>> = {
  client: { clinical: ["overview", "lifeplan", "notes", "medical"], practice: ["overview", "files", "profile"] },
  staff: { clinical: ["overview", "visits"], practice: ["overview", "compliance", "login"] },
};

const other = (ws: Workspace): Workspace => (ws === "clinical" ? "practice" : "clinical");

/** The tabs to draw: the side's own, plus the current one if a link brought us straight to it. */
export function tabsFor<T extends { key: string }>(kind: "client" | "staff", ws: Workspace, all: T[], current: string): T[] {
  const keep = new Set(RECORD_TABS[kind][ws]);
  return all.filter((t) => keep.has(t.key) || t.key === current);
}

/** One line under the tab row naming what lives on the other side, so nothing seems to vanish. */
export function hiddenTabsHint<T extends { key: string; label: string }>(kind: "client" | "staff", ws: Workspace, all: T[]): { labels: string[]; target: Workspace } {
  const shown = new Set(RECORD_TABS[kind][ws]);
  return { labels: all.filter((t) => !shown.has(t.key)).map((t) => t.label), target: other(ws) };
}
