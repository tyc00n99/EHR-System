"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";
import { useModulePanel } from "@/components/module-panel";
import { primaryNav, sectionRow, type NavCounts, type Role } from "@/lib/nav";

/**
 * The left panel, built the way Gusto's is (Sept 18, 2026, from the user's recording): every area
 * has its icon and its name, the open area lists its pages indented beneath it, the current row
 * carries a left bar, and the account sits at the bottom. It reads the same `primaryNav()` and
 * `sectionRow()` the phone bar and the old section row read, so nothing is offered in one place
 * and denied in another.
 */
export function Sidebar({ role, counts, orgName, footer }: { role: Role; counts: NavCounts; orgName: string; footer?: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const panel = useModulePanel();
  const panelFor = (href: string): "clients" | "team" | null => {
    const m = pathname.match(/^\/(clients|staff)\/([^/]+)/);
    if (!m || m[2] === "new") return null;
    if (href === "/clients" && m[1] === "clients") return "clients";
    if (href === "/staff" && m[1] === "staff") return "team";
    return null;
  };
  const isActive = (href: string, also?: string[]) =>
    href === "/" ? pathname === "/" : [href, ...(also ?? [])].some((h) => pathname === h || pathname.startsWith(h + "/"));
  const subs = sectionRow(pathname, role, counts);

  return (
    <nav aria-label="Main" className="relative z-40 hidden h-screen w-[240px] shrink-0 flex-col border-r border-line bg-sidebar md:flex">
      <Link href="/" aria-label="EVVora home" className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/evvora-tile.png" alt="" width={32} height={32} className="size-8 rounded-lg object-cover" />
        <span className="min-w-0 truncate text-[14.5px] font-semibold text-text-strong">{orgName}</span>
      </Link>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {primaryNav(role).map((d) => {
          const Ic = Icon[d.icon];
          const active = isActive(d.href, d.also);
          const badge = d.badge ? counts[d.badge] : 0;
          const overlay = panelFor(d.href);
          const rowClass = cx("flex h-10 w-full items-center gap-3 px-4 text-left text-[14.5px] transition-colors",
            active ? "bg-tab-hover font-medium text-primary shadow-[inset_3px_0_0_var(--primary)]" : "text-text hover:bg-tab-hover hover:text-text-strong");
          const inner = (<>
            <Ic size={18} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{d.label}</span>
            {badge > 0 && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1.5 text-[12px] font-medium leading-none text-white">{badge > 99 ? "99+" : badge}</span>}
          </>);
          return (
            <div key={d.href}>
              {overlay
                ? <button type="button" onClick={() => panel.setOpen(panel.open === overlay ? null : overlay)} aria-expanded={panel.open === overlay} className={rowClass}>{inner}</button>
                : <Link href={d.href} aria-current={active ? "page" : undefined} className={rowClass}>{inner}</Link>}
              {active && subs && subs.length > 0 && (
                <div className="py-1">
                  {subs.map((e) => {
                    const on = e.match ? e.match(pathname, params) : pathname === e.href;
                    return (
                      <Link key={e.href} href={e.href} aria-current={on ? "page" : undefined} className={cx("flex h-9 items-center gap-2 py-0 pl-[46px] pr-4 text-[14px] transition-colors", on ? "font-medium text-primary shadow-[inset_3px_0_0_var(--primary)]" : "text-text hover:bg-tab-hover hover:text-text-strong")}>
                        <span className="min-w-0 flex-1 truncate">{e.label}</span>
                        {e.count != null && <span className={cx("inline-flex h-[17px] items-center rounded-full px-1.5 text-[12px] tabular-nums", e.hot ? "bg-danger-soft text-danger" : "bg-panel text-muted-foreground")}>{e.count}</span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {footer && <div className="shrink-0 border-t border-line py-2">{footer}</div>}
    </nav>
  );
}
