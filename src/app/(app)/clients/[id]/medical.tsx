"use client";

import { useActionState, useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Field, FormError, Input, Select, Textarea, cx } from "@/components/kit";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ActionState } from "@/lib/validation";
import { createMedication, deleteMedication, setMedicationActive } from "../goal-actions";
import { recordMedAdmin } from "../../visits/record-actions";
import { DateInput } from "@/components/date-input";

export interface MedView { id: string; name: string; dose: string; route: string; frequency: string; times: string[]; instructions: string | null; prescriber: string | null; startDate: string; endDate: string | null; active: boolean }
export interface AdminView { medicationId: string; date: string; time: string; status: "given" | "refused" | "held" | "missed"; note: string | null; by: string; byName: string }

type Status = AdminView["status"];
const LETTER: Record<Status, string> = { given: "G", refused: "R", held: "H", missed: "M" };
const CELL: Record<Status, string> = { given: "bg-ok-soft text-ok", refused: "bg-warn-soft text-warn", held: "bg-warn-soft text-warn", missed: "bg-danger-soft text-danger" };
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysInMonth = (month: string) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/**
 * The MAR as a paper MAR (Sept 22, 2026, user's pick "D" of four mockups): one week at a time,
 * seven wide day columns, one row per medication and scheduled time, each cell a letter — G given,
 * R refused, H held, M missed — with the initials of whoever recorded it. Month totals sit in the
 * last column. Add, discontinue and the discontinued list are behind a button and a ⋮ menu, not
 * spread across the page.
 */
export function Medical({ personId, meds, admins, week, weekLabel, month, monthLabel, prevHref, nextHref, thisWeekHref, manage, canRecord, today }: { personId: string; meds: MedView[]; admins: AdminView[]; week: string; weekLabel: string; month: string; monthLabel: string; prevHref: string; nextHref: string; thisWeekHref: string | null; manage: boolean; canRecord: boolean; today: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const [pick, setPick] = useState<{ med: MedView; date: string; time: string; current?: AdminView } | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const active = meds.filter((m) => m.active);
  const retired = meds.filter((m) => !m.active);
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const inMonth = admins.filter((a) => a.date >= `${month}-01` && a.date <= monthEnd);
  const stats = inMonth.reduce((a, x) => ((a[x.status] = (a[x.status] ?? 0) + 1), a), {} as Record<string, number>);

  const scheduled = (m: MedView, date: string) => date >= m.startDate && (m.endDate == null || date <= m.endDate);
  /** Doses the month asked for so far (through today), for the "n / N given" column. */
  const dueInMonth = (m: MedView) => { let n = 0; const last = today < monthEnd ? today : monthEnd; for (let d = `${month}-01`; d <= last; d = addDays(d, 1)) if (scheduled(m, d)) n++; return n; };

  const record = (status: Status, note: string) => {
    if (!pick) return;
    start(async () => {
      const fd = new FormData(); fd.set("medicationId", pick.med.id); fd.set("personId", personId); fd.set("scheduledDate", pick.date); fd.set("scheduledTime", pick.time); fd.set("status", status); if (note) fd.set("note", note);
      const r = await recordMedAdmin({}, fd); if (r.errors) toast.error(r.message ?? "Failed"); else { toast.success("Recorded"); setPick(null); }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-sidebar px-3 py-2">
        <a href={prevHref} aria-label="Previous week" className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover">‹</a>
        <span className="text-[13px] font-medium text-text-strong">{weekLabel}</span>
        <a href={nextHref} aria-label="Next week" className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover">›</a>
        {thisWeekHref && <a href={thisWeekHref} className="text-[13px] font-medium text-primary hover:underline">This week</a>}
        <span className="ml-auto flex flex-wrap items-center gap-4 text-[13px] text-muted-foreground">
          {(["given", "refused", "held", "missed"] as const).map((s) => <span key={s} className="flex items-center gap-1.5"><Cell status={s} small />{s[0].toUpperCase() + s.slice(1)}</span>)}
        </span>
        {manage && <Button variant="secondary" className="h-8" onClick={() => setAdding(true)}>+ Add medication</Button>}
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-card shadow-[var(--shadow-sm)]">
        {active.length === 0 ? <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">No active medications. {manage ? "Add one to start the MAR." : ""}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-sidebar">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Medication</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Time</th>
                  {days.map((d) => (
                    <th key={d} className={cx("px-1 py-1.5 text-center font-medium leading-tight", d === today ? "bg-primary-soft text-primary" : "text-muted-foreground")}>
                      {DOW[days.indexOf(d)]}<br /><span className={cx("text-[13px] tabular-nums", d === today ? "text-primary" : "text-text-strong")}>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`))}</span>
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-muted-foreground">{monthLabel.split(" ")[0]}</th>
                  {manage && <th className="w-9" />}
                </tr>
              </thead>
              <tbody>
                {active.flatMap((m) => m.times.map((t, ti) => {
                  const given = inMonth.filter((a) => a.medicationId === m.id && a.time === t && a.status === "given").length;
                  return (
                    <tr key={`${m.id}-${t}`} className={cx("border-t", ti === 0 ? "border-line" : "border-line-soft")}>
                      {ti === 0 && (
                        <td rowSpan={m.times.length} className="max-w-[300px] px-4 py-2.5 align-top">
                          <div className="font-medium text-text-strong">{m.name}</div>
                          <div className="text-[13px] text-muted-foreground">{m.dose} · {m.route} · {m.frequency}</div>
                          {m.instructions && <div className="mt-0.5 text-[13px] text-muted-foreground">{m.instructions}</div>}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-2 py-2.5 align-top tabular-nums text-muted-foreground">{t}</td>
                      {days.map((d) => {
                        const a = admins.find((x) => x.medicationId === m.id && x.date === d && x.time === t);
                        const future = d > today, off = !scheduled(m, d);
                        const picked = pick && pick.med.id === m.id && pick.date === d && pick.time === t;
                        return (
                          <td key={d} className={cx("px-1 py-2 text-center align-top", d === today && "bg-primary-soft/40")}>
                            <button
                              type="button"
                              disabled={!canRecord || future || off}
                              onClick={() => setPick({ med: m, date: d, time: t, current: a })}
                              title={a ? `${a.status} · ${a.byName}${a.note ? ` · ${a.note}` : ""}` : off ? "Not scheduled" : future ? "Not yet due" : "Not recorded — click to record"}
                              className={cx("mx-auto block rounded-md px-1 py-0.5 disabled:cursor-default", picked && "ring-2 ring-primary")}
                            >
                              {a ? <><Cell status={a.status} /><span className="mt-0.5 block text-[11px] leading-none text-muted-foreground">{a.status === "missed" ? "—" : a.by}</span></> : <span className={cx("inline-block h-6 w-8 rounded-md text-[15px] leading-6", off ? "text-transparent" : future ? "text-line" : "text-hint hover:bg-hover")}>·</span>}
                            </button>
                          </td>
                        );
                      })}
                      <td className="whitespace-nowrap px-3 py-2.5 text-right align-top tabular-nums text-muted-foreground">{given} / {dueInMonth(m)} given</td>
                      {manage && ti === 0 && (
                        <td rowSpan={m.times.length} className="px-1 py-2 text-center align-top">
                          <DropdownMenu>
                            <DropdownMenuTrigger render={<button type="button" aria-label={`Actions for ${m.name}`} className="rounded-md p-1 text-muted-foreground hover:bg-hover hover:text-text-strong" />}><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem disabled={pending} onClick={() => { if (confirm(`Discontinue ${m.name}?`)) start(() => setMedicationActive(m.id, personId, false)); }}>Discontinue</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      )}
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4 border-t border-line-soft bg-sidebar px-4 py-2 text-[13px] text-muted-foreground">
          <span className="font-medium text-text-strong">{monthLabel}</span>
          <span>Given {stats.given ?? 0}</span><span>Refused/held {(stats.refused ?? 0) + (stats.held ?? 0)}</span><span>Missed {stats.missed ?? 0}</span>
          <span className="ml-auto">Initials are the caregiver who recorded the dose. Click an empty cell to record.</span>
        </div>
      </div>

      {pick && (
        <div className="rounded-lg border border-primary bg-primary-soft/40 p-4">
          <div className="mb-2 text-[13px]"><span className="font-semibold text-text-strong">{pick.med.name} {pick.med.dose}</span> <span className="text-muted-foreground">· {pick.date} at {pick.time}</span>{pick.current && <Badge tone={pick.current.status === "given" ? "ok" : "warn"}>{pick.current.status}</Badge>}</div>
          <RecordSlot pending={pending} onRecord={record} onCancel={() => setPick(null)} />
        </div>
      )}

      {retired.length > 0 && (
        <details className="rounded-lg border border-line bg-card"><summary className="cursor-pointer px-4 py-2.5 text-[13px] text-muted-foreground">Discontinued medications ({retired.length})</summary><ul className="divide-y divide-line-soft border-t border-line-soft">{retired.map((m) => <li key={m.id} className="flex items-center justify-between px-4 py-2 text-[13px]"><span><span className="font-medium text-text-strong">{m.name}</span> <span className="text-muted-foreground">{m.dose} · {m.frequency}{m.endDate ? ` · ended ${m.endDate}` : ""}</span></span>{manage && <span className="flex gap-3">
  <button disabled={pending} onClick={() => start(() => setMedicationActive(m.id, personId, true))} className="text-primary hover:underline">Reactivate</button>
  <button
    disabled={pending}
    onClick={() => {
      if (!confirm(`Delete ${m.name} from this record? This is for a medication added by mistake — it cannot be undone.`)) return;
      start(async () => { const r = await deleteMedication(m.id, personId); if (!r.ok && r.error) alert(r.error); });
    }}
    className="text-danger hover:underline"
  >Delete</button>
</span>}</li>)}</ul></details>
      )}

      {manage && adding && (
        <Dialog open onOpenChange={(o) => { if (!o) setAdding(false); }}>
          <DialogContent showCloseButton className="block max-h-[calc(100vh-3rem)] w-[calc(100%-2rem)] overflow-y-auto p-0 sm:max-w-[880px]">
            <DialogTitle className="sr-only">Add a medication</DialogTitle>
            <NewMedication personId={personId} onDone={() => setAdding(false)} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** One MAR cell: the letter a paper MAR uses, on the status tint. */
function Cell({ status, small }: { status: Status; small?: boolean }) {
  return <span className={cx("inline-grid place-items-center rounded-md font-semibold", small ? "h-[18px] w-[22px] text-[11px]" : "h-6 w-8 text-[12.5px]", CELL[status])}>{LETTER[status]}</span>;
}

function RecordSlot({ pending, onRecord, onCancel }: { pending: boolean; onRecord: (s: Status, note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["given", "refused", "held", "missed"] as const).map((s) => <Button key={s} variant={s === "given" ? "primary" : "outline"} disabled={pending} onClick={() => onRecord(s, note)} className="h-8">{s[0].toUpperCase() + s.slice(1)}</Button>)}
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (why refused, held, or late)" className="h-8 min-w-56 flex-1" />
      <Button variant="ghost" className="h-8" onClick={onCancel}>Cancel</Button>
    </div>
  );
}

function NewMedication({ personId, onDone }: { personId: string; onDone: () => void }) {
  const [state, submit, pending] = useActionState(async (p: ActionState, fd: FormData) => { const r = await createMedication(personId, p, fd); if (r.message && !r.errors) { toast.success(r.message); onDone(); } return r; }, {});
  const e = state.errors ?? {};
  return (
    <form action={submit} className="p-6">
      <div className="mb-4 text-[17px] font-semibold text-text-strong">Add a medication</div>
      <FormError message={state.errors ? state.message : undefined} />
      <div className="grid gap-3 md:grid-cols-6">
        <Field label="Medication" error={e.name} className="md:col-span-2"><Input name="name" placeholder="Metformin" required /></Field>
        <Field label="Dose" error={e.dose} className="md:col-span-1"><Input name="dose" placeholder="500 mg" required /></Field>
        <Field label="Route" error={e.route} className="md:col-span-1"><Select name="route" defaultValue="oral"><option value="oral">Oral</option><option value="topical">Topical</option><option value="inhaled">Inhaled</option><option value="injection">Injection</option><option value="other">Other</option></Select></Field>
        <Field label="Frequency" error={e.frequency} className="md:col-span-2"><Input name="frequency" placeholder="Twice daily with food" required /></Field>
        <Field label="Scheduled times" error={e.times} hint="24-hour, comma-separated: 08:00, 20:00" className="md:col-span-2"><Input name="times" placeholder="08:00, 20:00" required /></Field>
        <Field label="Prescriber" error={e.prescriber} className="md:col-span-2"><Input name="prescriber" /></Field>
        <Field label="Start" error={e.startDate} className="md:col-span-1"><DateInput name="startDate" required /></Field>
        <Field label="End" error={e.endDate} className="md:col-span-1"><DateInput name="endDate" /></Field>
        <Field label="Instructions for staff" error={e.instructions} className="md:col-span-6"><Textarea name="instructions" className="min-h-12" placeholder="Give with breakfast. Hold if blood sugar under 70." /></Field>
      </div>
      <div className="mt-5 flex gap-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add medication"}</Button><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </form>
  );
}
