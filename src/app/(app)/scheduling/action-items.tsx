"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";

/**
 * The reference puts a standing "Action Items" column beside the schedule: four fixed categories
 * that are always present, each saying plainly that it is empty rather than disappearing. Collapsed,
 * it becomes an 80px strip of the same four icons — the width of the nav rail beside it — so the
 * categories never leave the screen.
 */

export interface ActionItem {
  id: string;
  title: string;
  detail: string;
  href: string;
}

export interface ActionGroup {
  key: "cancellations" | "unassigned" | "authIssues" | "authUtilisation";
  label: string;
  empty: string;
  items: ActionItem[];
}

const TONE: Record<ActionGroup["key"], { icon: keyof typeof Icon; color: string }> = {
  cancellations: { icon: "flag", color: "text-danger" },
  unassigned: { icon: "staff", color: "text-warn" },
  authIssues: { icon: "money", color: "text-warn" },
  authUtilisation: { icon: "trend", color: "text-primary" },
};

export function ActionItems({ label, groups }: { label: string; groups: ActionGroup[] }) {
  const [open, setOpen] = useState(true);
  const [shut, setShut] = useState<Record<string, boolean>>({});

  if (!open) {
    return (
      <aside className="flex w-20 shrink-0 flex-col items-center gap-6 border-r border-line py-3.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Show action items"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-text-strong"
        >
          <Icon.chevronRight size={18} />
        </button>
        {groups.map((g) => {
          const t = TONE[g.key];
          const I = Icon[t.icon];
          return (
            <span key={g.key} title={`${g.label}${g.items.length ? ` · ${g.items.length}` : ""}`} className={cx("relative", t.color)}>
              <I size={20} />
              {g.items.length > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[13px] font-semibold leading-none text-white">
                  {g.items.length}
                </span>
              )}
            </span>
          );
        })}
      </aside>
    );
  }

  return (
    <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-r border-line">
      <div className="flex items-center gap-2 px-5 py-3.5">
        <span className="text-[17px] font-semibold text-text-strong">Action Items</span>
        <Icon.bell size={15} className="text-muted-foreground" />
        <span className="text-[14px] text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Hide action items"
          className="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-text-strong"
        >
          <Icon.chevronLeft size={16} />
        </button>
      </div>

      {groups.map((g) => {
        const t = TONE[g.key];
        const I = Icon[t.icon];
        const closed = shut[g.key];
        return (
          <section key={g.key} className="px-5 pb-5">
            <button
              type="button"
              onClick={() => setShut((s) => ({ ...s, [g.key]: !s[g.key] }))}
              aria-expanded={!closed}
              className="flex w-full items-center gap-2 py-2 text-left"
            >
              <I size={16} className={t.color} />
              <span className="text-[15px] font-medium text-text-strong">{g.label}</span>
              {g.items.length > 0 && (
                <span className="rounded-full bg-danger-soft px-1.5 text-[13px] font-semibold text-danger">{g.items.length}</span>
              )}
              <Icon.chevronDown size={14} className={cx("ml-auto text-muted-foreground transition-transform", !closed && "rotate-180")} />
            </button>

            {!closed && (
              g.items.length === 0 ? (
                <p className="px-1 text-[14px] italic leading-snug text-muted-foreground">{g.empty}</p>
              ) : (
                <ul className="space-y-1.5">
                  {g.items.map((it) => (
                    <li key={it.id}>
                      <Link
                        href={it.href}
                        className="block rounded-lg border border-line px-3 py-2 transition-colors hover:border-primary hover:bg-primary-soft"
                      >
                        <span className="block text-[14px] font-medium text-text-strong">{it.title}</span>
                        <span className="block text-[13px] text-muted-foreground">{it.detail}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            )}
          </section>
        );
      })}
    </aside>
  );
}
