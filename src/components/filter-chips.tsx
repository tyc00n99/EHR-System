"use client";

import { cn } from "@/lib/utils";

export function FilterChips<T extends string>({ options, value, onChange }: { options: { key: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map((o) => (
        <button key={o.key} type="button" onClick={() => onChange(o.key)} className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium", value === o.key ? "border-primary bg-primary-soft text-primary" : "border-line bg-page text-muted-foreground hover:bg-hover")}>
          {o.label}{o.count != null && <span className={cn("rounded-full px-1.5 text-[10.5px] leading-4", value === o.key ? "bg-primary/10" : "bg-panel")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
