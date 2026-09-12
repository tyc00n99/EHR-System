import type { ReactNode } from "react";
import { cx } from "@/components/kit";

/**
 * Chart primitives: the record shape a clinician already knows. A banner that never moves, then
 * hairline-separated sections instead of a card around every fact — nine identical boxes give
 * nine facts identical weight, which is the same as giving none of them any.
 */

/** Six hues, assigned per service code so the same service reads the same colour everywhere. */
const TRACK_COLORS = ["#1d4e89", "#0e7490", "#7c3aed", "#b45309", "#be185d", "#15803d"];

export function serviceColor(code: string): string {
  let n = 0;
  for (const ch of code) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return TRACK_COLORS[n % TRACK_COLORS.length];
}

export function ServiceDot({ code, className }: { code: string; className?: string }) {
  return <span aria-hidden className={cx("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: serviceColor(code) }} />;
}

/** The banner every screen of a person's record sits under. */
export function PatientBanner({ name, avatar, facts, chips, actions }: { name: string; avatar: ReactNode; facts: ReactNode; chips?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-1 rounded-xl border border-line bg-card px-5 py-3.5">
      {/* Name, since-date and the status pills read as one line in the reference, with the owning
          organisation pushed hard right. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {avatar}
        <div className="text-[21px] font-semibold leading-tight tracking-[-0.01em] text-text-strong">{name}</div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14.5px] text-muted-foreground">{facts}</div>
        {chips && <div className="flex flex-wrap items-center gap-2">{chips}</div>}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** A fact in the banner: quiet label, bright value. */
export function BannerFact({ label, children }: { label?: string; children: ReactNode }) {
  // The label is the quiet half; the value has to survive a glance, so it takes full-strength ink.
  return <span>{label && <span className="text-muted-foreground">{label} </span>}<span className="text-text-strong">{children}</span></span>;
}

export function ChartGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-0 border-t border-line lg:grid-cols-[248px_minmax(0,1fr)_268px]">{children}</div>;
}

export function ChartCol({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("min-w-0 border-line px-0 py-4 lg:px-5 lg:[&+&]:border-l", className)}>{children}</div>;
}

export function ChartSection({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-4 border-line pb-4 last:mb-0 last:border-0 last:pb-0 [&+&]:border-t [&+&]:pt-4">
      <div className="mb-2 flex items-baseline gap-3">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.11em] text-hint">{label}</div>
        {action && <div className="ml-auto text-[12px]">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** One row in a chart section. Dividers, not borders — a list, not a stack of cards. */
export function ChartLine({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex items-center gap-2.5 border-b border-line-soft py-1.5 text-[12.5px] last:border-0", className)}>{children}</div>;
}

export function ChartFacts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[12.5px]">
      {items.map((i) => (
        <div key={i.label} className="contents">
          <dt className="text-muted-foreground">{i.label}</dt>
          <dd className="m-0 text-text-strong">{i.value ?? <span className="text-hint">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Something to act on, with the reason spelled out. */
export function ChartAlert({ tone, children, action }: { tone: "danger" | "warn"; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={cx("mb-2 rounded-md border-l-[3px] px-2.5 py-2 text-[12px] leading-snug last:mb-0", tone === "danger" ? "border-danger bg-danger-soft text-danger" : "border-warn bg-warn-soft text-warn")}>
      <div>{children}</div>
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

/** A tiny meter for units consumed. Reads at a glance where a percentage does not. */
export function UnitBar({ used, total, code }: { used: number; total: number; code: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className="mt-1 h-1 w-full overflow-hidden rounded-sm bg-panel" role="img" aria-label={`${pct}% of authorized units used`}>
      <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: serviceColor(code) }} />
    </div>
  );
}
