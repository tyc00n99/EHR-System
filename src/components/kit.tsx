import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ---------- buttons ---------- */

const btn = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "bg-primary-soft text-primary hover:bg-blue-300/40",
  ghost: "text-text hover:bg-hover",
  outline: "border border-line bg-page text-text hover:bg-hover",
  danger: "bg-danger-soft text-danger hover:bg-danger/15",
} as const;

type Variant = keyof typeof btn;
const btnBase = "inline-flex h-8 items-center justify-center gap-1.5 rounded-[var(--radius-btn)] px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors disabled:opacity-50";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(btnBase, btn[variant], className)} {...props} />;
}

export function LinkButton({ variant = "secondary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(btnBase, btn[variant], className)} {...props} />;
}

/* ---------- form controls ---------- */

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block min-w-0", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-text">{label}</span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs leading-4 text-muted-foreground">{hint}</span>}
      {error && <span className="mt-1.5 block text-xs leading-4 text-danger">{error}</span>}
    </label>
  );
}

const control = "h-9 w-full rounded-lg border border-line bg-page px-3 text-text placeholder:text-hint transition-colors hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300/50 disabled:bg-panel";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(control, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(control, "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2378736f%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(control, "h-auto min-h-24 py-2 leading-5", className)} {...props} />;
}

export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cx("flex cursor-pointer items-center gap-3 px-3 py-2.5", className)}>
      <input type="checkbox" className="h-[18px] w-[18px] shrink-0 rounded border-line accent-[var(--primary)]" {...props} />
      <span>{label}</span>
    </label>
  );
}

/** Settings-style form section: title and description on the left, fields on the right. */
export function FormSection({ title, titleAfter, description, children }: { title: string; titleAfter?: ReactNode; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-line-soft py-7 first:border-t-0 first:pt-0 md:grid-cols-[200px_1fr] md:gap-10">
      <div>
        <h3 className="flex items-center gap-1.5 text-[15px]">{title}{titleAfter}</h3>
        {description && <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{description}</p>}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-6">{children}</div>
    </section>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex gap-2 border-t border-line-soft pt-6">{children}</div>;
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="mb-6 flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2.5 text-danger">
      <Icon.flag size={16} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

/* ---------- page structure ---------- */

export function PageHeader({ eyebrow, icon, title, meta, actions }: { eyebrow?: ReactNode; icon?: ReactNode; title: string; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8">
      {eyebrow && <div className="mb-3 flex items-center gap-1.5 text-[13px] text-muted-foreground">{eyebrow}</div>}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon}
          <div className="min-w-0">
            <h1 className="truncate">{title}</h1>
            {meta && <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">{meta}</div>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Crumb({ href, children }: { href?: string; children: ReactNode }) {
  return href ? <Link href={href} className="rounded px-1 py-0.5 hover:bg-hover hover:text-text-strong">{children}</Link> : <span className="px-1 text-text">{children}</span>;
}

export function CrumbSep() {
  return <span className="text-hint">/</span>;
}

/** Notion-style page icon: initials on a tinted square. */
export function PageIcon({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "accent" | "ok" | "warn" }) {
  const tones = { neutral: "bg-panel text-gray-700", accent: "bg-primary-soft text-primary", ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn" };
  return <span className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-base font-semibold", tones[tone])}>{text}</span>;
}

export function Card({ title, titleAfter, description, actions, children, className, padded = false }: { title?: string; titleAfter?: ReactNode; description?: string; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx("overflow-hidden rounded-[var(--radius-app)] border border-line bg-card shadow-[var(--shadow-sm)]", className)}>
      {(title || actions || titleAfter) && (
        <div className="flex items-center justify-between gap-4 border-b border-line-soft px-5 py-3">
          <div>
            {title && <h3 className="flex items-center gap-1.5">{title}{titleAfter}</h3>}
            {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padded ? "px-5 py-4" : undefined}>{children}</div>
    </section>
  );
}

export function StatTile({ label, value, note, tone, href }: { label: string; value: ReactNode; note?: ReactNode; tone?: "warn" | "danger" | "ok"; href?: string }) {
  const body = (
    <>
      <div className="text-[13px] font-medium text-muted-foreground">{label}</div>
      <div className="figure mt-2 text-[30px] leading-none text-text-strong">{value}</div>
      {note && <div className={cx("mt-2 text-[13px]", tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : "text-muted-foreground")}>{note}</div>}
    </>
  );
  const cls = "block rounded-lg border border-line bg-card px-5 py-4";
  return href ? <Link href={href} className={cx(cls, "transition-colors hover:bg-hover")}>{body}</Link> : <div className={cls}>{body}</div>;
}

/* ---------- properties (Notion-style page properties) ---------- */

export interface Property {
  icon?: IconName;
  label: string;
  value: ReactNode;
}

export function Properties({ items, labelWidth = 136 }: { items: Property[]; labelWidth?: number }) {
  return (
    <dl>
      {items.map((p) => {
        const Ic = p.icon ? Icon[p.icon] : null;
        const empty = p.value === null || p.value === undefined || p.value === "";
        return (
          <div key={p.label} className="grid items-start gap-3 py-[7px]" style={{ gridTemplateColumns: `${labelWidth}px 1fr` }}>
            <dt className="flex items-start gap-2 text-[13px] leading-5 text-muted-foreground">
              {Ic && <Ic size={15} className="mt-0.5 shrink-0 text-gray-400" />}
              <span>{p.label}</span>
            </dt>
            <dd className={cx("min-w-0 break-words leading-5", empty ? "text-hint" : "text-text")}>{empty ? "Empty" : p.value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/* ---------- badges ---------- */

const badges = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  accent: "bg-primary-soft text-primary",
  neutral: "bg-panel text-gray-700",
} as const;

export type Tone = keyof typeof badges;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("inline-flex h-5 items-center rounded px-1.5 text-xs font-medium leading-none whitespace-nowrap", badges[tone])}>{children}</span>;
}

/* ---------- tables ---------- */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">{children}</table>
    </div>
  );
}

export function Th({ children, className, align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" }) {
  return <th className={cx("h-9 whitespace-nowrap px-4 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground first:pl-5 last:pr-5", align === "right" ? "text-right" : "text-left", className)}>{children}</th>;
}

export function Td({ children, className, align = "left", strong, wrap }: { children?: ReactNode; className?: string; align?: "left" | "right"; strong?: boolean; wrap?: boolean }) {
  return <td className={cx("px-4 py-3 align-middle first:pl-5 last:pr-5", wrap ? "whitespace-normal" : "whitespace-nowrap", align === "right" ? "text-right tabular-nums" : "text-left", strong && "font-medium text-text-strong", className)}>{children}</td>;
}

export function Tr({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <tr className={cx("border-t border-line-soft transition-colors hover:bg-hover", muted && "text-muted-foreground")}>{children}</tr>;
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead className="bg-sidebar"><tr>{children}</tr></thead>;
}

/* ---------- empty states ---------- */

export function Empty({ icon = "inbox", title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  const Ic = Icon[icon];
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-panel text-gray-500"><Ic size={18} /></span>
      <div className="font-medium text-text-strong">{title}</div>
      {children && <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "accent", children, action }: { tone?: "accent" | "ok" | "warn"; children: ReactNode; action?: ReactNode }) {
  const tones = { accent: "border-primary/30 bg-primary-soft", ok: "border-ok/30 bg-ok-soft", warn: "border-warn/30 bg-warn-soft" };
  return (
    <div className={cx("mb-6 flex items-center justify-between gap-4 rounded-lg border px-4 py-3", tones[tone])}>
      <div>{children}</div>
      {action}
    </div>
  );
}

/* ---------- avatar ---------- */

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-gray-800 font-medium text-gray-100" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials || "?"}
    </span>
  );
}

/* ---------- record header, tabs, toolbar ---------- */

export function RecordHeader({ avatar, title, subtitle, chips, actions, crumbs }: { avatar: ReactNode; title: string; subtitle?: ReactNode; chips?: ReactNode; actions?: ReactNode; crumbs?: ReactNode }) {
  return (
    <div className="-mx-4 -mt-5 mb-0 border-b border-line bg-page px-4 pt-4 md:-mx-8 md:-mt-6 md:px-8 md:pt-5">
      {crumbs && <div className="mb-3 flex items-center gap-1.5 text-[13px] text-muted-foreground">{crumbs}</div>}
      <div className="flex flex-wrap items-center gap-4 pb-4">
        {avatar}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-[24px] leading-8">{title}</h1>{chips}</div>
          {subtitle && <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted-foreground">{subtitle}</div>}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, current, base }: { tabs: { key: string; label: string; count?: number }[]; current: string; base: string }) {
  return (
    <div className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line bg-page px-4 md:-mx-8 md:px-8">
      {tabs.map((t) => (
        <Link key={t.key} href={t.key === tabs[0].key ? base : `${base}?tab=${t.key}`} className={cx("-mb-px flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[13.5px] font-medium", current === t.key ? "border-primary text-text-strong" : "border-transparent text-muted-foreground hover:border-line-strong hover:text-text")}>
          {t.label}{t.count != null && <span className={cx("rounded-full px-1.5 text-[11px] leading-[18px]", current === t.key ? "bg-primary-soft text-primary" : "bg-panel text-muted-foreground")}>{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}

/** Table toolbar: search box (GET form), filter chips, count, right-side actions. */
export function Toolbar({ action, q, placeholder, chips, count, children, hidden }: { action: string; q?: string; placeholder: string; chips?: { key: string; label: string; href: string; active: boolean; tone?: Tone }[]; count?: ReactNode; children?: ReactNode; hidden?: Record<string, string> }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-sidebar px-4 py-2.5">
      <form action={action} className="relative">
        {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <Icon.search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input name="q" defaultValue={q} placeholder={placeholder} className="h-8 w-64 rounded-md border border-line bg-page pl-8 pr-2.5 text-[13px] placeholder:text-hint focus:border-blue-500 focus:outline-none" />
      </form>
      {chips && chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {chips.map((c) => <Link key={c.key} href={c.href} className={cx("inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium", c.active ? "border-primary bg-primary-soft text-primary" : "border-line bg-page text-muted-foreground hover:bg-hover")}>{c.label}</Link>)}
        </div>
      )}
      {count && <span className="text-[13px] text-muted-foreground">{count}</span>}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}

/** Tiny inline trend for KPI cards. Single series, accent color, no axes. */
export function Sparkline({ values, width = 96, height = 28, color = "var(--chart-1)" }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 2 - ((v - min) / (max - min || 1)) * (height - 4);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="3" fill={color} />
    </svg>
  );
}

export function Kpi({ label, value, note, tone, spark, href }: { label: string; value: ReactNode; note?: ReactNode; tone?: "warn" | "danger" | "ok"; spark?: number[]; href?: string }) {
  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-muted-foreground">{label}</div>
        <div className="figure mt-1.5 text-[28px] leading-none text-text-strong">{value}</div>
        {note && <div className={cx("mt-2 text-[12.5px]", tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : "text-muted-foreground")}>{note}</div>}
      </div>
      {spark && <Sparkline values={spark} />}
    </div>
  );
  const cls = "block rounded-xl border border-line bg-card px-4 py-3.5 shadow-[var(--shadow-sm)]";
  return href ? <Link href={href} className={cx(cls, "transition-colors hover:bg-hover")}>{body}</Link> : <div className={cls}>{body}</div>;
}
