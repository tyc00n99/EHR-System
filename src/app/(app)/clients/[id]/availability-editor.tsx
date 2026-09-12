"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { saveAvailability } from "./profile-actions";
import type { ActionState } from "@/lib/validation";

/**
 * The availability schedule: every weekday at once, because that is how someone thinks about a
 * week. A day can hold more than one window (a morning and an evening), and the copy control takes
 * the day you just filled in and stamps it onto the days you pick — typing the same 2:30–7:00 five
 * times is the thing this screen exists to avoid.
 */

export interface Window { start: string; end: string }
export interface Schedule { startDate: string; endDate: string; timeZone: string; days: Window[][] }

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * A 245D licence is a Minnesota licence, so every client is served on Central time. It is shown
 * rather than chosen: a dropdown with one option is a decision nobody gets to make.
 */
const ZONE = "America/Chicago";
const ZONE_LABEL = "Central Time — Minnesota";

const DEFAULT_WINDOW: Window = { start: "09:00", end: "17:00" };

export function AvailabilityEditor({ personId, initial, onDone }: { personId: string; initial: Schedule; onDone: () => void }) {
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const timeZone = ZONE;
  const [days, setDays] = useState<Window[][]>(initial.days);
  const [copyFrom, setCopyFrom] = useState<number | null>(null);

  const [state, submit, pending] = useActionState(async (p: ActionState, fd: FormData) => {
    const r = await saveAvailability(p, fd);
    if (r.ok) { toast.success(r.message ?? "Saved."); onDone(); }
    else if (r.error) toast.error(r.error);
    else if (r.errors) toast.error(Object.values(r.errors)[0] ?? "Check the highlighted fields.");
    return r;
  }, {});

  const setDay = (i: number, windows: Window[]) => setDays((d) => d.map((w, n) => (n === i ? windows : w)));
  const toggle = (i: number) => setDay(i, days[i].length ? [] : [{ ...DEFAULT_WINDOW }]);
  const edit = (i: number, j: number, key: keyof Window, value: string) =>
    setDay(i, days[i].map((w, n) => (n === j ? { ...w, [key]: value } : w)));

  const schedule = JSON.stringify({
    startDate, endDate: endDate || undefined, timeZone,
    windows: days.flatMap((ws, weekday) => ws.map((w) => ({ weekday, startTime: w.start, endTime: w.end }))),
  });

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onDone(); }}>
      <SheetContent side="right" showCloseButton={false} className="w-full overflow-y-auto p-0 data-[side=right]:sm:max-w-[760px]">
        <SheetTitle className="sr-only">Edit availability</SheetTitle>
        <form action={submit} className="flex min-h-full flex-col">
          <div className="flex items-center gap-3 border-b border-line px-6 py-4">
            <div className="text-[19px] font-semibold text-text-strong">Edit availability</div>
            <button type="button" onClick={onDone} aria-label="Close" className="ml-auto flex size-8 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-hover hover:text-text-strong">
              <Icon.plus size={17} className="rotate-45" />
            </button>
          </div>

          <input type="hidden" name="personId" value={personId} />
          <input type="hidden" name="schedule" value={schedule} />

          <div className="px-6 py-5">
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-1.5 block text-[14px] font-medium text-text-strong">Start date <span className="text-danger">*</span></span>
                <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10 w-full rounded-lg border border-line bg-card px-3 text-[14px] text-text" />
                {state.errors?.startDate && <span className="mt-1 block text-[12.5px] text-danger">{state.errors.startDate}</span>}
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[14px] font-medium text-text-strong">End date</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-10 w-full rounded-lg border border-line bg-card px-3 text-[14px] text-text" />
                {state.errors?.endDate && <span className="mt-1 block text-[12.5px] text-danger">{state.errors.endDate}</span>}
              </label>
            </div>

            <div className="mt-4">
              <span className="mb-1.5 block text-[14px] font-medium text-text-strong">Time zone</span>
              <div className="flex h-10 items-center rounded-lg border border-line bg-panel px-3 text-[14px] text-muted-foreground">{ZONE_LABEL}</div>
            </div>

            <div className="mt-6">
              {days.map((windows, i) => {
                const on = windows.length > 0;
                return (
                  <div key={i} className="relative border-b border-line-soft py-3 last:border-0">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`${FULL[i]} available`}
                        onClick={() => toggle(i)}
                        className={cx("mt-1 flex size-[22px] shrink-0 items-center justify-center rounded-md border-2 transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-primary/50 bg-card")}
                      >
                        {on && <Icon.check size={14} />}
                      </button>
                      <span className="mt-1 w-11 shrink-0 text-[14px] font-medium text-text-strong">{DAYS[i]}</span>

                      {!on ? (
                        <span className="mt-1 text-[14px] text-hint">Unavailable</span>
                      ) : (
                        <div className="min-w-0 flex-1">
                          {windows.map((w, j) => (
                            <div key={j} className="mb-2 flex flex-nowrap items-center gap-2 last:mb-0">
                              <input type="time" value={w.start} onChange={(e) => edit(i, j, "start", e.target.value)} className="h-9 w-[140px] rounded-lg border border-line bg-card px-3 text-[14px] text-text" aria-label={`${FULL[i]} window ${j + 1} starts`} />
                              <span className="text-muted-foreground">-</span>
                              <input type="time" value={w.end} onChange={(e) => edit(i, j, "end", e.target.value)} className="h-9 w-[140px] rounded-lg border border-line bg-card px-3 text-[14px] text-text" aria-label={`${FULL[i]} window ${j + 1} ends`} />
                              <button type="button" onClick={() => setDay(i, windows.filter((_, n) => n !== j))} aria-label={`Remove ${FULL[i]} window ${j + 1}`} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-danger-soft hover:text-danger">
                                <Icon.trash size={17} />
                              </button>
                              {j === 0 && (
                                <span className="ml-auto flex items-center gap-1">
                                  <button type="button" onClick={() => setDay(i, [...windows, { ...DEFAULT_WINDOW }])} aria-label={`Add another ${FULL[i]} window`} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-text-strong">
                                    <Icon.plus size={17} />
                                  </button>
                                  <button type="button" onClick={() => setCopyFrom(copyFrom === i ? null : i)} aria-label={`Copy ${FULL[i]} times to other days`} aria-expanded={copyFrom === i} className={cx("flex size-8 items-center justify-center rounded-md", copyFrom === i ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-hover hover:text-text-strong")}>
                                    <Icon.copy size={17} />
                                  </button>
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {copyFrom === i && (
                      <CopyTo
                        from={i}
                        onClose={() => setCopyFrom(null)}
                        onApply={(targets) => {
                          setDays((d) => d.map((w, n) => (targets.includes(n) ? windows.map((x) => ({ ...x })) : w)));
                          setCopyFrom(null);
                          toast.success(`${FULL[i]} times copied to ${targets.length} day${targets.length === 1 ? "" : "s"}.`);
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-auto flex items-center gap-3 border-t border-line px-6 py-4">
            <button type="submit" disabled={pending} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-[14px] font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60">
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={onDone} className="inline-flex h-10 items-center rounded-lg border border-line px-5 text-[14px] text-text hover:bg-hover">Cancel</button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** "Copy Mon times to …" — the control that stops you typing the same hours five times. */
function CopyTo({ from, onApply, onClose }: { from: number; onApply: (targets: number[]) => void; onClose: () => void }) {
  const others = [0, 1, 2, 3, 4, 5, 6].filter((n) => n !== from);
  const [picked, setPicked] = useState<number[]>([]);
  const all = picked.length === others.length;

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-20 cursor-default" onClick={onClose} />
      <div className="absolute right-0 top-full z-40 mt-1 w-60 rounded-xl border border-line bg-page p-4 shadow-xl">
        <div className="mb-3 text-[14px] font-medium text-text-strong">Copy {FULL[from]} times to</div>
        <label className="flex items-center gap-2.5 pb-3 text-[14px] text-text">
          <input type="checkbox" checked={all} onChange={() => setPicked(all ? [] : others)} className="size-[18px] rounded border-line accent-[var(--primary)]" />
          Select all
        </label>
        <div className="border-t border-line pt-2">
          {others.map((n) => (
            <label key={n} className="flex items-center gap-2.5 py-1.5 text-[14px] text-text">
              <input
                type="checkbox"
                checked={picked.includes(n)}
                onChange={() => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]))}
                className="size-[18px] rounded border-line accent-[var(--primary)]"
              />
              {FULL[n]}
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={picked.length === 0}
          onClick={() => onApply(picked)}
          className="mt-3 h-9 w-full rounded-lg bg-primary text-[14px] font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
        >
          Apply
        </button>
      </div>
    </>
  );
}
