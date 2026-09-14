/**
 * EVV service rules: which service code + modifier combinations require EVV. The table
 * (`evv_service_rules`) is the source of truth; this file holds the matching logic and the
 * seed for Minnesota so a new organisation starts with the current DHS list.
 *
 * Nothing else in the application checks service codes for EVV. Call `ruleFor()`.
 */
import type { EvvServiceRule } from "@/db/schema";

export const MN_EVV_SOURCE = {
  url: "https://mn.gov/dhs/partners-and-providers/news-initiatives-reports-workgroups/long-term-services-and-supports/evv/",
  label: "Minnesota DHS — Electronic visit verification: services that require EVV",
  /** The DHS list this seed was taken from. Re-check the page when DHS republishes. */
  effectiveDate: "2026-01-01",
} as const;

export interface RuleSeed {
  serviceCode: string;
  requiredModifiers: string[];
  excludedModifiers?: string[];
  allowAdditionalModifiers?: boolean;
  label: string;
  unitType: EvvServiceRule["unitType"];
  sharedCare?: boolean;
}

/**
 * Minnesota services that require EVV, as listed by DHS. Codes with modifiers are matched on the
 * modifiers DHS prints; `allowAdditionalModifiers` lets a visit carry extra pricing modifiers
 * (a UB/U8 rate modifier, say) and still match.
 */
export const MN_EVV_RULE_SEED: RuleSeed[] = [
  { serviceCode: "T2028", requiredModifiers: ["U1"], label: "CDCS personal assistance", unitType: "fifteen_minute" },
  { serviceCode: "T2025", requiredModifiers: [], label: "Consumer Support Grant", unitType: "fifteen_minute" },
  { serviceCode: "T1005", requiredModifiers: [], excludedModifiers: ["TG"], label: "Crisis respite, 15 minutes", unitType: "fifteen_minute" },
  { serviceCode: "S9125", requiredModifiers: [], label: "Crisis respite, daily", unitType: "daily" },
  { serviceCode: "T1005", requiredModifiers: ["TG"], label: "Specialized crisis respite", unitType: "fifteen_minute" },
  { serviceCode: "S5130", requiredModifiers: ["TG"], label: "Homemaker with personal care", unitType: "fifteen_minute" },
  { serviceCode: "H2015", requiredModifiers: ["U3"], label: "ICLS, in person", unitType: "fifteen_minute" },
  { serviceCode: "S5125", requiredModifiers: ["UC"], excludedModifiers: ["UN"], label: "IHS with family training", unitType: "fifteen_minute" },
  { serviceCode: "S5125", requiredModifiers: ["UC", "UN"], label: "Shared IHS with family training", unitType: "fifteen_minute", sharedCare: true },
  { serviceCode: "H2014", requiredModifiers: ["UC", "U3"], excludedModifiers: ["UN"], label: "IHS with training", unitType: "fifteen_minute" },
  { serviceCode: "H2014", requiredModifiers: ["UC", "UN", "U3"], label: "Shared IHS with training", unitType: "fifteen_minute", sharedCare: true },
  { serviceCode: "H0043", requiredModifiers: ["U3", "UC"], label: "Daily IHS with training", unitType: "daily" },
  { serviceCode: "S5135", requiredModifiers: ["UC"], excludedModifiers: ["UN"], label: "IHS without training", unitType: "fifteen_minute" },
  { serviceCode: "S5135", requiredModifiers: ["UC", "UN"], label: "Shared IHS without training", unitType: "fifteen_minute", sharedCare: true },
  { serviceCode: "S5135", requiredModifiers: ["UA"], label: "Night supervision", unitType: "fifteen_minute" },
  { serviceCode: "T1019", requiredModifiers: [], label: "PCA / CFSS (all applicable modifiers)", unitType: "fifteen_minute" },
  { serviceCode: "S5150", requiredModifiers: [], label: "In-home respite, 15 minutes", unitType: "fifteen_minute" },
  { serviceCode: "S5151", requiredModifiers: [], label: "In-home respite, daily", unitType: "daily" },
];

const norm = (m: string) => m.trim().toUpperCase();

/** Whether a visit's modifiers satisfy a rule's modifier constraints. */
export function modifiersMatch(rule: Pick<EvvServiceRule, "requiredModifiers" | "excludedModifiers" | "allowAdditionalModifiers">, modifiers: string[]): boolean {
  const have = new Set(modifiers.map(norm));
  for (const r of rule.requiredModifiers) if (!have.has(norm(r))) return false;
  for (const x of rule.excludedModifiers) if (have.has(norm(x))) return false;
  if (!rule.allowAdditionalModifiers) {
    const required = new Set(rule.requiredModifiers.map(norm));
    for (const h of have) if (!required.has(h)) return false;
  }
  return true;
}

/** Whether a rule is in force on a date. */
export function ruleInForce(rule: Pick<EvvServiceRule, "active" | "effectiveFrom" | "effectiveTo">, isoDate: string): boolean {
  if (!rule.active) return false;
  if (rule.effectiveFrom > isoDate) return false;
  if (rule.effectiveTo && rule.effectiveTo < isoDate) return false;
  return true;
}

/**
 * The rule that governs a service on a date, or null when no rule matches (→ EVV not required).
 * Most specific wins: more required modifiers beat fewer; a payer-specific rule beats a general
 * one; a newer version beats an older one.
 */
export function ruleFor(rules: EvvServiceRule[], serviceCode: string, modifiers: string[], isoDate: string, payerId: string | null = null): EvvServiceRule | null {
  const code = serviceCode.trim().toUpperCase();
  const candidates = rules.filter((r) => r.serviceCode.toUpperCase() === code && ruleInForce(r, isoDate) && (r.payerId === null || r.payerId === payerId) && modifiersMatch(r, modifiers));
  if (!candidates.length) return null;
  candidates.sort((a, b) =>
    (b.payerId ? 1 : 0) - (a.payerId ? 1 : 0) ||
    b.requiredModifiers.length - a.requiredModifiers.length ||
    b.version - a.version ||
    (b.effectiveFrom > a.effectiveFrom ? 1 : -1),
  );
  return candidates[0];
}
