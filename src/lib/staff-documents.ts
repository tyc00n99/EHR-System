/**
 * The personnel-file categories, drawn from what the agency actually keeps on a person: the
 * background study, certificates, orientation record, licenses, ID, employment and tax forms,
 * policy acknowledgments, evaluations.
 */
export const STAFF_DOCUMENT_CATEGORIES = [
  { value: "background_study", label: "Background study" },
  { value: "training_certificate", label: "Training certificate" },
  { value: "orientation", label: "Orientation record" },
  { value: "license", label: "License or insurance" },
  { value: "identification", label: "Identification" },
  { value: "employment_form", label: "Employment form" },
  { value: "tax_form", label: "Tax form" },
  { value: "policy_acknowledgment", label: "Policy acknowledgment" },
  { value: "evaluation", label: "Evaluation" },
  { value: "other", label: "Other" },
] as const;

export type StaffDocumentCategory = (typeof STAFF_DOCUMENT_CATEGORIES)[number]["value"];

/** Which category a credential's evidence files under. */
export function categoryForCredential(type: string): StaffDocumentCategory {
  if (type === "background_study") return "background_study";
  if (type === "orientation") return "orientation";
  if (type === "drivers_license" || type === "auto_insurance" || type === "first_aid" || type === "cpr") return "license";
  return "training_certificate";
}
