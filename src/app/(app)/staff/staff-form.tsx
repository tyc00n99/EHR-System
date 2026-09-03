"use client";

import { useActionState } from "react";
import { Button, Checkbox, Field, FormActions, FormError, FormSection, Input, LinkButton, Select } from "@/components/kit";
import { GENDERS, type ActionState } from "@/lib/validation";
import type { Staff } from "@/db/schema";

export function StaffForm({ action, defaults, cancelHref }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; defaults?: Partial<Staff>; cancelHref: string }) {
  const [state, submit, pending] = useActionState(action, {});
  const e = state.errors ?? {};
  const d = defaults ?? {};
  const editing = Boolean(d.id);
  return (
    <form action={submit} className="max-w-4xl">
      <FormError message={state.message} />
      <FormSection title="Identity" description="Legal name and identifiers as they appear on the background study.">
        <Field label="First name" error={e.firstName} className="md:col-span-3"><Input name="firstName" defaultValue={d.firstName} required /></Field>
        <Field label="Last name" error={e.lastName} className="md:col-span-3"><Input name="lastName" defaultValue={d.lastName} required /></Field>
        <Field label="Date of birth" error={e.dob} className="md:col-span-2"><Input name="dob" type="date" defaultValue={d.dob ?? ""} required /></Field>
        <Field label="Gender" error={e.gender} className="md:col-span-2">
          <Select name="gender" defaultValue={d.gender ?? ""} required>
            <option value="" disabled>Choose…</option>
            {GENDERS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </Select>
        </Field>
        <Field label="Social Security number" error={e.ssn} hint={editing ? `Stored encrypted, ending ${d.ssnLast4}. Leave blank to keep it.` : "Stored encrypted. Only the last four digits are shown afterwards."} className="md:col-span-2">
          <Input name="ssn" inputMode="numeric" placeholder={editing ? `•••-••-${d.ssnLast4}` : "123-45-6789"} autoComplete="off" required={!editing} />
        </Field>
      </FormSection>
      <FormSection title="Home address" description="Required for the personnel file.">
        <Field label="Street address" error={e.address1} className="col-span-2 md:col-span-4"><Input name="address1" defaultValue={d.address1 ?? ""} required /></Field>
        <Field label="Apt / unit" error={e.address2} className="md:col-span-2"><Input name="address2" defaultValue={d.address2 ?? ""} /></Field>
        <Field label="City" error={e.city} className="md:col-span-3"><Input name="city" defaultValue={d.city ?? ""} required /></Field>
        <Field label="State" error={e.state} className="md:col-span-1"><Input name="state" defaultValue={d.state ?? "MN"} maxLength={2} required /></Field>
        <Field label="ZIP" error={e.zip} className="md:col-span-2"><Input name="zip" inputMode="numeric" defaultValue={d.zip ?? ""} required /></Field>
        <Field label="Email" error={e.email} className="md:col-span-3"><Input name="email" type="email" defaultValue={d.email ?? ""} /></Field>
        <Field label="Phone" error={e.phone} className="md:col-span-3"><Input name="phone" type="tel" defaultValue={d.phone ?? ""} /></Field>
      </FormSection>
      <FormSection title="Employment" description="Title is the job, not the access level. Access is set on the login. Pay rate is visible to administrators only.">
        <Field label="Title" error={e.title} className="col-span-2 md:col-span-3"><Input name="title" defaultValue={d.title} placeholder="Direct support professional" required /></Field>
        <Field label="Hire date" error={e.hireDate} className="md:col-span-2"><Input name="hireDate" type="date" defaultValue={d.hireDate ?? ""} required /></Field>
        <Field label="Hourly pay rate" error={e.payRate} className="md:col-span-1"><Input name="payRate" type="number" min={0.01} step={0.01} defaultValue={d.payRate ?? ""} required /></Field>
        <div className="col-span-2 -mx-3 md:col-span-6"><Checkbox name="active" defaultChecked={d.active ?? true} label="Active. Inactive staff cannot clock in." /></div>
      </FormSection>
      <FormSection title="Rendering provider ID" description="One is required. It goes on every visit and claim line this person renders.">
        <Field label="NPI" error={e.npi} hint="10 digits" className="md:col-span-3"><Input name="npi" inputMode="numeric" defaultValue={d.npi ?? ""} /></Field>
        <Field label="UMPI" error={e.umpi} hint="10 characters from MHCP enrollment" className="md:col-span-3"><Input name="umpi" className="uppercase" defaultValue={d.umpi ?? ""} /></Field>
      </FormSection>
      <FormActions>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save staff member"}</Button>
        <LinkButton href={cancelHref} variant="ghost">Cancel</LinkButton>
      </FormActions>
    </form>
  );
}
