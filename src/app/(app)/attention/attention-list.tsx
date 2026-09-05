"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Empty, Input, Select, cx } from "@/components/kit";
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

export function AttentionList({ groups, initialKind = "all" }: { groups: Group[]; initialKind?: string }) {
  const [kind, setKind] = useState(initialKind);
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const allRows = groups.flatMap((g) => g.rows);
  const filtered = groups.filter((g) => kind === "all" || g.kind === kind).map((g) => ({
    ...g, rows: g.rows.filter((r) => (severity === "all" || r.severity === severity) && (r.title + " " + r.detail).toLowerCase().includes(query.toLowerCase().trim())),
  })).filter((g) => g.rows.length);
  const visibleCount = filtered.reduce((n, g) => n + g.rows.length, 0);
  const resetSelection = () => { setPicked({}); setReason(""); };

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
      const all = ids.every((id) => cur[kind]?.has(id));
      return { ...cur, [kind]: new Set(all ? [] : ids) };
    });

  const run = (kind: string) =>
    start(async () => {
      try {
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
      } catch { setConfirming(null); toast.error("Could not save changes. Your selection is kept; try again."); }
    });

  return (
    <div className="space-y-4">
      <Card padded>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><span className="figure text-3xl">{allRows.length}</span><span className="text-sm text-muted-foreground">open items<br /><span className="font-medium text-danger">{allRows.filter((r) => r.severity === "danger").length} high priority</span></span></div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Input aria-label="Search review queue" placeholder="Search client, staff, or issue…" value={query} disabled={pending} onChange={(e) => { setQuery(e.target.value); resetSelection(); }} className="sm:w-64" />
            <Select aria-label="Issue type" value={kind} disabled={pending} onChange={(e) => { setKind(e.target.value); resetSelection(); }} className="sm:w-52">
              <option value="all">All issue types</option>{kind !== "all" && !groups.some((g) => g.kind === kind) && <option value={kind}>{kind.replaceAll("_", " ")} (0)</option>}{groups.map((g) => <option key={g.kind} value={g.kind}>{g.label} ({g.rows.length})</option>)}
            </Select>
            <Select aria-label="Priority" value={severity} disabled={pending} onChange={(e) => { setSeverity(e.target.value); resetSelection(); }} className="sm:w-40"><option value="all">All priorities</option><option value="danger">High priority</option><option value="warn">Needs review</option><option value="accent">Information</option></Select>
          </div>
        </div>
        <p role="status" className="mt-3 text-xs text-muted-foreground">{visibleCount} matching items · Grouped by issue; high priority first within each group.</p>
      </Card>
      {filtered.length === 0 && <Card><Empty icon="search" title="No matching items" action={<Button variant="outline" onClick={() => { setQuery(""); setKind("all"); setSeverity("all"); resetSelection(); }}>Clear filters</Button>}>Try another name, issue type, or priority.</Empty></Card>}
      {filtered.map((g) => {
        const Ic = Icon[g.icon];
        const bulk = BULK[g.kind];
        const selectable = bulk ? g.rows.filter((r) => r.id) : [];
        const sel = chosen(g.kind);
        return (
          <Card
            key={g.kind}
            title={g.label}
            description={undefined}
            actions={
              <span className="flex items-center gap-2">
                {selectable.length > 1 && (
                  <button type="button" disabled={pending} onClick={() => toggleAll(g.kind, selectable)} className="text-[12.5px] font-medium text-primary hover:underline">
                    {selectable.every((r) => sel.has(r.id!)) ? "Clear" : "Select all matching"}
                  </button>
                )}
                <Badge tone={g.rows.some((r) => r.severity === "danger") ? "danger" : "warn"}>{g.rows.length}</Badge>
              </span>
            }
          >
            <ul className="divide-y divide-line-soft">
              {(expanded[g.kind] ? g.rows : g.rows.slice(0, 8)).map((r, n) => {
                const canPick = Boolean(bulk && r.id);
                const on = Boolean(r.id && sel.has(r.id));
                return (
                  <li key={r.id ?? n} className={cx("flex items-center gap-3 px-4 py-2.5", on ? "bg-primary-soft/40" : "hover:bg-hover")}>
                    {canPick ? (
                      <input type="checkbox" disabled={pending} checked={on} onChange={() => toggle(g.kind, r.id!)} aria-label={`Select ${r.title}`} className="mt-1.5 h-[17px] w-[17px] shrink-0 rounded border-line accent-[var(--primary)]" />
                    ) : (
                      <span className={cx("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md", r.severity === "danger" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn")}><Ic size={15} /></span>
                    )}
                    <Link href={r.href} className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-text-strong">{r.title}</span>
                        {r.detail && <span className="block text-[13px] text-muted-foreground">{r.detail}</span>}
                      </span>
                      <span className={cx("hidden shrink-0 rounded px-2 py-0.5 text-xs sm:inline", r.severity === "danger" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn")}>{r.severity === "danger" ? "High priority" : "Review"}</span>
                      <Icon.chevronRight size={16} className="mt-1 shrink-0 text-gray-400" />
                    </Link>
                  </li>
                );
              })}
            </ul>

            {g.rows.length > 8 && <div className="border-t border-line-soft px-4 py-2"><Button variant="ghost" onClick={() => setExpanded((x) => ({ ...x, [g.kind]: !x[g.kind] }))}>{expanded[g.kind] ? "Show fewer" : `Show all ${g.rows.length} matching items`}</Button></div>}
            {bulk && sel.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line-soft bg-sidebar px-5 py-3">
                <span className="text-[13px] font-medium text-text-strong">{sel.size} selected</span><p className="w-full text-xs text-muted-foreground">{bulk.hint}</p>
                {bulk.needsReason && confirming !== g.kind && <Input aria-label={bulk.needsReason} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={bulk.needsReason} className="h-8 w-64 text-[13px]" />}
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
