"use client";

import Link from "next/link";
import { ChevronRight, CircleCheck, CircleX, Clock, Hourglass, List, PenLine, Send, ShieldCheck, TriangleAlert, Wrench, type LucideIcon } from "lucide-react";
import { cx } from "@/components/kit";
import { currentView, QUEUE_VIEW_KEYS, QUEUE_VIEW_LABEL, QUEUE_VIEWS, SUBMISSION_GROUPS, type QueueView, type SubmissionGroup } from "@/evv/labels";

const VIEW_ICON: Record<QueueView, LucideIcon> = { "": List, attention: TriangleAlert, rejected: CircleX, deadline: Clock, manual: PenLine };
const GROUP_ICON: Record<SubmissionGroup, LucideIcon> = { unsent: Send, awaiting: Hourglass, accepted: CircleCheck, fix: Wrench };

/**
 * The EVV sidebar (Oct 18, 2026, the user's pick "A", shaped on a settings screen): Queue, Submission and Reports groups, one icon row each. The row you are on takes the tan
 * fill and a chevron. One row is on at a time: picking a Submission group clears the Queue view
 * and the other way round. The table's own filters (dates, client, caregiver) ride along.
 */
export function EvvSidebar({ screen, filter, counts, groupCounts }: { screen: "queue" | "compliance"; filter: Record<string, string>; counts?: Record<QueueView, number>; groupCounts?: Record<SubmissionGroup, number> }) {
  const view = currentView(filter);
  const href = (patch: Record<string, string | undefined>, resetView = false) => {
    const next: Record<string, string> = { ...filter };
    delete next.offset; delete next.visit; delete next.tab;
    if (resetView) for (const k of QUEUE_VIEW_KEYS) delete next[k];
    for (const [k, v] of Object.entries(patch)) { if (v) next[k] = v; else delete next[k]; }
    const s = new URLSearchParams(next).toString();
    return `/evv${s ? `?${s}` : ""}`;
  };
  const views = Object.keys(QUEUE_VIEW_LABEL) as QueueView[];
  const groups = Object.keys(SUBMISSION_GROUPS) as SubmissionGroup[];

  return (
    <aside aria-label="EVV menu" className="flex flex-col gap-4">
      <div className="grid gap-3.5 [&>*+*]:border-t [&>*+*]:border-line [&>*+*]:pt-3.5">
      <Group label="Queue">
        {views.map((k) => {
          const Icon = VIEW_ICON[k], n = counts?.[k];
          return <Row key={k || "all"} href={href({ ...QUEUE_VIEWS[k], submissionGroup: undefined, submissionStatus: undefined }, true)} icon={Icon} current={screen === "queue" && view === k && !filter.submissionGroup} label={k ? QUEUE_VIEW_LABEL[k] : "All visits"}
            count={n} alarm={(k === "attention" || k === "rejected") && Boolean(n)} />;
        })}
      </Group>
      <Group label="Submission">
        {groups.map((k) => (
          <Row key={k} href={href({ submissionGroup: k, submissionStatus: undefined }, true)} icon={GROUP_ICON[k]}
            current={screen === "queue" && filter.submissionGroup === k} label={SUBMISSION_GROUPS[k].label} count={groupCounts?.[k]} />
        ))}
      </Group>
      <Group label="Reports">
        <Row href="/evv?tab=compliance" icon={ShieldCheck} current={screen === "compliance"} label="Compliance" />
      </Group>
      </div>
    </aside>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <div className="px-2.5 pb-1.5 text-[13px] text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function Row({ href, icon: Icon, label, current, count, alarm }: { href: string; icon: LucideIcon; label: string; current: boolean; count?: number; alarm?: boolean }) {
  return (
    <Link href={href} aria-current={current ? "page" : undefined}
      className={cx("flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[15px] text-text transition-colors hover:bg-tab-hover", current && "bg-tab-hover font-medium text-text-strong")}>
      <Icon size={18} aria-hidden className={current ? "text-primary" : "text-muted-foreground"} />
      <span className="min-w-0 flex-1">{label}</span>
      {count != null && <span className={cx("text-[13px] tabular-nums", alarm ? "font-semibold text-danger" : "text-muted-foreground")}>{count}</span>}
      {current && <ChevronRight size={15} aria-hidden className="text-muted-foreground" />}
    </Link>
  );
}
