"use client";

import { useState } from "react";
import { Input, Select, cx } from "@/components/kit";

/**
 * The job title on a staff record (Sept 28, 2026, user's request): the three 245D roles and the
 * combined one as a menu, with "Other…" opening a text box for anything else. The form still
 * receives one `title` string, so the actions and schema are unchanged.
 */
export const JOB_TITLES = ["Direct support professional", "Designated coordinator", "Designated manager", "DC/DM (designated coordinator and manager)"] as const;
const OTHER = "__other__";

export function JobTitleField({ name = "title", defaultValue = "", required, className }: { name?: string; defaultValue?: string; required?: boolean; className?: string }) {
  const preset = (JOB_TITLES as readonly string[]).includes(defaultValue);
  const [choice, setChoice] = useState<string>(preset ? defaultValue : defaultValue ? OTHER : JOB_TITLES[0]);
  const [custom, setCustom] = useState(preset ? "" : defaultValue);
  const value = choice === OTHER ? custom : choice;
  return (
    <div className={cx("grid gap-2", className)}>
      <input type="hidden" name={name} value={value} />
      <Select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Job title" required={required}>
        {JOB_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
        <option value={OTHER}>Other…</option>
      </Select>
      {choice === OTHER && <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Type the job title" aria-label="Other job title" required={required} autoFocus />}
    </div>
  );
}
