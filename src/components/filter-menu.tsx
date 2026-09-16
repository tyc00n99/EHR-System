"use client";

import { ChevronDown } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { cx } from "@/components/kit";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface FilterOption { value: string; label: string; hint?: string }

/**
 * The one way to pick a value from a short list anywhere a list is being filtered. It is the
 * app's own menu: a native <select> hands its list to the operating system, which draws a dark
 * grey box on a dark-mode Mac that matches nothing else on the page.
 *
 * Two shapes: `control` is a bordered field that sits beside other controls; `cell` is a
 * borderless segment of a filter bar. Two ways to report a choice: `onChange`, or — when `name`
 * is set — a hidden input in the surrounding form, submitted on change when `submit` is true.
 */
export function FilterMenu({ label, icon, name, value, options, onChange, submit, variant = "control", className, disabled, align = "start", "aria-label": ariaLabel }: {
  label?: string;
  icon?: ReactNode;
  name?: string;
  value: string;
  options: FilterOption[];
  onChange?: (value: string) => void;
  submit?: boolean;
  variant?: "control" | "cell";
  className?: string;
  disabled?: boolean;
  align?: "start" | "end";
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];
  const shape = variant === "cell"
    ? "relative flex h-10 items-center gap-1.5 border-r border-line-soft px-3 text-[14px] text-text-strong hover:bg-tab-hover"
    : "inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-[14px] text-text-strong hover:bg-tab-hover";
  return (<>
    {name && <input ref={ref} type="hidden" name={name} defaultValue={value} />}
    <DropdownMenu>
      <DropdownMenuTrigger disabled={disabled} render={<button type="button" aria-label={ariaLabel ?? `${label ?? name ?? "Filter"}: ${current?.label ?? ""}`} className={cx(shape, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 disabled:opacity-50", className)} />}>
        {label && <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</span>}
        {icon}
        <span className="min-w-0 max-w-[220px] truncate">{current?.label ?? ""}</span>
        <ChevronDown size={15} aria-hidden className="ml-auto shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-auto min-w-56 max-w-[440px]">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => { const next = String(v); if (ref.current) { ref.current.value = next; if (submit) ref.current.form?.requestSubmit(); } onChange?.(next); }}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} aria-label={o.hint ? `${o.label} · ${o.hint}` : o.label} className="py-1.5 pr-9 pl-2.5 text-[14px]">
              <span className="whitespace-nowrap">{o.label}</span>{o.hint && <span className="ml-1 shrink-0 whitespace-nowrap text-muted-foreground">· {o.hint}</span>}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </>);
}
