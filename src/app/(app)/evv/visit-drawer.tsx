"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { Badge, Button, Field, FormError, Input, Select, Textarea, cx } from "@/components/kit";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { BILLING, COMPLIANCE, LIFECYCLE, LOCATION_STATE, METHOD, SUBMISSION, reasonLabel } from "@/evv/labels";
import type { visitDetail } from "@/evv/review";
import { CORRECTION_REASONS } from "@/evv/types";
import { fmtDate, fmtDateTime, toLocalInput } from "@/lib/format";
import type { ActionState } from "@/lib/validation";
import { acknowledgeAction, commentAction, correctVisitAction, exceptionAction, resubmitAction, reviewVisitAction, voidVisitAction } from "./actions";
import { DateTimeInput } from "@/components/time-input";

type Detail = Awaited<ReturnType<typeof visitDetail>>;
type Names = { person: Record<string, string>; staff: Record<string, string> };

const Section = ({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) => (
  <section className="border-t border-line-soft px-5 py-4">
    <div className="mb-2 flex items-center justify-between"><div className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>{action}</div>
    {children}
  </section>
);

function useToast(state: ActionState, onOk?: () => void) {
  // The callback is read through a ref so a new closure each render does not re-fire the toast.
  const cb = useRef(onOk);
  useEffect(() => { cb.current = onOk; });
  useEffect(() => { if (state.ok) { toast.success(state.message ?? "Saved."); cb.current?.(); } else if (state.message && !state.errors) toast.error(state.message); }, [state]);
}

/**
 * One EVV visit, in a drawer over the queue: the six elements, the four independent statuses,
 * every event as the device sent it, exceptions with their actions, corrections, submissions,
 * comments — and the actions a reviewer takes. Coordinates are fetched only on request and the
 * request is audited.
 */
export function VisitDrawer({ detail, names, reviewers, canCorrect, canResubmit, backHref }: { detail: Detail; names: Names; reviewers: { id: string; label: string }[]; canCorrect: boolean; canResubmit: boolean; backHref: string }) {
  const router = useRouter();
  const v = detail.visit;
  const close = () => router.push(backHref);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<ActionState>) => start(async () => { const r = await fn(); if (r.ok) toast.success(r.message ?? "Done."); else toast.error(r.message ?? "Failed."); });
  const [panel, setPanel] = useState<"none" | "correct" | "void" | "ack">("none");
  const [fixes, setFixes] = useState<{ eventId: string; type: string; coordinates: { lat: number; lng: number; accuracy: number | null } | null }[] | null>(null);
  const c = COMPLIANCE[v.complianceStatus], s = v.submissionStatus ? SUBMISSION[v.submissionStatus] : null, b = BILLING[v.billingReadiness], l = LIFECYCLE[v.status];
  const open = detail.exceptions.filter((e) => e.status === "open" || e.status === "acknowledged");
  const reveal = () => start(async () => {
    const r = await fetch(`/api/evv/visits/${v.id}/location`, { credentials: "same-origin" });
    if (!r.ok) { toast.error("Could not load the location."); return; }
    setFixes((await r.json()).fixes);
  });

  const elements: { label: string; ok: boolean; value: string }[] = [
    { label: "Type of service", ok: Boolean(v.serviceCode), value: `${v.serviceCode} ${v.modifiers.join(" ")}` },
    { label: "Person receiving the service", ok: Boolean(v.personId), value: `${names.person[v.personId] ?? "Client"} · PMI ${v.memberId}` },
    { label: "Date of service", ok: Boolean(v.serviceDate), value: v.serviceDate ? fmtDate(v.serviceDate) : "Not yet" },
    { label: "Location", ok: Boolean(detail.events.find((e) => e.type === "clock_in")?.hasLocation) || ["protected_address", "registered_location"].includes(detail.events.find((e) => e.type === "clock_in")?.locationState ?? ""), value: v.locationType ? `${v.locationType[0].toUpperCase()}${v.locationType.slice(1)}` : "Not captured" },
    { label: "Person providing the service", ok: Boolean(v.staffId), value: names.staff[v.staffId] ?? "Caregiver" },
    { label: "Start and end times", ok: Boolean(v.clockInAt && v.clockOutAt), value: `${v.clockInAt ? fmtDateTime(v.clockInAt) : "—"} → ${v.clockOutAt ? fmtDateTime(v.clockOutAt) : "—"}${v.durationMinutes != null ? ` · ${v.durationMinutes} min · ${v.units ?? 0} units` : ""}` },
  ];

  return (
    <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent side="right" showCloseButton={false} className="w-full overflow-y-auto p-0 data-[side=right]:sm:max-w-[720px]">
        <SheetTitle className="sr-only">EVV visit</SheetTitle>
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-line bg-card px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[19px] font-semibold text-text-strong">{names.person[v.personId] ?? "Client"} <span className="font-normal text-muted-foreground">with {names.staff[v.staffId] ?? "caregiver"}</span></div>
            <div className="mt-1 flex flex-wrap gap-1.5"><Badge tone={l.tone}>{l.label}</Badge><Badge tone={c.tone}>{c.label}</Badge>{s && <Badge tone={s.tone}>{s.label}</Badge>}<Badge tone={b.tone}>{b.label}</Badge>{!v.evvRequired && <Badge>EVV not required</Badge>}</div>
            <div className="mt-1 text-[13px] text-muted-foreground">Version {v.version}{v.submissionDeadline ? ` · submit by ${fmtDate(v.submissionDeadline)}` : ""}{v.reviewedAt ? ` · reviewed ${fmtDateTime(v.reviewedAt)}` : ""}{v.visitId ? <> · <a href={`/visits/${v.visitId}`} className="text-primary hover:underline">open the note</a></> : null}</div>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-hover hover:text-text-strong"><Icon.plus size={17} className="rotate-45" /></button>
        </div>

        <div className="flex flex-wrap gap-2 px-5 py-3">
          <Button variant="secondary" disabled={pending} onClick={() => act(() => reviewVisitAction(v.id))}>Mark reviewed</Button>
          {canCorrect && v.status !== "voided" && <Button variant="secondary" onClick={() => setPanel(panel === "correct" ? "none" : "correct")}>Correct…</Button>}
          {canResubmit && v.evvRequired && v.status !== "voided" && <Button variant="secondary" disabled={pending} onClick={() => act(() => resubmitAction(v.id))}>Resubmit</Button>}
          {canResubmit && detail.submissions.length > 0 && <Button variant="secondary" onClick={() => setPanel(panel === "ack" ? "none" : "ack")}>Mark acknowledged…</Button>}
          {canCorrect && <Button variant="secondary" onClick={() => setPanel(panel === "void" ? "none" : "void")}>{v.status === "voided" ? "Undo void…" : "Void…"}</Button>}
        </div>
        {panel === "correct" && <CorrectForm visitId={v.id} clockInAt={v.clockInAt} clockOutAt={v.clockOutAt} locationType={v.locationType} serviceCode={v.serviceCode} modifiers={v.modifiers} onDone={() => setPanel("none")} />}
        {panel === "void" && <VoidForm visitId={v.id} undo={v.status === "voided"} onDone={() => setPanel("none")} />}
        {panel === "ack" && <AckForm visitId={v.id} onDone={() => setPanel("none")} />}

        <Section title="The six required elements">
          <ul className="grid gap-1.5 sm:grid-cols-2">{elements.map((e) => <li key={e.label} className="flex items-start gap-2 rounded-lg border border-line-soft px-3 py-2"><span className={cx("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[13px] font-bold", e.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>{e.ok ? "✓" : "!"}</span><span className="min-w-0"><span className="block text-[13px] text-muted-foreground">{e.label}</span><span className="block text-text-strong">{e.value}</span></span></li>)}</ul>
          {v.complianceReasons.length > 0 && <ul className="mt-3 space-y-1 text-[13.5px]">{v.complianceReasons.map((r) => <li key={r} className="flex items-start gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" />{reasonLabel(r)}</li>)}</ul>}
          {v.billingReasons.length > 0 && <p className="mt-2 text-[13px] text-muted-foreground">Billing: {v.billingReasons.map(reasonLabel).join("; ")}.</p>}
        </Section>

        <Section title={`Exceptions · ${open.length} open`}>
          {detail.exceptions.length === 0 ? <p className="text-[13px] text-muted-foreground">None.</p> : (
            <ul className="space-y-2">{detail.exceptions.map((e) => <ExceptionRow key={e.id} e={e} reviewers={reviewers} pending={pending} act={act} />)}</ul>
          )}
        </Section>

        <Section title="Events" action={fixes ? null : <button type="button" disabled={pending || !detail.events.some((e) => e.hasLocation)} onClick={reveal} className="text-[13px] font-medium text-primary hover:underline disabled:opacity-50">Show coordinates (audited)</button>}>
          <ul className="space-y-2">
            {detail.events.map((e) => {
              const fix = fixes?.find((f) => f.eventId === e.id)?.coordinates;
              return (
                <li key={e.id} className="rounded-lg border border-line-soft px-3 py-2 text-[13.5px]">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-text-strong">{e.type === "clock_in" ? "Clock-in" : e.type === "clock_out" ? "Clock-out" : e.type}</span><span>{e.effectiveAt ? fmtDateTime(e.effectiveAt) : "—"}</span><Badge>{METHOD[e.verificationMethod] ?? e.verificationMethod}</Badge>{e.offline && <Badge tone="warn">offline</Badge>}{e.delayed && <Badge tone="warn">delayed sync</Badge>}</div>
                  <div className="mt-0.5 text-muted-foreground">{LOCATION_STATE[e.locationState] ?? e.locationState}{e.distanceFromHomeMeters != null ? ` · ${Math.round(e.distanceFromHomeMeters)} m from home` : ""}{e.accuracyMeters != null ? ` · ±${Math.round(e.accuracyMeters)} m` : ""}{fix ? ` · ${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}` : ""}</div>
                  <div className="mt-0.5 text-[13px] text-muted-foreground">Device said {e.deviceCapturedAt ? fmtDateTime(e.deviceCapturedAt) : "—"} · server received {fmtDateTime(e.serverReceivedAt)}{e.deviceId ? ` · ${e.deviceId}` : ""}</div>
                </li>
              );
            })}
          </ul>
        </Section>

        {detail.corrections.length > 0 && (
          <Section title="Corrections">
            <ul className="space-y-2">{detail.corrections.map((k) => <li key={k.id} className="rounded-lg border border-line-soft px-3 py-2 text-[13.5px]"><div className="font-medium text-text-strong">{k.reasonCode.replaceAll("_", " ").toLowerCase()} · v{k.priorVersion} → v{k.resultingVersion} · {fmtDateTime(k.correctedAt)}</div><div className="text-muted-foreground">{k.explanation}</div><ul className="mt-1 text-[13px]">{Object.entries(k.changes).map(([f, ch]) => <li key={f}><span className="text-muted-foreground">{f}:</span> {String(ch.from ?? "—")} → {String(ch.to ?? "—")}</li>)}</ul></li>)}</ul>
          </Section>
        )}

        <Section title="Submissions">
          {detail.submissions.length === 0 ? <p className="text-[13px] text-muted-foreground">{v.evvRequired ? "Not queued yet." : "Not required for this service."}</p> : (
            <ul className="space-y-1.5 text-[13.5px]">{detail.submissions.map((sub) => <li key={sub.id} className="flex flex-wrap items-center gap-2"><span className="text-muted-foreground">v{sub.visitVersion} · {sub.operation}</span><Badge tone={SUBMISSION[sub.status].tone}>{SUBMISSION[sub.status].label}</Badge><span className="text-muted-foreground">{sub.attemptCount} attempt{sub.attemptCount === 1 ? "" : "s"}{sub.externalReferenceId ? ` · ref ${sub.externalReferenceId}` : ""}{sub.nextAttemptAt && sub.status === "retry_scheduled" ? ` · next ${fmtDateTime(sub.nextAttemptAt)}` : ""}</span>{sub.rejectionMessage && <span className="text-danger">{sub.rejectionMessage}</span>}</li>)}</ul>
          )}
        </Section>

        <Section title="Versions">
          <p className="text-[13px] text-muted-foreground">{detail.versions.map((x) => `v${x.version} ${x.cause}`).join(" · ")}</p>
        </Section>

        <Section title="Internal comments">
          {detail.comments.length > 0 && <ul className="mb-3 space-y-1.5 text-[13.5px]">{detail.comments.map((k) => <li key={k.id}><span className="text-muted-foreground">{fmtDateTime(k.createdAt)} · </span>{k.body}</li>)}</ul>}
          <CommentForm visitId={v.id} />
        </Section>
      </SheetContent>
    </Sheet>
  );
}

function ExceptionRow({ e, reviewers, pending, act }: { e: Detail["exceptions"][number]; reviewers: { id: string; label: string }[]; pending: boolean; act: (fn: () => Promise<ActionState>) => void }) {
  const [assignee, setAssignee] = useState(e.assignedTo ?? "");
  const closed = e.status === "resolved" || e.status === "waived";
  return (
    <li className={cx("rounded-lg border px-3 py-2 text-[13.5px]", closed ? "border-line-soft opacity-70" : e.severity === "error" ? "border-danger/40 bg-danger-soft/40" : e.severity === "info" ? "border-line-soft" : "border-warn/40 bg-warn-soft/40")}>
      <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-text-strong">{reasonLabel(e.type)}</span><Badge tone={closed ? "neutral" : e.status === "acknowledged" ? "accent" : "warn"}>{e.status}</Badge><span className="text-[13px] text-muted-foreground">{fmtDateTime(e.createdAt)}</span></div>
      {e.detail && <div className="mt-0.5 text-muted-foreground">{e.detail}</div>}
      {e.resolutionNote && <div className="mt-0.5 text-[13px] text-muted-foreground">{e.resolutionNote}</div>}
      {!closed && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {e.status === "open" && <Button variant="secondary" className="h-8" disabled={pending} onClick={() => act(() => exceptionAction(e.id, "acknowledge"))}>Acknowledge</Button>}
          <Button variant="secondary" className="h-8" disabled={pending} onClick={() => { const note = window.prompt("Resolution note (optional)") ?? undefined; act(() => exceptionAction(e.id, "resolve", note)); }}>Resolve</Button>
          <Select value={assignee} onChange={(ev) => setAssignee(ev.target.value)} className="h-8 w-auto"><option value="">Assign to…</option>{reviewers.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select>
          <Button variant="secondary" className="h-8" disabled={pending || !assignee || assignee === e.assignedTo} onClick={() => act(() => exceptionAction(e.id, "assign", undefined, assignee))}>Assign</Button>
        </div>
      )}
    </li>
  );
}

function CorrectForm({ visitId, clockInAt, clockOutAt, locationType, serviceCode, modifiers, onDone }: { visitId: string; clockInAt: Date | null; clockOutAt: Date | null; locationType: string | null; serviceCode: string; modifiers: string[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(correctVisitAction.bind(null, visitId), {});
  useToast(state, onDone);
  const e = state.errors ?? {};
  return (
    <form action={action} className="mx-5 mb-3 rounded-xl border border-primary bg-primary-soft/30 p-4">
      <div className="mb-3 text-[15px] font-semibold text-text-strong">Correct this visit</div>
      <p className="mb-3 text-[13px] text-muted-foreground">The original stays on record. The visit becomes a new version, is marked corrected (noncompliant under Minnesota policy unless exempt) and is resubmitted.</p>
      <FormError message={state.errors ? state.message : undefined} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Clock-in" error={e.clockInAt}><DateTimeInput name="clockInAt" defaultValue={clockInAt ? toLocalInput(clockInAt) : ""} /></Field>
        <Field label="Clock-out" error={e.clockOutAt}><DateTimeInput name="clockOutAt" defaultValue={clockOutAt ? toLocalInput(clockOutAt) : ""} /></Field>
        <Field label="Location type"><Select name="locationType" defaultValue={locationType ?? ""}><option value="">Unchanged</option><option value="home">Home</option><option value="community">Community</option><option value="alternate">Alternate</option><option value="protected">Protected address</option></Select></Field>
        <Field label="Service code · modifiers"><div className="flex gap-2"><Input name="serviceCode" defaultValue={serviceCode} className="w-28" /><Input name="modifiers" defaultValue={modifiers.join(" ")} placeholder="UC U3" /></div></Field>
        <Field label="Reason" error={e.reasonCode}><Select name="reasonCode" defaultValue="SUPERVISOR_REVIEW">{CORRECTION_REASONS.map((r) => <option key={r} value={r}>{r.replaceAll("_", " ").toLowerCase()}</option>)}</Select></Field>
        <Field label="Explanation" error={e.explanation} className="sm:col-span-2"><Textarea name="explanation" required minLength={10} className="min-h-16" placeholder="What was wrong, how you confirmed the right value" /></Field>
      </div>
      <div className="mt-3 flex gap-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save correction"}</Button><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </form>
  );
}

function VoidForm({ visitId, undo, onDone }: { visitId: string; undo: boolean; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="mx-5 mb-3 rounded-xl border border-danger/40 bg-danger-soft/30 p-4">
      <div className="mb-1 text-[15px] font-semibold text-text-strong">{undo ? "Undo the void" : "Void this visit"}</div>
      <p className="mb-3 text-[13px] text-muted-foreground">{undo ? "The visit returns to its previous state and is re-evaluated." : "Nothing is deleted: the events, versions and audit trail stay, and the aggregator is told if it already has the visit. Reversible."}</p>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className="min-h-16" />
      <div className="mt-3 flex gap-2"><Button disabled={pending || reason.trim().length < 5} onClick={() => start(async () => { const r = await voidVisitAction(visitId, reason, undo); if (r.ok) { toast.success(r.message); onDone(); } else toast.error(r.message ?? "Failed."); })}>{undo ? "Undo void" : "Void visit"}</Button><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </div>
  );
}

function AckForm({ visitId, onDone }: { visitId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(acknowledgeAction.bind(null, visitId), {});
  useToast(state, onDone);
  return (
    <form action={action} className="mx-5 mb-3 rounded-xl border border-line bg-card-soft p-4">
      <div className="mb-1 text-[15px] font-semibold text-text-strong">Mark acknowledged</div>
      <p className="mb-3 text-[13px] text-muted-foreground">Only for an acceptance confirmed outside this system (a portal or an email from the aggregator). Audited.</p>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Aggregator reference" error={state.errors?.externalReferenceId}><Input name="externalReferenceId" required /></Field><Field label="Note"><Input name="note" placeholder="Where the confirmation came from" /></Field></div>
      <div className="mt-3 flex gap-2"><Button type="submit" disabled={pending}>Save</Button><Button type="button" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </form>
  );
}

function CommentForm({ visitId }: { visitId: string }) {
  const [state, action, pending] = useActionState(commentAction.bind(null, visitId), {});
  const form = useRef<HTMLFormElement>(null);
  useToast(state, () => form.current?.reset());
  return (
    <form ref={form} action={action} className="flex gap-2">
      <Input name="body" placeholder="Add an internal comment" required className="flex-1" />
      <Button type="submit" variant="secondary" disabled={pending}>Add</Button>
    </form>
  );
}
