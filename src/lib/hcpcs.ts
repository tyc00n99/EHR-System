/**
 * Main HCPCS procedure codes and modifiers for 245D services.
 * Source: DHS-3945 "Long-Term Services and Supports Service Rate Limits",
 * effective April 1, 2026 (CADI, DD, and EW sections). 15-minute codes only;
 * units in this system are always 15 minutes.
 */

export interface ServiceCode {
  code: string;
  /** Modifiers DHS lists with this code by default (in DHS order). */
  modifiers: string[];
  label: string;
  /** Key into src/lib/services.ts. */
  serviceTypeId: string;
}

export const SERVICE_CODES: ServiceCode[] = [
  { code: "H2014", modifiers: ["UC", "U3"], label: "Individualized home supports with training, 1:1", serviceTypeId: "ihs-with-training" },
  { code: "H2014", modifiers: ["UC", "UN", "U3"], label: "Individualized home supports with training, 1:2", serviceTypeId: "ihs-with-training" },
  { code: "S5135", modifiers: ["UC"], label: "Individualized home supports without training, 1:1", serviceTypeId: "ihs-without-training" },
  { code: "S5135", modifiers: ["UC", "UN"], label: "Individualized home supports without training, 1:2", serviceTypeId: "ihs-without-training" },
  { code: "S5125", modifiers: ["UC"], label: "Individualized home supports with family training, 1:1", serviceTypeId: "ihs-family-training" },
  { code: "S5125", modifiers: ["UC", "UN"], label: "Individualized home supports with family training, 1:2", serviceTypeId: "ihs-family-training" },
  { code: "S5150", modifiers: [], label: "Respite care, in home", serviceTypeId: "respite-in-home" },
  { code: "S5150", modifiers: ["UB"], label: "Respite care, out of home", serviceTypeId: "respite-out-of-home" },
  { code: "T1005", modifiers: [], label: "Crisis respite", serviceTypeId: "crisis-respite" },
  { code: "T1005", modifiers: ["TG"], label: "Crisis respite, specialized staff", serviceTypeId: "crisis-respite" },
  { code: "S5130", modifiers: [], label: "Homemaker, cleaning", serviceTypeId: "homemaker" },
  { code: "S5130", modifiers: ["TF"], label: "Homemaker, home management", serviceTypeId: "homemaker" },
  { code: "S5130", modifiers: ["TG"], label: "Homemaker, assistance with personal cares", serviceTypeId: "homemaker" },
  { code: "S5135", modifiers: [], label: "Adult companion services", serviceTypeId: "adult-companion" },
  { code: "S5135", modifiers: ["UA"], label: "Night supervision services", serviceTypeId: "night-supervision" },
  { code: "H2011", modifiers: [], label: "24-hour emergency assistance", serviceTypeId: "emergency-assistance" },
  { code: "H2015", modifiers: ["U3"], label: "Individual community living support (ICLS)", serviceTypeId: "icls" },
  { code: "H2019", modifiers: [], label: "Positive support by analyst", serviceTypeId: "positive-support" },
  { code: "H2019", modifiers: ["TF"], label: "Positive support by specialist", serviceTypeId: "positive-support" },
  { code: "H2019", modifiers: ["TG"], label: "Positive support by professional", serviceTypeId: "positive-support" },
  { code: "T2021", modifiers: ["UC"], label: "Day support services", serviceTypeId: "day-support" },
  { code: "T2047", modifiers: [], label: "Prevocational services", serviceTypeId: "prevocational" },
  { code: "T2019", modifiers: ["U2"], label: "Employment exploration", serviceTypeId: "employment-exploration" },
  { code: "T2019", modifiers: ["U1"], label: "Employment development, plan", serviceTypeId: "employment-development" },
  { code: "T2019", modifiers: ["U8"], label: "Employment development, find", serviceTypeId: "employment-development" },
  { code: "T2019", modifiers: ["U3"], label: "Employment development", serviceTypeId: "employment-development" },
  { code: "T2019", modifiers: ["U9"], label: "Employment support, individual", serviceTypeId: "employment-support" },
  { code: "T2019", modifiers: ["HQ"], label: "Employment support, group", serviceTypeId: "employment-support" },
  { code: "H2032", modifiers: ["TG"], label: "Independent living skills, individual", serviceTypeId: "sils" },
  { code: "H2032", modifiers: ["HQ"], label: "Independent living skills, group", serviceTypeId: "sils" },
];

/** Value used in the service-code select: code plus its default modifiers. */
export function serviceCodeKey(s: ServiceCode) {
  return [s.code, ...s.modifiers].join(" ");
}

export interface Modifier {
  code: string;
  meaning: string;
}

/** Modifiers that appear on 245D service lines in DHS-3945, with the meaning DHS uses them for. */
export const MODIFIERS: Modifier[] = [
  { code: "UC", meaning: "Waiver service (DHS-defined)" },
  { code: "U1", meaning: "Employment development, plan phase" },
  { code: "U2", meaning: "Employment exploration / life sharing" },
  { code: "U3", meaning: "With training / ICLS / employment development" },
  { code: "U4", meaning: "Delivered remotely" },
  { code: "U5", meaning: "Adult companion, remote" },
  { code: "U8", meaning: "Employment development, find phase" },
  { code: "U9", meaning: "Individual (1:1) employment support / CRS" },
  { code: "UA", meaning: "Night supervision" },
  { code: "UB", meaning: "Out of home" },
  { code: "UN", meaning: "Staff ratio 1:2" },
  { code: "UP", meaning: "Staff ratio 1:3" },
  { code: "UQ", meaning: "Staff ratio 1:4" },
  { code: "UR", meaning: "Staff ratio 1:5" },
  { code: "US", meaning: "Staff ratio 1:6 or more" },
  { code: "HQ", meaning: "Group setting" },
  { code: "TF", meaning: "Intermediate level (specialist / home management)" },
  { code: "TG", meaning: "Complex or high level (professional / personal cares / specialized staff)" },
];

export const MODIFIER_CODES = MODIFIERS.map((m) => m.code);

/** Human label for a code + modifier combination, falling back to the raw claim line. */
export function labelForCode(code: string, modifiers: string[]): string {
  const key = [code, ...modifiers].join(" ");
  const exact = SERVICE_CODES.find((s) => serviceCodeKey(s) === key);
  if (exact) return exact.label;
  const byCode = SERVICE_CODES.find((s) => s.code === code);
  return byCode ? byCode.label.replace(/,\s*1:\d$/, "") : key;
}
