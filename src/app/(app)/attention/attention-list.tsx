"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Input, cx } from "@/components/kit";
import { Icon } from "@/components/icons";
import { bulkCancelShifts, bulkConfirmManualEvidence, bulkRecordUnableToSign, undoBulk } from "./actions";

export interface Row { id?: string; kind: string; severity: string; title: string; detail: string; href: string }
export interface Group { kind: string; label: string; icon: keyof typeof Icon; rows: Row[] }

/** Kinds that can be fixed in a batch, and what the batch does. */
const BULK: Record<string, { verb: string; needsReason?: string; hint: string; confirm: (n: number) => string }> = {
  unsigned: { verb: "Record reason", needsReason: "Why the client could not sign", hint: "Recording why the client could not sign clears the note for billing.", confirm: (n) => `Write this reason on ${n} note${n === 1 ? "" : "s"}?` },
  manual: { verb: "Confirm evidence", hint: "Confirms the paper or verbal backup for these manual entries is on file.", confirm: (n) => `Confirm evidence on ${n} manual entr${n === 1 ? "y" : "ies"}?` },
  missed_shift: { verb: "Cancel shifts", hint: "Marks these shifts cancelled so the calendar and this list stop counting them.", confirm: (n) => `Cancel ${n} shift${n === 1 ? "" : "s"}? Each one can be put back with Undo.` },
};

export function AttentionList({ groups }: { groups: Group[] }) {
  const [picked, setPicked] = useState<Record<string, Set<string>>>({});
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const chosen = (kind: string) => picked[kind] ?? new Set<string>();
  const toggle = (kind: string, id: string) =>
    setPicked((cur) => {
      const next = new Set(cur[kind] ?? []);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...cur, [kind]: next };
    });
  const toggleAll = (kind: string, rows: Row[]) =>
    setPicked((cur) => {
      const ids = rows.map((r) => r.id).filter(Boolean) as string[];
      const all = (cur[kind]?.size ?? 0) === ids.length;
      return { ...cur, [kind]: new Set(all ? [] : ids) };
    });

  const run = (kind: string) =>
    start(async () => {
      const ids = [...chosen(kind)];
      const r =
        kind === "unsigned" ? await bulkRecordUnableToSign(ids, reason)
        : kind === "manual" ? await bulkConfirmManualEvidence(ids)
        : await bulkCancelShifts(ids);
      setConfirming(null);
      if (/^(Nothing|Say )/.test(r.message ?? "")) { toast.error(r.message); return; }
      const undo = r.undo;
      toast.success(r.message ?? "Done", undo ? { action: { label: "Undo", onClick: () => start(async () => { const u = await undoBulk(undo); toast.success(u.message ?? "Undone."); }) }, duration: 12000 } : undefined);
      setPicked((cur) => ({ ...cur, [kind]: new Set() }));
      setReason("");
    });

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const Ic = Icon[g.icon];
        const bulk = BULK[g.kind];
        const selectable = bulk ? g.rows.filter((r) => r.id) : [];
        const sel = chosen(g.kind);
        return (
          <Card
            key={g.kind}
            title={g.label}
            description={bulk ? bulk.hint : undefined}
            actions={
              <span className="flex items-center gap-2">
                {selectable.length > 1 && (
                  <button type="button" onClick={() => toggleAll(g.kind, selectable)} className="text-[12.5px] font-medium text-primary hover:underline">
                    {sel.size === selectable.length ? "Clear" : "Select all"}
                  </button>
                )}
                <Badge tone={g.rows.some((r) => r.severity === "danger") ? "danger" : "warn"}>{g.rows.length}</Badge>
              </span>
            }
          >
            <ul className="divide-y divide-line-soft">
              {g.rows.map((r, n) => {
                const canPick = Boolean(bulk && r.id);
                const on = Boolean(r.id && sel.has(r.id));
                return (
                  <li key={r.id ?? n} className={cx("flex items-start gap-3 px-5 py-3", on ? "bg-primary-soft/40" : "hover:bg-hover")}>
                    {canPick ? (
                      <input type="checkbox" checked={on} onChange={() => toggle(g.kind, r.id!)} aria-label={`Select ${r.title}`} className="mt-1.5 h-[17px] w-[17px] shrink-0 rounded border-line accent-[var(--primary)]" />
                    ) : (
                      <span className={cx("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md", r.severity === "danger" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn")}><Ic size={15} /></span>
                    )}
                    <Link href={r.href} className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-text-strong">{r.title}</span>
                        {r.detail && <span className="block text-[13px] text-muted-foreground">{r.detail}</span>}
                      </span>
                      <Icon.chevronRight size={16} className="mt-1 shrink-0 text-gray-400" />
                    </Link>
                  </li>
                );
              })}
            </ul>

            {bulk && sel.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line-soft bg-sidebar px-5 py-3">
                <span className="text-[13px] font-medium text-text-strong">{sel.size} selected</span>
                {bulk.needsReason && confirming !== g.kind && <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={bulk.needsReason} className="h-8 w-64 text-[13px]" />}
                {confirming === g.kind ? (
                  <>
                    <span className="text-[13px] text-text">{bulk.confirm(sel.size)}</span>
                    <Button disabled={pending} onClick={() => run(g.kind)}>{pending ? "Working…" : "Yes, do it"}</Button>
                    <Button variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>Back</Button>
                  </>
                ) : (
                  <>
                    <Button disabled={pending || (Boolean(bulk.needsReason) && reason.trim().length < 3)} onClick={() => setConfirming(g.kind)}>{bulk.verb}</Button>
                    <Button variant="ghost" disabled={pending} onClick={() => setPicked((cur) => ({ ...cur, [g.kind]: new Set() }))}>Cancel</Button>
                  </>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
