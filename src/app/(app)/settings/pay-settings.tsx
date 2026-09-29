"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, Card, Field, FormError, Input, Select } from "@/components/kit";
import { DateInput } from "@/components/date-input";
import { fmtDate } from "@/lib/format";
import { FREQUENCY_LABEL, describePayRule, payPeriodContaining, shiftPayPeriod, type PayFrequency, type PayRule } from "@/lib/pay-period";
import type { OvertimeRules } from "@/lib/pay";
import type { ActionState } from "@/lib/validation";
import { deletePaySchedule, saveOvertimeRules, savePaySchedule } from "./pay-actions";

export interface ScheduleRow extends PayRule { id: string }

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function useResult(state: ActionState, onOk?: () => void) {
  useEffect(() => {
    if (state.ok) { toast.success(state.message ?? "Saved."); onOk?.(); }
    else if (state.error) toast.error(state.error);
  }, [state, onOk]);
}

/**
 * The agency's pay schedule (Sept 29, 2026). A new schedule takes effect on the date chosen; the old
 * one's last period ends the day before. The preview shows the periods it will produce, so the
 * choice is checked against dates rather than trusted.
 */
export function PayScheduleEditor({ schedules, onDone }: { schedules: ScheduleRow[]; onDone?: () => void }) {
  const [state, action, pending] = useActionState(savePaySchedule, {});
  const [frequency, setFrequency] = useState<PayFrequency>("biweekly");
  const [from, setFrom] = useState("");
  const [removing, startRemove] = useTransition();
  useResult(state, onDone);
  const e = state.errors ?? {};
  const rules: PayRule[] = schedules.map(({ effectiveFrom, frequency, anchorDate }) => ({ effectiveFrom, frequency, anchorDate }));
  const preview = from ? (() => {
    const next = [...rules.filter((r) => r.effectiveFrom !== from), { effectiveFrom: from, frequency, anchorDate: from }];
    const before = payPeriodContaining(from, next).startDate === from ? shiftPayPeriod(payPeriodContaining(from, next), -1, next) : null;
    const first = payPeriodContaining(from, next);
    return { before, periods: [first, shiftPayPeriod(first, 1, next), shiftPayPeriod(first, 2, next)] };
  })() : null;
  const current = [...schedules].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  return (
    <div className="grid gap-5">
      <div>
        <div className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Schedules</div>
        <ul className="divide-y divide-line-soft rounded-xl border border-line">
          {current.map((s, i) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-text-strong">{describePayRule(s)}</div>
                <div className="text-[13px] text-muted-foreground">{s.effectiveFrom <= "2000-01-01" ? "From the start" : `From ${fmtDate(s.effectiveFrom)}`}{i === 0 ? " · in use now or next" : ""}</div>
              </div>
              {schedules.length > 1 && (
                <button type="button" disabled={removing} onClick={() => { if (confirm("Remove this schedule? The one before it will run on in its place.")) startRemove(async () => { const r = await deletePaySchedule(s.id); if (r.error) toast.error(r.error); else toast.success(r.message ?? "Removed."); }); }} className="text-[13px] font-medium text-danger hover:underline disabled:opacity-50">Remove</button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <form action={action} className="grid gap-4 rounded-xl border border-line bg-card-soft p-4">
        <div className="text-[15px] font-semibold text-text-strong">Change the pay schedule</div>
        <FormError message={state.errors ? state.message : undefined} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="How often" error={e.frequency}>
            <Select name="frequency" value={frequency} onChange={(ev) => setFrequency(ev.target.value as PayFrequency)}>
              {(Object.keys(FREQUENCY_LABEL) as PayFrequency[]).map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
            </Select>
          </Field>
          <Field label="First period starts" error={e.effectiveFrom} hint={frequency === "weekly" || frequency === "biweekly" ? "Periods count from this day" : "Periods follow the calendar from here"}>
            <DateInput name="effectiveFrom" value={from} onChange={(ev) => setFrom(ev.target.value)} required />
          </Field>
        </div>
        {preview && (
          <div className="rounded-lg bg-card px-3 py-2.5 text-[13.5px]">
            {preview.before && <div className="text-muted-foreground">The period before ends {fmtDate(preview.before.endDate)} ({preview.before.label}).</div>}
            <div className="mt-0.5">Then: {preview.periods.map((p) => p.label).join(" · ")} …</div>
          </div>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending || !from}>{pending ? "Saving…" : "Save schedule"}</Button>
          {onDone && <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>}
        </div>
      </form>
    </div>
  );
}

/** Overtime rules. The agency decides; Minnesota's own law is the default. */
export function OvertimeForm({ rules }: { rules: OvertimeRules }) {
  const [state, action, pending] = useActionState(saveOvertimeRules, {});
  useResult(state);
  const e = state.errors ?? {};
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state.errors ? state.message : undefined} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Overtime after, per week" error={e.weeklyHours} hint="Hours in one workweek"><Input name="weeklyHours" inputMode="decimal" defaultValue={String(rules.weeklyHours)} required /></Field>
        <Field label="Overtime after, per day" error={e.dailyHours} hint="Optional. Leave blank for none"><Input name="dailyHours" inputMode="decimal" defaultValue={rules.dailyHours == null ? "" : String(rules.dailyHours)} placeholder="None" /></Field>
        <Field label="Overtime pays" error={e.multiplier} hint="Times the regular rate"><Input name="multiplier" inputMode="decimal" defaultValue={String(rules.multiplier)} required /></Field>
        <Field label="Workweek starts on" error={e.workweekStartDay}>
          <Select name="workweekStartDay" defaultValue={String(rules.workweekStartDay)}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select>
        </Field>
      </div>
      <p className="text-[13px] text-muted-foreground">Minnesota&apos;s own rule is overtime after 48 hours in a week. Federal law sets 40 for most home care workers employed by an agency. Check with your accountant which applies to you. Anyone marked exempt on their Pay tab gets no overtime.</p>
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save overtime rules"}</Button></div>
    </form>
  );
}

export function PaySettings({ schedules, overtime }: { schedules: ScheduleRow[]; overtime: OvertimeRules }) {
  return (
    <div className="grid max-w-5xl items-start gap-5 lg:grid-cols-2">
      <Card padded title="Pay schedule" description="How pay periods are cut. Notes, billing, reports and the Pay tab all follow it.">
        <PayScheduleEditor schedules={schedules} />
      </Card>
      <Card padded title="Overtime" description="How each team member's Pay tab estimates overtime.">
        <OvertimeForm rules={overtime} />
      </Card>
    </div>
  );
}
