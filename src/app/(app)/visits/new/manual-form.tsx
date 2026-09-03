"use client";

import { useActionState, useMemo, useState } from "react";
import { Button, Field, FormActions, FormError, FormSection, Input, LinkButton, Select, Textarea } from "@/components/kit";
import { PLACES_OF_SERVICE } from "@/lib/validation";
import { createManualVisit } from "../actions";

interface AgreementOption { id: string; personId: string; personName: string; label: string }

export function ManualVisitForm({ agreements, staff }: { agreements: AgreementOption[]; staff: { id: string; name: string }[] }) {
  const [state, submit, pending] = useActionState(createManualVisit, {});
  const e = state.errors ?? {};
  const people = useMemo(() => Array.from(new Map(agreements.map((a) => [a.personId, a.personName])).entries()), [agreements]);
  const [personId, setPersonId] = useState(people[0]?.[0] ?? "");
  const options = agreements.filter((a) => a.personId === personId);

  return (
    <form action={submit} className="max-w-4xl">
      <FormError message={state.message} />
      <FormSection title="Who and what" description="Only active clients with a current service agreement are listed.">
        <Field label="Client" error={e.personId} className="col-span-2 md:col-span-3">
          <Select name="personId" value={personId} onChange={(ev) => setPersonId(ev.target.value)}>{people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select>
        </Field>
        <Field label="Staff" error={e.staffId} className="col-span-2 md:col-span-3">
          <Select name="staffId" defaultValue="">{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        </Field>
        <Field label="Service agreement" error={e.serviceAgreementId} className="col-span-2 md:col-span-4">
          <Select name="serviceAgreementId" key={personId} defaultValue={options[0]?.id ?? ""}>{options.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select>
        </Field>
        <Field label="Place of service" error={e.placeOfService} className="col-span-2 md:col-span-2">
          <Select name="placeOfService" defaultValue="12">{PLACES_OF_SERVICE.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.label}</option>)}</Select>
        </Field>
      </FormSection>
      <FormSection title="When and where" description="Times in Central time. Coordinates are required because the aggregator requires them.">
        <Field label="Clock in" error={e.clockInAt} className="md:col-span-3"><Input name="clockInAt" type="datetime-local" required /></Field>
        <Field label="Clock out" error={e.clockOutAt} className="md:col-span-3"><Input name="clockOutAt" type="datetime-local" required /></Field>
        <Field label="Clock-in latitude" error={e.clockInLat} className="md:col-span-3"><Input name="clockInLat" type="number" step="any" placeholder="44.97" required /></Field>
        <Field label="Clock-in longitude" error={e.clockInLng} className="md:col-span-3"><Input name="clockInLng" type="number" step="any" placeholder="-93.26" required /></Field>
        <Field label="Clock-out latitude" error={e.clockOutLat} className="md:col-span-3"><Input name="clockOutLat" type="number" step="any" required /></Field>
        <Field label="Clock-out longitude" error={e.clockOutLng} className="md:col-span-3"><Input name="clockOutLng" type="number" step="any" required /></Field>
      </FormSection>
      <FormSection title="Evidence" description="Both are exported with the visit.">
        <Field label="Why is this being entered manually?" error={e.manualEntryReason} className="col-span-2 md:col-span-6"><Input name="manualEntryReason" required placeholder="Phone died; times confirmed with guardian by text" /></Field>
        <Field label="Shift note" error={e.shiftNote} className="col-span-2 md:col-span-6"><Textarea name="shiftNote" required /></Field>
      </FormSection>
      <FormActions>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save visit"}</Button>
        <LinkButton href="/visits" variant="ghost">Cancel</LinkButton>
      </FormActions>
    </form>
  );
}
