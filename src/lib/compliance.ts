/**
 * Service-planning deadlines derived from Minn. Stat. 245D.07 and 245D.071.
 * All functions are pure so they can be unit-tested and reused server-side.
 */
import type { PlanningTrack } from "./services";

export interface Deadline {
  id: string;
  label: string;
  cite: string;
  due: Date;
}

const DAY = 24 * 60 * 60 * 1000;

export function addCalendarDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY);
}

/** Working days = Monday through Friday. State holidays are not yet excluded. */
export function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  let remaining = days;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return d;
}

/** Deadlines that start the clock at service initiation. */
export function deadlinesFromServiceStart(track: PlanningTrack, start: Date): Deadline[] {
  const preliminary: Deadline = {
    id: "preliminary-addendum",
    label: "Preliminary support plan addendum",
    cite: track === "245D.07" ? "245D.07, subd. 2(b)" : "245D.071, subd. 3(a)",
    due: addCalendarDays(start, 15),
  };

  if (track === "245D.07") {
    return [
      preliminary,
      {
        id: "addendum-review",
        label: "Review and revise the preliminary addendum",
        cite: "245D.07, subd. 2(c)",
        due: addCalendarDays(start, 60),
      },
    ];
  }

  // 245D.071: before 45 days of service or within 60 calendar days, whichever is
  // shorter. Without a service calendar we use the 60-day ceiling; callers that
  // know the service days delivered should tighten this with `daysOfServiceLimit`.
  const assessmentDue = addCalendarDays(start, 60);
  return [
    {
      id: "abuse-prevention-plan",
      label: "Abuse prevention plan",
      cite: "245D.071, subd. 2; 245A.65, subd. 2",
      due: start,
    },
    preliminary,
    {
      id: "assessments",
      label: "Assessments: health, safety, and behavior self-management",
      cite: "245D.071, subd. 3(b)",
      due: assessmentDue,
    },
    {
      id: "initial-planning-meeting",
      label: "Initial planning meeting",
      cite: "245D.071, subd. 3(c)",
      due: assessmentDue,
    },
  ];
}

/** Deadlines that start the clock at the initial planning meeting (245D.071 only). */
export function deadlinesFromPlanningMeeting(meeting: Date): Deadline[] {
  return [
    {
      id: "service-plan",
      label: "Service outcomes and supports documented in the addendum",
      cite: "245D.071, subd. 4(a)",
      due: addWorkingDays(meeting, 10),
    },
    {
      id: "signatures",
      label: "Dated signatures from the person or legal representative and case manager",
      cite: "245D.071, subd. 4(c)",
      due: addWorkingDays(meeting, 20),
    },
  ];
}

/** Assessments recur at least annually (245D.071, subd. 3(b)). */
export function nextAnnualAssessment(lastAssessment: Date): Date {
  const d = new Date(lastAssessment.getTime());
  d.setFullYear(d.getFullYear() + 1);
  return d;
}
