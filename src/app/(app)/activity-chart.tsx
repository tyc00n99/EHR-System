"use client";

import { useState } from "react";

export interface DayPoint { date: string; label: string; units: number; visits: number }

/**
 * Units delivered per day across the pay period. One green series over a dotted grid,
 * the way the Neon monitoring panel draws compute. Hover shows the day.
 */
export function ActivityChart({ points, unit = "units" }: { points: DayPoint[]; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 230, padL = 44, padR = 16, padT = 14, padB = 32;
  const max = Math.max(4, ...points.map((p) => p.units)) * 1.15;
  const n = points.length;
  const x = (i: number) => padL + ((i + 0.5) / n) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.units).toFixed(1)}`).join(" ");
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const h = hover != null ? points[hover] : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${unit} per day this pay period`} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="act-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" strokeDasharray="2 4" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--text-muted)" fontFamily="var(--font-mono)">{t}</text>
          </g>
        ))}
        {points.map((p, i) => (
          <g key={p.date} onMouseEnter={() => setHover(i)}>
            <rect x={x(i) - (W - padL - padR) / n / 2} y={padT} width={(W - padL - padR) / n} height={H - padT - padB} fill={hover === i ? "var(--hover)" : "transparent"} />
            <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="11.5" fill={p.date === today ? "var(--text-strong)" : "var(--text-muted)"} fontWeight={p.date === today ? 600 : 400} fontFamily="var(--font-mono)">{p.label}</text>
            {p.date > today && <line x1={x(i)} x2={x(i)} y1={padT} y2={H - padB} stroke="var(--line-soft)" strokeWidth="1" strokeDasharray="1 5" />}
          </g>
        ))}
        <path d={`${line} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#act-fill)" />
        <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {h && hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="var(--text-hint)" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(h.units)} r="4.5" fill="var(--chart-1)" stroke="var(--card)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {h && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-md border border-line bg-popover px-2.5 py-1.5 text-[12px] shadow-[var(--shadow-md)]">
          <div className="font-medium text-text-strong">{h.label}</div>
          <div className="tabular-nums text-muted-foreground">{h.units} {unit} · {h.visits} visit{h.visits === 1 ? "" : "s"}</div>
        </div>
      )}
    </div>
  );
}
