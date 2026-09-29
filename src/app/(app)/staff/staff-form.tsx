"use client";

import { useActionState } from "react";
import { Button, Card, Checkbox, Field, FormError, Input, LinkButton, Select } from "@/components/kit";
import { GENDERS, type ActionState } from "@/lib/validation";
import type { Staff } from "@/db/schema";
import { DateInput } from "@/components/date-input";
import { JobTitleField } from "@/components/job-title-field";
import { RenderingIdField } from "@/components/rendering-id-field";

export function StaffForm({ action, defaults, cancelHref }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; defaults?: Partial<Staff>; cancelHref: string }) {
  const [state, submit, pending] = useActionState(action, {});
  const e = state.errors ?? {};
  const d = defaults ?? {};
  const editing = Boolean(d.id);
  const grid = "grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-6";
  return (
    <form action={submit} className="grid gap-5">
      <FormError message={state.message} />

      {/* Same layout as the client form (user, Sept 29, 2026): four boxes, two per side — the person and
          where they live on the left, the job and the billing identifier on the right. Stacks below lg. */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="grid gap-5">
          <Card padded title="The person" description="Legal name and identifiers as they appear on the background study.">
            <div className={grid}>
              <Field label="First name" error={e.firstName} className="md:col-span-3"><Input name="firstName" defaultValue={d.firstName} required /></Field>
              <Field label="Last name" error={e.lastName} className="md:col-span-3"><Input name="lastName" defaultValue={d.lastName} required /></Field>
              <Field label="Date of birth" error={e.dob} className="md:col-span-3"><DateInput name="dob" defaultValue={d.dob ?? ""} required /></Field>
              <Field label="Gender" error={e.gender} className="md:col-span-3">
                <Select name="gender" defaultValue={d.gender ?? ""} required>
                  <option value="" disabled>Choose…</option>
                  {GENDERS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </Select>
              </Field>
              <Field label="Social Security number" error={e.ssn} hint={editing ? `Stored encrypted, ending ${d.ssnLast4}. Leave blank to keep it.` : "Stored encrypted. Only the last four digits are shown afterwards."} className="col-span-2 md:col-span-6">
                <Input name="ssn" inputMode="numeric" placeholder={editing ? `•••-••-${d.ssnLast4}` : "123-45-6789"} autoComplete="off" required={!editing} />
              </Field>
            </div>
          </Card>

          <Card padded title="Home address" description="Required for the personnel file.">
            <div className={grid}>
              <Field label="Street address" error={e.address1} className="col-span-2 md:col-span-4"><Input name="address1" defaultValue={d.address1 ?? ""} required /></Field>
              <Field label="Apt / unit" error={e.address2} className="col-span-2 md:col-span-2"><Input name="address2" defaultValue={d.address2 ?? ""} /></Field>
              <Field label="City" error={e.city} className="col-span-2 md:col-span-3"><Input name="city" defaultValue={d.city ?? ""} required /></Field>
              <Field label="State" error={e.state} className="md:col-span-1"><Input name="state" defaultValue={d.state ?? "MN"} maxLength={2} required /></Field>
              <Field label="ZIP" error={e.zip} className="md:col-span-2"><Input name="zip" inputMode="numeric" defaultValue={d.zip ?? ""} required /></Field>
              <Field label="Phone" error={e.phone} className="md:col-span-3"><Input name="phone" type="tel" defaultValue={d.phone ?? ""} /></Field>
              <Field label="Email" error={e.email} className="md:col-span-3"><Input name="email" type="email" defaultValue={d.email ?? ""} /></Field>
            </div>
          </Card>
        </div>

        <div className="grid gap-5">
          <Card padded title="Employment" description="Title is the job, not the access level; access is set on the login. Only administrators see the pay rate.">
            <div className={grid}>
              <Field label="Title" error={e.title} className="col-span-2 md:col-span-6"><JobTitleField defaultValue={d.title} required /></Field>
              <Field label="Hire date" error={e.hireDate} className="md:col-span-3"><DateInput name="hireDate" defaultValue={d.hireDate ?? ""} required /></Field>
              <Field label="Pay rate" error={e.payRate} hint={editing ? "Per hour. A change here starts today; back-date it on the Pay tab." : "Per hour"} className="md:col-span-3"><Input name="payRate" type="number" min={0.01} step={0.01} defaultValue={d.payRate ?? ""} required /></Field>
              {/* A new staff member is active by definition (user, Sept 28, 2026); inactivating is an edit made later. */}
              {/* Always rendered: an absent checkbox would read as "not exempt" and clear it on every save. */}
              <div className="col-span-2 -mx-3 md:col-span-6"><Checkbox name="overtimeExempt" defaultChecked={d.overtimeExempt ?? false} label="Exempt from overtime. Every hour pays at the regular rate." /></div>
              {d.id ? <div className="col-span-2 -mx-3 md:col-span-6"><Checkbox name="active" defaultChecked={d.active ?? true} label="Active. Inactive staff cannot clock in." /></div> : <input type="hidden" name="active" value="on" />}
            </div>
          </Card>

          <Card padded title="Rendering provider ID" description="Goes on every note and claim line this person renders.">
            <div className={grid}>
              <RenderingIdField npi={d.npi} umpi={d.umpi} errors={{ npi: e.npi, umpi: e.umpi }} />
            </div>
          </Card>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save team member"}</Button>
        <LinkButton href={cancelHref} variant="ghost">Cancel</LinkButton>
      </div>
    </form>
  );
}
