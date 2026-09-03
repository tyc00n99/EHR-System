"use client";

import { useActionState, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Field, FormError, Input, Select, Textarea, cx } from "@/components/kit";
import { GOAL_CATEGORIES } from "@/lib/templates";
import type { ActionState } from "@/lib/validation";
import { addGoalQuestion, createGoal, retireGoalQuestion, setGoalStatus } from "../goal-actions";

export interface GoalView { id: string; title: string; description: string | null; category: string; status: "active" | "met" | "discontinued"; targetDate: string | null; questions: { id: string; prompt: string; yes: number; no: number; na: number }[] }

const ICON: Record<string, string> = { social: "👥", daily_living: "🏠", health: "💚", community: "🚌", employment: "💼", communication: "💬", other: "⭐" };

function Bar({ label, n, total, tone }: { label: string; n: number; total: number; tone: "ok" | "danger" }) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div className="rounded-md border border-line bg-card px-3 py-2">
      <div className="flex items-baseline justify-between text-[13px]"><span className="text-muted-foreground">{label}</span><span className="font-semibold tabular-nums text-text-strong">{n}/{total}</span></div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel"><div className={cx("h-full rounded-full", tone === "ok" ? "bg-ok" : "bg-gray-700")} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function LifePlan({ personId, goals, manage, rangeLabel }: { personId: string; goals: GoalView[]; manage: boolean; rangeLabel: string }) {
  const [pending, start] = useTransition();
  const [newQ, setNewQ] = useState<Record<string, string>>({});
  return (
    <div className="space-y-4">
      {goals.length === 0 && <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-[13px] text-muted-foreground">No goals yet. {manage ? "Add the outcomes from the support plan below. Each goal gets yes/no questions caregivers answer in every visit note." : "A supervisor adds goals from the support plan."}</div>}
      {goals.map((g) => {
        return (
          <section key={g.id} className={cx("rounded-lg border border-line bg-card shadow-[var(--shadow-sm)]", g.status !== "active" && "opacity-70")}>
            <div className="flex items-start gap-3 border-b border-line-soft px-5 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-panel text-lg">{ICON[g.category] ?? "⭐"}</span>
              <div className="min-w-0 flex-1"><h3 className="text-[16px] font-semibold text-text-strong">{g.title}</h3>{g.description && <p className="mt-0.5 text-[13px] text-muted-foreground">{g.description}</p>}{g.targetDate && <p className="mt-0.5 text-[12px] text-muted-foreground">Target {g.targetDate}</p>}</div>
              <Badge tone={g.status === "active" ? "ok" : g.status === "met" ? "accent" : "neutral"}>{g.status}</Badge>
              {manage && (
                <div className="w-36 shrink-0">
                  <Select value={g.status} onChange={(e) => start(async () => { await setGoalStatus(g.id, personId, e.target.value as GoalView["status"]); toast.success("Goal updated"); })} disabled={pending} className="h-8 text-[12.5px]">
                    <option value="active">Active</option><option value="met">Met</option><option value="discontinued">Discontinued</option>
                  </Select>
                </div>
              )}
            </div>
            <div className="px-5 py-4">
              <div className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Questions · responses {rangeLabel}</div>
              <ol className="space-y-4">
                {g.questions.map((q, i) => {
                  const total = q.yes + q.no;
                  return (
                    <li key={q.id}>
                      <div className="mb-2 flex items-center gap-2 text-[13.5px]"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel text-[12px] font-semibold text-text-strong">{i + 1}</span><span className="flex-1">{q.prompt}</span>{q.na > 0 && <span className="text-[12px] text-muted-foreground">{q.na} n/a</span>}{manage && <button disabled={pending} onClick={() => { if (confirm("Retire this question? Past responses stay.")) start(() => retireGoalQuestion(q.id, personId)); }} className="text-muted-foreground hover:text-danger"><Trash2 className="size-3.5" /></button>}</div>
                      <div className="grid gap-2 sm:grid-cols-2 sm:pl-8"><Bar label="Responded yes" n={q.yes} total={total} tone="ok" /><Bar label="Responded no" n={q.no} total={total} tone="danger" /></div>
                    </li>
                  );
                })}
              </ol>
              {manage && g.status === "active" && (
                <div className="mt-4 flex gap-2 sm:pl-8">
                  <Input value={newQ[g.id] ?? ""} onChange={(e) => setNewQ((s) => ({ ...s, [g.id]: e.target.value }))} placeholder="Add a yes/no question caregivers answer each visit" className="h-8 text-[12.5px]" />
                  <Button variant="outline" className="h-8 gap-1" disabled={pending || !(newQ[g.id] ?? "").trim()} onClick={() => start(async () => { const r = await addGoalQuestion(g.id, personId, newQ[g.id] ?? ""); if (r.message) toast.error(r.message); else { toast.success("Question added"); setNewQ((s) => ({ ...s, [g.id]: "" })); } })}><Plus className="size-3.5" />Add</Button>
                </div>
              )}
            </div>
          </section>
        );
      })}
      {manage && <NewGoal personId={personId} />}
    </div>
  );
}

function NewGoal({ personId }: { personId: string }) {
  const [state, submit, pending] = useActionState(async (p: ActionState, fd: FormData) => { const r = await createGoal(personId, p, fd); if (r.message && !r.errors) toast.success(r.message); return r; }, {});
  const [questions, setQuestions] = useState<string[]>([""]);
  const e = state.errors ?? {};
  return (
    <form action={submit} key={pending ? "p" : String(state.message ?? "")} className="rounded-lg border border-line bg-sidebar p-5">
      <div className="mb-3 text-[13px] font-semibold text-text-strong">Add a goal from the support plan</div>
      <FormError message={state.errors ? state.message : undefined} />
      <div className="grid gap-3 md:grid-cols-6">
        <Field label="Goal" error={e.title} className="md:col-span-4"><Input name="title" placeholder="Improve social skills" required /></Field>
        <Field label="Category" error={e.category} className="md:col-span-2"><Select name="category" defaultValue="social">{GOAL_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="What this looks like for the person" error={e.description} className="md:col-span-6"><Textarea name="description" className="min-h-14" placeholder="Help Jordan build social skills by joining group activities and starting conversations." /></Field>
        <Field label="Start" error={e.startDate} className="md:col-span-2"><Input name="startDate" type="date" /></Field>
        <Field label="Target" error={e.targetDate} className="md:col-span-2"><Input name="targetDate" type="date" /></Field>
        <div className="md:col-span-6">
          <span className="mb-1.5 block text-[13px] font-medium text-text">Yes/no questions caregivers answer each visit</span>
          {e.questions && <span className="mb-1 block text-xs text-danger">{e.questions}</span>}
          <div className="space-y-2">{questions.map((q, i) => <Input key={i} name="questions[]" value={q} onChange={(ev) => setQuestions((qs) => qs.map((x, j) => (j === i ? ev.target.value : x)))} placeholder={i === 0 ? "Did Jordan participate in a community outing?" : "Did Jordan start a conversation with a peer or staff?"} />)}</div>
          <button type="button" onClick={() => setQuestions((qs) => [...qs, ""])} className="mt-2 text-[12.5px] font-medium text-primary hover:underline">+ Another question</button>
        </div>
      </div>
      <Button type="submit" disabled={pending} className="mt-4">{pending ? "Saving…" : "Add goal"}</Button>
    </form>
  );
}
