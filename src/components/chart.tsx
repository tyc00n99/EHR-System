import type { ReactNode } from "react";
import { cx } from "@/components/kit";

/**
 * Chart primitives: the record shape a clinician already knows. A banner that never moves, then
 * hairline-separated sections instead of a card around every fact — nine identical boxes give
 * nine facts identical weight, which is the same as giving none of them any.
 */

/** Six hues, assigned per service code so the same service reads the same colour everywhere. */
// Service hues carry meaning per code, so they must not look like the interface: no blue (the
// user asked for none) and no purple (the accent and its lavender tint are purple now). Green,
// amber, pink, rust, brown, olive.
const TRACK_COLORS = ["#15803d", "#b45309", "#be185d", "#c2410c", "#854d0e", "#4d7c0f"];

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
    <div className="mb-1 shrink-0 rounded-xl border border-line bg-card px-4 py-2.5">
      {/* Name, since-date and the status pills read as one line in the reference, with the owning
          organisation pushed hard right. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {avatar}
        <div className="text-[20px] font-bold leading-tight tracking-[-0.01em] text-text-strong">{name}</div>
        {chips && <div className="flex flex-wrap items-center gap-2">{chips}</div>}
        {/* The identifiers are the quiet half: smaller, muted, and behind a hairline so the name and status read first. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-muted-foreground sm:border-l sm:border-line sm:pl-4">{facts}</div>
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

export function ChartGrid({ children, columns = "three" }: { children: ReactNode; columns?: "three" | "two" }) {
  return <div className={cx("grid gap-4", columns === "two" ? "lg:grid-cols-[minmax(0,1fr)_320px]" : "lg:grid-cols-[248px_minmax(0,1fr)_268px]")}>{children}</div>;
}

export function ChartCol({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("min-w-0", className)}>{children}</div>;
}

export function ChartSection({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-xl border border-line bg-card px-5 py-4 last:mb-0">
      <div className="mb-2 flex items-baseline gap-3">
        <div className="text-[13px] font-medium uppercase tracking-[0.11em] text-hint">{label}</div>
        {action && <div className="ml-auto text-[13px]">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** One row in a chart section. Dividers, not borders — a list, not a stack of cards. */
/**
 * A section whose name sits in the left margin beside its rows (the client Overview since
 * 2026-09-19). No card: sections are divided by a single rule.
 */
export function MarginSection({ label, labelAfter, action, note, children }: { label: string; labelAfter?: ReactNode; action?: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-y-3 border-t border-line py-5 first:border-t-0 first:pt-1 md:grid-cols-[200px_minmax(0,1fr)] md:gap-x-8">
      <div className="md:pt-2">
        <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}{labelAfter}</div>
        {action && <div className="mt-2 text-[13.5px] font-medium text-primary">{action}</div>}
        {note && <div className="mt-2 text-[13px] leading-snug text-muted-foreground">{note}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Units left on an authorization: a ring in the service colour, the share as a small chip, then the count. */
export function UnitsLeft({ used, total, code }: { used: number; total: number; code: string }) {
  const left = Math.max(0, total - used);
  const pct = total > 0 ? Math.min(100, Math.max(0, Math.round((left / total) * 100))) : 0;
  const color = serviceColor(code);
  const r = 9, c = 2 * Math.PI * r;
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0" aria-hidden><circle cx="12" cy="12" r={r} fill="none" stroke="var(--color-panel, #eef2f6)" strokeWidth="3" /><circle cx="12" cy="12" r={r} fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${(c * pct) / 100} ${c}`} strokeLinecap="round" transform="rotate(-90 12 12)" /></svg>
      <span className="ident inline-flex h-5 items-center rounded-full px-2 text-[12px] font-semibold" style={{ background: `${color}1f`, color }}>{pct}%</span>
      <span className="ident text-[14px]"><span className="font-medium text-text-strong">{left.toLocaleString()}</span> <span className="text-muted-foreground">of {total.toLocaleString()}</span></span>
    </span>
  );
}

export function ChartLine({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex items-center gap-2.5 border-b border-line-soft py-1.5 text-[13px] last:border-0", className)}>{children}</div>;
}

export function ChartFacts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px] [overflow-wrap:anywhere]">
      {items.map((i) => (
        <div key={i.label} className="contents">
          <dt className="text-muted-foreground">{i.label}</dt>
          <dd className="m-0 min-w-0 break-words text-text-strong">{i.value ?? <span className="text-hint">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Something to act on, with the reason spelled out. */
export function ChartAlert({ tone, children, action }: { tone: "danger" | "warn"; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={cx("mb-2 rounded-md border-l-[3px] px-2.5 py-2 text-[13px] leading-snug last:mb-0", tone === "danger" ? "border-danger bg-danger-soft text-danger" : "border-warn bg-warn-soft text-warn")}>
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
