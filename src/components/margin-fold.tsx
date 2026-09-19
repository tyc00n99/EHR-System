"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";

/**
 * A margin-labelled section that folds: the whole label row is the toggle and the one-line summary
 * stays visible either way. Pairs with `MarginSection` on the client record tabs.
 */
export function MarginFold({ label, note, summary, children, defaultOpen = false }: { label: string; note?: ReactNode; summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-line py-5 md:grid md:grid-cols-[200px_minmax(0,1fr)_32px] md:gap-x-8">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="contents text-left">
        <span className="block md:pt-0.5"><span className="block text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>{note && <span className="mt-2 block text-[13px] leading-snug text-muted-foreground">{note}</span>}</span>
        <span className="mt-2 block min-w-0 truncate text-[14px] text-muted-foreground md:mt-0 md:pt-0.5">{summary}</span>
        <Icon.chevron size={18} className={cx("mt-2 text-muted-foreground transition-transform md:mt-0 md:justify-self-end", open && "rotate-180")} />
      </button>
      {open && <div className="min-w-0 md:col-span-2 md:col-start-2">{children}</div>}
    </section>
  );
}
