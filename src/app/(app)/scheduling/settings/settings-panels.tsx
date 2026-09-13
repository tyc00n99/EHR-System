"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";
import { serviceColor } from "@/components/chart";
import { deleteCancellationReason, saveCalendarSettings, saveCancellationReason } from "../actions";

/**
 * Schedule settings, in the reference's three tabs. Event types is the one that differs on purpose:
 * theirs is a free list of session types, ours is the DHS service list, because a 245D event has to
 * carry a billable service code and inventing our own would make the claim wrong.
 */

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const field = "h-10 rounded-lg border border-line bg-card px-3 text-[14.5px] text-text outline-none focus:border-primary";

export function EventTypes({ services }: { services: { code: string; label: string; modifiers: string; clients: number }[] }) {
  return (
    <section className="rounded-xl border border-line">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <div className="mr-auto">
          <h2 className="text-[21px] leading-none">Sessions</h2>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            The session types used on the schedule. Billing codes come from the DHS service list in{" "}
            <Link href="/services" className="font-medium text-primary hover:underline">245D services</Link>.
          </p>
        </div>
      </div>
      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
        {services.length === 0 && <p className="text-[14px] text-muted-foreground">No authorized services yet. They appear here once a client has an authorization.</p>}
        {services.map((s) => (
          <div key={s.code + s.modifiers} className="rounded-lg border border-line p-3">
            <div className="flex items-center gap-2">
              <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: serviceColor(s.code) }} />
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-text-strong">{s.label}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="ident rounded bg-primary-soft px-1.5 py-0.5 text-[13px] font-medium text-primary">{s.code}{s.modifiers && ` ${s.modifiers}`}</span>
              <span className="text-[13px] text-muted-foreground">{s.clients} client{s.clients === 1 ? "" : "s"}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CancellationReasons({ reasons }: { reasons: { id: string; label: string; active: boolean }[] }) {
  const [state, action, pending] = useActionState(saveCancellationReason, {});
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  // Closing the editor belongs to the submit event, not to an effect watching the result.
  const close = () => { setEditing(null); setAdding(false); };

  const row = (r: { id: string; label: string; active: boolean }) => (
    <div key={r.id} className="flex items-center gap-2 rounded-lg border border-line p-3">
      {editing === r.id ? (
        <form action={action} onSubmit={close} className="flex flex-1 items-center gap-2">
          <input type="hidden" name="id" value={r.id} />
          <input name="label" defaultValue={r.label} autoFocus className={cx(field, "min-w-0 flex-1")} />
          <button disabled={pending} className="h-9 rounded-lg bg-primary px-3 text-[14px] font-medium text-primary-foreground">Save</button>
          <button type="button" onClick={() => setEditing(null)} className="h-9 px-2 text-[14px] text-muted-foreground hover:text-text-strong">Cancel</button>
        </form>
      ) : (
        <>
          <span className={cx("min-w-0 flex-1 text-[14.5px]", r.active ? "text-text-strong" : "text-hint line-through")}>{r.label}</span>
          {!r.active && <span className="rounded bg-panel px-1.5 text-[13px] text-muted-foreground">retired</span>}
          <button type="button" onClick={() => setEditing(r.id)} aria-label={`Rename ${r.label}`} className="flex size-9 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-hover hover:text-text-strong">
            <Icon.edit size={16} />
          </button>
          <button
            type="button"
            aria-label={`Delete ${r.label}`}
            onClick={async () => {
              if (!confirm(`Delete "${r.label}"?`)) return;
              const res = await deleteCancellationReason(r.id);
              if (res.message) toast.message(res.message);
            }}
            className="flex size-9 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-danger-soft hover:text-danger"
          >
            <Icon.trash size={16} />
          </button>
        </>
      )}
    </div>
  );

  return (
    <section className="rounded-xl border border-line">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <div className="mr-auto">
          <h2 className="text-[21px] leading-none">Cancellation reasons</h2>
          <p className="mt-1.5 text-[14px] text-muted-foreground">The reasons offered when events are cancelled in bulk.</p>
        </div>
        <button type="button" onClick={() => setAdding(true)} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[14.5px] font-medium text-primary-foreground hover:bg-primary-hover">
          <Icon.plus size={15} />Add cancellation reason
        </button>
      </div>
      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
        {adding && (
          <form action={action} onSubmit={close} className="flex items-center gap-2 rounded-lg border border-primary p-3">
            <input name="label" placeholder="Reason" autoFocus className={cx(field, "min-w-0 flex-1")} />
            <button disabled={pending} className="h-9 rounded-lg bg-primary px-3 text-[14px] font-medium text-primary-foreground">Add</button>
            <button type="button" onClick={() => setAdding(false)} className="h-9 px-2 text-[14px] text-muted-foreground hover:text-text-strong">Cancel</button>
          </form>
        )}
        {reasons.map(row)}
      </div>
    </section>
  );
}

export function CalendarSettings({ startHour, endHour, days }: { startHour: number; endHour: number; days: number[] }) {
  const [state, action, pending] = useActionState(saveCalendarSettings, {});
  const [on, setOn] = useState<number[]>(days);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <form action={action} className="rounded-xl border border-line">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[21px] leading-none">Calendar settings</h2>
        <p className="mt-1.5 text-[14px] text-muted-foreground">These settings apply to everyone in the agency.</p>
      </div>
      <div className="grid gap-6 p-5 md:grid-cols-2">
        <div>
          <h3 className="mb-1 text-[17px]">Displayed days</h3>
          <p className="mb-3 text-[14px] text-muted-foreground">The days the schedule shows.</p>
          <div className="flex flex-wrap gap-1.5">
            {DOW.map((d, i) => {
              const set = on.includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={set}
                  onClick={() => setOn((v) => (set ? v.filter((x) => x !== i) : [...v, i]))}
                  className={cx("h-9 rounded-lg border px-3 text-[14px] font-medium", set ? "border-primary bg-primary-soft text-primary" : "border-line text-muted-foreground hover:bg-hover")}
                >
                  {d.slice(0, 3)}
                </button>
              );
            })}
          </div>
          {on.map((d) => <input key={d} type="hidden" name="days[]" value={d} />)}
          {state.errors?.days && <p className="mt-1 text-[13px] text-danger">{state.errors.days}</p>}
        </div>

        <div>
          <h3 className="mb-1 text-[17px]">Displayed hours</h3>
          <p className="mb-3 text-[14px] text-muted-foreground">The window of the day the schedule draws, in Central time.</p>
          <div className="flex items-center gap-2">
            <label className="text-[14px] text-muted-foreground" htmlFor="from-hour">From</label>
            <select id="from-hour" name="scheduleStartHour" defaultValue={startHour} className={field}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h % 12 === 0 ? 12 : h % 12}:00 {h < 12 ? "AM" : "PM"}</option>)}
            </select>
            <label className="text-[14px] text-muted-foreground" htmlFor="to-hour">To</label>
            <select id="to-hour" name="scheduleEndHour" defaultValue={endHour} className={field}>
              {Array.from({ length: 25 }, (_, h) => <option key={h} value={h}>{h === 24 ? "Midnight" : `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`}</option>)}
            </select>
          </div>
          {state.errors?.scheduleEndHour && <p className="mt-1 text-[13px] text-danger">{state.errors.scheduleEndHour}</p>}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <button disabled={pending} className="h-10 rounded-lg bg-primary px-4 text-[14.5px] font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
