/**
 * Catalog of every service type licensed under Minn. Stat. 245D.
 * Source: 245D.03, subd. 1, paragraphs (b) and (c) (2025 statutes, as amended).
 *
 * `planningTrack` follows 245D.071, subd. 1: intervention services (c)(1) and
 * individualized home supports with training (c)(2)(ii) follow the basic-track
 * planning rules in 245D.07, subd. 2, even though they are intensive services.
 */

export type ServiceCategory = "basic" | "intensive";

export type ServiceGroup =
  | "respite"
  | "in-home"
  | "supervision"
  | "intervention"
  | "residential"
  | "day"
  | "employment"
  | "community";

/** Planning rules that govern the service (see 245D.07 and 245D.071). */
export type PlanningTrack = "245D.07" | "245D.071";

export type Waiver = "BI" | "CAC" | "CADI" | "DD" | "EW";

export const WAIVER_NAMES: Record<Waiver, string> = {
  BI: "Brain Injury",
  CAC: "Community Alternative Care",
  CADI: "Community Access for Disability Inclusion",
  DD: "Developmental Disabilities",
  EW: "Elderly Waiver",
};

export interface ServiceType {
  /** Stable identifier used in the database and URLs. */
  id: string;
  /** Short label for tables and badges. */
  code: string;
  name: string;
  category: ServiceCategory;
  group: ServiceGroup;
  planningTrack: PlanningTrack;
  waivers: Waiver[];
  /** Statute clause that defines the service. */
  cite: string;
  note?: string;
}

const ALL_HCBS: Waiver[] = ["BI", "CAC", "CADI", "DD"];

export const SERVICE_TYPES: ServiceType[] = [
  // ---- Basic support services: 245D.03, subd. 1(b) ----
  {
    id: "respite-in-home",
    code: "Respite (in-home)",
    name: "In-home respite care",
    category: "basic",
    group: "respite",
    planningTrack: "245D.07",
    waivers: ["BI", "CAC", "CADI", "DD", "EW"],
    cite: "245D.03, subd. 1(b)(1)",
  },
  {
    id: "respite-out-of-home",
    code: "Respite (out-of-home)",
    name: "Out-of-home respite care",
    category: "basic",
    group: "respite",
    planningTrack: "245D.07",
    waivers: ["BI", "CAC", "CADI", "DD", "EW"],
    cite: "245D.03, subd. 1(b)(1)",
    note: "Children served in a licensed family child foster care home are excluded when the foster license holder meets 245D.06 and 245D.061.",
  },
  {
    id: "adult-companion",
    code: "Adult companion",
    name: "Adult companion services",
    category: "basic",
    group: "in-home",
    planningTrack: "245D.07",
    waivers: ["EW"],
    cite: "245D.03, subd. 1(b)(2)",
    note: "Excludes the federal Senior Companion Program.",
  },
  {
    id: "emergency-assistance",
    code: "24-hour emergency",
    name: "24-hour emergency assistance / personal emergency response",
    category: "basic",
    group: "supervision",
    planningTrack: "245D.07",
    waivers: ["CADI", "DD"],
    cite: "245D.03, subd. 1(b)(3)",
  },
  {
    id: "night-supervision",
    code: "Night supervision",
    name: "Night supervision services",
    category: "basic",
    group: "supervision",
    planningTrack: "245D.07",
    waivers: ALL_HCBS,
    cite: "245D.03, subd. 1(b)(4)",
  },
  {
    id: "homemaker",
    code: "Homemaker",
    name: "Homemaker services",
    category: "basic",
    group: "in-home",
    planningTrack: "245D.07",
    waivers: ["BI", "CAC", "CADI", "DD", "EW"],
    cite: "245D.03, subd. 1(b)(5)",
    note: "Excludes MDH-licensed providers under chapter 144A and cleaning-only providers.",
  },
  {
    id: "icls",
    code: "ICLS",
    name: "Individual community living support",
    category: "basic",
    group: "community",
    planningTrack: "245D.07",
    waivers: ["EW"],
    cite: "245D.03, subd. 1(b)(6); 256S.13",
  },
  {
    id: "ihs-without-training",
    code: "IHS (no training)",
    name: "Individualized home supports without training",
    category: "basic",
    group: "in-home",
    planningTrack: "245D.07",
    waivers: ALL_HCBS,
    cite: "245D.03, subd. 1(b)(7)",
  },

  // ---- Intensive support services: 245D.03, subd. 1(c) ----
  {
    id: "positive-support",
    code: "Positive support",
    name: "Positive support services",
    category: "intensive",
    group: "intervention",
    planningTrack: "245D.07",
    waivers: ALL_HCBS,
    cite: "245D.03, subd. 1(c)(1)(i); 245D.091",
  },
  {
    id: "crisis-respite",
    code: "Crisis respite",
    name: "In-home or out-of-home crisis respite services",
    category: "intensive",
    group: "intervention",
    planningTrack: "245D.07",
    waivers: ALL_HCBS,
    cite: "245D.03, subd. 1(c)(1)(ii); 245D.091",
  },
  {
    id: "specialist",
    code: "Specialist",
    name: "Specialist services",
    category: "intensive",
    group: "intervention",
    planningTrack: "245D.07",
    waivers: ALL_HCBS,
    cite: "245D.03, subd. 1(c)(1)(iii); 245D.091",
  },
  {
    id: "sils",
    code: "SILS",
    name: "Semi-independent living services",
    category: "intensive",
    group: "in-home",
    planningTrack: "245D.071",
    waivers: [],
    cite: "245D.03, subd. 1(c)(2)(i)",
    note: "State-funded program under 252.275, not a waiver service.",
  },
  {
    id: "ihs-with-training",
    code: "IHS (training)",
    name: "Individualized home supports with training",
    category: "intensive",
    group: "in-home",
    planningTrack: "245D.07",
    waivers: ALL_HCBS,
    cite: "245D.03, subd. 1(c)(2)(ii)",
    note: "Intensive service that follows the basic planning track per 245D.071, subd. 1.",
  },
  {
    id: "ihs-family-training",
    code: "IHS (family training)",
    name: "Individualized home supports with family training",
    category: "intensive",
    group: "in-home",
    planningTrack: "245D.071",
    waivers: ALL_HCBS,
    cite: "245D.03, subd. 1(c)(2)(iii)",
  },
  {
    id: "crs",
    code: "CRS",
    name: "Community residential services",
    category: "intensive",
    group: "residential",
    planningTrack: "245D.071",
    waivers: ALL_HCBS,
    cite: "245D.03, subd. 1(c)(3)(i)",
    note: "Provided in a corporate child foster care residence, community residential setting, or supervised living facility.",
  },
  {
    id: "frs",
    code: "FRS",
    name: "Family residential services",
    category: "intensive",
    group: "residential",
    planningTrack: "245D.071",
    waivers: ALL_HCBS,
    cite: "245D.03, subd. 1(c)(3)(ii)",
    note: "Provided in a family child or family adult foster care residence.",
  },
  {
    id: "slf-residential",
    code: "SLF / ICF-DD",
    name: "Residential services in a supervised living facility (more than four persons), including ICFs/DD",
    category: "intensive",
    group: "residential",
    planningTrack: "245D.071",
    waivers: [],
    cite: "245D.03, subd. 1(c)(3)(iii)",
    note: "ICF/DD license holders are exempt from several sections; see 245D.03, subd. 2(e).",
  },
  {
    id: "life-sharing",
    code: "Life sharing",
    name: "Life sharing",
    category: "intensive",
    group: "residential",
    planningTrack: "245D.071",
    waivers: ALL_HCBS,
    cite: "245D.03, subd. 1(c)(3)(iv)",
  },
  {
    id: "day-support",
    code: "Day support",
    name: "Day support services",
    category: "intensive",
    group: "day",
    planningTrack: "245D.071",
    waivers: ALL_HCBS,
    cite: "245D.03, subd. 1(c)(4)(i)",
  },
  {
    id: "dth",
    code: "DT&H",
    name: "Day training and habilitation services",
    category: "intensive",
    group: "day",
    planningTrack: "245D.071",
    waivers: ["DD"],
    cite: "245D.03, subd. 1(c)(4)(ii); 252.41 to 252.46",
  },
  {
    id: "prevocational",
    code: "Prevocational",
    name: "Prevocational services",
    category: "intensive",
    group: "day",
    planningTrack: "245D.071",
    waivers: ALL_HCBS,
    cite: "245D.03, subd. 1(c)(4)(iii)",
  },
  {
    id: "employment-exploration",
    code: "Employment exploration",
    name: "Employment exploration services",
    category: "intensive",
    group: "employment",
    planningTrack: "245D.071",
    waivers: ALL_HCBS,
    cite: "245D.03, subd. 1(c)(5)",
  },
  {
    id: "employment-development",
    code: "Employment development",
    name: "Employment development services",
    category: "intensive",
    group: "employment",
    planningTrack: "245D.071",
    waivers: ALL_HCBS,
    cite: "245D.03, subd. 1(c)(6)",
  },
  {
    id: "employment-support",
    code: "Employment support",
    name: "Employment support services",
    category: "intensive",
    group: "employment",
    planningTrack: "245D.071",
    waivers: ALL_HCBS,
    cite: "245D.03, subd. 1(c)(7)",
  },
  {
    id: "ics",
    code: "ICS",
    name: "Integrated community supports",
    category: "intensive",
    group: "community",
    planningTrack: "245D.071",
    waivers: ALL_HCBS,
    cite: "245D.03, subd. 1(c)(8); 245D.12",
  },
];

export const GROUP_LABELS: Record<ServiceGroup, string> = {
  respite: "Respite",
  "in-home": "In-home supports",
  supervision: "Supervision and emergency response",
  intervention: "Intervention services",
  residential: "Residential supports and services",
  day: "Day services",
  employment: "Employment services",
  community: "Community living",
};

export function getServiceType(id: string): ServiceType {
  const s = SERVICE_TYPES.find((t) => t.id === id);
  if (!s) throw new Error(`Unknown 245D service type: ${id}`);
  return s;
}

export function servicesByCategory(category: ServiceCategory): ServiceType[] {
  return SERVICE_TYPES.filter((s) => s.category === category);
}
