/** "16 visits · 353 units · 88.3 hours · 8 unsigned", the same line on every notes table. */
export function VisitTotals({ t }: { t: { visits: number; units: number; minutes: number; unsigned: number } }) {
  const parts = [{ n: t.visits, label: "visits" }, { n: t.units, label: "units" }, { n: Math.round(t.minutes / 6) / 10, label: "hours" }, ...(t.unsigned ? [{ n: t.unsigned, label: "unsigned", tone: "text-danger" }] : [])];
  return <span className="inline-flex flex-wrap items-center gap-x-2 text-[14px] tabular-nums">{parts.map((x, i) => <span key={x.label} className="inline-flex items-center gap-x-2">{i > 0 && <span aria-hidden className="text-hint">·</span>}<span><span className={`font-medium ${x.tone ?? "text-text-strong"}`}>{x.n}</span> {x.label}</span></span>)}</span>;
}

