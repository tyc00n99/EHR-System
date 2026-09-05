"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, Field, FormError, Input, Select, Textarea } from "@/components/kit";
import { PLACES_OF_SERVICE } from "@/lib/validation";
import { editVisit, voidVisit } from "../actions";

export function VisitEditForm({ visitId, defaults }: { visitId: string; defaults: { clockInAt: string; clockOutAt: string; placeOfService: string; shiftNote: string } }) {
  const [state, submit, pending] = useActionState(editVisit, {});
  const e = state.errors ?? {};
  return (
    <form action={submit} className="space-y-5">
      <FormError message={state.message} />
      <input type="hidden" name="visitId" value={visitId} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Field label="Clock in" error={e.clockInAt}><Input name="clockInAt" type="datetime-local" defaultValue={defaults.clockInAt} required /></Field>
        <Field label="Clock out" error={e.clockOutAt}><Input name="clockOutAt" type="datetime-local" defaultValue={defaults.clockOutAt} required /></Field>
        <Field label="Place of service" error={e.placeOfService} className="col-span-2 md:col-span-1">
          <Select name="placeOfService" defaultValue={defaults.placeOfService}>{PLACES_OF_SERVICE.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.label}</option>)}</Select>
        </Field>
      </div>
      <Field label="Shift note" error={e.shiftNote}><Textarea name="shiftNote" defaultValue={defaults.shiftNote} /></Field>
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <Field label="Reason for edit" error={e.reason} hint="Kept in the note history and sent to the aggregator, so say what changed and why"><Input name="reason" required placeholder="What was wrong and how the correct value was confirmed" /></Field>
        <Button type="submit" disabled={pending} className="h-9 md:mb-[22px]">{pending ? "Saving…" : "Save edit"}</Button>
      </div>
    </form>
  );
}

export function VoidButton({ visitId }: { visitId: string }) {
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
      <Field label="Void this note" error={msg} hint="A voided note is never billed or exported. It stays in the record.">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for voiding" />
      </Field>
      <Button variant="danger" disabled={pending} className="h-9 md:mb-[22px]" onClick={() => { if (!confirm("Void this note? It will not be billed or exported.")) return; start(async () => { const r = await voidVisit(visitId, reason); setMsg(r.message); }); }}>
        Void visit
      </Button>
    </div>
  );
}
