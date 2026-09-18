import type { ReactNode } from "react";

/** A plain section: a title, an optional action on the same line, and the content below. No card. */
export function Plain({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-xl border border-line bg-card px-4 py-3.5 last:mb-0">
      <div className="mb-2 flex items-baseline gap-3"><h2 className="text-[15px] font-semibold text-text-strong">{title}</h2>{action}</div>
      {children}
    </section>
  );
}

/** Label / value pairs, one per line, in plain words. */
export function Rows({ rows }: { rows: readonly (readonly [string, ReactNode])[] }) {
  return <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-[14.5px]">{rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="m-0">{v}</dd></div>)}</dl>;
}
