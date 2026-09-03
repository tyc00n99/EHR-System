/**
 * Documentation templates by 245D service. Drives the structured fields in the
 * service record: which skills a caregiver can mark as worked on.
 */
import { getServiceType } from "./services";

export const INTERACTION_LEVELS = [
  ["low", "Low", "Mostly independent; occasional prompts"],
  ["medium", "Medium", "Regular prompting or partial assistance"],
  ["high", "High", "Hands-on support or continuous direction"],
] as const;

const SKILLS: Record<string, string[]> = {
  "in-home": ["Communication", "Daily living", "Independence", "Community integration", "Health and safety", "Money management", "Social skills", "Problem solving", "Household tasks", "Medication support"],
  respite: ["Personal care", "Meals", "Recreation", "Community outing", "Bedtime routine", "Safety supervision"],
  day: ["Communication", "Social skills", "Vocational skills", "Community integration", "Recreation", "Self-advocacy", "Health and wellness"],
  employment: ["Job search", "Interview practice", "Workplace communication", "Task completion", "Time management", "Transportation", "Employer contact"],
  residential: ["Personal care", "Meals", "Medication support", "Household tasks", "Community integration", "Health appointments", "Social skills", "Safety"],
  community: ["Community integration", "Transportation", "Money management", "Daily living", "Social skills"],
  intervention: ["De-escalation", "Coping strategies", "Positive support plan", "Environmental change", "Skill teaching"],
  supervision: ["Overnight safety", "Sleep routine", "Medication support", "Emergency response"],
};

export function skillsFor(serviceTypeId: string | null | undefined): string[] {
  if (!serviceTypeId) return SKILLS["in-home"];
  try {
    return SKILLS[getServiceType(serviceTypeId).group] ?? SKILLS["in-home"];
  } catch {
    return SKILLS["in-home"];
  }
}

export const GOAL_CATEGORIES = [
  ["social", "Social skills"],
  ["daily_living", "Daily living"],
  ["health", "Health and wellness"],
  ["community", "Community"],
  ["employment", "Employment"],
  ["communication", "Communication"],
  ["other", "Other"],
] as const;
