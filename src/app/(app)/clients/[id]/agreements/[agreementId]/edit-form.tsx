"use client";

import { useActionState, useState } from "react";
import { Button, Field, FormError, Input, LinkButton, Select, cx } from "@/components/kit";
import { MODIFIERS, SERVICE_CODES, serviceCodeKey } from "@/lib/hcpcs";
import type { ActionState } from "@/lib/validation";

const OTHER = "__other__";

export function AgreementEditForm({ action, defaults, cancelHref }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; defaults: { agreementNumber: string; serviceCode: string; modifiers: string[]; authorizedUnits: number; unitRate: string; startDate: string; endDate: string; authorizingCounty: string; status: string }; cancelHref: string }) {
  const [state, submit, pending] = useActionState(action, {});
  const e = state.errors ?? {};
  const initialKey = SERVICE_CODES.find((s) => s.code === defaults.serviceCode && s.modifiers.join(" ") === defaults.modifiers.join(" ")) ?? SERVICE_CODES.find((s) => s.code === defaults.serviceCode);
  const [codeKey, setCodeKey] = useState(initialKey ? serviceCodeKey(initialKey) : OTHER);
  const [otherCode, setOtherCode] = useState(initialKey ? "" : defaults.serviceCode);
  const [modifiers, setModifiers] = useState<string[]>(defaults.modifiers);
  const selected = SERVICE_CODES.find((s) => serviceCodeKey(s) === codeKey);
  const serviceCode = codeKey === OTHER ? otherCode.toUpperCase() : (selected?.code ?? "");
  const toggleMod = (m: string) => setModifiers((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : cur.length >= 4 ? cur : [...cur, m]));
  return (
    <form action={submit} className="space-y-5">
      <FormError message={state.errors ? state.message : undefined} />
      <input type="hidden" name="serviceCode" value={serviceCode} />
      {modifiers.map((m) => <input key={m} type="hidden" name="modifiers[]" value={m} />)}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <Field label="Agreement number" error={e.agreementNumber} className="md:col-span-3"><Input name="agreementNumber" defaultValue={defaults.agreementNumber} required /></Field>
        <Field label="Status" error={e.status} className="md:col-span-3"><Select name="status" defaultValue={defaults.status}><option value="active">Active</option><option value="exhausted">Exhausted</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></Select></Field>
        <Field label="Service" error={e.serviceCode} className="col-span-2 md:col-span-6">
          <Select value={codeKey} onChange={(ev) => { setCodeKey(ev.target.value); const s = SERVICE_CODES.find((c) => serviceCodeKey(c) === ev.target.value); if (s) setModifiers(s.modifiers); }}>
            {SERVICE_CODES.map((s) => <option key={serviceCodeKey(s)} value={serviceCodeKey(s)}>{s.label} · {serviceCodeKey(s)}</option>)}<option value={OTHER}>Other code…</option>
          </Select>
        </Field>
        {codeKey === OTHER && <Field label="HCPCS code" className="md:col-span-2"><Input value={otherCode} onChange={(ev) => setOtherCode(ev.target.value)} className="uppercase" maxLength={5} /></Field>}
        <div className="col-span-2 md:col-span-6">
          <span className="mb-1.5 block text-[13px] font-medium text-text">Modifiers</span>
          <div className="flex flex-wrap gap-1.5">{MODIFIERS.map((m) => <button key={m.code} type="button" title={m.meaning} onClick={() => toggleMod(m.code)} className={cx("h-7 rounded-full border px-2.5 font-mono text-[12px] font-medium", modifiers.includes(m.code) ? "border-primary bg-primary-soft text-primary" : "border-line bg-page text-muted-foreground hover:bg-hover")}>{m.code}</button>)}</div>
          {e.modifiers && <span className="mt-1 block text-xs text-danger">{e.modifiers}</span>}
        </div>
        <Field label="Authorized units" error={e.authorizedUnits} hint="15-minute units" className="md:col-span-2"><Input name="authorizedUnits" type="number" min={1} step={1} defaultValue={defaults.authorizedUnits} required /></Field>
        <Field label="Rate per unit" error={e.unitRate} className="md:col-span-2"><Input name="unitRate" type="number" min={0.01} step={0.01} defaultValue={defaults.unitRate} required /></Field>
        <Field label="Authorizing county" error={e.authorizingCounty} className="md:col-span-2"><Input name="authorizingCounty" defaultValue={defaults.authorizingCounty} required /></Field>
        <Field label="Start date" error={e.startDate} className="md:col-span-3"><Input name="startDate" type="date" defaultValue={defaults.startDate} required /></Field>
        <Field label="End date" error={e.endDate} className="md:col-span-3"><Input name="endDate" type="date" defaultValue={defaults.endDate} required /></Field>
      </div>
      <div className="flex gap-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button><LinkButton href={cancelHref} variant="ghost">Cancel</LinkButton></div>
    </form>
  );
}
