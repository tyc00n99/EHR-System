"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Button, Card, Field, FormError, Input, LinkButton, Select, Textarea, cx } from "@/components/kit";
import { DateInput } from "@/components/date-input";
import { TimeInput } from "@/components/time-input";
import { INTERACTION_LEVELS } from "@/lib/templates";
import { PLACES_OF_SERVICE, type ActionState } from "@/lib/validation";
import { computeUnits } from "@/lib/units";
import { MANUAL_REASONS, shiftMinutes, type ManualContext } from "@/lib/manual-note";
import { createManualNote, manualNoteContext } from "../actions";

interface AgreementOption { id: string; personId: string; personName: string; label: string }

const CHIP = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13.5px] transition-colors";
const chip = (on: boolean) => cx(CHIP, on ? "border-primary bg-primary-soft text-primary" : "border-line bg-card text-text hover:bg-hover");
const SEG = (on: boolean) => cx("px-3 py-1.5 text-[13.5px] font-medium", on ? "bg-primary text-primary-foreground" : "bg-card text-text hover:bg-hover");
const MEDS = [["given", "G", "Given"], ["refused", "R", "Refused"], ["held", "H", "Held"], ["missed", "M", "Missed"]] as const;
const MED_ON: Record<string, string> = { given: "border-ok bg-ok-soft text-ok", refused: "border-warn bg-warn-soft text-warn", held: "border-warn bg-warn-soft text-warn", missed: "border-danger bg-danger-soft text-danger" };

/**
 * "Enter a note manually" (Sept 29, 2026, the user's pick "2"): the whole Daily Service Note on one page,
 * in the printed note's order — the visit across the top, narrative, supports and outcomes on the left,
 * assistance, activities, medications, incidents and signatures on the right — and, last, what happened:
 * why electronic visit verification did not capture it. Only an administrator or supervisor who did not
 * work the visit can use it; the caregiver signs afterwards from their own notes.
 */
export function ManualNoteForm({ agreements, staff, initial, today }: { agreements: AgreementOption[]; staff: { id: string; name: string }[]; initial: ManualContext | null; today: string }) {
  const [state, submit, pending] = useActionState(createManualNote, {} as ActionState);
  const e = state.errors ?? {};
  const people = useMemo(() => Array.from(new Map(agreements.map((a) => [a.personId, a.personName])).entries()), [agreements]);
  const [personId, setPersonId] = useState(people[0]?.[0] ?? "");
  const options = agreements.filter((a) => a.personId === personId);
  const [agreementId, setAgreementId] = useState(options[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [inTime, setIn] = useState(""), [outTime, setOut] = useState("");
  const [ctx, setCtx] = useState<ManualContext | null>(initial);
  const [loading, startLoad] = useTransition();
  // A new client brings their own addresses, outcomes and medications; the address choices follow.
  const load = (agreement: string, day: string) => startLoad(async () => {
    const r = await manualNoteContext(agreement, day);
    const next = "error" in r ? null : r;
    setCtx(next);
    setInLocation(next?.locations[0]?.id ?? "typed");
    setOutLocation(next?.locations[0]?.id ?? "typed");
  });

  const [skills, setSkills] = useState<string[]>([]);
  const [activities, setActivities] = useState<string[]>([]);
  const [level, setLevel] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [worked, setWorked] = useState<string[]>([]);
  const [meds, setMeds] = useState<Record<string, string>>({});
  const [incidents, setIncidents] = useState<"none" | "report">("none");
  const [inLocation, setInLocation] = useState(initial?.locations[0]?.id ?? "typed");
  const [outSame, setOutSame] = useState(true);
  const [outLocation, setOutLocation] = useState(initial?.locations[0]?.id ?? "typed");
  const [reason, setReason] = useState("");
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const resetDoc = () => { setSkills([]); setActivities([]); setAnswers({}); setWorked([]); setMeds({}); };

  const minutes = /^\d{2}:\d{2}$/.test(inTime) && /^\d{2}:\d{2}$/.test(outTime) && inTime !== outTime ? shiftMinutes(inTime, outTime) : 0;
  const units = minutes ? computeUnits(new Date(0), new Date(minutes * 60_000), ctx?.unitMinutes ?? 15) : 0;
  const overnight = minutes > 0 && outTime <= inTime;
  const hoursText = minutes ? `${Math.round((minutes / 60) * 100) / 100} h · ${units} unit${units === 1 ? "" : "s"}${overnight ? " · ends next day" : ""}` : "—";
  const locations = ctx?.locations ?? [];

  const place = (which: "in" | "out", value: string, set: (v: string) => void) => (
    <div className="grid gap-2">
      <Select name={`${which}Location`} value={value} onChange={(ev) => set(ev.target.value)}>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.label}: {l.address}</option>)}
        <option value="typed">Type an address…</option>
      </Select>
      {value === "typed" && <Input name={`${which}Address`} placeholder="Street, city, state and ZIP" autoComplete="off" />}
    </div>
  );

  return (
    <form action={submit} className="grid gap-5">
      <FormError message={state.message} />
      {skills.map((x) => <input key={x} type="hidden" name="skills[]" value={x} />)}
      {activities.map((x) => <input key={x} type="hidden" name="activities[]" value={x} />)}
      {worked.map((x) => <input key={x} type="hidden" name="goal_worked[]" value={x} />)}
      {Object.entries(answers).map(([k, v]) => <input key={k} type="hidden" name={`goal_${k}`} value={v} />)}
      {Object.entries(meds).map(([k, v]) => <input key={k} type="hidden" name={`med_${k}`} value={v} />)}
      <input type="hidden" name="interactionLevel" value={level} />
      <input type="hidden" name="incidents" value={incidents} />

      <Card padded title="The visit">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-4">
          <Field label="Client" error={e.personId}>
            <Select name="personId" value={personId} onChange={(ev) => { const p = ev.target.value; setPersonId(p); const a = agreements.find((x) => x.personId === p)?.id ?? ""; setAgreementId(a); resetDoc(); if (a) load(a, date); }}>
              {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </Select>
          </Field>
          <Field label="Caregiver" error={e.staffId} hint="Who worked the visit. Not you.">
            <Select name="staffId" defaultValue=""><option value="">Choose…</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          </Field>
          <Field label="Service" error={e.serviceAgreementId} className="col-span-2">
            <Select name="serviceAgreementId" value={agreementId} onChange={(ev) => { setAgreementId(ev.target.value); load(ev.target.value, date); }}>{options.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select>
          </Field>
          <Field label="Date" error={e.date}><DateInput name="date" value={date} onChange={(ev) => { setDate(ev.target.value); if (agreementId && ev.target.value) load(agreementId, ev.target.value); }} required /></Field>
          <Field label="Clock in · out" error={e.inTime || e.outTime}>
            <div className="flex gap-2"><TimeInput name="inTime" value={inTime} onChange={(ev) => setIn(ev.target.value)} required aria-label="Clock in" /><TimeInput name="outTime" value={outTime} onChange={(ev) => setOut(ev.target.value)} required aria-label="Clock out" /></div>
          </Field>
          <Field label="Setting" error={e.placeOfService}>
            <Select name="placeOfService" defaultValue={locations[0]?.posCode ?? "12"}>{PLACES_OF_SERVICE.map((p) => <option key={p.code} value={p.code}>{p.label} · POS {p.code}</option>)}</Select>
          </Field>
          <Field label="Worked out"><div className="flex h-9 items-center rounded-lg bg-card-soft px-3 text-[14px] font-semibold tabular-nums text-text-strong">{hoursText}</div></Field>
          <Field label="Clock-in location" error={e.inLocation} className="col-span-2" hint="The address on file, or type the one the visit happened at.">{place("in", inLocation, setInLocation)}</Field>
          <Field label="Clock-out location" error={e.outLocation} className="col-span-2">
            <label className="flex h-9 items-center gap-2 text-[14px]"><input type="checkbox" name="outSame" checked={outSame} onChange={(ev) => setOutSame(ev.target.checked)} className="size-4 accent-[var(--primary)]" />Same as clock-in</label>
            {!outSame && place("out", outLocation, setOutLocation)}
          </Field>
        </div>
      </Card>

      <div className={cx("grid items-start gap-5 lg:grid-cols-[1.6fr_1fr]", loading && "opacity-60")}>
        <div className="grid gap-5">
          <Card padded title="Service narrative">
            <Textarea name="shiftNote" className="min-h-32" placeholder={`What happened during the visit, in plain words. What ${ctx?.first ?? "the client"} did, what support was given, anything the next caregiver should know.`} required />
            {e.shiftNote && <p className="mt-1 text-[13px] text-danger">{e.shiftNote}</p>}
          </Card>
          <Card padded title="Supports provided">
            <div className="flex flex-wrap gap-2">{(ctx?.skills ?? []).map((x) => <button key={x} type="button" onClick={() => toggle(skills, setSkills, x)} className={chip(skills.includes(x))}>{skills.includes(x) ? "✓" : "+"} {x}</button>)}</div>
          </Card>
          <Card padded title="Support plan outcomes" description={ctx && ctx.goals.length ? "Answer what applied to this visit; leave the rest." : undefined}>
            {!ctx || ctx.goals.length === 0 ? <p className="text-[14px] text-muted-foreground">No active outcomes for this client.</p> : (
              <div className="grid gap-4">
                {ctx.goals.map((goal) => (
                  <div key={goal.id}>
                    <div className="mb-1.5 flex items-center gap-2 text-[14px] font-semibold text-text-strong">{goal.title}
                      {goal.questions.length === 0 && <button type="button" onClick={() => toggle(worked, setWorked, goal.id)} className={cx(chip(worked.includes(goal.id)), "ml-auto py-0.5 text-[13px] font-normal")}>{worked.includes(goal.id) ? "✓ Worked on" : "+ Worked on"}</button>}
                    </div>
                    {goal.questions.map((q) => (
                      <div key={q.id} className="flex items-start gap-3 border-t border-line-soft py-2">
                        <div className="flex shrink-0 gap-1">
                          {(["yes", "no"] as const).map((r) => (
                            <button key={r} type="button" onClick={() => setAnswers((a) => { const n = { ...a }; if (n[q.id] === r) delete n[q.id]; else n[q.id] = r; return n; })} className={cx("rounded-md border px-2.5 py-0.5 text-[12.5px] font-semibold", answers[q.id] === r ? (r === "yes" ? "border-ok bg-ok-soft text-ok" : "border-danger bg-danger-soft text-danger") : "border-line text-text hover:bg-hover")}>{r === "yes" ? "Yes" : "No"}</button>
                          ))}
                        </div>
                        <span className="text-[14px]">{q.prompt}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="grid gap-5">
          <Card padded title="Level of assistance">
            <div className="inline-flex overflow-hidden rounded-lg border border-line">{INTERACTION_LEVELS.map(([v, label, hint]) => <button key={v} type="button" title={hint} onClick={() => setLevel(level === v ? "" : v)} className={cx(SEG(level === v), "border-r border-line last:border-r-0")}>{label}</button>)}</div>
          </Card>
          <Card padded title="Daily activities">
            <div className="flex flex-wrap gap-2">{(ctx?.activities ?? []).map((x) => <button key={x} type="button" onClick={() => toggle(activities, setActivities, x)} className={chip(activities.includes(x))}>{activities.includes(x) ? "✓" : "+"} {x}</button>)}</div>
          </Card>
          <Card padded title={`Medications${date ? " · that day" : ""}`}>
            {!ctx || ctx.meds.length === 0 ? <p className="text-[14px] text-muted-foreground">No medications scheduled that day.</p> : (
              <div className="grid gap-1.5">
                {ctx.meds.map((m) => { const k = `${m.id}_${m.time}`; return (
                  <div key={k} className="flex items-center gap-2 text-[14px]">
                    <span className="min-w-0 flex-1">{m.name} {m.dose}, <span className="tabular-nums">{m.time}</span></span>
                    {MEDS.map(([v, letter, label]) => <button key={v} type="button" title={label} onClick={() => setMeds((s) => { const n = { ...s }; if (n[k] === v) delete n[k]; else n[k] = v; return n; })} className={cx("grid size-7 place-items-center rounded-md border text-[12px] font-bold", meds[k] === v ? MED_ON[v] : "border-line text-muted-foreground hover:bg-hover")}>{letter}</button>)}
                  </div>
                ); })}
              </div>
            )}
          </Card>
          <Card padded title="Incidents">
            <div className="inline-flex overflow-hidden rounded-lg border border-line"><button type="button" onClick={() => setIncidents("none")} className={cx(SEG(incidents === "none"), "border-r border-line")}>None</button><button type="button" onClick={() => setIncidents("report")} className={SEG(incidents === "report")}>Report one</button></div>
            {incidents === "report" && <><Textarea name="incidentNote" className="mt-3 min-h-20" placeholder="What happened, when, and what was done" />{e.incidentNote && <p className="mt-1 text-[13px] text-danger">{e.incidentNote}</p>}</>}
          </Card>
          <Card padded title="Signatures">
            <div className="text-[13px] font-medium">Caregiver</div>
            <p className="mt-1 text-[13.5px] text-muted-foreground">The caregiver signs this note themselves from their notes. It stays on hold for pay until they do.</p>
            <div className="mt-4 text-[13px] font-medium">Client</div>
            <div className="mt-1 grid gap-2">
              <Input name="clientCode" inputMode="numeric" maxLength={6} placeholder="Signing code" autoComplete="off" />
              <Input name="clientReason" placeholder="Or why they could not sign" />
              {e.clientCode && <p className="text-[13px] text-danger">{e.clientCode}</p>}
            </div>
          </Card>
        </div>
      </div>

      {/* Last, what happened (user, Sept 29, 2026): a manual note is the exception to EVV, so it says why. */}
      <Card padded title="Why this note is entered manually" description="This visit was not captured by electronic visit verification. It will be marked as a manual entry, sent to the aggregator with this reason, and kept on the record.">
        <div className="grid gap-4 md:grid-cols-[320px_1fr]">
          <Field label="What happened" error={e.reasonCategory}>
            <Select name="reasonCategory" value={reason} onChange={(ev) => setReason(ev.target.value)}><option value="">Choose…</option>{MANUAL_REASONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</Select>
          </Field>
          <Field label="Details" error={e.reasonDetails} hint="What went wrong, and how the times were confirmed (a call with the guardian, a text, the paper log).">
            <Textarea name="reasonDetails" className="min-h-20" required />
          </Field>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save note"}</Button>
        <LinkButton href="/visits" variant="ghost">Cancel</LinkButton>
      </div>
    </form>
  );
}
