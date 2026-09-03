"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarX, ClipboardList, FileText, Pill, Target, Wallet } from "lucide-react";
import { Badge, cx } from "@/components/kit";
import { FilterChips } from "@/components/filter-chips";

export type FeedItem =
  | { kind: "visit"; at: string; day: string; time: string; id: string; staff: string; service: string; units: number; minutes: number | null; status: string; note: string | null; interaction: string | null; skills: string[]; signed: boolean; staffSigned: boolean; approved: boolean; manual: boolean; goalYes: number; goalNo: number }
  | { kind: "med"; at: string; day: string; time: string; id: string; name: string; dose: string; status: string; note: string | null; by: string | null }
  | { kind: "shift"; at: string; day: string; time: string; id: string; staff: string; service: string; status: string }
  | { kind: "document"; at: string; day: string; time: string; id: string; title: string; category: string; by: string }
  | { kind: "agreement"; at: string; day: string; time: string; id: string; number: string; service: string; units: number; status: string }
  | { kind: "goal"; at: string; day: string; time: string; id: string; title: string; status: string };

type Kind = "all" | FeedItem["kind"];

export function Feed({ items, personId, days, olderHref }: { items: FeedItem[]; personId: string; days: number; olderHref: string }) {
  const [kind, setKind] = useState<Kind>("all");
  const shown = items.filter((i) => kind === "all" || i.kind === kind);
  const count = (k: FeedItem["kind"]) => items.filter((i) => i.kind === k).length;
  const byDay = shown.reduce<Record<string, FeedItem[]>>((acc, i) => ((acc[i.day] ??= []).push(i), acc), {});
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <FilterChips value={kind} onChange={setKind} options={[{ key: "all", label: "Everything", count: items.length }, { key: "visit", label: "Visits", count: count("visit") }, { key: "med", label: "Medications", count: count("med") }, { key: "shift", label: "Schedule", count: count("shift") }, { key: "document", label: "Files", count: count("document") }, { key: "agreement", label: "Authorizations", count: count("agreement") }, { key: "goal", label: "Goals", count: count("goal") }]} />
        <span className="text-[12.5px] text-muted-foreground">Last {days} days</span>
      </div>
      {shown.length === 0 && <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-[13px] text-muted-foreground">Nothing in this window.</div>}
      {Object.entries(byDay).map(([day, list]) => (
        <section key={day} className="relative mb-6 pl-6">
          <div className="absolute bottom-0 left-[7px] top-2 w-px bg-line" />
          <div className="relative mb-2 text-[13px] font-semibold text-text-strong"><span className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-gray-100 bg-gray-400" />{day}</div>
          <div className="space-y-2">{list.map((i) => <Row key={`${i.kind}-${i.id}`} item={i} personId={personId} />)}</div>
        </section>
      ))}
      <div className="mt-2"><Link href={olderHref} className="inline-flex h-8 items-center rounded-md border border-line bg-page px-3 text-[13px] font-medium hover:bg-hover">Show older</Link></div>
    </div>
  );
}

function Row({ item, personId }: { item: FeedItem; personId: string }) {
  const base = "block rounded-lg border border-line bg-card px-4 py-3 shadow-[var(--shadow-sm)]";
  if (item.kind === "visit") {
    return (
      <Link href={`/clients/${personId}?tab=feed&visit=${item.id}`} scroll={false} className={cx(base, "transition-colors hover:bg-hover")}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <ClipboardList className="size-4 text-primary" /><span className="font-medium text-text-strong tabular-nums">{item.time}</span><span className="text-muted-foreground">· {item.staff} · {item.service} · {item.units} units{item.minutes != null ? ` · ${item.minutes} min` : ""}</span>
          <span className="ml-auto flex gap-1"><Badge tone={item.approved ? "ok" : item.staffSigned ? "accent" : item.note ? "warn" : "neutral"}>{item.approved ? "approved" : item.staffSigned ? "staff signed" : item.note ? "draft" : "no note"}</Badge>{item.status === "completed" && !item.signed && <Badge tone="danger">unsigned</Badge>}{item.manual && <Badge tone="warn">manual</Badge>}</span>
        </div>
        {(item.interaction || item.skills.length > 0 || item.goalYes + item.goalNo > 0) && <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">{item.interaction && <span>Interaction: {item.interaction}</span>}{item.skills.length > 0 && <span>Skills: {item.skills.join(", ")}</span>}{item.goalYes + item.goalNo > 0 && <span>Goals: {item.goalYes} yes · {item.goalNo} no</span>}</div>}
        {item.note && <p className="mt-2 line-clamp-3 text-[13px] leading-5 text-text">{item.note}</p>}
      </Link>
    );
  }
  if (item.kind === "med") {
    const tone = item.status === "given" ? "ok" : item.status === "missed" ? "danger" : "warn";
    return <div className={base}><div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]"><Pill className={cx("size-4", tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : "text-warn")} /><span className="font-medium text-text-strong tabular-nums">{item.time}</span><span className="text-muted-foreground">· {item.name} {item.dose}</span><Badge tone={tone}>{item.status}</Badge>{item.by && <span className="text-muted-foreground">· {item.by}</span>}</div>{item.note && <p className="mt-1 text-[12.5px] text-muted-foreground">{item.note}</p>}</div>;
  }
  if (item.kind === "shift") return <div className={base}><div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]"><CalendarX className="size-4 text-danger" /><span className="font-medium text-text-strong tabular-nums">{item.time}</span><span className="text-muted-foreground">· Shift with {item.staff} · {item.service}</span><Badge tone={item.status === "missed" ? "danger" : "neutral"}>{item.status}</Badge></div></div>;
  if (item.kind === "document") return <div className={base}><div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]"><FileText className="size-4 text-gray-500" /><span className="font-medium text-text-strong">{item.title}</span><span className="text-muted-foreground">· {item.category.replace("_", " ")} uploaded by {item.by}</span><Link href={`/clients/${personId}/documents/${item.id}`} target="_blank" className="ml-auto text-primary hover:underline">Open</Link></div></div>;
  if (item.kind === "agreement") return <div className={base}><div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]"><Wallet className="size-4 text-gray-500" /><span className="font-medium text-text-strong">Authorization {item.number}</span><span className="text-muted-foreground">· {item.service} · {item.units.toLocaleString()} units</span><Badge tone={item.status === "active" ? "ok" : "neutral"}>{item.status}</Badge></div></div>;
  return <div className={base}><div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]"><Target className="size-4 text-gray-500" /><span className="font-medium text-text-strong">Goal added: {item.title}</span><Badge tone={item.status === "active" ? "ok" : "neutral"}>{item.status}</Badge></div></div>;
}
