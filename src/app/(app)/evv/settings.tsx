"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Checkbox, Field, FormError, Input, PageHeader, Select, Textarea } from "@/components/kit";
import type { EvvLiveInRelationship, EvvPayer, EvvPolicy, EvvProviderIdentifier, EvvProviderProfile, EvvServiceRule } from "@/db/schema";
import { fmtDate } from "@/lib/format";
import type { ActionState } from "@/lib/validation";
import { addIdentifierAction, addLiveInAction, addPayerAction, addRuleAction, endLiveInAction, retireRuleAction, saveProviderAction, savePolicyAction, toggleIdentifierAction } from "./actions";
import { DateInput } from "@/components/date-input";

function useToast(state: ActionState) {
  useEffect(() => { if (state.ok) toast.success(state.message ?? "Saved."); else if (state.message && !state.errors) toast.error(state.message); }, [state]);
}
type Opt = { id: string; name: string };

/** Everything an admin configures for EVV. Every tolerance and every rule lives here, not in code. */
export function SettingsTab({ profile, identifiers, payers, policy, rules, liveIns, people, staff }: { profile: EvvProviderProfile; identifiers: EvvProviderIdentifier[]; payers: EvvPayer[]; policy: EvvPolicy; rules: EvvServiceRule[]; liveIns: EvvLiveInRelationship[]; people: Opt[]; staff: Opt[] }) {
  return (
    <div>
      <PageHeader title="EVV settings" meta={<span>Provider enrollment data, the Minnesota policy tolerances, which services require EVV, and documented live-in caregivers.</span>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ProviderForm profile={profile} />
        <IdentifiersCard identifiers={identifiers} payers={payers} />
      </div>
      <PolicyForm policy={policy} />
      <RulesCard rules={rules} />
      <LiveInCard liveIns={liveIns} people={people} staff={staff} />
    </div>
  );
}

function ProviderForm({ profile }: { profile: EvvProviderProfile }) {
  const [state, action, pending] = useActionState(saveProviderAction, {});
  useToast(state);
  const e = state.errors ?? {};
  return (
    <Card title="Provider enrollment" description="What DHS and the aggregator evaluate compliance against" padded>
      <form action={action} className="grid gap-3 sm:grid-cols-2">
        <FormError message={state.errors ? state.message : undefined} />
        <Field label="Legal provider name" error={e.legalName} className="sm:col-span-2"><Input name="legalName" defaultValue={profile.legalName} required /></Field>
        <Field label="Federal tax ID (EIN)" error={e.federalTaxId}><Input name="federalTaxId" defaultValue={profile.federalTaxId} placeholder="41-1234567" required /></Field>
        <Field label="Minnesota Medicaid provider ID" hint="MHCP provider number"><Input name="medicaidProviderId" defaultValue={profile.medicaidProviderId ?? ""} /></Field>
        <Field label="HHAeXchange provider identifier" hint="Assigned at HHAX onboarding"><Input name="hhaxProviderId" defaultValue={profile.hhaxProviderId ?? ""} /></Field>
        <Field label="EVV system"><Select name="evvSystem" defaultValue={profile.evvSystem}><option value="third_party">EVVora (third-party system)</option><option value="hhax_direct">HHAeXchange directly</option></Select></Field>
        <div className="sm:col-span-2 -mx-3"><Checkbox name="productionEnabled" value="true" defaultChecked={profile.productionEnabled} label={<span>Production submission enabled<span className="block text-[13px] text-muted-foreground">Only after sandbox testing and production credentials. The environment flag must also be on.</span></span>} /></div>
        <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save provider details"}</Button></div>
      </form>
    </Card>
  );
}

function IdentifiersCard({ identifiers, payers }: { identifiers: EvvProviderIdentifier[]; payers: EvvPayer[] }) {
  const [idState, addId, idPending] = useActionState(addIdentifierAction, {});
  const [payState, addPayer, payPending] = useActionState(addPayerAction, {});
  useToast(idState); useToast(payState);
  const [pending, start] = useTransition();
  return (
    <Card title="Identifiers and payers" description="Every NPI and UMPI on the tax ID, and the payers you bill" padded>
      <ul className="mb-3 divide-y divide-line-soft rounded-lg border border-line">
        {identifiers.length === 0 && <li className="px-3 py-2 text-[13px] text-muted-foreground">No NPI or UMPI yet.</li>}
        {identifiers.map((i) => <li key={i.id} className="flex items-center gap-3 px-3 py-2 text-[13.5px]"><Badge>{i.type.toUpperCase()}</Badge><span className="tabular-nums text-text-strong">{i.value}</span><span className="text-muted-foreground">{i.label}</span><button type="button" disabled={pending} onClick={() => start(async () => { const r = await toggleIdentifierAction(i.id, !i.active); if (!r.ok) toast.error(r.message ?? "Failed."); })} className="ml-auto text-[13px] font-medium text-primary hover:underline">{i.active ? "Deactivate" : "Reactivate"}</button></li>)}
      </ul>
      <form action={addId} className="mb-5 flex flex-wrap items-end gap-2">
        <Field label="Type"><Select name="type" defaultValue="npi"><option value="npi">NPI</option><option value="umpi">UMPI</option></Select></Field>
        <Field label="Number" error={idState.errors?.value}><Input name="value" required className="w-40" /></Field>
        <Field label="Label"><Input name="label" placeholder="Group NPI" className="w-36" /></Field>
        <Button type="submit" variant="secondary" disabled={idPending}>Add</Button>
      </form>
      <ul className="mb-3 divide-y divide-line-soft rounded-lg border border-line">
        {payers.map((p) => <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-[13.5px]"><span className="text-text-strong">{p.name}</span><Badge>{p.kind === "mco" ? "MCO" : p.kind === "medicaid_ffs" ? "Medicaid FFS" : "Other"}</Badge>{p.isDefault && <Badge tone="accent">default</Badge>}{!p.active && <Badge>inactive</Badge>}{p.externalPayerId && <span className="text-muted-foreground">{p.externalPayerId}</span>}</li>)}
      </ul>
      <form action={addPayer} className="flex flex-wrap items-end gap-2">
        <Field label="Payer" error={payState.errors?.name}><Input name="name" required className="w-48" placeholder="Blue Plus, UCare…" /></Field>
        <Field label="Kind"><Select name="kind" defaultValue="mco"><option value="medicaid_ffs">Medicaid FFS</option><option value="mco">MCO</option><option value="other">Other</option></Select></Field>
        <Field label="Aggregator payer ID"><Input name="externalPayerId" className="w-32" /></Field>
        <label className="flex h-9 items-center gap-2 text-[13px]"><input type="checkbox" name="isDefault" value="true" className="size-4 accent-[var(--primary)]" /> Default</label>
        <Button type="submit" variant="secondary" disabled={payPending}>Add</Button>
      </form>
    </Card>
  );
}

const N = ({ name, label, hint, value }: { name: keyof EvvPolicy; label: string; hint?: string; value: number }) => <Field label={label} hint={hint}><Input type="number" name={name} defaultValue={value} required /></Field>;

function PolicyForm({ policy }: { policy: EvvPolicy }) {
  const [state, action, pending] = useActionState(savePolicyAction, {});
  useToast(state);
  return (
    <Card title="Minnesota policy" description="Every tolerance the compliance engine applies. Set them from the DHS compliance policy; nothing here is hardcoded." className="mt-4" padded>
      <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormError message={state.errors ? state.message : undefined} />
        <N name="geofenceMeters" label="Home geofence (m)" hint="Distance from the client's home that still counts as home" value={policy.geofenceMeters} />
        <N name="maxAccuracyMeters" label="Max GPS accuracy (m)" hint="A fix vaguer than this cannot place the caregiver" value={policy.maxAccuracyMeters} />
        <N name="realTimeToleranceMinutes" label="Real-time window (min)" hint="Device-to-server delay beyond this is not real time" value={policy.realTimeToleranceMinutes} />
        <N name="maxFutureSkewMinutes" label="Max future clock skew (min)" value={policy.maxFutureSkewMinutes} />
        <N name="minVisitMinutes" label="Shortest plausible visit (min)" value={policy.minVisitMinutes} />
        <N name="maxVisitMinutes" label="Longest plausible visit (min)" value={policy.maxVisitMinutes} />
        <N name="submissionDeadlineDay" label="Monthly deadline (day of month)" hint="DHS: the 14th of the following month" value={policy.submissionDeadlineDay} />
        <N name="deadlineWarningDays" label="Warn this many days before" value={policy.deadlineWarningDays} />
        <N name="maxSubmissionAttempts" label="Max submission attempts" value={policy.maxSubmissionAttempts} />
        <N name="ackTimeoutHours" label="Acknowledgment timeout (h)" value={policy.ackTimeoutHours} />
        <div className="-mx-3 sm:col-span-2"><Checkbox name="liveInNonRealTimeAllowed" value="true" defaultChecked={policy.liveInNonRealTimeAllowed} label="Live-in daily entries may be captured outside real time" /></div>
        <div className="-mx-3 sm:col-span-2"><Checkbox name="billingHoldOnNoncompliant" value="true" defaultChecked={policy.billingHoldOnNoncompliant} label={<span>Hold billing on noncompliant visits<span className="block text-[13px] text-muted-foreground">Off: they bill with a warning, per your claims-review process.</span></span>} /></div>
        <div className="sm:col-span-2 lg:col-span-4"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save policy"}</Button></div>
      </form>
    </Card>
  );
}

const UNIT: Record<string, string> = { fifteen_minute: "15-minute", hourly: "hourly", daily: "daily", per_visit: "per visit" };

function RulesCard({ rules }: { rules: EvvServiceRule[] }) {
  const [state, action, pending] = useActionState(addRuleAction, {});
  useToast(state);
  const [adding, setAdding] = useState(false);
  const [supersedes, setSupersedes] = useState<EvvServiceRule | null>(null);
  const [tPending, start] = useTransition();
  const active = rules.filter((r) => r.active).sort((a, b) => a.serviceCode.localeCompare(b.serviceCode) || a.requiredModifiers.length - b.requiredModifiers.length);
  const retired = rules.filter((r) => !r.active);
  const e = state.errors ?? {};
  const source = active[0]?.sourceUrl ?? rules[0]?.sourceUrl;
  return (
    <Card title="Services that require EVV" description={`The code + modifier combinations the state lists. ${active.length} active${retired.length ? `, ${retired.length} retired` : ""}.`} className="mt-4" actions={<Button variant="secondary" onClick={() => { setSupersedes(null); setAdding((v) => !v); }}>{adding ? "Close" : "Add rule"}</Button>}>
      {source && <p className="px-5 pt-3 text-[13px] text-muted-foreground">Seeded from <a href={source} target="_blank" rel="noreferrer" className="text-primary hover:underline">the DHS EVV page</a>{active[0]?.sourceEffectiveDate ? `, list dated ${fmtDate(active[0].sourceEffectiveDate)}` : ""}. Re-check it when DHS republishes.</p>}
      {(adding || supersedes) && (
        <form action={action} className="m-5 rounded-xl border border-primary bg-primary-soft/30 p-4">
          <div className="mb-3 text-[15px] font-semibold text-text-strong">{supersedes ? `New version of ${supersedes.serviceCode} ${supersedes.requiredModifiers.join(" ")}` : "New rule"}</div>
          {supersedes && <input type="hidden" name="supersedesId" value={supersedes.id} />}
          <FormError message={state.errors ? state.message : undefined} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="HCPCS code" error={e.serviceCode}><Input name="serviceCode" defaultValue={supersedes?.serviceCode ?? ""} required className="uppercase" /></Field>
            <Field label="Required modifiers" hint="Space separated"><Input name="requiredModifiers" defaultValue={supersedes?.requiredModifiers.join(" ") ?? ""} placeholder="UC U3" /></Field>
            <Field label="Excluded modifiers"><Input name="excludedModifiers" defaultValue={supersedes?.excludedModifiers.join(" ") ?? ""} placeholder="UN" /></Field>
            <Field label="Unit type"><Select name="unitType" defaultValue={supersedes?.unitType ?? "fifteen_minute"}>{Object.entries(UNIT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Label" error={e.label} className="sm:col-span-2"><Input name="label" defaultValue={supersedes?.label ?? ""} required /></Field>
            <Field label="Effective from" error={e.effectiveFrom}><DateInput name="effectiveFrom" required /></Field>
            <Field label="Effective to"><DateInput name="effectiveTo" /></Field>
            <Field label="Source URL" className="sm:col-span-2"><Input name="sourceUrl" defaultValue={supersedes?.sourceUrl ?? ""} placeholder="https://mn.gov/dhs/…" /></Field>
            <Field label="Source label" className="sm:col-span-2"><Input name="sourceLabel" defaultValue={supersedes?.sourceLabel ?? ""} placeholder="DHS bulletin, date" /></Field>
            <div className="-mx-3 flex flex-wrap gap-4 sm:col-span-2 lg:col-span-4">
              <Checkbox name="requiresEvv" value="true" defaultChecked={supersedes?.requiresEvv ?? true} label="Requires EVV" />
              <Checkbox name="sharedCare" value="true" defaultChecked={supersedes?.sharedCare ?? false} label="Shared care" />
              <Checkbox name="allowAdditionalModifiers" value="true" defaultChecked={supersedes?.allowAdditionalModifiers ?? true} label="Extra modifiers still match" />
            </div>
          </div>
          <div className="mt-3 flex gap-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save rule"}</Button><Button type="button" variant="ghost" onClick={() => { setAdding(false); setSupersedes(null); }}>Cancel</Button></div>
        </form>
      )}
      <ul className="divide-y divide-line-soft">
        {active.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-[13.5px]">
            <span className="w-40 shrink-0 font-medium tabular-nums text-text-strong">{r.serviceCode} {r.requiredModifiers.join(" ")}{r.excludedModifiers.length ? <span className="font-normal text-muted-foreground"> not {r.excludedModifiers.join(" ")}</span> : null}</span>
            <span className="min-w-0 flex-1 text-text">{r.label}</span>
            <Badge>{UNIT[r.unitType]}</Badge>{r.sharedCare && <Badge tone="accent">shared care</Badge>}{!r.requiresEvv && <Badge tone="warn">exempt</Badge>}
            <span className="text-[13px] text-muted-foreground">from {fmtDate(r.effectiveFrom)}{r.effectiveTo ? ` to ${fmtDate(r.effectiveTo)}` : ""} · v{r.version}</span>
            <span className="flex gap-2 text-[13px]"><button type="button" onClick={() => { setAdding(false); setSupersedes(r); }} className="font-medium text-primary hover:underline">New version</button><button type="button" disabled={tPending} onClick={() => { if (confirm(`Retire ${r.serviceCode} ${r.requiredModifiers.join(" ")}? Visits already classified keep their rule.`)) start(async () => { const x = await retireRuleAction(r.id); if (x.ok) toast.success(x.message); else toast.error(x.message ?? "Failed."); }); }} className="font-medium text-danger hover:underline">Retire</button></span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function LiveInCard({ liveIns, people, staff }: { liveIns: EvvLiveInRelationship[]; people: Opt[]; staff: Opt[] }) {
  const [state, action, pending] = useActionState(addLiveInAction, {});
  useToast(state);
  const [tPending, start] = useTransition();
  const name = (list: Opt[], id: string) => list.find((o) => o.id === id)?.name ?? "—";
  return (
    <Card title="Live-in caregivers" description="Only a documented, effective-dated relationship makes a visit exempt. A live-in claim without one is treated as a manual entry." className="mt-4">
      <ul className="divide-y divide-line-soft">
        {liveIns.length === 0 && <li className="px-5 py-3 text-[13px] text-muted-foreground">None recorded.</li>}
        {liveIns.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-[13.5px]"><span className="font-medium text-text-strong">{name(staff, r.staffId)}</span><span className="text-muted-foreground">lives with</span><span className="font-medium text-text-strong">{name(people, r.personId)}</span><span className="text-muted-foreground">{fmtDate(r.effectiveFrom)}{r.effectiveTo ? ` – ${fmtDate(r.effectiveTo)}` : " – open"}</span><span className="text-[13px] text-muted-foreground">{r.documentationRef}</span>{!r.effectiveTo && <button type="button" disabled={tPending} onClick={() => { const d = window.prompt("End date (YYYY-MM-DD)", new Date().toISOString().slice(0, 10)); if (d) start(async () => { const x = await endLiveInAction(r.id, d); if (x.ok) toast.success(x.message); else toast.error(x.message ?? "Failed."); }); }} className="ml-auto text-[13px] font-medium text-danger hover:underline">End</button>}</li>)}
      </ul>
      <form action={action} className="border-t border-line-soft bg-sidebar px-5 py-4">
        <div className="mb-3 text-[13px] font-medium text-text-strong">Record a live-in relationship</div>
        <FormError message={state.errors ? state.message : undefined} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Caregiver"><Select name="staffId" required>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Client"><Select name="personId" required>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="From"><DateInput name="effectiveFrom" required /></Field>
          <Field label="To"><DateInput name="effectiveTo" /></Field>
          <div className="flex items-end"><Button type="submit" variant="secondary" disabled={pending} className="h-9 w-full">Record</Button></div>
          <Field label="Documentation" hint="Where the signed live-in documentation is filed" className="sm:col-span-2 lg:col-span-3"><Input name="documentationRef" required placeholder="Personnel file · live-in attestation 2026-09-01" /></Field>
          <Field label="Note" className="sm:col-span-2"><Textarea name="note" className="min-h-9" /></Field>
        </div>
      </form>
    </Card>
  );
}
