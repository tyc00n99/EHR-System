"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";
import { createShifts } from "../actions";

/**
 * Create event, laid out field for field as the reference does it: a full page rather than a
 * drawer, one column of full-width controls, the three time fields on one line, and the two
 * groups ("Event details", "Location") that the reference separates.
 *
 * Two of its fields are ours rather than theirs, and for a licence reason: an event has to hang off
 * an authorization, so "Event type" lists the client's authorized services instead of a free list
 * of session types, and it only fills in once a client is chosen.
 */

export interface FormAgreement {
  id: string;
  personId: string;
  label: string;
  dates: string;
}

const ZONE_LABEL = "Central Time - Minneapolis, St. Paul, Duluth";

const RECURRENCE = [
  ["none", "Does not repeat"],
  ["weekly", "Weekly on the chosen days"],
] as const;

function Label({ children, required, after }: { children: React.ReactNode; required?: boolean; after?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className="text-[14.5px] text-text-strong">{children}{required && <span className="text-danger"> *</span>}</span>
      {after}
    </div>
  );
}

const field = "h-10 w-full rounded-lg border border-line bg-card px-3 text-[14.5px] text-text outline-none focus:border-primary";

export function EventForm({
  clients, staff, agreements, locations, defaultDate,
}: {
  clients: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  agreements: FormAgreement[];
  locations: { id: string; name: string }[];
  defaultDate: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createShifts, {});
  const [personId, setPersonId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("13:00");
  const [recurrence, setRecurrence] = useState<string>("none");
  const [weekdays, setWeekdays] = useState<number[]>([]);

  const forClient = useMemo(() => agreements.filter((a) => a.personId === personId), [agreements, personId]);
  const timed = Boolean(date && start && end);
  const err = (k: string) => state.errors?.[k];

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-4 border-b border-line px-6 py-3.5">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back to the schedule"
          className="flex size-9 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-hover hover:text-text-strong"
        >
          <Icon.chevronLeft size={16} />
        </button>
        <h1 className="mr-auto text-[26px] leading-none">Create event</h1>
        <Link href="/scheduling" className="flex h-10 items-center rounded-lg border border-line bg-card px-4 text-[14.5px] font-medium text-text-strong hover:bg-hover">Cancel</Link>
        <button disabled={pending} className="flex h-10 items-center rounded-lg bg-primary px-4 text-[14.5px] font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60">
          {pending ? "Creating…" : "Create event"}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-[1180px]">
          {state.message && <p className="mb-4 rounded-lg border border-danger bg-danger-soft px-3 py-2 text-[14px] text-danger">{state.message}</p>}

          <h2 className="mb-3 text-[21px] leading-none">Event details</h2>

          <div className="mb-4">
            <Label required>Client</Label>
            <select name="personId" value={personId} onChange={(e) => setPersonId(e.target.value)} className={field}>
              <option value="">Select client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {err("personId") && <p className="mt-1 text-[13px] text-danger">{err("personId")}</p>}
          </div>

          <div className="mb-4">
            <Label required after={personId && <Link href={`/clients/${personId}?tab=profile&section=authorizations`} className="text-[14px] font-medium text-primary hover:underline">Authorization utilization</Link>}>
              Event type
            </Label>
            <select name="serviceAgreementId" disabled={!personId} className={cx(field, !personId && "bg-panel text-hint")}>
              <option value="">{personId ? "Select a session type" : "Select a client first"}</option>
              {forClient.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            {personId && forClient.length === 0 && <p className="mt-1 text-[13px] text-warn">This client has no active authorization to schedule against.</p>}
            {err("serviceAgreementId") && <p className="mt-1 text-[13px] text-danger">{err("serviceAgreementId")}</p>}
          </div>

          <div className="mb-4 grid gap-4 md:grid-cols-3">
            <div>
              <Label required>Date</Label>
              <input type="date" name="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
              {err("date") && <p className="mt-1 text-[13px] text-danger">{err("date")}</p>}
            </div>
            <div>
              <Label required>Start time</Label>
              <input type="time" name="start" value={start} onChange={(e) => setStart(e.target.value)} step={900} className={field} />
              {err("start") && <p className="mt-1 text-[13px] text-danger">{err("start")}</p>}
            </div>
            <div>
              <Label required>End time</Label>
              <input type="time" name="end" value={end} onChange={(e) => setEnd(e.target.value)} step={900} className={field} />
              {err("end") && <p className="mt-1 text-[13px] text-danger">{err("end")}</p>}
            </div>
          </div>

          <div className="mb-4">
            <Label>Time zone</Label>
            <input readOnly value={ZONE_LABEL} aria-label="Time zone" className={cx(field, "bg-panel text-muted-foreground")} />
            <p className="mt-1 text-[13px] text-muted-foreground">A 245D licence is a Minnesota licence, so every time on the schedule is Central.</p>
          </div>

          <div className="mb-4">
            <Label>Recurrence</Label>
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className={field}>
              {RECURRENCE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {recurrence === "weekly" && (
              <div className="mt-3 rounded-lg border border-line p-3">
                <p className="mb-2 text-[14px] text-muted-foreground">Repeat on</p>
                <div className="flex flex-wrap gap-1.5">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => {
                    const on = weekdays.includes(i);
                    return (
                      <button
                        type="button"
                        key={d}
                        aria-pressed={on}
                        onClick={() => setWeekdays((w) => (on ? w.filter((x) => x !== i) : [...w, i]))}
                        className={cx("h-9 rounded-lg border px-3 text-[14px] font-medium", on ? "border-primary bg-primary-soft text-primary" : "border-line text-muted-foreground hover:bg-hover")}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
                {weekdays.map((w) => <input key={w} type="hidden" name="weekdays[]" value={w} />)}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[14px] text-muted-foreground">for</span>
                  <input type="number" name="repeatWeeks" min={1} max={26} defaultValue={4} className="h-9 w-20 rounded-lg border border-line bg-card px-2 text-[14px]" />
                  <span className="text-[14px] text-muted-foreground">weeks</span>
                </div>
              </div>
            )}
          </div>

          <div className="mb-4">
            <Label required>Team members</Label>
            <select name="staffId" disabled={!timed} className={cx(field, !timed && "bg-panel text-hint")}>
              <option value="">{timed ? "Select a caregiver" : "Select a date and time first"}</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {err("staffId") && <p className="mt-1 text-[13px] text-danger">{err("staffId")}</p>}
          </div>

          <div className="mb-6">
            <Label>Notes</Label>
            <textarea name="note" rows={3} placeholder="Enter custom event notes" className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[14.5px] text-text outline-none placeholder:text-hint focus:border-primary" />
          </div>

          <h2 className="mb-3 text-[21px] leading-none">Location</h2>
          <div className="mb-4">
            <Label>Care location</Label>
            <select disabled={!personId} className={cx(field, !personId && "bg-panel text-hint")}>
              <option value="">{personId ? "Select a care location" : "Select a client first"}</option>
              {locations.filter(() => personId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <p className="mt-1 text-[13px] text-muted-foreground">Care locations are kept on the client&apos;s Profile tab; the note records where the visit actually happened.</p>
          </div>
        </div>
      </div>
    </form>
  );
}
