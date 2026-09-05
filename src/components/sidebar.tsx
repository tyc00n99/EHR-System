"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "./icons";
import { cx } from "./kit";

type Role = "admin" | "supervisor" | "dsp";
interface Item { href: string; label: string; icon: IconName; roles?: Role[]; badge?: number }
interface Group { label?: string; items: Item[]; divider?: boolean }

const PROMO_KEY = "ehr.sidebar.promo";

/**
 * Left rail, laid out the way the Neon console does it: a section label, a filled call-to-action,
 * a short list of destinations, a context switcher (our pay period), then the product areas
 * separated by hairlines. Collapses to icons.
 */
export function Sidebar({ role, orgName, attention, canClock }: { role: Role; orgName: string; attention: number; canClock: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [promo, setPromo] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        setCollapsed(localStorage.getItem("ehr.sidebar") === "collapsed");
        setPromo(localStorage.getItem(PROMO_KEY) !== "dismissed");
      } catch {}
    });
    return () => cancelAnimationFrame(id);
  }, []);
  const toggle = () => { const next = !collapsed; setCollapsed(next); try { localStorage.setItem("ehr.sidebar", next ? "collapsed" : "open"); } catch {} };
  const dismissPromo = () => { setPromo(false); try { localStorage.setItem(PROMO_KEY, "dismissed"); } catch {} };
  const office = role !== "dsp";

  const groups: Group[] = [
    { items: [
      { href: "/", label: office ? "Dashboard" : "Home", icon: "home" },
      { href: "/owner", label: "Agency performance", icon: "trend", roles: ["admin"] },
      { href: "/attention", label: "Review queue", icon: "bell", roles: ["admin", "supervisor"], badge: attention },
    ] },
    { label: "Care", items: [
      { href: "/clients", label: role === "dsp" ? "My clients" : "Clients", icon: "clients" },
      { href: "/clock", label: "Clock in / out", icon: "clock" },
      { href: "/visits", label: "Notes & EVV", icon: "visits" },
      { href: "/scheduling", label: "Scheduling", icon: "calendar" },
    ] },
    { label: "Operations", divider: true, items: [
      { href: "/billing", label: "Billing", icon: "money", roles: ["admin", "supervisor"] },
      { href: "/staff", label: "Staff", icon: "staff", roles: ["admin", "supervisor"] },
      { href: "/compliance", label: "Compliance", icon: "audit", roles: ["admin", "supervisor"] },
      { href: "/reports", label: "Reports", icon: "chart", roles: ["admin", "supervisor"] },
    ] },
    { label: "Administration", divider: true, items: [
      { href: "/settings", label: "Settings", icon: "settings", roles: ["admin"] },
      { href: "/sites", label: "Sites & programs", icon: "sites", roles: ["admin", "supervisor"] },
      { href: "/services", label: "245D services", icon: "catalog" },
      { href: "/audit", label: "Audit log", icon: "history", roles: ["admin"] },
    ] },
  ];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/") || (href === "/visits" && pathname.startsWith("/notes")));
  const cta = canClock ? { href: "/clock", label: "Clock in", icon: "clock" as IconName } : { href: "/clients/new", label: "New client", icon: "plus" as IconName };

  return (
    <aside className={cx("sticky top-0 hidden h-screen shrink-0 flex-col border-r border-nav-border bg-nav text-nav-text transition-[width] duration-200 md:flex", collapsed ? "w-16" : "w-64")}>
      <div className={cx("flex h-14 items-center gap-2.5 border-b border-nav-border", collapsed ? "justify-center px-0" : "px-4")}>
        <Link href="/" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-[12px] font-bold text-primary-foreground">D</Link>
        {!collapsed && <div className="min-w-0 leading-tight"><div className="truncate text-[13.5px] font-semibold text-nav-text-strong">{orgName}</div><div className="text-[11px] text-nav-text">Licensed 245D provider</div></div>}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {!collapsed && <div className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-nav-group">Workspace</div>}
        <Link href={cta.href} title={collapsed ? cta.label : undefined} className={cx("mb-3 flex h-9 items-center justify-center gap-2 rounded-md border border-nav-cta-border bg-nav-cta text-[13.5px] font-medium text-nav-text-strong transition-colors hover:brightness-110", collapsed && "mx-auto w-10")}>
          {(() => { const Ic = Icon[cta.icon]; return <Ic size={16} />; })()}
          {!collapsed && cta.label}
        </Link>

        {groups.map((g, gi) => {
          const items = g.items.filter((i) => !i.roles || i.roles.includes(role));
          if (!items.length) return null;
          return (
            <div key={gi} className={cx(g.divider && "mt-3 border-t border-nav-border pt-3", !g.divider && gi > 0 && "mt-5")}>
              {g.label && !collapsed && <div className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-nav-group">{g.label}</div>}
              {g.label && collapsed && <div className="mx-auto mb-2 h-px w-6 bg-nav-border" />}
              <ul className="space-y-px">
                {items.map((it) => {
                  const Ic = Icon[it.icon]; const active = isActive(it.href);
                  return (
                    <li key={it.href}>
                      <Link href={it.href} title={collapsed ? it.label : undefined} aria-current={active ? "page" : undefined}
                        className={cx("flex h-9 items-center gap-2.5 rounded-md text-[13.5px] font-medium transition-colors", collapsed ? "justify-center px-0" : "px-2.5", active ? "bg-nav-active text-nav-active-text" : "text-nav-text hover:bg-nav-hover hover:text-nav-text-strong")}>
                        <span className="relative"><Ic size={17} />{collapsed && it.badge ? <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-nav-badge" /> : null}</span>
                        {!collapsed && <span className="min-w-0 flex-1 truncate">{it.label}</span>}
                        {!collapsed && it.badge ? <span className="rounded-full bg-nav-badge px-1.5 text-[11px] font-semibold leading-[18px] text-white">{it.badge}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {role === "admin" && promo && !collapsed && (
        <div className="mx-3 mb-3 rounded-md border border-nav-border bg-nav-hover p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[13px] font-semibold text-nav-text-strong">Set up your agency</div>
            <button onClick={dismissPromo} aria-label="Dismiss" className="-mr-1 -mt-1 rounded p-1 text-nav-group hover:bg-nav-hover hover:text-nav-text-strong"><Icon.plus size={14} className="rotate-45" /></button>
          </div>
          <p className="mt-1 text-[12px] leading-4 text-nav-text">Add staff, upload service agreements, and schedule the first week.</p>
          <Link href="/settings" className="mt-2 inline-flex text-[12px] font-medium text-primary hover:underline">Open settings</Link>
        </div>
      )}

      <button onClick={toggle} className={cx("flex h-11 items-center gap-2 border-t border-nav-border text-[12.5px] text-nav-text hover:bg-nav-hover hover:text-nav-text-strong", collapsed ? "justify-center" : "px-4")} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed ? <Icon.chevronRight size={16} /> : <><Icon.chevronLeft size={16} />Collapse menu</>}
      </button>
    </aside>
  );
}
