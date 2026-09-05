"use client";

import { useActionState } from "react";
import { Button, Checkbox, Field, FormActions, FormError, FormSection, Input, LinkButton, Select } from "@/components/kit";
import { PERSON_STATUS, WAIVERS, type ActionState } from "@/lib/validation";
import type { Person } from "@/db/schema";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function PersonForm({ action, defaults, cancelHref }: { action: Action; defaults?: Partial<Person>; cancelHref: string }) {
  const [state, submit, pending] = useActionState(action, {});
  const e = state.errors ?? {};
  const d = defaults ?? {};
  return (
    <form action={submit} className="max-w-4xl">
      <FormError message={state.message} />

      <FormSection title="Identity" description="Name and identifiers as they appear on the DHS eligibility record.">
        <Field label="First name" error={e.firstName} className="col-span-1 md:col-span-2"><Input name="firstName" defaultValue={d.firstName} required /></Field>
        <Field label="Last name" error={e.lastName} className="col-span-1 md:col-span-2"><Input name="lastName" defaultValue={d.lastName} required /></Field>
        <Field label="Preferred name" error={e.preferredName} className="col-span-2 md:col-span-2"><Input name="preferredName" defaultValue={d.preferredName ?? ""} /></Field>
        <Field label="Date of birth" error={e.dob} className="md:col-span-2"><Input name="dob" type="date" defaultValue={d.dob ?? ""} required /></Field>
        <Field label="PMI #" error={e.pmi} hint="8-digit PMI number from the DHS eligibility record" className="md:col-span-2"><Input name="pmi" inputMode="numeric" pattern="[0-9]{8}" defaultValue={d.pmi} required /></Field>
        <Field label="Waiver program" error={e.waiverProgram} className="md:col-span-2">
          <Select name="waiverProgram" defaultValue={d.waiverProgram ?? "CADI"}>{WAIVERS.map((w) => <option key={w} value={w}>{w}</option>)}</Select>
        </Field>
      </FormSection>

      <FormSection title="Service" description="Status and the start date that begins the 245D planning clock.">
        <Field label="Status" error={e.status} className="md:col-span-2">
          <Select name="status" defaultValue={d.status ?? "intake"}>{PERSON_STATUS.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</Select>
        </Field>
        <Field label="Service start date" error={e.serviceStartDate} className="md:col-span-2"><Input name="serviceStartDate" type="date" defaultValue={d.serviceStartDate ?? ""} /></Field>
        <Field label="County of residence" error={e.county} className="col-span-2 md:col-span-2"><Input name="county" defaultValue={d.county} required /></Field>
        <div className="col-span-2 -mx-3 md:col-span-6"><Checkbox name="medicationSupport" value="true" defaultChecked={d.medicationSupport ?? false} label="Staff administer or assist with medications for this person (shows the Medical tab and MAR)" /></div>
      </FormSection>

      <FormSection title="Emergency contact" description="Who staff call first in an emergency. Can be the guardian or someone else.">
        <Field label="Name" error={e.emergencyContactName} className="md:col-span-3"><Input name="emergencyContactName" defaultValue={d.emergencyContactName ?? ""} /></Field>
        <Field label="Relationship" error={e.emergencyContactRelationship} className="md:col-span-3"><Input name="emergencyContactRelationship" defaultValue={d.emergencyContactRelationship ?? ""} /></Field>
        <Field label="Phone" error={e.emergencyContactPhone} className="md:col-span-3"><Input name="emergencyContactPhone" type="tel" defaultValue={d.emergencyContactPhone ?? ""} /></Field>
        <Field label="Email" error={e.emergencyContactEmail} className="md:col-span-3"><Input name="emergencyContactEmail" type="email" defaultValue={d.emergencyContactEmail ?? ""} /></Field>
      </FormSection>

      <FormSection title="County case manager" description="Receives progress reports and signs the support plan addendum.">
        <Field label="Name" error={e.caseManagerName} className="col-span-2 md:col-span-2"><Input name="caseManagerName" defaultValue={d.caseManagerName} required /></Field>
        <Field label="Phone" error={e.caseManagerPhone} className="md:col-span-2"><Input name="caseManagerPhone" type="tel" defaultValue={d.caseManagerPhone ?? ""} /></Field>
        <Field label="Email" error={e.caseManagerEmail} className="md:col-span-2"><Input name="caseManagerEmail" type="email" defaultValue={d.caseManagerEmail ?? ""} /></Field>
      </FormSection>

      <FormSection title="Guardian or legal representative" description="Leave blank if the person is their own legal representative.">
        <Field label="Name" error={e.guardianName} className="md:col-span-3"><Input name="guardianName" defaultValue={d.guardianName ?? ""} /></Field>
        <Field label="Relationship" error={e.guardianRelationship} className="md:col-span-3"><Input name="guardianRelationship" defaultValue={d.guardianRelationship ?? ""} placeholder="Mother, spouse, public guardian…" /></Field>
        <Field label="Phone" error={e.guardianPhone} className="md:col-span-3"><Input name="guardianPhone" type="tel" defaultValue={d.guardianPhone ?? ""} /></Field>
        <Field label="Email" error={e.guardianEmail} className="md:col-span-3"><Input name="guardianEmail" type="email" defaultValue={d.guardianEmail ?? ""} /></Field>
      </FormSection>

      <FormSection title="Consultation Services provider" description="The waiver Consultation Services provider supporting this person's plan, if any.">
        <Field label="Provider" error={e.consultProviderName} className="md:col-span-3"><Input name="consultProviderName" defaultValue={d.consultProviderName ?? ""} /></Field>
        <Field label="Contact name" error={e.consultContactName} className="md:col-span-3"><Input name="consultContactName" defaultValue={d.consultContactName ?? ""} /></Field>
        <Field label="Phone" error={e.consultPhone} className="md:col-span-3"><Input name="consultPhone" type="tel" defaultValue={d.consultPhone ?? ""} /></Field>
        <Field label="Email" error={e.consultEmail} className="md:col-span-3"><Input name="consultEmail" type="email" defaultValue={d.consultEmail ?? ""} /></Field>
      </FormSection>

      <FormSection title="Address and contact">
        <Field label="Street address" error={e.address1} className="col-span-2 md:col-span-4"><Input name="address1" defaultValue={d.address1 ?? ""} /></Field>
        <Field label="Apt / unit" error={e.address2} className="md:col-span-2"><Input name="address2" defaultValue={d.address2 ?? ""} /></Field>
        <Field label="City" error={e.city} className="md:col-span-3"><Input name="city" defaultValue={d.city ?? ""} /></Field>
        <Field label="State" error={e.state} className="md:col-span-1"><Input name="state" defaultValue={d.state ?? "MN"} maxLength={2} /></Field>
        <Field label="ZIP" error={e.zip} className="md:col-span-2"><Input name="zip" inputMode="numeric" defaultValue={d.zip ?? ""} /></Field>
        <Field label="Phone" error={e.phone} className="md:col-span-3"><Input name="phone" type="tel" defaultValue={d.phone ?? ""} /></Field>
        <div className="col-span-2 -mx-3 md:col-span-6"><Checkbox name="smsConsent" value="true" defaultChecked={d.smsConsent ?? false} label={<span>This person agreed to receive text messages at that number<span className="block text-[13px] text-muted-foreground">Signing codes are texted only with consent. They can stop any time by replying STOP.</span></span>} /></div>
        <Field label="Email" error={e.email} className="md:col-span-3"><Input name="email" type="email" defaultValue={d.email ?? ""} /></Field>
      </FormSection>

      <FormActions>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save client"}</Button>
        <LinkButton href={cancelHref} variant="ghost">Cancel</LinkButton>
      </FormActions>
    </form>
  );
}
