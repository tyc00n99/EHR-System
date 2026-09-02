"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input } from "@/components/ui";
import type { Organization } from "@/db/schema";
import { updateOrganization } from "./actions";

export function OrgForm({ org }: { org: Organization }) {
  const [state, submit, pending] = useActionState(updateOrganization, {});
  const e = state.errors ?? {};
  return (
    <form action={submit} className="space-y-4">
      {state.message && !state.errors && <div className="rounded-md bg-ok-soft px-3 py-2 text-[13px] text-ok">{state.message}</div>}
      <FormError message={state.errors ? "Check the highlighted fields." : undefined} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <Field label="Organization name" error={e.name} className="col-span-2 md:col-span-6"><Input name="name" defaultValue={org.name} required /></Field>
        <Field label="Tax ID (EIN)" error={e.taxId} hint="Aggregator provider identifier" className="md:col-span-2"><Input name="taxId" defaultValue={org.taxId} required /></Field>
        <Field label="NPI" error={e.npi} className="md:col-span-2"><Input name="npi" defaultValue={org.npi ?? ""} /></Field>
        <Field label="UMPI" error={e.umpi} className="md:col-span-2"><Input name="umpi" defaultValue={org.umpi ?? ""} className="uppercase" /></Field>
        <Field label="245D license number" error={e.licenseNumber} className="md:col-span-2"><Input name="licenseNumber" defaultValue={org.licenseNumber ?? ""} /></Field>
        <Field label="Phone" error={e.phone} className="md:col-span-2"><Input name="phone" type="tel" defaultValue={org.phone ?? ""} /></Field>
        <div className="hidden md:col-span-2 md:block" />
        <Field label="Street address" error={e.address1} className="col-span-2 md:col-span-3"><Input name="address1" defaultValue={org.address1 ?? ""} /></Field>
        <Field label="City" error={e.city} className="md:col-span-1"><Input name="city" defaultValue={org.city ?? ""} /></Field>
        <Field label="State" error={e.state} className="md:col-span-1"><Input name="state" defaultValue={org.state ?? "MN"} maxLength={2} /></Field>
        <Field label="ZIP" error={e.zip} className="md:col-span-1"><Input name="zip" defaultValue={org.zip ?? ""} /></Field>
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save organization"}</Button>
    </form>
  );
}
