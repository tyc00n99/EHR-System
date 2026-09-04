"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Loader2, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Field, FormError, Input, Select, Textarea, cx } from "@/components/kit";
import { X } from "lucide-react";
import { INTERACTION_LEVELS } from "@/lib/templates";
import type { ActionState } from "@/lib/validation";
import { draftProgressReview, recordMedAdmin, saveDocumentation, setApproval, signVisitWithCode } from "../record-actions";

interface Question { id: string; prompt: string; goal: string; response: string; note: string }

export function RecordForm({ visitId, personFirst, locked, skillsOptions, activityOptions, defaults, tasks, questions }: { visitId: string; personFirst: string; locked: boolean; skillsOptions: string[]; activityOptions: string[]; defaults: { interactionLevel: string; skills: string[]; activities: string[]; shiftNote: string; staffSigned: boolean }; tasks: { code: string; label: string; completed: boolean }[]; questions: Question[] }) {
  const [state, submit, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    // Best-effort device location for the note history; never blocks the save.
    const fix = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
      const t = setTimeout(() => resolve(null), 4000);
      navigator.geolocation.getCurrentPosition((p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); }, () => { clearTimeout(t); resolve(null); }, { maximumAge: 300000, timeout: 3500 });
    });
    if (fix) { fd.set("lat", String(fix.lat)); fd.set("lng", String(fix.lng)); }
    const r = await saveDocumentation(prev, fd); if (r.message && !r.errors) toast.success(r.message); else if (r.message) toast.error(r.message); return r;
  }, {});
  const [interaction, setInteraction] = useState(defaults.interactionLevel);
  const [skills, setSkills] = useState<string[]>(defaults.skills);
  const [activities, setActivities] = useState<string[]>(defaults.activities);
  const [note, setNote] = useState(defaults.shiftNote);
  const [answers, setAnswers] = useState<Record<string, string>>(Object.fromEntries(questions.map((q) => [q.id, q.response])));
  const [notes, setNotes] = useState<Record<string, string>>(Object.fromEntries(questions.map((q) => [q.id, q.note])));
  const [drafting, startDraft] = useTransition();
  const e = state.errors ?? {};
  const toggleSkill = (s: string) => setSkills((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const draft = () => startDraft(async () => {
    const r = await draftProgressReview(visitId, { interactionLevel: interaction || undefined, skills, goalAnswers: questions.filter((q) => answers[q.id]).map((q) => ({ prompt: q.prompt, response: answers[q.id], note: notes[q.id] })), tasks: tasks.filter((t) => t.completed).map((t) => t.label), notes: note });
    if (r.text) { setNote(r.text); toast.success("Draft ready. Read it, fix anything wrong, then sign."); } else toast.error(r.message ?? "Could not draft.");
  });
  const grouped = questions.reduce<Record<string, Question[]>>((acc, q) => ((acc[q.goal] ??= []).push(q), acc), {});

  return (
    <form action={submit} className="space-y-5">
      <input type="hidden" name="visitId" value={visitId} />
      {interaction && <input type="hidden" name="interactionLevel" value={interaction} />}
      {skills.map((s) => <input key={s} type="hidden" name="skills[]" value={s} />)}
      {activities.map((a) => <input key={a} type="hidden" name="activities[]" value={a} />)}
      <FormError message={state.errors ? state.message : undefined} />
      {locked && <div className="flex items-center gap-2 rounded-md bg-ok-soft px-3 py-2 text-[13px] text-ok"><Lock className="size-3.5" /> Approved by a supervisor. Read only.</div>}

      <fieldset disabled={locked} className="space-y-5">
        <section>
          <div className="mb-2 text-[13px] font-semibold text-text-strong">Level of interaction</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {INTERACTION_LEVELS.map(([v, label, hint]) => (
              <button key={v} type="button" onClick={() => setInteraction(v)} className={cx("rounded-md border px-3 py-2 text-left", interaction === v ? "border-primary bg-primary-soft" : "border-line bg-card hover:bg-hover")}>
                <div className={cx("text-[13px] font-medium", interaction === v ? "text-primary" : "text-text-strong")}>{label}</div><div className="text-[12px] text-muted-foreground">{hint}</div>
              </button>
            ))}
          </div>
          {e.interactionLevel && <div className="mt-1 text-xs text-danger">{e.interactionLevel}</div>}
        </section>

        <section>
          <div className="mb-2 text-[13px] font-semibold text-text-strong">Skills worked on</div>
          <div className="flex flex-wrap gap-1.5">
            {skillsOptions.map((s) => <button key={s} type="button" onClick={() => toggleSkill(s)} className={cx("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium", skills.includes(s) ? "border-primary bg-primary-soft text-primary" : "border-line bg-card text-text hover:bg-hover")}>{skills.includes(s) && <Check className="size-3.5" />}{s}</button>)}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-baseline justify-between"><span className="text-[13px] font-semibold text-text-strong">Daily activities</span><span className="text-[12px] text-muted-foreground">Pick each activity you did with {personFirst}</span></div>
          <Select value="" onChange={(ev) => { const a = ev.target.value; if (a && !activities.includes(a)) setActivities((cur) => [...cur, a]); }} className="h-9">
            <option value="">Add an activity…</option>
            {activityOptions.filter((a) => !activities.includes(a)).map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
          {activities.length > 0 && (
            <ul className="mt-2 space-y-1">
              {activities.map((a) => (
                <li key={a} className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary-soft px-3 py-1.5 text-[13px] text-text-strong">
                  <span className="min-w-0 flex-1">{a}</span>
                  {!locked && <button type="button" onClick={() => setActivities((cur) => cur.filter((x) => x !== a))} aria-label="Remove activity" className="rounded p-0.5 text-muted-foreground hover:bg-hover hover:text-danger"><X className="size-3.5" /></button>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {questions.length > 0 && (
          <section>
            <div className="mb-2 text-[13px] font-semibold text-text-strong">Life plan goals</div>
            <div className="space-y-3">
              {Object.entries(grouped).map(([goal, qs]) => (
                <div key={goal} className="rounded-md border border-line bg-card">
                  <div className="border-b border-line-soft bg-sidebar px-3 py-1.5 text-[12px] font-medium text-text-strong">{goal}</div>
                  {qs.map((q) => (
                    <div key={q.id} className="border-b border-line-soft px-3 py-2.5 last:border-b-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 text-[13px]">{q.prompt}</span>
                        <div className="flex gap-1">
                          {(["yes", "no", "na"] as const).map((v) => <button key={v} type="button" onClick={() => setAnswers((a) => ({ ...a, [q.id]: a[q.id] === v ? "" : v }))} className={cx("h-7 rounded-md border px-2.5 text-[12px] font-medium", answers[q.id] === v ? (v === "yes" ? "border-ok bg-ok-soft text-ok" : v === "no" ? "border-danger bg-danger-soft text-danger" : "border-line bg-panel text-text") : "border-line bg-page text-muted-foreground hover:bg-hover")}>{v === "na" ? "N/A" : v[0].toUpperCase() + v.slice(1)}</button>)}
                        </div>
                      </div>
                      <input type="hidden" name={`goal_${q.id}`} value={answers[q.id] ?? ""} />
                      {answers[q.id] && <Input name={`goalnote_${q.id}`} value={notes[q.id] ?? ""} onChange={(ev) => setNotes((n) => ({ ...n, [q.id]: ev.target.value }))} placeholder="Optional detail" className="mt-2 h-8 text-[12.5px]" />}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between"><div className="text-[13px] font-semibold text-text-strong">Progress review</div><Button type="button" variant="secondary" onClick={draft} disabled={drafting} className="h-7 gap-1.5 text-[12px]">{drafting ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}{drafting ? "Drafting…" : "Draft from what I marked"}</Button></div>
          <Field label="" error={e.shiftNote} hint={`What ${personFirst} did, the support provided, and progress toward goals. Objective, past tense.`}>
            <Textarea name="shiftNote" value={note} onChange={(ev) => setNote(ev.target.value)} className="min-h-32" placeholder={`${personFirst} …`} />
          </Field>
        </section>

        <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
          <Button type="submit" variant="outline" disabled={pending}>{pending ? "Saving…" : "Save draft"}</Button>
          <Button type="submit" name="staffSign" value="true" disabled={pending || !note.trim()} className="gap-1.5"><Check className="size-4" />{defaults.staffSigned ? "Re-sign and save" : "Sign and save"}</Button>
          {defaults.staffSigned && <Badge tone="ok">signed by staff</Badge>}
        </div>
      </fieldset>
    </form>
  );
}

export function SignaturePanel({ visitId, status, clientSignedAt, unsignedReason, staffSignedAt, approvedAt, approverEmail, canApprove, hasNote }: { visitId: string; status: string; clientSignedAt: string | null; unsignedReason: string | null; staffSignedAt: string | null; approvedAt: string | null; approverEmail: string | null; canApprove: boolean; hasNote: boolean }) {
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionState>) => start(async () => { const r = await fn(); if (r.errors || (r.message && /not|cannot|only|already/i.test(r.message))) toast.error(r.message ?? "Failed"); else toast.success(r.message ?? "Done"); });
  return (
    <section className="rounded-lg border border-line bg-sidebar p-4">
      <div className="mb-3 text-[13px] font-semibold text-text-strong">Signatures</div>
      <ul className="space-y-2.5 text-[13px]">
        <li className="flex flex-wrap items-center gap-2"><Step done={Boolean(staffSignedAt)} /><span className="font-medium">Caregiver</span><span className="text-muted-foreground">{staffSignedAt ? `signed ${staffSignedAt}` : "not yet signed. Sign from the form above."}</span></li>
        <li className="flex flex-wrap items-center gap-2">
          <Step done={Boolean(clientSignedAt)} /><span className="font-medium">Client</span>
          {clientSignedAt ? <span className="text-muted-foreground">signed with code {clientSignedAt}</span> : status === "completed" ? (
            <span className="flex flex-wrap items-center gap-2"><span className="text-muted-foreground">{unsignedReason ? `not signed: ${unsignedReason}.` : "not signed."} Hand the phone to the person:</span><Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6-digit code" className="h-8 w-32 text-center tabular-nums tracking-[0.2em]" /><Button variant="outline" className="h-8" disabled={pending || code.length !== 6} onClick={() => run(() => signVisitWithCode(visitId, code))}>Sign</Button></span>
          ) : <span className="text-muted-foreground">signs at clock-out.</span>}
        </li>
        <li className="flex flex-wrap items-center gap-2">
          <Step done={Boolean(approvedAt)} /><span className="font-medium">Supervisor</span>
          {approvedAt ? <span className="text-muted-foreground">approved {approvedAt}{approverEmail ? ` by ${approverEmail}` : ""}</span> : <span className="text-muted-foreground">not yet approved.</span>}
          {canApprove && (approvedAt ? <Button variant="ghost" className="h-7 text-[12px]" disabled={pending} onClick={() => run(() => setApproval(visitId, false))}>Reopen</Button> : <Button className="h-7 text-[12px]" disabled={pending || status !== "completed" || !hasNote} onClick={() => run(() => setApproval(visitId, true))}>Approve</Button>)}
        </li>
      </ul>
    </section>
  );
}

function Step({ done }: { done: boolean }) {
  return <span className={cx("flex h-5 w-5 items-center justify-center rounded-full border", done ? "border-ok bg-ok text-white" : "border-line bg-page text-transparent")}><Check className="size-3" /></span>;
}

export function MedsDue({ visitId, personId, date, meds, admins, readOnly }: { visitId: string; personId: string; date: string; meds: { id: string; name: string; dose: string; times: string[] }[]; admins: { medicationId: string; time: string; status: string }[]; readOnly: boolean }) {
  const [pending, start] = useTransition();
  const record = (medicationId: string, scheduledTime: string, status: "given" | "refused" | "held" | "missed") => start(async () => {
    const fd = new FormData(); fd.set("medicationId", medicationId); fd.set("personId", personId); fd.set("scheduledDate", date); fd.set("scheduledTime", scheduledTime); fd.set("status", status); fd.set("visitId", visitId);
    const r = await recordMedAdmin({}, fd); if (r.errors) toast.error(r.message ?? "Failed"); else toast.success(`${status[0].toUpperCase() + status.slice(1)} recorded`);
  });
  const slots = meds.flatMap((m) => m.times.map((t) => ({ m, t, a: admins.find((x) => x.medicationId === m.id && x.time === t) })));
  if (slots.length === 0) return null;
  return (
    <section className="rounded-lg border border-line bg-card">
      <div className="border-b border-line-soft px-4 py-2 text-[13px] font-semibold text-text-strong">Medications on {date}</div>
      <ul className="divide-y divide-line-soft">
        {slots.map(({ m, t, a }) => (
          <li key={`${m.id}-${t}`} className="flex flex-wrap items-center gap-2 px-4 py-2 text-[13px]">
            <span className="w-12 shrink-0 tabular-nums text-muted-foreground">{t}</span><span className="min-w-0 flex-1"><span className="block truncate font-medium text-text-strong">{m.name}</span><span className="block text-[12px] text-muted-foreground">{m.dose}</span></span>
            {a ? <Badge tone={a.status === "given" ? "ok" : a.status === "missed" ? "danger" : "warn"}>{a.status}</Badge> : null}
            {!readOnly && (<span className="flex gap-1">{(["given", "refused", "held"] as const).map((s) => <button key={s} disabled={pending} onClick={() => record(m.id, t, s)} className={cx("h-7 rounded-md border px-2 text-[12px] font-medium disabled:opacity-50", a?.status === s ? "border-primary bg-primary-soft text-primary" : "border-line bg-page text-muted-foreground hover:bg-hover")}>{s[0].toUpperCase() + s.slice(1)}</button>)}</span>)}
          </li>
        ))}
      </ul>
    </section>
  );
}
