"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, cx } from "@/components/kit";
import { setApproval } from "./visits/record-actions";

export interface QueueRow { id: string; person: string; staff: string; when: string; units: number; note: string | null }
export interface QueueData { awaitingApproval: QueueRow[]; unsigned: QueueRow[]; missingNote: QueueRow[]; notStaffSigned: QueueRow[]; open: QueueRow[]; approved: number; total: number }

type Tab = "awaitingApproval" | "unsigned" | "notStaffSigned" | "missingNote" | "open";
const TABS: { key: Tab; label: string; tone: "accent" | "danger" | "warn" | "neutral"; hint: string }[] = [
  { key: "awaitingApproval", label: "Awaiting approval", tone: "accent", hint: "Caregiver signed. Read the note and approve." },
  { key: "unsigned", label: "Unsigned by client", tone: "danger", hint: "Client never entered a code. Get the signature or void." },
  { key: "notStaffSigned", label: "Draft notes", tone: "warn", hint: "Note written but the caregiver has not signed." },
  { key: "missingNote", label: "No note", tone: "warn", hint: "Completed visits with nothing documented." },
  { key: "open", label: "In progress", tone: "neutral", hint: "Clocked in right now." },
];

export function ReviewQueue({ data }: { data: QueueData }) {
  const [tab, setTab] = useState<Tab>(TABS.find((t) => data[t.key].length > 0)?.key ?? "awaitingApproval");
  const [pending, start] = useTransition();
  const rows = data[tab];
  const current = TABS.find((t) => t.key === tab)!;
  const pct = data.total ? Math.round((data.approved / data.total) * 100) : 0;
  const approve = (id: string) => start(async () => { const r = await setApproval(id, true); if (r.errors || /only|add|not/i.test(r.message ?? "")) toast.error(r.message ?? "Failed"); else toast.success("Approved"); });
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-card shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-3">
        <div><h3>Documentation review</h3><p className="text-[12.5px] text-muted-foreground">This pay period · {data.approved} of {data.total} completed visits approved</p></div>
        <div className="ml-auto flex items-center gap-2"><div className="h-2 w-32 overflow-hidden rounded-full bg-panel"><div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} /></div><span className="text-[12.5px] tabular-nums text-muted-foreground">{pct}%</span></div>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-line-soft bg-sidebar px-3 py-2">
        {TABS.map((t) => <button key={t.key} onClick={() => setTab(t.key)} className={cx("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium", tab === t.key ? "border-primary bg-primary-soft text-primary" : "border-line bg-page text-muted-foreground hover:bg-hover")}>{t.label}<span className={cx("rounded-full px-1.5 text-[10.5px] leading-4", data[t.key].length ? (t.tone === "danger" ? "bg-danger text-white" : t.tone === "warn" ? "bg-warn text-white" : "bg-panel") : "bg-panel")}>{data[t.key].length}</span></button>)}
      </div>
      <p className="px-5 py-2 text-[12.5px] text-muted-foreground">{current.hint}</p>
      {rows.length === 0 ? <p className="px-5 pb-6 pt-2 text-center text-[13px] text-muted-foreground">Nothing here. {tab === "awaitingApproval" ? "You're caught up." : ""}</p> : (
        <ul className="divide-y divide-line-soft border-t border-line-soft">
          {rows.slice(0, 12).map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-2.5">
              <Link href={`/?visit=${r.id}`} scroll={false} className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 text-[13px]"><span className="font-medium text-text-strong">{r.person}</span><span className="text-muted-foreground">· {r.staff} · {r.when} · {r.units} units</span></div>
                {r.note && <p className="mt-0.5 line-clamp-1 text-[12.5px] text-muted-foreground">{r.note}</p>}
              </Link>
              {tab === "awaitingApproval" && <Button className="h-7 gap-1 text-[12px]" disabled={pending} onClick={() => approve(r.id)}><Check className="size-3.5" />Approve</Button>}
              <Link href={`/?visit=${r.id}`} scroll={false} aria-label="Open record" className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-hover"><ChevronRight className="size-4" /></Link>
            </li>
          ))}
          {rows.length > 12 && <li className="px-5 py-2 text-[12.5px] text-muted-foreground">{rows.length - 12} more in <Link href="/visits" className="text-primary hover:underline">Visits</Link>.</li>}
        </ul>
      )}
      {tab === "unsigned" && rows.length > 0 && <div className="border-t border-line-soft px-5 py-2 text-[12px] text-muted-foreground"><Badge tone="danger">unsigned</Badge> visits are held from billing until signed.</div>}
    </section>
  );
}
