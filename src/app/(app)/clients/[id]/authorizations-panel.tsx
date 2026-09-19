"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, cx } from "@/components/kit";
import { MarginSection, UnitsLeft } from "@/components/chart";
import { Icon } from "@/components/icons";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { labelForCode } from "@/lib/hcpcs";
import { fmtDate, fmtDateNum, fmtMoney } from "@/lib/format";
import { createAgreement, extractAgreement, updateAgreement } from "../actions";
import { AgreementEditForm } from "./agreements/[agreementId]/edit-form";
import { AgreementForm } from "./agreements/new/agreement-form";
import { AgreementArchiveButton, AgreementStatusButton } from "./agreement-status";

export interface AuthorizationItem {
  id: string; agreementNumber: string; serviceCode: string; modifiers: string[]; authorizedUnits: number; unitsUsed: number;
  unitRate: string; startDate: string; endDate: string; authorizingCounty: string; status: string; documentPath: string | null; documentName: string | null;
}

/**
 * The Overview's authorizations card. Everything happens on this page (user, 2026-09-18): a row opens
 * the agreement in a side panel for editing, and "Add" opens the new-agreement form the same way.
 */
export function AuthorizationsPanel({ personId, manage, defaultCounty, aiReady, items }: { personId: string; manage: boolean; defaultCounty: string; aiReady: boolean; items: AuthorizationItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const done = () => { setOpen(null); router.refresh(); };
  const current = items.find((a) => a.id === open);

  const cols = "grid grid-cols-[minmax(0,1fr)_100px_250px_100px] items-center gap-x-5";
  const row = (a: AuthorizationItem) => (
    <>
      <span className="truncate text-[14px] font-medium text-text-strong">{labelForCode(a.serviceCode, a.modifiers)}</span>
      <span className="ident text-[14px] text-muted-foreground">{a.serviceCode}{a.modifiers.length ? " " + a.modifiers.join(" ") : ""}</span>
      <UnitsLeft used={a.unitsUsed} total={a.authorizedUnits} code={a.serviceCode} />
      <span className="ident text-[14px] text-muted-foreground">{fmtDateNum(a.endDate)}</span>
    </>
  );
  const rowCls = cx(cols, "w-full border-t border-line-soft py-2.5 text-left first:border-t-0");

  return (
    <>
      <MarginSection label="Authorizations" action={manage && <button type="button" onClick={() => setOpen("new")} className="hover:underline">Manage →</button>}>
        {items.length === 0 ? (
          <p className="py-2 text-[14px] text-muted-foreground">No active authorization. Notes cannot be recorded until one exists.</p>
        ) : (
          <div>
            <div className={cx(cols, "pb-1.5 text-[12.5px] text-muted-foreground")}><span>Service</span><span>Service code</span><span>Units left</span><span>Through</span></div>
            {items.map((a) => manage
              ? <button key={a.id} type="button" onClick={() => setOpen(a.id)} className={cx(rowCls, "hover:bg-sidebar")}>{row(a)}</button>
              : <div key={a.id} className={rowCls}>{row(a)}</div>)}
          </div>
        )}
      </MarginSection>

      {open && (
        <Sheet open onOpenChange={(o) => { if (!o) setOpen(null); }}>
          <SheetContent side="right" showCloseButton={false} className="w-full overflow-y-auto p-0 data-[side=right]:sm:max-w-[760px]">
            <SheetTitle className="sr-only">{current ? `Agreement ${current.agreementNumber}` : "New service agreement"}</SheetTitle>
            <div className="flex items-center gap-3 border-b border-line px-6 py-4">
              <div className="min-w-0">
                <div className="text-[19px] font-semibold text-text-strong">{current ? labelForCode(current.serviceCode, current.modifiers) : "New service agreement"}</div>
                {current && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                    <span className="ident">{current.agreementNumber}</span><span>·</span>
                    <span className="ident">{current.unitsUsed.toLocaleString()} of {current.authorizedUnits.toLocaleString()} units used</span><span>·</span>
                    <span>{fmtDate(current.startDate)} – {fmtDate(current.endDate)}</span><span>·</span>
                    <span>{fmtMoney(current.unitRate)} / unit</span>
                    <Badge tone={current.status === "active" ? "ok" : current.status === "cancelled" ? "danger" : "neutral"}>{current.status}</Badge>
                    {current.documentPath && <a href={`/agreements/${current.id}/document`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{current.documentName ?? "Letter PDF"}</a>}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-hover hover:text-text-strong"><Icon.plus size={17} className="rotate-45" /></button>
            </div>
            <div className="px-6 py-5">
              {current ? (
                <>
                  <AgreementEditForm
                    key={current.id}
                    action={updateAgreement.bind(null, current.id, personId)}
                    defaults={{ agreementNumber: current.agreementNumber, serviceCode: current.serviceCode, modifiers: current.modifiers, authorizedUnits: current.authorizedUnits, unitRate: current.unitRate, startDate: current.startDate, endDate: current.endDate, authorizingCounty: current.authorizingCounty, status: current.status }}
                    cancelHref={`/clients/${personId}`}
                    onSaved={done}
                    onCancel={() => setOpen(null)}
                  />
                  <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line-soft pt-4 text-[13px]">
                    <span className="text-muted-foreground">Every change is kept in the history.</span>
                    <span className="ml-auto flex gap-4"><AgreementStatusButton id={current.id} personId={personId} status={current.status} />{current.status !== "active" && <AgreementArchiveButton id={current.id} personId={personId} archived={false} />}</span>
                  </div>
                </>
              ) : (
                <AgreementForm action={createAgreement.bind(null, personId)} extract={extractAgreement.bind(null, personId)} cancelHref={`/clients/${personId}`} defaultCounty={defaultCounty} aiReady={aiReady} onSaved={done} onCancel={() => setOpen(null)} />
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
