"use client";

import { useActionState } from "react";
import { Button, Field, FormActions, FormError, FormSection, Input, LinkButton, Select } from "@/components/ui";
import { SITE_TYPES, type ActionState } from "@/lib/validation";

const LABEL: Record<(typeof SITE_TYPES)[number], string> = { office: "Office", community_residential: "Community residential setting", day_services: "Day services facility", in_home: "In-home services" };

export function SiteForm({ action }: { action: (p: ActionState, fd: FormData) => Promise<ActionState> }) {
  const [state, submit, pending] = useActionState(action, {});
  const e = state.errors ?? {};
  return (
    <form action={submit} className="max-w-4xl">
      <FormError message={state.message} />
      <FormSection title="Site" description="A licensed location or, for in-home services, the service line itself.">
        <Field label="Name" error={e.name} className="col-span-2 md:col-span-4"><Input name="name" required /></Field>
        <Field label="Type" error={e.type} className="md:col-span-2"><Select name="type" defaultValue="in_home">{SITE_TYPES.map((t) => <option key={t} value={t}>{LABEL[t]}</option>)}</Select></Field>
        <Field label="License number" error={e.licenseNumber} className="md:col-span-2"><Input name="licenseNumber" /></Field>
        <Field label="Phone" error={e.phone} className="md:col-span-2"><Input name="phone" type="tel" /></Field>
      </FormSection>
      <FormSection title="Address">
        <Field label="Street address" error={e.address1} className="col-span-2 md:col-span-4"><Input name="address1" /></Field>
        <Field label="Suite" error={e.address2} className="md:col-span-2"><Input name="address2" /></Field>
        <Field label="City" error={e.city} className="md:col-span-3"><Input name="city" /></Field>
        <Field label="State" error={e.state} className="md:col-span-1"><Input name="state" defaultValue="MN" maxLength={2} /></Field>
        <Field label="ZIP" error={e.zip} className="md:col-span-2"><Input name="zip" inputMode="numeric" /></Field>
      </FormSection>
      <FormActions>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save site"}</Button>
        <LinkButton href="/sites" variant="ghost">Cancel</LinkButton>
      </FormActions>
    </form>
  );
}
