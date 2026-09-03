"use client";

import { useActionState, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Button, Field, FormActions, FormError, FormSection, Input, LinkButton, Select, cx } from "@/components/kit";
import { MODIFIERS, SERVICE_CODES, serviceCodeKey } from "@/lib/hcpcs";
import type { ActionState } from "@/lib/validation";
import type { ExtractState } from "../../../actions";

type Action = (p: ActionState, fd: FormData) => Promise<ActionState>;
type Extract = (p: ExtractState, fd: FormData) => Promise<ExtractState>;

const OTHER = "__other__";

export function AgreementForm({ action, extract, cancelHref, defaultCounty, aiReady }: { action: Action; extract: Extract; cancelHref: string; defaultCounty: string; aiReady: boolean }) {
  const [state, submit, pending] = useActionState(action, {});
  const [ex, runExtract, extracting] = useActionState(extract, {});
  const e = state.errors ?? {};

  const [codeKey, setCodeKey] = useState<string>(serviceCodeKey(SERVICE_CODES[0]));
  const [otherCode, setOtherCode] = useState("");
  const [modifiers, setModifiers] = useState<string[]>(SERVICE_CODES[0].modifiers);
  const [fields, setFields] = useState({ agreementNumber: "", authorizedUnits: "", unitRate: "", startDate: "", endDate: "", authorizingCounty: defaultCounty });

  const selected = useMemo(() => SERVICE_CODES.find((s) => serviceCodeKey(s) === codeKey), [codeKey]);
  const serviceCode = codeKey === OTHER ? otherCode.toUpperCase() : (selected?.code ?? "");

  // Prefill from the AI extraction once it lands (state derived from the action result).
  const [applied, setApplied] = useState<ExtractState["extracted"]>();
  const [lineIdx, setLineIdx] = useState(0);
  const applyLine = (x: NonNullable<ExtractState["extracted"]>, idx: number) => {
    const line = x.lines[idx];
    setFields((f) => ({
      agreementNumber: x.agreementNumber ?? f.agreementNumber,
      authorizedUnits: line?.quantity != null ? String(line.quantity) : f.authorizedUnits,
      unitRate: line?.ratePerUnit != null ? line.ratePerUnit.toFixed(2) : f.unitRate,
      startDate: line?.startDate ?? x.effectiveDate ?? f.startDate,
      endDate: line?.endDate ?? x.throughDate ?? f.endDate,
      authorizingCounty: f.authorizingCounty,
    }));
    if (line?.procedureCode) {
      const code = line.procedureCode.toUpperCase();
      const mods = line.modifiers.map((m) => m.toUpperCase());
      const exact = SERVICE_CODES.find((s) => s.code === code && s.modifiers.join(" ") === mods.join(" "));
      const byCode = exact ?? SERVICE_CODES.find((s) => s.code === code);
      if (byCode) { setCodeKey(serviceCodeKey(byCode)); setModifiers(mods.length ? mods : byCode.modifiers); }
      else { setCodeKey(OTHER); setOtherCode(code); setModifiers(mods); }
    }
  };
  if (ex.extracted && ex.extracted !== applied) {
    setApplied(ex.extracted);
    const firstApproved = Math.max(0, ex.extracted.lines.findIndex((l) => /approved/i.test(l.status ?? "")));
    setLineIdx(firstApproved);
    applyLine(ex.extracted, firstApproved);
  }

  const pickCode = (key: string) => {
    setCodeKey(key);
    const s = SERVICE_CODES.find((c) => serviceCodeKey(c) === key);
    if (s) setModifiers(s.modifiers);
  };
  const toggleMod = (m: string) => setModifiers((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : cur.length >= 4 ? cur : [...cur, m]));
  const set = (k: keyof typeof fields) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFields((f) => ({ ...f, [k]: ev.target.value }));

  return (
    <div className="max-w-4xl">
      <form action={runExtract} className="mb-2">
        <FormSection title="Upload the service agreement" description={aiReady ? "Upload the DHS service agreement PDF and the details below fill in automatically. Review them before saving." : "Add ANTHROPIC_API_KEY to .env.local to enable automatic extraction. You can still attach the PDF."}>
          <div className="col-span-2 md:col-span-6">
            <FormError message={ex.message} />
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line bg-sidebar px-4 py-4">
              <Icon.doc size={20} className="text-gray-500" />
              <input type="file" name="document" accept="application/pdf,.pdf" className="text-[13px] file:mr-3 file:rounded-md file:border file:border-line file:bg-page file:px-3 file:py-1.5 file:text-[13px] file:font-medium hover:file:bg-hover" />
              <Button type="submit" variant="secondary" disabled={extracting || !aiReady} className="ml-auto">{extracting ? "Reading the PDF…" : "Extract details"}</Button>
            </div>
            {ex.documentName && (
              <div className={cx("mt-3 rounded-md px-3 py-2.5 text-[13px]", ex.extracted ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
                <div className="flex items-start gap-2">
                  <Icon.check size={15} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{ex.extracted ? `Read ${ex.documentName}. Check the fields below before saving.` : `Attached ${ex.documentName}.`}</div>
                    {ex.pmiMismatch && <div className="mt-0.5 text-danger">The PMI on the letter ({ex.extracted?.pmi}) does not match this client. Make sure you picked the right client.</div>}
                    {ex.extracted && (
                      <div className="mt-1 grid gap-x-6 gap-y-0.5 text-[12.5px] sm:grid-cols-2">
                        {ex.extracted.recipientName && <span>Recipient: {ex.extracted.recipientName}</span>}
                        {ex.extracted.effectiveDate && <span>Agreement dates: {ex.extracted.effectiveDate} to {ex.extracted.throughDate ?? "?"}</span>}
                        {ex.extracted.caseManagerName && <span>Case manager: {ex.extracted.caseManagerName}{ex.extracted.caseManagerPhone ? ` · ${ex.extracted.caseManagerPhone}` : ""}</span>}
                        {ex.extracted.icd10 && <span>Diagnosis: {ex.extracted.icd10}</span>}
                        {ex.extracted.providerName && <span>Issued to: {ex.extracted.providerName}{ex.extracted.providerId ? ` (${ex.extracted.providerId})` : ""}</span>}
                      </div>
                    )}
                    {ex.extracted?.notes && <div className="mt-1 text-[12.5px]">Reviewer note: {ex.extracted.notes}</div>}
                  </div>
                </div>
                {ex.extracted && ex.extracted.lines.length > 1 && (
                  <div className="mt-2 border-t border-ok/20 pt-2">
                    <div className="mb-1 text-[12px] font-medium">This letter has {ex.extracted.lines.length} service lines. Choose the one to save as this agreement:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ex.extracted.lines.map((l, i) => (
                        <button key={i} type="button" onClick={() => { setLineIdx(i); applyLine(ex.extracted!, i); }} className={cx("rounded-md border px-2 py-1 text-[12px]", i === lineIdx ? "border-primary bg-primary-soft text-primary" : "border-line bg-page text-text hover:bg-hover")}>
                          Line {l.lineNumber ?? i + 1} · {l.procedureCode} {l.modifiers.join(" ")} · {l.quantity ?? "?"} units{l.status && !/approved/i.test(l.status) ? ` · ${l.status}` : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </FormSection>
      </form>

      <form action={submit}>
        <FormError message={state.message} />
        {ex.documentPath && <input type="hidden" name="documentPath" value={ex.documentPath} />}
        {ex.documentName && <input type="hidden" name="documentName" value={ex.documentName} />}
        <input type="hidden" name="serviceCode" value={serviceCode} />
        {modifiers.map((m) => <input key={m} type="hidden" name="modifiers[]" value={m} />)}

        <FormSection title="Authorization" description="From the DHS service agreement letter.">
          <Field label="Agreement number" error={e.agreementNumber} className="md:col-span-3"><Input name="agreementNumber" value={fields.agreementNumber} onChange={set("agreementNumber")} required /></Field>
          <Field label="Authorizing county" error={e.authorizingCounty} className="md:col-span-3"><Input name="authorizingCounty" value={fields.authorizingCounty} onChange={set("authorizingCounty")} required /></Field>
          <Field label="Start date" error={e.startDate} className="md:col-span-3"><Input name="startDate" type="date" value={fields.startDate} onChange={set("startDate")} required /></Field>
          <Field label="End date" error={e.endDate} className="md:col-span-3"><Input name="endDate" type="date" value={fields.endDate} onChange={set("endDate")} required /></Field>
        </FormSection>

        <FormSection title="Service" description="Procedure code and modifiers from DHS-3945 (April 2026). Picking a service fills in its standard modifiers; adjust if the letter differs.">
          <Field label="Service" error={e.serviceCode} className="col-span-2 md:col-span-6">
            <Select value={codeKey} onChange={(ev) => pickCode(ev.target.value)}>
              {SERVICE_CODES.map((s) => <option key={serviceCodeKey(s)} value={serviceCodeKey(s)}>{s.label} · {serviceCodeKey(s)}</option>)}
              <option value={OTHER}>Other code…</option>
            </Select>
          </Field>
          {codeKey === OTHER && (
            <Field label="HCPCS code" error={e.serviceCode} className="md:col-span-2"><Input value={otherCode} onChange={(ev) => setOtherCode(ev.target.value)} placeholder="T2016" className="uppercase" maxLength={5} /></Field>
          )}
          <div className="col-span-2 md:col-span-6">
            <span className="mb-1.5 block text-[13px] font-medium text-text">Modifiers <span className="font-normal text-muted-foreground">· up to four</span></span>
            <details className="group relative">
              <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-line bg-page px-3 hover:border-gray-400 [&::-webkit-details-marker]:hidden">
                {modifiers.length === 0 ? <span className="text-hint">No modifiers</span> : modifiers.map((m) => <span key={m} className="rounded bg-panel px-1.5 py-0.5 text-xs font-medium tabular-nums text-gray-700">{m}</span>)}
                <span className="ml-auto text-muted-foreground">▾</span>
              </summary>
              <div className="absolute left-0 top-10 z-20 max-h-72 w-full overflow-y-auto rounded-lg border border-line bg-card p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] md:w-[28rem]">
                {MODIFIERS.map((m) => (
                  <label key={m.code} className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-1.5 hover:bg-hover">
                    <input type="checkbox" checked={modifiers.includes(m.code)} onChange={() => toggleMod(m.code)} className="h-4 w-4 accent-[var(--primary)]" />
                    <span className="w-8 font-medium tabular-nums text-text-strong">{m.code}</span>
                    <span className="text-[13px] text-muted-foreground">{m.meaning}</span>
                  </label>
                ))}
              </div>
            </details>
            {e.modifiers && <span className="mt-1.5 block text-xs text-danger">{e.modifiers}</span>}
            <div className="mt-2 text-[13px] text-muted-foreground">Claim line: <span className="font-medium tabular-nums text-text-strong">{serviceCode || "—"}{modifiers.length ? ` ${modifiers.join(" ")}` : ""}</span></div>
          </div>
        </FormSection>

        <FormSection title="Units and rate" description="All units are 15 minutes. Units burn down as visits complete.">
          <Field label="Authorized units" error={e.authorizedUnits} hint="15-minute units" className="md:col-span-3"><Input name="authorizedUnits" type="number" min={1} step={1} value={fields.authorizedUnits} onChange={set("authorizedUnits")} required /></Field>
          <Field label="Rate per unit" error={e.unitRate} className="md:col-span-3"><Input name="unitRate" type="number" min={0.01} step={0.01} placeholder="0.00" value={fields.unitRate} onChange={set("unitRate")} required /></Field>
        </FormSection>

        <FormActions>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save agreement"}</Button>
          <LinkButton href={cancelHref} variant="ghost">Cancel</LinkButton>
        </FormActions>
      </form>
    </div>
  );
}
