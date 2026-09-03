"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge, Button, Field, FormError, Input, Select, Textarea, cx } from "@/components/kit";
import type { ActionState } from "@/lib/validation";
import { createMedication, setMedicationActive } from "../goal-actions";
import { recordMedAdmin } from "../../visits/record-actions";

export interface MedView { id: string; name: string; dose: string; route: string; frequency: string; times: string[]; instructions: string | null; prescriber: string | null; startDate: string; endDate: string | null; active: boolean }
export interface AdminView { medicationId: string; date: string; time: string; status: "given" | "refused" | "held" | "missed"; note: string | null }

const DOT: Record<string, string> = { given: "bg-ok", refused: "bg-warn", held: "bg-warn", missed: "bg-danger" };

export function Medical({ personId, meds, admins, month, monthLabel, prevHref, nextHref, manage, canRecord, today }: { personId: string; meds: MedView[]; admins: AdminView[]; month: string; monthLabel: string; prevHref: string; nextHref: string; manage: boolean; canRecord: boolean; today: string }) {
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const [pick, setPick] = useState<{ med: MedView; date: string; time: string; current?: AdminView } | null>(null);
  const [pending, start] = useTransition();
  const active = meds.filter((m) => m.active);
  const stats = admins.reduce((a, x) => ((a[x.status] = (a[x.status] ?? 0) + 1), a), {} as Record<string, number>);

  const record = (status: "given" | "refused" | "held" | "missed", note: string) => {
    if (!pick) return;
    start(async () => {
      const fd = new FormData(); fd.set("medicationId", pick.med.id); fd.set("personId", personId); fd.set("scheduledDate", pick.date); fd.set("scheduledTime", pick.time); fd.set("status", status); if (note) fd.set("note", note);
      const r = await recordMedAdmin({}, fd); if (r.errors) toast.error(r.message ?? "Failed"); else { toast.success("Recorded"); setPick(null); }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-sidebar px-3 py-2">
        <a href={prevHref} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover">‹</a>
        <span className="text-[13px] font-medium text-text-strong">{monthLabel}</span>
        <a href={nextHref} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover">›</a>
        <span className="ml-auto flex flex-wrap gap-3 text-[12.5px] text-muted-foreground"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ok" />Given {stats.given ?? 0}</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-warn" />Refused/held {(stats.refused ?? 0) + (stats.held ?? 0)}</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-danger" />Missed {stats.missed ?? 0}</span></span>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-card shadow-[var(--shadow-sm)]">
        {active.length === 0 ? <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">No active medications. {manage ? "Add one below to start the MAR." : ""}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead className="bg-sidebar"><tr><th className="sticky left-0 z-10 bg-sidebar px-4 py-2 text-left font-medium text-muted-foreground">Medication</th><th className="px-2 py-2 text-left font-medium text-muted-foreground">Time</th>{days.map((d) => <th key={d} className={cx("w-7 py-2 text-center font-medium tabular-nums", `${month}-${String(d).padStart(2, "0")}` === today ? "text-primary" : "text-muted-foreground")}>{d}</th>)}</tr></thead>
              <tbody>
                {active.flatMap((m) => m.times.map((t, ti) => (
                  <tr key={`${m.id}-${t}`} className="border-t border-line-soft">
                    {ti === 0 && <td rowSpan={m.times.length} className="sticky left-0 z-10 bg-card px-4 py-2 align-top"><div className="font-medium text-text-strong">💊 {m.name}</div><div className="text-[12px] text-muted-foreground">{m.dose} · {m.route} · {m.frequency}</div>{m.instructions && <div className="text-[11.5px] text-muted-foreground">{m.instructions}</div>}</td>}
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums text-muted-foreground">{t}</td>
                    {days.map((d) => {
                      const date = `${month}-${String(d).padStart(2, "0")}`;
                      const a = admins.find((x) => x.medicationId === m.id && x.date === date && x.time === t);
                      const future = date > today, before = date < m.startDate || (m.endDate != null && date > m.endDate);
                      return (
                        <td key={d} className="py-2 text-center">
                          <button disabled={!canRecord || future || before} onClick={() => setPick({ med: m, date, time: t, current: a })} title={a ? `${a.status}${a.note ? ` · ${a.note}` : ""}` : before ? "Not scheduled" : "Not recorded"} className={cx("mx-auto block h-4 w-4 rounded-full transition-transform enabled:hover:scale-125 disabled:cursor-default", a ? DOT[a.status] : before ? "bg-transparent" : future ? "bg-gray-200" : "bg-gray-300")} />
                        </td>
                      );
                    })}
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pick && (
        <div className="rounded-lg border border-primary bg-primary-soft/40 p-4">
          <div className="mb-2 text-[13px]"><span className="font-semibold text-text-strong">{pick.med.name} {pick.med.dose}</span> <span className="text-muted-foreground">· {pick.date} at {pick.time}</span>{pick.current && <Badge tone={pick.current.status === "given" ? "ok" : "warn"}>{pick.current.status}</Badge>}</div>
          <RecordSlot pending={pending} onRecord={record} onCancel={() => setPick(null)} />
        </div>
      )}

      {meds.some((m) => !m.active) && (
        <details className="rounded-lg border border-line bg-card"><summary className="cursor-pointer px-4 py-2.5 text-[13px] text-muted-foreground">Discontinued medications ({meds.filter((m) => !m.active).length})</summary><ul className="divide-y divide-line-soft border-t border-line-soft">{meds.filter((m) => !m.active).map((m) => <li key={m.id} className="flex items-center justify-between px-4 py-2 text-[13px]"><span>{m.name} {m.dose} · {m.frequency}</span><span className="text-muted-foreground">ended {m.endDate}</span>{manage && <button disabled={pending} onClick={() => start(() => setMedicationActive(m.id, personId, true))} className="text-primary hover:underline">Reactivate</button>}</li>)}</ul></details>
      )}
      {manage && active.length > 0 && <div className="flex flex-wrap gap-2 text-[12.5px]">{active.map((m) => <button key={m.id} disabled={pending} onClick={() => { if (confirm(`Discontinue ${m.name}?`)) start(() => setMedicationActive(m.id, personId, false)); }} className="rounded-md border border-line bg-page px-2.5 py-1 text-muted-foreground hover:text-danger">Discontinue {m.name}</button>)}</div>}
      {manage && <NewMedication personId={personId} />}
    </div>
  );
}

function RecordSlot({ pending, onRecord, onCancel }: { pending: boolean; onRecord: (s: "given" | "refused" | "held" | "missed", note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["given", "refused", "held", "missed"] as const).map((s) => <Button key={s} variant={s === "given" ? "primary" : "outline"} disabled={pending} onClick={() => onRecord(s, note)} className="h-8">{s[0].toUpperCase() + s.slice(1)}</Button>)}
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (why refused, held, or late)" className="h-8 min-w-56 flex-1" />
      <Button variant="ghost" className="h-8" onClick={onCancel}>Cancel</Button>
    </div>
  );
}

function NewMedication({ personId }: { personId: string }) {
  const [state, submit, pending] = useActionState(async (p: ActionState, fd: FormData) => { const r = await createMedication(personId, p, fd); if (r.message && !r.errors) toast.success(r.message); return r; }, {});
  const e = state.errors ?? {};
  return (
    <form action={submit} key={String(state.message ?? "")} className="rounded-lg border border-line bg-sidebar p-5">
      <div className="mb-3 text-[13px] font-semibold text-text-strong">Add a medication</div>
      <FormError message={state.errors ? state.message : undefined} />
      <div className="grid gap-3 md:grid-cols-6">
        <Field label="Medication" error={e.name} className="md:col-span-2"><Input name="name" placeholder="Metformin" required /></Field>
        <Field label="Dose" error={e.dose} className="md:col-span-1"><Input name="dose" placeholder="500 mg" required /></Field>
        <Field label="Route" error={e.route} className="md:col-span-1"><Select name="route" defaultValue="oral"><option value="oral">Oral</option><option value="topical">Topical</option><option value="inhaled">Inhaled</option><option value="injection">Injection</option><option value="other">Other</option></Select></Field>
        <Field label="Frequency" error={e.frequency} className="md:col-span-2"><Input name="frequency" placeholder="Twice daily with food" required /></Field>
        <Field label="Scheduled times" error={e.times} hint="24-hour, comma-separated: 08:00, 20:00" className="md:col-span-2"><Input name="times" placeholder="08:00, 20:00" required /></Field>
        <Field label="Prescriber" error={e.prescriber} className="md:col-span-2"><Input name="prescriber" /></Field>
        <Field label="Start" error={e.startDate} className="md:col-span-1"><Input name="startDate" type="date" required /></Field>
        <Field label="End" error={e.endDate} className="md:col-span-1"><Input name="endDate" type="date" /></Field>
        <Field label="Instructions for staff" error={e.instructions} className="md:col-span-6"><Textarea name="instructions" className="min-h-12" placeholder="Give with breakfast. Hold if blood sugar under 70." /></Field>
      </div>
      <Button type="submit" disabled={pending} className="mt-4">{pending ? "Saving…" : "Add medication"}</Button>
    </form>
  );
}
