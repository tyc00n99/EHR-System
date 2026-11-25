"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Notice, Properties } from "@/components/kit";
import type { EvvProviderProfile, EvvSubmission } from "@/db/schema";
import type { HealthResult } from "@/evv/adapters/types";
import { SUBMISSION } from "@/evv/labels";
import { fmtDateTime } from "@/lib/format";
import { reconcileAction, runQueueAction } from "./actions";

type Names = { person: Record<string, string>; staff: Record<string, string> };

type Payer = { name: string; externalPayerId: string | null };
type Sync = { staffId: string; status: string; message: string | null; syncedAt: Date | null };

export function IntegrationTab({ adapterKey, health, profile, identifierCount, submissions, names, payers, caregiverSyncs }: { adapterKey: string; health: HealthResult; profile: EvvProviderProfile; identifierCount: number; submissions: EvvSubmission[]; names: Names; payers: Payer[]; caregiverSyncs: Sync[] }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok?: boolean; message?: string }>) => start(async () => { const r = await fn(); if (r.ok) toast.success(r.message ?? "Done."); else toast.error(r.message ?? "Failed."); });
  const productionActive = health.ok && health.environment === "production" && profile.productionEnabled;
  const readiness: string[] = [];
  if (!profile.medicaidProviderId) readiness.push("Minnesota Medicaid provider ID is not entered (Settings → EVV).");
  if (!identifierCount) readiness.push("No NPI or UMPI recorded (Settings → EVV).");
  if (!profile.federalTaxId) readiness.push("Federal tax ID is not entered (Settings → EVV). HHAeXchange identifies the agency by it.");
  if (profile.officeQualifier !== "FederalTaxID" && !profile.officeIdentifier) readiness.push(`Office identifier (${profile.officeQualifier}) is not entered (Settings → EVV).`);
  if (!payers.length) readiness.push("No active payer (Settings → EVV).");
  for (const p of payers) if (!p.externalPayerId) readiness.push(`Payer “${p.name}” has no HHAeXchange payer ID (MIWS for Waiver Services FFS).`);
  if (profile.evvSystem === "hhax_direct") readiness.push("EVV system is set to HHAeXchange directly, so EVVora will not send visits. Choose EVVora to submit from here.");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-muted-foreground">How visits reach the Minnesota HHAeXchange aggregator, and whether that path is live.</p>
        <div className="flex gap-2"><Button variant="secondary" disabled={pending} onClick={() => run(runQueueAction)}>Run queue now</Button><Button variant="secondary" disabled={pending} onClick={() => run(reconcileAction)}>Reconcile now</Button></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Status" padded>
          <Properties items={[
            { label: "Adapter", value: adapterKey === "mock" ? "Mock (nothing leaves the server)" : "Minnesota HHAeXchange" },
            { label: "Environment", value: <Badge tone={health.environment === "production" ? "ok" : "neutral"}>{health.environment}</Badge> },
            { label: "Configured", value: health.configured ? "Yes" : "No" },
            { label: "Submission flag", value: health.submissionEnabled ? "On" : "Off" },
            { label: "Provider production switch", value: profile.productionEnabled ? "On" : "Off" },
            { label: "Production submission", value: <Badge tone={productionActive ? "ok" : "warn"}>{productionActive ? "Active" : "Not active"}</Badge> },
          ]} />
          {health.problems.length > 0 && <ul className="mt-4 space-y-1 text-[13px] text-muted-foreground">{health.problems.map((p) => <li key={p}>· {p}</li>)}</ul>}
        </Card>
        <Card title="Provider readiness" padded>
          {readiness.length === 0 ? <p className="text-[13px] text-ok">Provider enrollment data is complete.</p> : <ul className="space-y-1 text-[13px] text-warn">{readiness.map((r) => <li key={r}>· {r}</li>)}</ul>}
          <Notice tone="accent">
            <div className="text-[13px]">Built to the HHAeXchange Minnesota specification (rev. 10/28/2024). Visits are sent when the caregiver clocks out and after every correction or void, and the caregiver record goes first. Without the HHAX client ID, secret and scope the adapter fails closed: nothing is transmitted and no visit is shown as accepted. The external steps are listed in <code>docs/evv-hhax-integration-checklist.md</code>.</div>
          </Notice>
        </Card>
      </div>

      <Card title="Caregivers sent to HHAeXchange" description="A caregiver record goes before that caregiver's first visit, and again only when it changes" className="mt-4">
        {caregiverSyncs.length === 0 ? <p className="px-5 py-4 text-[13px] text-muted-foreground">No caregiver has been sent yet.</p> : (
          <ul className="divide-y divide-line-soft">
            {caregiverSyncs.map((c) => <li key={c.staffId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-[13px]"><span className="font-medium">{names.staff[c.staffId] ?? "Caregiver"}</span><Badge tone={c.status === "synced" ? "ok" : c.status === "blocked" ? "warn" : "danger"}>{c.status === "synced" ? "Sent" : c.status === "blocked" ? "Waiting" : "Rejected"}</Badge>{c.syncedAt && <span className="text-muted-foreground">{fmtDateTime(c.syncedAt)}</span>}{c.message && c.status !== "synced" && <span className="text-danger">{c.message}</span>}</li>)}
          </ul>
        )}
      </Card>

      <Card title="Recent submissions" description="Latest twenty, any status" className="mt-4">
        {submissions.length === 0 ? <p className="px-5 py-4 text-[13px] text-muted-foreground">Nothing has been queued yet.</p> : (
          <ul className="divide-y divide-line-soft">
            {submissions.map((s) => <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-[13px]"><a href={`/evv?visit=${s.evvVisitId}`} className="font-medium text-primary hover:underline">Visit v{s.visitVersion} · {s.operation}</a><Badge tone={SUBMISSION[s.status].tone}>{SUBMISSION[s.status].label}</Badge><span className="text-muted-foreground">{s.attemptCount} attempt{s.attemptCount === 1 ? "" : "s"} · {fmtDateTime(s.updatedAt)}</span>{s.externalReferenceId && <span className="text-muted-foreground">ref {s.externalReferenceId}</span>}{s.rejectionMessage && <span className="text-danger">{s.rejectionMessage}</span>}</li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}
