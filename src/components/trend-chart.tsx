"use client";

import { useState } from "react";

export interface TrendPoint { label: string; revenue: number; labor: number; href?: string; current?: boolean }

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Billable vs labor by pay period. Two series, fixed hues, legend + direct labels, hover crosshair. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 220, padL = 48, padR = 36, padT = 16, padB = 34;
  const max = Math.max(1, ...points.map((p) => Math.max(p.revenue, p.labor))) * 1.1;
  const x = (i: number) => padL + (i / Math.max(1, points.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const path = (k: "revenue" | "labor") => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const ticks = [0, 0.5, 1].map((f) => max * f);
  const h = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      <div className="mb-2 flex items-center gap-4 px-1 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-1)" }} />Billable</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-2)" }} />Labor cost</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Billable revenue and labor cost by pay period" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--gray-200)" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--gray-500)">{money(t)}</text>
          </g>
        ))}
        <path d={path("revenue") + ` L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="var(--chart-1)" opacity="0.08" />
        <path d={path("revenue")} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" />
        <path d={path("labor")} fill="none" stroke="var(--chart-2)" strokeWidth="2" strokeLinejoin="round" strokeDasharray={undefined} />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.revenue)} r={hover === i ? 5 : 3.5} fill="var(--chart-1)" stroke="var(--page)" strokeWidth="2" />
            <circle cx={x(i)} cy={y(p.labor)} r={hover === i ? 5 : 3.5} fill="var(--chart-2)" stroke="var(--page)" strokeWidth="2" />
            <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="11" fill={p.current ? "var(--text-strong)" : "var(--gray-500)"} fontWeight={p.current ? 600 : 400}>{p.label}</text>
            <rect x={x(i) - (W - padL - padR) / (points.length * 2)} y={padT} width={(W - padL - padR) / points.length} height={H - padT - padB} fill="transparent" onMouseEnter={() => setHover(i)} />
          </g>
        ))}
        {h && hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="var(--gray-400)" strokeDasharray="3 3" />}
      </svg>
      {h && hover != null && (
        <div className="pointer-events-none absolute top-8 rounded-md border border-line bg-card px-3 py-2 text-[12px] shadow-[var(--shadow-md)]" style={{ left: `${(x(hover) / W) * 100}%`, transform: hover > points.length / 2 ? "translateX(-110%)" : "translateX(12px)" }}>
          <div className="font-medium text-text-strong">{h.label}</div>
          <div className="mt-1 flex items-center gap-1.5 tabular-nums"><span className="h-2 w-2 rounded-sm" style={{ background: "var(--chart-1)" }} />Billable {money(h.revenue)}</div>
          <div className="flex items-center gap-1.5 tabular-nums"><span className="h-2 w-2 rounded-sm" style={{ background: "var(--chart-2)" }} />Labor {money(h.labor)}</div>
          <div className="mt-1 text-muted-foreground">Margin {money(h.revenue - h.labor)}</div>
        </div>
      )}
    </div>
  );
}
