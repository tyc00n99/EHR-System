"use client";

import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cx } from "@/components/kit";

/**
 * Explains a 245D rule where it actually bites, rather than in a manual nobody opens.
 * Add rules here; every place that enforces one should point at it by key.
 */
export const RULES = {
  orientation: {
    title: "Orientation before unsupervised contact",
    body: "A caregiver cannot work alone with someone until they have been oriented to that person's support plan, health needs, and emergency procedures. Record the date on the assignment. Until you do, the app blocks clock-in for that pairing.",
    cite: "Minn. Stat. § 245D.09, subd. 4a",
  },
  units: {
    title: "How units are counted",
    body: "A unit is 15 minutes. The app converts clocked time using the 8-minute rule: a leftover of 8 minutes or more earns another unit, less than 8 earns nothing. A 3 hour 10 minute service bills 13 units, not 12.5.",
    cite: "DHS provider manual, unit-based services",
  },
  code: {
    title: "The client's signing code",
    body: "Each person has a private six-digit code. They enter it on the caregiver's phone at the end of the service to confirm it happened. The caregiver never sees it. If the person cannot sign, the caregiver records why, and that reason travels with the note.",
    cite: "Anti-fraud control on caregiver billings",
  },
  manual: {
    title: "Manual entries",
    body: "A note typed in without a clock-in and clock-out has no electronic visit verification behind it. It needs a written reason and paper or verbal backup on file, and it stays flagged until someone confirms that evidence exists.",
    cite: "21st Century Cures Act EVV requirement",
  },
  planning: {
    title: "Planning deadlines",
    body: "Service start triggers a chain of dates: a preliminary support plan addendum within 15 days, the full addendum within 45 days, then a review every year. Missing these is the most common licensing citation.",
    cite: "Minn. Stat. § 245D.07 and § 245D.071",
  },
  documentation: {
    title: "What a service note must show",
    body: "Who provided the service, for whom, on what date, from when to when, where, what supports were given, and how the person responded against their support plan outcomes. The printed note carries all of it plus both signatures.",
    cite: "Minn. Stat. § 245D.095, subd. 3",
  },
  incident: {
    title: "Incidents",
    body: "Injury, medication error, a person missing, maltreatment, or emergency use of manual restraint must be documented and reported, some within 24 hours. Incident tracking is not built yet, so the note prints \"None reported\" for now.",
    cite: "Minn. Stat. § 245D.06, subd. 1",
  },
} as const;

export type RuleKey = keyof typeof RULES;

export function Rule({ name, className }: { name: RuleKey; className?: string }) {
  const r = RULES[name];
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button type="button" aria-label={`What the rule says: ${r.title}`} className={cx("inline-flex size-4 shrink-0 items-center justify-center rounded-full text-hint hover:text-primary", className)} />
        }
      >
        <HelpCircle className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-4 text-left">
        <div className="text-[13.5px] font-semibold text-text-strong">{r.title}</div>
        <p className="mt-1.5 text-[13px] leading-5 text-text">{r.body}</p>
        <div className="mt-2.5 border-t border-line-soft pt-2 text-[11.5px] text-muted-foreground">{r.cite}</div>
      </PopoverContent>
    </Popover>
  );
}
