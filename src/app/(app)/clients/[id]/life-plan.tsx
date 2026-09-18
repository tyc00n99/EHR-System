"use client";

import { CircleHelp } from "lucide-react";
import { FilterMenu } from "@/components/filter-menu";
import { useActionState, useEffect, useState, useTransition, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { toast } from "sonner";
import { Badge, Button, Field, FormError, Input, Select, Textarea, cx } from "@/components/kit";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { ActionState } from "@/lib/validation";
import { addGoalQuestion, addGoalReview, createGoal, reinstateGoalQuestion, retireGoalQuestion, setGoalStatus, updateGoal } from "../goal-actions";

export interface GoalView {
  id: string; title: string; outcome: string | null; description: string | null; category: string; status: "active" | "met" | "discontinued"; startDate: string | null; targetDate: string | null;
  questions: { id: string; prompt: string; active: boolean; yes: number; no: number; na: number; recent: string[] }[];
  reviews: { id: string; assessment: string; note: string; reviewedAt: Date; by: string }[];
}

const ASSESSMENT: Record<string, { label: string; dot: string; tone: "ok" | "warn" | "accent" | "danger" | "neutral" }> = {
  on_track: { label: "On track", dot: "bg-ok", tone: "ok" },
  needs_attention: { label: "Needs attention", dot: "bg-warn", tone: "warn" },
  met: { label: "Met", dot: "bg-primary", tone: "accent" },
  not_met: { label: "Not met", dot: "bg-danger", tone: "danger" },
};

/** The one chip a goal carries: the latest review's judgement, or the lifecycle status when nobody has reviewed it. */
function standing(g: GoalView) {
  if (g.status === "met") return ASSESSMENT.met;
  if (g.status === "discontinued") return { label: "Discontinued", dot: "bg-gray-400", tone: "neutral" as const };
  const latest = g.reviews[0];
  return latest ? ASSESSMENT[latest.assessment] ?? ASSESSMENT.on_track : { label: "Not reviewed yet", dot: "bg-gray-400", tone: "neutral" as const };
}

function useToast(state: ActionState, onOk?: () => void) {
  useEffect(() => { if (state.ok) { toast.success(state.message ?? "Saved."); onOk?.(); } else if (state.message && !state.errors) toast.error(state.message); }, [state, onOk]);
}

/**
 * Support plan goals: a full-width list, and a full-width detail when one is opened — not a side
 * pane. The outcome leads; questions are optional (a goal may be measured only by the
 * supervisor's review); the review history is the record a licensor asks for.
 */
export function LifePlan({ personId, goals, manage, rangeLabel, library }: { personId: string; goals: GoalView[]; manage: boolean; rangeLabel: string; library?: ReactNode }) {
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const current = goals.find((g) => g.id === selected) ?? null;
  const back = () => setSelected(null);

  if (selected === "new" && manage) {
    return <div className="rounded-xl border border-line bg-card p-5 lg:p-6"><BackLink onClick={back} /><NewGoal personId={personId} onDone={back} /></div>;
  }
  if (current) {
    return <div className="rounded-xl border border-line bg-card p-5 lg:p-6"><BackLink onClick={back} /><GoalDetail key={current.id} personId={personId} g={current} manage={manage} rangeLabel={rangeLabel} /></div>;
  }

  // Active goals in the order a supervisor reads them: needs attention, then never reviewed, then
  // on track — and within each, the one reviewed longest ago first.
  const rank = (g: GoalView) => { const a = g.reviews[0]?.assessment; return a === "needs_attention" || a === "not_met" ? 0 : !a ? 1 : 2; };
  const lastReview = (g: GoalView) => g.reviews[0]?.reviewedAt.getTime() ?? 0;
  const active = goals.filter((g) => g.status === "active").sort((a, b) => rank(a) - rank(b) || lastReview(a) - lastReview(b) || a.title.localeCompare(b.title));

  const done = goals.filter((g) => g.status !== "active");
  return (
    <div>
      {manage && <div className="mb-3 flex justify-end"><Button variant="outline" className="h-9" onClick={() => setSelected("new")}>+ New goal</Button></div>}
      {goals.length === 0 && <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center text-[13px]">{manage ? "No goals yet. Add the outcomes from the support plan." : "A supervisor adds goals from the support plan."}</div>}
      {active.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-line bg-card">
          <div className={cx(ROW, "border-b border-line py-2 text-[12.5px] text-muted-foreground")}><span /><span>Goal</span><span className={WIDE}>Answered yes on notes</span><span className={WIDE}>Trend</span><span className={WIDE}>Last review</span><span /></div>
          {active.map((g) => <GoalRow key={g.id} g={g} onOpen={() => setSelected(g.id)} />)}
        </section>
      )}
      {done.length > 0 && (
        <Fold label={`${done.length} goal${done.length === 1 ? "" : "s"} ${done.every((g) => g.status === "met") ? "met" : "closed"}`} hint={done.map((g) => g.title).join(", ")}>
          {done.map((g) => <GoalRow key={g.id} g={g} onOpen={() => setSelected(g.id)} muted />)}
        </Fold>
      )}
      {library && <Fold label="Daily activities" hint="what caregivers pick from on every note">{library}</Fold>}
    </div>
  );
}

const ROW = "grid grid-cols-[6px_minmax(0,1fr)_140px] items-center gap-x-5 pr-5 xl:grid-cols-[6px_minmax(0,1fr)_190px_130px_170px_140px]";
const WIDE = "hidden xl:block";

/** One goal, read left to right: how it stands, what it is, what the notes say, and when it was last looked at. */
function GoalRow({ g, onOpen, muted }: { g: GoalView; onOpen: () => void; muted?: boolean }) {
  const st = standing(g);
  const latest = g.reviews[0];
  const live = g.questions.filter((q) => q.active);
  const yes = live.reduce((n, q) => n + q.yes, 0), answered = live.reduce((n, q) => n + q.yes + q.no, 0);
  const pct = answered ? Math.round((yes / answered) * 100) : null;
  const trend = live.length ? live.reduce((best, q) => (q.recent.length > best.recent.length ? q : best), live[0]).recent.filter((r) => r !== "na") : [];
  const barTone = st.tone === "warn" || st.tone === "danger" ? "bg-warn" : st.tone === "ok" ? "bg-ok" : "bg-primary";
  return (
    <button type="button" onClick={onOpen} className={cx(ROW, "w-full border-t border-line-soft py-3 text-left transition-colors first:border-t-0 hover:bg-sidebar", muted && "opacity-70")}>
      <span className={cx("h-10 rounded-r-[3px]", st.dot)} />
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-medium leading-snug text-text-strong">{g.title}</span>
        {g.outcome && <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{g.outcome}</span>}
      </span>
      <span className={cx(WIDE, "text-[13px] text-muted-foreground")}>
        {pct == null ? (live.length ? "No answers yet" : "Judged at review") : <>
          <span className="block h-1.5 w-full overflow-hidden rounded-full bg-panel"><span className={cx("block h-full rounded-full", barTone)} style={{ width: `${pct}%` }} /></span>
          <span className="mt-1 block tabular-nums">{pct}% · {yes} of {answered}</span>
        </>}
      </span>
      <span className="hidden h-[18px] items-end gap-[3px] xl:flex">{trend.length ? trend.map((r, i) => <span key={i} className={cx("w-[5px] rounded-[1px]", r === "yes" ? "h-full bg-primary" : "h-[8px] bg-primary/25")} />) : <span className="text-hint">—</span>}</span>
      <span className={cx(WIDE, "text-[13.5px] text-muted-foreground")}><span className="block">{latest ? fmtDate(latest.reviewedAt) : "Not reviewed yet"}</span>{g.targetDate && <span className="block text-[12.5px] text-hint">target {fmtDate(g.targetDate)}</span>}</span>
      <span className="flex justify-end"><Badge tone={st.tone}>{st.label}</Badge></span>
    </button>
  );
}

function Fold({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-line bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2.5 px-5 py-3.5 text-left text-[14px] hover:bg-sidebar">
        <span className="shrink-0 font-medium text-text-strong">{label}</span>
        <span className="min-w-0 truncate text-muted-foreground">· {hint}</span>
        <Icon.chevron size={18} className={cx("ml-auto shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-line">{children}</div>}
    </section>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="mb-4 text-[13px] font-medium text-primary hover:underline">← All goals</button>;
}

function GoalDetail({ personId, g, manage, rangeLabel }: { personId: string; g: GoalView; manage: boolean; rangeLabel: string }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [newQ, setNewQ] = useState("");
  const st = standing(g);
  const latest = g.reviews[0];
  const live = g.questions.filter((q) => q.active);
  const retired = g.questions.filter((q) => !q.active);
  const answered = live.reduce((n, q) => Math.max(n, q.yes + q.no + q.na), 0);

  return (
    <div>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="max-w-3xl text-[21px] leading-tight">{g.title}</h2>
          {(g.targetDate || g.startDate) && <div className="mt-1 text-[13px]">{[g.targetDate && `Target ${fmtDate(g.targetDate)}`, g.startDate && `Since ${fmtDate(g.startDate)}`].filter(Boolean).join(" · ")}</div>}
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
        {manage && (<>
          <Button variant="outline" className="h-8" onClick={() => { setEditing((v) => !v); setReviewing(false); }}>{editing ? "Close" : "Edit"}</Button>
          {g.status === "active" && <Button variant="outline" className="h-8" onClick={() => { setReviewing((v) => !v); setEditing(false); }}>{reviewing ? "Close" : "Review"}</Button>}
          <FilterMenu aria-label="Goal status" value={g.status} disabled={pending} className="h-8" onChange={(v) => start(async () => { await setGoalStatus(g.id, personId, v as GoalView["status"]); toast.success("Status updated"); })} options={[{ value: "active", label: "Active" }, { value: "met", label: "Met" }, { value: "discontinued", label: "Discontinued" }]} />
        </>)}
      </div>

      {editing && manage ? <EditGoal personId={personId} g={g} onDone={() => setEditing(false)} /> : (
        <div className="mt-4 rounded-lg bg-card-soft px-4 py-3">
          <div className="text-[13px] uppercase tracking-[0.08em]">Outcome</div>
          <div className="mt-0.5 text-[15px] font-medium text-text-strong">{g.outcome ?? "No outcome written yet."}</div>
          {g.description && <p className="mt-1.5 text-[13.5px]">{g.description}</p>}
          {!latest && <p className="mt-2 text-[13px]">{live.length ? `Not reviewed yet. ${answered} notes have answered its questions ${rangeLabel}.` : "Not reviewed yet. This goal has no per-note questions; it is judged at review."}</p>}
        </div>
      )}

      {reviewing && manage && <ReviewForm personId={personId} goalId={g.id} onDone={() => setReviewing(false)} />}

      {(live.length > 0 || (manage && g.status === "active")) && (
        <section className="mt-5">
          <div className="mb-1 flex items-center justify-between"><div className="text-[13px] font-medium uppercase tracking-[0.11em]">Questions on every note{live.length ? ` · ${rangeLabel}` : ""}</div></div>
          {live.length === 0 && <p className="text-[13px]">None. Add one only if caregivers should answer it on every note; otherwise the goal is judged at review.</p>}
          <ul className="divide-y divide-line-soft">
            {live.map((q) => { const total = q.yes + q.no; const pct = total ? Math.round((q.yes / total) * 100) : null; return (
              <li key={q.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[14px]">
                <span className="min-w-0 flex-1">{q.prompt}</span>
                <span className="flex items-center gap-2 text-[13px]"><span className="relative inline-block h-1 w-14 overflow-hidden rounded bg-panel"><span className="absolute inset-y-0 left-0 rounded bg-text-strong" style={{ width: `${pct ?? 0}%` }} /></span><span className="w-9 text-right tabular-nums">{pct == null ? "—" : `${pct}%`}</span><span className="w-16 tabular-nums">{q.yes} / {total}</span><span className="w-10 tabular-nums">{q.na ? `${q.na} n/a` : ""}</span></span>
                {manage && <button type="button" disabled={pending} onClick={() => { if (confirm("Retire this question? Past responses stay.")) start(() => retireGoalQuestion(q.id, personId)); }} className="text-[13px] hover:text-danger">Retire</button>}
              </li>
            ); })}
          </ul>
          {manage && g.status === "active" && (
            <div className="mt-2 flex gap-2">
              <Input value={newQ} onChange={(e) => setNewQ(e.target.value)} placeholder="Add a yes/no question caregivers answer on each note" className="h-8 text-[13px]" />
              <Button variant="outline" className="h-8" disabled={pending || !newQ.trim()} onClick={() => start(async () => { const r = await addGoalQuestion(g.id, personId, newQ); if (r.message) toast.error(r.message); else { toast.success("Question added"); setNewQ(""); } })}>Add</Button>
            </div>
          )}
        </section>
      )}

      {retired.length > 0 && (
        <section className="mt-5">
          <div className="mb-1 flex items-center gap-1.5 text-[13px] font-medium uppercase tracking-[0.11em]">
            Retired questions · {retired.length}
            <span className="group relative inline-flex">
              <button type="button" aria-label="About retired questions" className="flex size-5 items-center justify-center rounded-full hover:bg-hover"><CircleHelp size={14} /></button>
              <span role="tooltip" className="pointer-events-none absolute left-6 top-1/2 z-20 hidden w-72 -translate-y-1/2 rounded-md bg-gray-800 px-2.5 py-1.5 text-[13px] font-normal normal-case tracking-normal text-gray-100 shadow-lg group-hover:block group-focus-within:block">No longer asked on new notes. Past answers are kept, and a question can be reinstated.</span>
            </span>
          </div>
          <ul className="divide-y divide-line-soft">
            {retired.map((q) => { const total = q.yes + q.no; return (
              <li key={q.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[14px]">
                <span className="min-w-0 flex-1 text-text-strong line-through decoration-danger decoration-1">{q.prompt}</span>
                <span className="text-[13px] tabular-nums">{total ? `${q.yes} yes · ${q.no} no` : "no answers yet"}{q.na ? ` · ${q.na} n/a` : ""}</span>
                {manage && g.status === "active" && <button type="button" disabled={pending} onClick={() => start(async () => { await reinstateGoalQuestion(q.id, personId); toast.success("Question reinstated"); })} className="text-[13px] font-medium text-primary hover:underline">Reinstate</button>}
              </li>
            ); })}
          </ul>
        </section>
      )}

      <section className="mt-5">
        <div className="mb-1 text-[13px] font-medium uppercase tracking-[0.11em]">Review history</div>
        {g.reviews.length === 0 ? <p className="text-[13px]">No reviews yet.</p> : (
          <ul className="divide-y divide-line-soft">
            {g.reviews.map((r) => { const a = ASSESSMENT[r.assessment]; return (
              <li key={r.id} className="py-2.5 text-[13.5px]">
                <div className="flex flex-wrap items-center gap-2"><span className="tabular-nums">{fmtDateTime(r.reviewedAt)}</span><span>·</span><span>{r.by}</span>{a && <Badge tone={a.tone}>{a.label}</Badge>}</div>
                <div className="mt-0.5">{r.note}</div>
              </li>
            ); })}
          </ul>
        )}
      </section>
    </div>
  );
}

function ReviewForm({ personId, goalId, onDone }: { personId: string; goalId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(addGoalReview.bind(null, goalId, personId), {});
  useToast(state, onDone);
  const e = state.errors ?? {};
  return (
    <form action={action} className="mt-4 rounded-lg border border-primary bg-primary-soft/30 p-4">
      <div className="mb-3 text-[15px] font-semibold text-text-strong">Record a review</div>
      <FormError message={state.errors ? state.message : undefined} />
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <Field label="Where it stands" error={e.assessment}><Select name="assessment" defaultValue="on_track"><option value="on_track">On track</option><option value="needs_attention">Needs attention</option><option value="met">Met — close the goal</option><option value="not_met">Not met</option></Select></Field>
        <Field label="Note" error={e.note}><Textarea name="note" required className="min-h-16" placeholder="What the notes show, what changed, what happens next" /></Field>
      </div>
      <div className="mt-3 flex gap-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save review"}</Button><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </form>
  );
}

function EditGoal({ personId, g, onDone }: { personId: string; g: GoalView; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateGoal.bind(null, g.id, personId), {});
  useToast(state, onDone);
  const e = state.errors ?? {};
  return (
    <form action={action} className="mt-4 rounded-lg border border-primary bg-primary-soft/30 p-4">
      <FormError message={state.errors ? state.message : undefined} />
      <div className="grid gap-3 sm:grid-cols-6">
        <Field label="Goal" error={e.title} className="sm:col-span-6"><Input name="title" defaultValue={g.title} required /></Field>
        <Field label="Outcome" error={e.outcome} hint="One measurable line from the support plan" className="sm:col-span-6"><Input name="outcome" defaultValue={g.outcome ?? ""} placeholder="Fewer than two refused doses a week" /></Field>
        <Field label="What this looks like for the person" error={e.description} className="sm:col-span-6"><Textarea name="description" defaultValue={g.description ?? ""} className="min-h-14" /></Field>
        <Field label="Start" error={e.startDate} className="sm:col-span-3"><Input name="startDate" type="date" defaultValue={g.startDate ?? ""} /></Field>
        <Field label="Target" error={e.targetDate} className="sm:col-span-3"><Input name="targetDate" type="date" defaultValue={g.targetDate ?? ""} /></Field>
      </div>
      <div className="mt-3 flex gap-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </form>
  );
}

function NewGoal({ personId, onDone }: { personId: string; onDone: () => void }) {
  const [state, submit, pending] = useActionState(createGoal.bind(null, personId), {});
  useToast(state, onDone);
  const [questions, setQuestions] = useState<string[]>([]);
  const e = state.errors ?? {};
  return (
    <form action={submit} className="max-w-3xl">
      <h2 className="text-[19px] leading-tight">New goal</h2>
      <p className="mt-1 text-[13.5px]">From the support plan. Write the outcome as the plan states it; add per-note questions only where caregivers should answer them on every note.</p>
      <FormError message={state.errors ? state.message : undefined} />
      <div className="mt-4 grid gap-3 md:grid-cols-6">
        <Field label="Goal" error={e.title} className="md:col-span-6"><Input name="title" placeholder="Take every medication as prescribed" required /></Field>
        <Field label="Outcome" error={e.outcome} hint="One measurable line" className="md:col-span-6"><Input name="outcome" placeholder="Fewer than two refused doses a week by December" /></Field>
        <Field label="What this looks like for the person" error={e.description} className="md:col-span-6"><Textarea name="description" className="min-h-14" placeholder="Staff administer from the locked box and record every dose." /></Field>
        <Field label="Start" error={e.startDate} className="md:col-span-3"><Input name="startDate" type="date" /></Field>
        <Field label="Target" error={e.targetDate} className="md:col-span-3"><Input name="targetDate" type="date" /></Field>
        <div className="md:col-span-6">
          <span className="mb-1.5 block text-[13px] font-medium">Yes/no questions on every note <span className="font-normal">(optional)</span></span>
          {e.questions && <span className="mb-1 block text-[13px] text-danger">{e.questions}</span>}
          <div className="space-y-2">{questions.map((q, i) => <Input key={i} name="questions[]" value={q} onChange={(ev) => setQuestions((qs) => qs.map((x, j) => (j === i ? ev.target.value : x)))} placeholder="Did Harold take every scheduled dose during this visit?" />)}</div>
          <button type="button" onClick={() => setQuestions((qs) => [...qs, ""])} className="mt-2 text-[13px] font-medium text-primary hover:underline">+ {questions.length ? "Another question" : "Add a question"}</button>
        </div>
      </div>
      <div className="mt-4 flex gap-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add goal"}</Button><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </form>
  );
}
