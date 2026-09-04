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

/**
 * Default daily-activity statements, written with {name} so each client's list reads naturally.
 * Supervisors can replace the list per client (people.activityLibrary).
 */
export const DEFAULT_ACTIVITIES = [
  "Accompanied {name} on community outings, providing support as needed to promote comfort and participation",
  "Assisted {name} with coordinating transportation to events, appointments, and social outings",
  "Assisted {name} with developing and following a weekly activity schedule to reduce idle time and promote active daily routines",
  "Assisted {name} with hygiene routines to promote consistency",
  "Assisted {name} with organizing personal belongings and daily tasks",
  "Assisted {name} with setting boundaries and navigating social interactions",
  "Assisted {name} with setting up reminders and systems for appointments and scheduled events",
  "Assisted {name} with meal planning, grocery shopping, and preparing a meal",
  "Assisted {name} with household tasks such as laundry, dishes, and tidying living areas",
  "Assisted {name} with budgeting, paying bills, and tracking spending",
  "Supported {name} with medication reminders and monitoring for side effects",
  "Supported {name} in practicing coping strategies during moments of stress or frustration",
  "Provided supervision and safety monitoring throughout the service",
  "Modeled and practiced communication skills with {name} in a natural setting",
  "Supported {name} in contacting family, friends, or providers to stay connected",
  "Assisted {name} with physical activity or exercise as tolerated",
];

/** The activity choices for one person: their own library if set, otherwise the defaults with their name filled in. */
export function activitiesFor(firstName: string, library: string[] | null | undefined): string[] {
  const base = library && library.length ? library : DEFAULT_ACTIVITIES;
  return base.map((a) => a.replace(/\{name\}/g, firstName));
}
