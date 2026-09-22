"use client";

import { CircleHelp } from "lucide-react";
import { FilterMenu } from "@/components/filter-menu";
import { useActionState, useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MarginSection } from "@/components/chart";
import { MarginFold } from "@/components/margin-fold";
import { toast } from "sonner";
import { Badge, Button, Field, FormError, Input, Select, Textarea, cx } from "@/components/kit";
import { fmtDate } from "@/lib/format";
import type { ActionState } from "@/lib/validation";
import { addGoalEntry, addGoalQuestion, addGoalReview, createGoal, reinstateGoalQuestion, retireGoalQuestion, setGoalStatus, updateGoal } from "../goal-actions";
import { DateInput } from "@/components/date-input";

export interface GoalView {
  id: string; title: string; outcome: string | null; supports: string | null; measurement: string | null; description: string | null; category: string; status: "active" | "met" | "discontinued"; startDate: string | null; targetDate: string | null; createdAt: Date;
  questions: { id: string; prompt: string; active: boolean; yes: number; no: number; na: number; thisMonth: { yes: number; no: number }; lastMonth: { yes: number; no: number } }[];
  reviews: { id: string; assessment: string; note: string; reviewedAt: Date; by: string }[];
  /** The progress log: one row per visit that addressed the outcome (with the caregiver's line, if any) and per hand-written entry. */
  entries: { id: string; visitId: string | null; at: Date; by: string; body: string | null }[];
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
 * Support plan outcomes (rebuilt Sept 22, 2026, user's pick "D" of four mockups). An outcome is
 * paragraphs, not a line: the outcome as the CSSP addendum states it, the supports and methods,
 * and how progress is measured. Opened, it shows those on top and a dated progress log
 * underneath — every note that addressed it, hand-written entries, and coordinator reviews —
 * so the story a licensor asks for is one scroll. Per-note yes/no questions still exist but are
 * optional and folded away.
 */
const DAY_OPTIONS = [30, 60, 90, 180, 365] as const;

export function LifePlan({ personId, goals, manage, rangeLabel, days, library }: { personId: string; goals: GoalView[]; manage: boolean; rangeLabel: string; days: number; library?: ReactNode }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const current = goals.find((g) => g.id === selected) ?? null;
  const back = () => setSelected(null);

  if (selected === "new" && manage) {
    return <div className="rounded-xl border border-line bg-card p-5 lg:p-6"><BackLink onClick={back} /><NewGoal personId={personId} onDone={back} /></div>;
  }
  if (current) {
    return <div className="rounded-xl border border-line bg-card p-5 lg:p-6"><BackLink onClick={back} /><GoalDetail key={current.id} personId={personId} g={current} manage={manage} days={days} /></div>;
  }

  // Active outcomes in the order a coordinator reads them: needs attention, then never reviewed, then
  // on track — and within each, the one reviewed longest ago first.
  const rank = (g: GoalView) => { const a = g.reviews[0]?.assessment; return a === "needs_attention" || a === "not_met" ? 0 : !a ? 1 : 2; };
  const lastReview = (g: GoalView) => g.reviews[0]?.reviewedAt.getTime() ?? 0;
  const active = goals.filter((g) => g.status === "active").sort((a, b) => rank(a) - rank(b) || lastReview(a) - lastReview(b) || a.title.localeCompare(b.title));

  const done = goals.filter((g) => g.status !== "active");
  const picker = (
    <FilterMenu aria-label="How far back to count the log" value={String(days)} className="h-8" onChange={(v) => router.push(`/clients/${personId}?tab=lifeplan&days=${v}`)} options={DAY_OPTIONS.map((d) => ({ value: String(d), label: d === 365 ? "Last year" : `Last ${d} days` }))} />
  );
  return (
    <div>
      <MarginSection label="Outcomes" note={<div className="grid gap-2"><span>From the support plan addendum</span>{picker}</div>} action={manage && <button type="button" onClick={() => setSelected("new")} className="hover:underline">+ New outcome</button>}>
        {goals.length === 0 ? (
          <p className="py-2 text-[14px] text-muted-foreground">{manage ? "No outcomes yet. Add them from the support plan addendum." : "A supervisor adds outcomes from the support plan."}</p>
        ) : active.length === 0 ? (
          <p className="py-2 text-[14px] text-muted-foreground">Every outcome is met or closed.</p>
        ) : (
          <div>
            <div className={cx(ROW, "pb-1.5 text-[12.5px] text-muted-foreground")}><span /><span>Outcome</span><span className={WIDE}>Log · {rangeLabel.replace(/^in /, "")}</span><span className={WIDE}>Last review</span><span /></div>
            {active.map((g) => <GoalRow key={g.id} g={g} days={days} onOpen={() => setSelected(g.id)} />)}
          </div>
        )}
      </MarginSection>
      {done.length > 0 && (
        <MarginFold label="Met" summary={<><span className="font-medium text-text-strong">{done.length} outcome{done.length === 1 ? "" : "s"}</span> · {done.map((g) => g.title).join(", ")}</>}>
          <div className="mt-2">{done.map((g) => <GoalRow key={g.id} g={g} days={days} onOpen={() => setSelected(g.id)} muted />)}</div>
        </MarginFold>
      )}
      {library && (
        <MarginFold label="Daily activities" note="What caregivers pick from on every note." summary="The list caregivers choose from when they write a note">
          <div className="mt-1">{library}</div>
        </MarginFold>
      )}
    </div>
  );
}

const ROW = "grid grid-cols-[4px_minmax(0,1fr)_140px] items-start gap-x-5 xl:grid-cols-[4px_minmax(0,1fr)_200px_150px_130px]";
const WIDE = "hidden xl:block";

const sinceDays = (days: number) => Date.now() - days * 86_400_000;

/**
 * One outcome, read left to right: what it is (the title and the first lines of the outcome
 * paragraph), how often the log has grown, when it was last reviewed, how it stands. Colour is
 * spent on one thing only: an outcome that needs attention.
 */
function GoalRow({ g, days, onOpen, muted }: { g: GoalView; days: number; onOpen: () => void; muted?: boolean }) {
  const st = standing(g);
  const attention = st.tone === "warn" || st.tone === "danger";
  const latest = g.reviews[0];
  const from = sinceDays(days);
  const recent = g.entries.filter((e) => e.at.getTime() >= from);
  const visits = recent.filter((e) => e.visitId).length;
  return (
    <button type="button" onClick={onOpen} className={cx(ROW, "w-full border-t border-line-soft py-3 text-left transition-colors hover:bg-sidebar", muted && "opacity-70")}>
      <span className={cx("mt-0.5 h-9 rounded-[2px]", attention ? "bg-warn" : "bg-transparent")} />
      <span className="min-w-0">
        <span className="block text-[15px] font-medium leading-snug text-text-strong">{g.title}</span>
        {g.outcome && <span className="mt-0.5 line-clamp-2 block text-[13px] leading-[1.45] text-muted-foreground">{g.outcome}</span>}
      </span>
      <span className={cx(WIDE, "pt-0.5 text-[13.5px] text-muted-foreground")}>
        {recent.length === 0 ? "No entries" : <>
          <span className="block">{visits ? `${visits} note${visits === 1 ? "" : "s"}` : ""}{visits && recent.length - visits ? " · " : ""}{recent.length - visits ? `${recent.length - visits} ${recent.length - visits === 1 ? "entry" : "entries"}` : ""}</span>
          <span className="block text-[12.5px] text-hint">last {fmtDate(recent[0].at)}</span>
        </>}
      </span>
      <span className={cx(WIDE, "pt-0.5 text-[13.5px] text-muted-foreground")}><span className="block">{latest ? fmtDate(latest.reviewedAt) : "Not reviewed yet"}</span>{g.targetDate && <span className="block text-[12.5px] text-hint">target {fmtDate(g.targetDate)}</span>}</span>
      <span className={cx("pt-0.5 text-right text-[14px]", attention ? "font-semibold text-warn" : "text-muted-foreground")}>{st.label}</span>
    </button>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="mb-4 text-[13px] font-medium text-primary hover:underline">← All outcomes</button>;
}

const PARA = "whitespace-pre-line text-[14px] leading-[1.55] text-text";
const H4 = "mb-1 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground";

type LogRow = { key: string; at: Date; kind: string; kindTone?: "accent" | "warn" | "ok" | "danger"; body: string; visitId?: string | null };

function GoalDetail({ personId, g, manage, days }: { personId: string; g: GoalView; manage: boolean; days: number }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [newQ, setNewQ] = useState("");
  const st = standing(g);
  const live = g.questions.filter((q) => q.active);
  const retired = g.questions.filter((q) => !q.active);

  // The log: notes and hand-written entries, reviews, and the day the outcome was added — one list, newest first.
  const log: LogRow[] = [
    ...g.entries.map((e): LogRow => ({ key: `e${e.id}`, at: e.at, kind: e.visitId ? `Note · ${e.by}` : `Entry · ${e.by}`, body: e.body?.trim() || "Worked on during this visit.", visitId: e.visitId })),
    ...g.reviews.map((r): LogRow => { const a = ASSESSMENT[r.assessment]; return { key: `r${r.id}`, at: r.reviewedAt, kind: `Review · ${r.by}`, kindTone: a?.tone === "neutral" ? undefined : a?.tone, body: `${a?.label ?? r.assessment}. ${r.note}` }; }),
    { key: "start", at: g.startDate ? new Date(`${g.startDate}T12:00:00`) : g.createdAt, kind: "Started", body: g.startDate ? `Outcome in effect from ${fmtDate(g.startDate)}.` : "Outcome added." },
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const shown = showAll ? log : log.slice(0, 12);
  const recent = g.entries.filter((e) => e.at.getTime() >= sinceDays(days)).length;
  const openNote = (visitId: string) => { const u = new URL(window.location.href); u.searchParams.set("note", visitId); window.history.pushState(null, "", u.toString()); };

  return (
    <div>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="max-w-3xl text-[21px] leading-tight">{g.title}</h2>
          <div className="mt-1 text-[13px] text-muted-foreground">{[g.startDate && `Since ${fmtDate(g.startDate)}`, g.targetDate && `Target ${fmtDate(g.targetDate)}`, recent ? `${recent} log ${recent === 1 ? "entry" : "entries"} in the last ${days} days` : null].filter(Boolean).join(" · ")}</div>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
        {manage && (<>
          <Button variant="outline" className="h-8" onClick={() => { setEditing((v) => !v); setReviewing(false); }}>{editing ? "Close" : "Edit"}</Button>
          {g.status === "active" && <Button className="h-8" onClick={() => { setReviewing((v) => !v); setEditing(false); }}>{reviewing ? "Close" : "Review"}</Button>}
          <FilterMenu aria-label="Outcome status" value={g.status} disabled={pending} className="h-8" onChange={(v) => start(async () => { await setGoalStatus(g.id, personId, v as GoalView["status"]); toast.success("Status updated"); })} options={[{ value: "active", label: "Active" }, { value: "met", label: "Met" }, { value: "discontinued", label: "Discontinued" }]} />
        </>)}
      </div>

      {editing && manage ? <EditGoal personId={personId} g={g} onDone={() => setEditing(false)} /> : (
        <div className="mt-5 grid gap-x-8 gap-y-5 lg:grid-cols-2">
          <div>
            <div className={H4}>Outcome</div>
            <p className={PARA}>{g.outcome?.trim() || <span className="text-muted-foreground">Not written yet. Copy the outcome from the support plan addendum.</span>}</p>
          </div>
          <div className="grid gap-y-5">
            <div>
              <div className={H4}>Supports and methods</div>
              <p className={PARA}>{g.supports?.trim() || <span className="text-muted-foreground">Not written yet.</span>}</p>
            </div>
            <div>
              <div className={H4}>How progress is measured</div>
              <p className={PARA}>{g.measurement?.trim() || <span className="text-muted-foreground">Not written yet.</span>}</p>
            </div>
          </div>
        </div>
      )}

      {reviewing && manage && <ReviewForm personId={personId} goalId={g.id} onDone={() => setReviewing(false)} />}

      <section className="mt-6 border-t border-line-soft pt-4">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <div className={cx(H4, "mb-0")}>Progress log</div>
          <span className="text-[13px] text-muted-foreground">{log.length - 1} {log.length - 1 === 1 ? "entry" : "entries"} · from notes, entries and reviews</span>
          {manage && <button type="button" onClick={() => setAdding((v) => !v)} className="ml-auto text-[13px] font-medium text-primary hover:underline">{adding ? "Cancel" : "+ Add an entry"}</button>}
        </div>
        {adding && manage && <EntryForm personId={personId} goalId={g.id} onDone={() => setAdding(false)} />}
        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[14px] md:grid-cols-[110px_150px_minmax(0,1fr)]">
          {shown.map((r) => (
            <div key={r.key} className="contents">
              <span className="text-[13px] text-muted-foreground tabular-nums">{fmtDate(r.at)}</span>
              <span className={cx("text-[13px]", r.kindTone === "warn" || r.kindTone === "danger" ? "font-medium text-warn" : r.kindTone ? "text-primary" : "text-muted-foreground", "md:block hidden")}>{r.kind}</span>
              <span className="whitespace-pre-line">
                <span className={cx("mr-1.5 text-[13px] md:hidden", r.kindTone ? "text-primary" : "text-muted-foreground")}>{r.kind} ·</span>
                {r.body}
                {r.visitId && <button type="button" onClick={() => openNote(r.visitId!)} className="ml-2 text-[13px] font-medium text-primary hover:underline">Open note</button>}
              </span>
            </div>
          ))}
        </div>
        {log.length > shown.length && <button type="button" onClick={() => setShowAll(true)} className="mt-3 text-[13px] font-medium text-primary hover:underline">Show {log.length - shown.length} more</button>}
      </section>

      {(live.length > 0 || retired.length > 0 || (manage && g.status === "active")) && (
        <details className="mt-6 border-t border-line-soft pt-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <span className={cx(H4, "mb-0")}>Daily questions · optional{live.length ? ` · ${live.length}` : ""}</span>
            <span className="text-[13px] text-muted-foreground">Yes/no prompts a caregiver can answer when they tick this outcome on a note. Not required.</span>
            <span className="ml-auto text-muted-foreground">⌄</span>
          </summary>
          <ul className="mt-2 divide-y divide-line-soft">
            {live.map((q) => { const total = q.yes + q.no; const pct = total ? Math.round((q.yes / total) * 100) : null; return (
              <li key={q.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[14px]">
                <span className="min-w-0 flex-1">{q.prompt}</span>
                <span className="text-[13px] tabular-nums text-muted-foreground">{pct == null ? "no answers yet" : `${pct}% yes · ${q.yes} / ${total}`}{q.na ? ` · ${q.na} n/a` : ""}</span>
                {manage && <button type="button" disabled={pending} onClick={() => { if (confirm("Retire this question? Past responses stay.")) start(() => retireGoalQuestion(q.id, personId)); }} className="text-[13px] hover:text-danger">Retire</button>}
              </li>
            ); })}
            {retired.map((q) => { const total = q.yes + q.no; return (
              <li key={q.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[14px]">
                <span className="min-w-0 flex-1 text-text-strong line-through decoration-danger decoration-1">{q.prompt}</span>
                <span className="text-[13px] tabular-nums text-muted-foreground">{total ? `${q.yes} yes · ${q.no} no` : "no answers yet"}{q.na ? ` · ${q.na} n/a` : ""}</span>
                {manage && g.status === "active" && <button type="button" disabled={pending} onClick={() => start(async () => { await reinstateGoalQuestion(q.id, personId); toast.success("Question reinstated"); })} className="text-[13px] font-medium text-primary hover:underline">Reinstate</button>}
              </li>
            ); })}
          </ul>
          {retired.length > 0 && <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground"><CircleHelp className="size-3.5" /> A struck-through question is retired: no longer asked, past answers kept.</p>}
          {manage && g.status === "active" && (
            <div className="mt-2 flex gap-2">
              <Input value={newQ} onChange={(e) => setNewQ(e.target.value)} placeholder="Add a yes/no question caregivers can answer on a note" className="h-8 text-[13px]" />
              <Button variant="outline" className="h-8" disabled={pending || !newQ.trim()} onClick={() => start(async () => { const r = await addGoalQuestion(g.id, personId, newQ); if (r.message) toast.error(r.message); else { toast.success("Question added"); setNewQ(""); } })}>Add</Button>
            </div>
          )}
        </details>
      )}
    </div>
  );
}

function EntryForm({ personId, goalId, onDone }: { personId: string; goalId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(addGoalEntry.bind(null, goalId, personId), {});
  useToast(state, onDone);
  const e = state.errors ?? {};
  return (
    <form action={action} className="mb-4 rounded-lg border border-primary bg-primary-soft/30 p-3">
      <FormError message={state.errors ? state.message : undefined} />
      <Field label="Entry" error={e.body}><Textarea name="body" required className="min-h-14" placeholder="A weight, a call with the family, something a note did not carry" /></Field>
      <div className="mt-2 flex gap-2"><Button type="submit" className="h-8" disabled={pending}>{pending ? "Saving…" : "Add to the log"}</Button><Button type="button" variant="ghost" className="h-8" onClick={onDone}>Cancel</Button></div>
    </form>
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
        <Field label="Where it stands" error={e.assessment}><Select name="assessment" defaultValue="on_track"><option value="on_track">On track</option><option value="needs_attention">Needs attention</option><option value="met">Met — close the outcome</option><option value="not_met">Not met</option></Select></Field>
        <Field label="Note" error={e.note}><Textarea name="note" required className="min-h-16" placeholder="What the log shows, what changed, what happens next" /></Field>
      </div>
      <div className="mt-3 flex gap-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save review"}</Button><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </form>
  );
}

function GoalFields({ g, e }: { g?: GoalView; e: Record<string, string | undefined> }) {
  return (<>
    <Field label="Outcome" error={e.title} hint="A short name for it, as it appears in the plan's list" className="sm:col-span-6"><Input name="title" defaultValue={g?.title ?? ""} placeholder="Eat three meals and drink enough water" required /></Field>
    <Field label="The outcome, as the plan states it" error={e.outcome} className="sm:col-span-6"><Textarea name="outcome" defaultValue={g?.outcome ?? ""} className="min-h-24" placeholder="Harold will keep adequate nutrition and hydration by eating three meals a day and drinking at least six glasses of water, so that…" /></Field>
    <Field label="Supports and methods" error={e.supports} hint="What staff do, when, and how" className="sm:col-span-6"><Textarea name="supports" defaultValue={g?.supports ?? ""} className="min-h-24" placeholder="Staff prepare meals at 8:00, 12:30 and 6:00 and sit with Harold while he eats…" /></Field>
    <Field label="How progress is measured" error={e.measurement} hint="And how often it is reviewed" className="sm:col-span-6"><Textarea name="measurement" defaultValue={g?.measurement ?? ""} className="min-h-16" placeholder="Monthly weight, meals eaten in full on daily notes; reviewed every 90 days." /></Field>
    <Field label="Start" error={e.startDate} className="sm:col-span-3"><DateInput name="startDate" defaultValue={g?.startDate ?? ""} /></Field>
    <Field label="Target" error={e.targetDate} className="sm:col-span-3"><DateInput name="targetDate" defaultValue={g?.targetDate ?? ""} /></Field>
  </>);
}

function EditGoal({ personId, g, onDone }: { personId: string; g: GoalView; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateGoal.bind(null, g.id, personId), {});
  useToast(state, onDone);
  const e = state.errors ?? {};
  return (
    <form action={action} className="mt-4 rounded-lg border border-primary bg-primary-soft/30 p-4">
      <FormError message={state.errors ? state.message : undefined} />
      <div className="grid gap-3 sm:grid-cols-6"><GoalFields g={g} e={e} /></div>
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
      <h2 className="text-[19px] leading-tight">New outcome</h2>
      <p className="mt-1 text-[13.5px] text-muted-foreground">Copy it from the support plan addendum, paragraph by paragraph.</p>
      <FormError message={state.errors ? state.message : undefined} />
      <div className="mt-4 grid gap-3 sm:grid-cols-6">
        <GoalFields e={e} />
        <div className="sm:col-span-6">
          <span className="mb-1.5 block text-[13px] font-medium">Daily yes/no questions <span className="font-normal text-muted-foreground">(optional — most outcomes need none)</span></span>
          {e.questions && <span className="mb-1 block text-[13px] text-danger">{e.questions}</span>}
          <div className="space-y-2">{questions.map((q, i) => <Input key={i} name="questions[]" value={q} onChange={(ev) => setQuestions((qs) => qs.map((x, j) => (j === i ? ev.target.value : x)))} placeholder="Did Harold drink at least two glasses of water?" />)}</div>
          <button type="button" onClick={() => setQuestions((qs) => [...qs, ""])} className="mt-2 text-[13px] font-medium text-primary hover:underline">+ {questions.length ? "Another question" : "Add a question"}</button>
        </div>
      </div>
      <div className="mt-4 flex gap-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add outcome"}</Button><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </form>
  );
}
