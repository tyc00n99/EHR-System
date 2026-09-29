"use client";

import { useActionState } from "react";
import { Button, Card, Checkbox, Field, FormError, Input, LinkButton, Select } from "@/components/kit";
import { PERSON_STATUS, WAIVERS, type ActionState } from "@/lib/validation";
import type { Person } from "@/db/schema";
import { DateInput } from "@/components/date-input";
import { MN_COUNTIES } from "@/lib/mn-counties";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function PersonForm({ action, defaults, cancelHref }: { action: Action; defaults?: Partial<Person>; cancelHref: string }) {
  const [state, submit, pending] = useActionState(action, {});
  const e = state.errors ?? {};
  const d = defaults ?? {};
  const grid = "grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-6";
  return (
    <form action={submit} className="grid gap-5">
      <FormError message={state.message} />

      {/* Layout "A" (user's pick, Sept 29, 2026): four boxes, two per side — the person and where they
          live on the left, their service and the people to call on the right. Stacks on narrow screens. */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="grid gap-5">
          <Card padded title="The person" description="As it appears on the DHS eligibility record.">
            <div className={grid}>
              <Field label="First name" error={e.firstName} className="md:col-span-3"><Input name="firstName" defaultValue={d.firstName} required /></Field>
              <Field label="Last name" error={e.lastName} className="md:col-span-3"><Input name="lastName" defaultValue={d.lastName} required /></Field>
              <Field label="Preferred name" error={e.preferredName} className="md:col-span-2"><Input name="preferredName" defaultValue={d.preferredName ?? ""} /></Field>
              <Field label="Date of birth" error={e.dob} className="md:col-span-2"><DateInput name="dob" defaultValue={d.dob ?? ""} required /></Field>
              <Field label="Sex at birth" error={e.sexAtBirth} className="col-span-2 md:col-span-2">
                <Select name="sexAtBirth" defaultValue={d.sexAtBirth ?? ""}>
                  <option value="">Not recorded</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="nonbinary">Non-binary</option>
                  <option value="other">Other</option>
                  <option value="undisclosed">Undisclosed</option>
                </Select>
              </Field>
              <Field label="PMI #" error={e.pmi} hint="8 digits" className="md:col-span-3"><Input name="pmi" inputMode="numeric" pattern="[0-9]{8}" defaultValue={d.pmi} required /></Field>
              <Field label="Waiver program" error={e.waiverProgram} className="md:col-span-3">
                <Select name="waiverProgram" defaultValue={d.waiverProgram ?? "CADI"}>{WAIVERS.map((w) => <option key={w} value={w}>{w}</option>)}</Select>
              </Field>
            </div>
          </Card>

          <Card padded title="Address and contact">
            <div className={grid}>
              <Field label="Street address" error={e.address1} className="col-span-2 md:col-span-4"><Input name="address1" defaultValue={d.address1 ?? ""} /></Field>
              <Field label="Apt / unit" error={e.address2} className="col-span-2 md:col-span-2"><Input name="address2" defaultValue={d.address2 ?? ""} /></Field>
              <Field label="City" error={e.city} className="col-span-2 md:col-span-3"><Input name="city" defaultValue={d.city ?? ""} /></Field>
              <Field label="State" error={e.state} className="md:col-span-1"><Input name="state" defaultValue={d.state ?? "MN"} maxLength={2} /></Field>
              <Field label="ZIP" error={e.zip} className="md:col-span-2"><Input name="zip" inputMode="numeric" defaultValue={d.zip ?? ""} /></Field>
              <Field label="Phone" error={e.phone} className="md:col-span-3"><Input name="phone" type="tel" defaultValue={d.phone ?? ""} /></Field>
              <Field label="Email" error={e.email} className="md:col-span-3"><Input name="email" type="email" defaultValue={d.email ?? ""} /></Field>
              <div className="col-span-2 -mx-3 md:col-span-6"><Checkbox name="smsConsent" value="true" defaultChecked={d.smsConsent ?? false} label={<span>Agreed to receive text messages at that number<span className="block text-[13px] text-muted-foreground">Signing codes are texted only with consent. They can reply STOP at any time.</span></span>} /></div>
            </div>
          </Card>
        </div>
        <div className="grid gap-5">
          <Card padded title="Service" description="The start date begins the planning clock.">
            <div className={grid}>
              <Field label="Status" error={e.status} className="md:col-span-3">
                <Select name="status" defaultValue={d.status ?? "intake"}>{PERSON_STATUS.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</Select>
              </Field>
              <Field label="Service start date" error={e.serviceStartDate} className="md:col-span-3"><DateInput name="serviceStartDate" defaultValue={d.serviceStartDate ?? ""} /></Field>
              <Field label="County of residence" error={e.county} className="col-span-2 md:col-span-6"><Select name="county" defaultValue={d.county ?? ""} required><option value="">Choose a county…</option>{d.county && !MN_COUNTIES.includes(d.county as (typeof MN_COUNTIES)[number]) && <option value={d.county}>{d.county}</option>}{MN_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
              <div className="col-span-2 -mx-3 md:col-span-6"><Checkbox name="medicationSupport" value="true" defaultChecked={d.medicationSupport ?? false} label="Staff give or help with medications (turns on the MAR)" /></div>
              <div className="col-span-2 mt-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground md:col-span-6">County case manager</div>
              <Field label="Name" error={e.caseManagerName} className="col-span-2 md:col-span-6"><Input name="caseManagerName" defaultValue={d.caseManagerName} required /></Field>
              <Field label="Phone" error={e.caseManagerPhone} className="md:col-span-3"><Input name="caseManagerPhone" type="tel" defaultValue={d.caseManagerPhone ?? ""} /></Field>
              <Field label="Email" error={e.caseManagerEmail} className="md:col-span-3"><Input name="caseManagerEmail" type="email" defaultValue={d.caseManagerEmail ?? ""} /></Field>
            </div>
          </Card>

          <Card padded title="People to call" description="The emergency contact, and the guardian if there is one.">
            <div className={grid}>
              <div className="col-span-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground md:col-span-6">Emergency contact</div>
              <Field label="Name" error={e.emergencyContactName} className="md:col-span-3"><Input name="emergencyContactName" defaultValue={d.emergencyContactName ?? ""} /></Field>
              <Field label="Relationship" error={e.emergencyContactRelationship} className="md:col-span-3"><Input name="emergencyContactRelationship" defaultValue={d.emergencyContactRelationship ?? ""} /></Field>
              <Field label="Phone" error={e.emergencyContactPhone} className="md:col-span-3"><Input name="emergencyContactPhone" type="tel" defaultValue={d.emergencyContactPhone ?? ""} /></Field>
              <Field label="Email" error={e.emergencyContactEmail} className="md:col-span-3"><Input name="emergencyContactEmail" type="email" defaultValue={d.emergencyContactEmail ?? ""} /></Field>
              <div className="col-span-2 mt-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground md:col-span-6">Guardian or legal representative</div>
              <Field label="Name" error={e.guardianName} className="md:col-span-3"><Input name="guardianName" defaultValue={d.guardianName ?? ""} /></Field>
              <Field label="Relationship" error={e.guardianRelationship} className="md:col-span-3"><Input name="guardianRelationship" defaultValue={d.guardianRelationship ?? ""} placeholder="Mother, spouse, public guardian…" /></Field>
              <Field label="Phone" error={e.guardianPhone} className="md:col-span-3"><Input name="guardianPhone" type="tel" defaultValue={d.guardianPhone ?? ""} /></Field>
              <Field label="Email" error={e.guardianEmail} className="md:col-span-3"><Input name="guardianEmail" type="email" defaultValue={d.guardianEmail ?? ""} /></Field>
              <p className="col-span-2 -mt-1 text-[13px] text-muted-foreground md:col-span-6">Leave the guardian blank if the person is their own legal representative.</p>
            </div>
          </Card>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save client"}</Button>
        <LinkButton href={cancelHref} variant="ghost">Cancel</LinkButton>
      </div>
    </form>
  );
}
