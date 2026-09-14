"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Notice, PageHeader, Properties } from "@/components/kit";
import type { EvvProviderProfile, EvvSubmission } from "@/db/schema";
import type { HealthResult } from "@/evv/adapters/types";
import { SUBMISSION } from "@/evv/labels";
import { fmtDateTime } from "@/lib/format";
import { reconcileAction, runQueueAction } from "./actions";

type Names = { person: Record<string, string>; staff: Record<string, string> };

export function IntegrationTab({ adapterKey, health, profile, identifierCount, submissions, names }: { adapterKey: string; health: HealthResult; profile: EvvProviderProfile; identifierCount: number; submissions: EvvSubmission[]; names: Names }) {
  void names;
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok?: boolean; message?: string }>) => start(async () => { const r = await fn(); if (r.ok) toast.success(r.message ?? "Done."); else toast.error(r.message ?? "Failed."); });
  const productionActive = health.ok && health.environment === "production" && profile.productionEnabled;
  const readiness: string[] = [];
  if (!profile.medicaidProviderId) readiness.push("Minnesota Medicaid provider ID is not entered (Settings).");
  if (!identifierCount) readiness.push("No NPI or UMPI recorded (Settings).");
  if (!profile.hhaxProviderId) readiness.push("HHAeXchange provider identifier is not entered — assigned at onboarding.");

  return (
    <div>
      <PageHeader title="Aggregator integration" meta={<span>How visits reach the Minnesota HHAeXchange aggregator, and whether that path is live.</span>} actions={<div className="flex gap-2"><Button variant="secondary" disabled={pending} onClick={() => run(runQueueAction)}>Run queue now</Button><Button variant="secondary" disabled={pending} onClick={() => run(reconcileAction)}>Reconcile now</Button></div>} />

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
            <div className="text-[13px]">Until DHS and HHAeXchange provide the specification and credentials, the adapter fails closed: nothing is transmitted and no visit is ever shown as accepted. The external steps are listed in <code>docs/evv-hhax-integration-checklist.md</code>.</div>
          </Notice>
        </Card>
      </div>

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
