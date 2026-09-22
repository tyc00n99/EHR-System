"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Button, FormError, Input } from "@/components/kit";
import { fmtDate, fmtMoney } from "@/lib/format";
import type { ActionState } from "@/lib/validation";
import { updateStaff } from "../actions";
import { Plain, Rows } from "./plain";
import { DateInput } from "@/components/date-input";

export interface AboutValues {
  firstName: string; lastName: string; dob: string; gender: string; npi: string | null; umpi: string | null; active: boolean;
  title: string; hireDate: string; phone: string | null; email: string | null; address1: string; address2: string | null; city: string; state: string; zip: string; payRate: string;
}

/**
 * The About section edits in place: Edit swaps each value for a field on the same screen, Save
 * runs the same update as the full edit page (the fields not shown travel as hidden inputs, so
 * nothing is blanked), and Cancel puts the words back.
 */
export function AboutSection({ staffId, v, canEdit, ssn }: { staffId: string; v: AboutValues; canEdit: boolean; ssn?: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(updateStaff.bind(null, staffId), {});
  const e = state.errors ?? {};
  const label = "block text-[13px] text-muted-foreground";
  const field = "h-9 w-full";

  if (!editing) {
    return (
      <Plain title="About" action={canEdit && <button type="button" onClick={() => setEditing(true)} className="text-[13.5px] font-medium text-primary hover:underline">Edit</button>}>
        <Rows rows={[
          ["Job", v.title],
          ["Started", fmtDate(v.hireDate)],
          ["Phone", v.phone || <span className="text-muted-foreground">Not added</span>],
          ["Email", v.email || <span className="text-muted-foreground">Not added</span>],
          ["Address", [v.address1, v.address2, `${v.city}, ${v.state} ${v.zip}`].filter(Boolean).join(", ")],
          ...(canEdit ? [["Pay", <span key="pay" className="tabular-nums">{fmtMoney(v.payRate)} an hour</span>] as const] : []),
          ...(ssn ? [["SSN", ssn] as const] : []),
        ]} />
      </Plain>
    );
  }

  return (
    <Plain title="About">
      <form action={action} className="max-w-2xl">
        {(["firstName", "lastName", "dob", "gender"] as const).map((k) => <input key={k} type="hidden" name={k} value={v[k]} />)}
        {v.npi && <input type="hidden" name="npi" value={v.npi} />}
        {v.umpi && <input type="hidden" name="umpi" value={v.umpi} />}
        <input type="hidden" name="active" value={v.active ? "true" : "false"} />
        <FormError message={state.errors ? state.message : undefined} />
        <div className="grid grid-cols-[150px_1fr] items-center gap-x-3 gap-y-2.5 text-[15px]">
          <span className={label}>Job</span><div><Input name="title" defaultValue={v.title} required className={field} />{e.title && <p className="mt-1 text-[13px] text-danger">{e.title}</p>}</div>
          <span className={label}>Started</span><div><DateInput name="hireDate" defaultValue={v.hireDate} required className="w-48" />{e.hireDate && <p className="mt-1 text-[13px] text-danger">{e.hireDate}</p>}</div>
          <span className={label}>Phone</span><div><Input name="phone" type="tel" defaultValue={v.phone ?? ""} placeholder="612-555-0100" className="h-9 w-64" />{e.phone && <p className="mt-1 text-[13px] text-danger">{e.phone}</p>}</div>
          <span className={label}>Email</span><div><Input name="email" type="email" defaultValue={v.email ?? ""} className={field} />{e.email && <p className="mt-1 text-[13px] text-danger">{e.email}</p>}</div>
          <span className={label}>Address</span>
          <div className="grid gap-2">
            <Input name="address1" defaultValue={v.address1} placeholder="Street" required className={field} />
            <Input name="address2" defaultValue={v.address2 ?? ""} placeholder="Apt, unit (optional)" className={field} />
            <div className="grid grid-cols-[1fr_72px_120px] gap-2"><Input name="city" defaultValue={v.city} placeholder="City" required className={field} /><Input name="state" defaultValue={v.state} maxLength={2} className={field} /><Input name="zip" defaultValue={v.zip} placeholder="ZIP" required className={field} /></div>
            {(e.address1 || e.city || e.state || e.zip) && <p className="text-[13px] text-danger">{e.address1 ?? e.city ?? e.state ?? e.zip}</p>}
          </div>
          <span className={label}>Pay</span><div className="flex items-center gap-2"><span className="text-muted-foreground">$</span><Input name="payRate" type="number" step="0.01" min="0" defaultValue={v.payRate} required className="h-9 w-32 tabular-nums" /><span className="whitespace-nowrap text-muted-foreground">an hour</span>{e.payRate && <p className="text-[13px] text-danger">{e.payRate}</p>}</div>
          {ssn && <><span className={label}>SSN</span><div>{ssn} <span className="text-[13px] text-muted-foreground">· change it from the full edit page</span></div></>}
        </div>
        <div className="mt-4 flex gap-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button><Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
      </form>
    </Plain>
  );
}
