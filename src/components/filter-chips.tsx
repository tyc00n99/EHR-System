"use client";

import { cn } from "@/lib/utils";

export function FilterChips<T extends string>({ options, value, onChange }: { options: { key: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map((o) => (
        <button key={o.key} type="button" onClick={() => onChange(o.key)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors", value === o.key ? "border-primary bg-primary text-primary-foreground" : "border-line bg-card text-text-strong hover:bg-hover")}>
          {o.label}{o.count != null && <span className={cn("text-[13px] leading-4", value === o.key ? "opacity-80" : "text-muted-foreground")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
