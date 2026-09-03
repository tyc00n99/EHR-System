"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "./icons";
import { cx } from "./kit";

type Role = "admin" | "supervisor" | "dsp";
interface Item { href: string; label: string; icon: IconName; roles?: Role[]; soon?: boolean; badge?: number }
interface Group { label?: string; items: Item[] }

export function Sidebar({ role, orgName, attention }: { role: Role; orgName: string; attention: number }) {
  const pathname = usePathname();
  // Read the stored preference once after mount (the server render has no localStorage).
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => { try { setCollapsed(localStorage.getItem("ehr.sidebar") === "collapsed"); } catch {} setHydrated(true); });
    return () => cancelAnimationFrame(id);
  }, []);
  const toggle = () => { const next = !collapsed; setCollapsed(next); try { localStorage.setItem("ehr.sidebar", next ? "collapsed" : "open"); } catch {} };
  void hydrated;

  const groups: Group[] = [
    { items: [
      { href: "/", label: "Home", icon: "home" },
      { href: "/owner", label: "Owner insights", icon: "trend", roles: ["admin"] },
      { href: "/attention", label: "Needs attention", icon: "bell", roles: ["admin", "supervisor"], badge: attention },
    ] },
    { label: "Care", items: [
      { href: "/clients", label: role === "dsp" ? "My clients" : "Clients", icon: "clients" },
      { href: "/clock", label: "Clock in / out", icon: "clock" },
      { href: "/visits", label: "Visits & EVV", icon: "visits" },
      { href: "/scheduling", label: "Scheduling", icon: "calendar" },
    ] },
    { label: "Operations", items: [
      { href: "/billing", label: "Billing", icon: "money", roles: ["admin", "supervisor"] },
      { href: "/staff", label: "Staff", icon: "staff", roles: ["admin", "supervisor"] },
      { href: "/compliance", label: "Compliance", icon: "audit", roles: ["admin", "supervisor"] },
      { href: "/reports", label: "Reports", icon: "chart", roles: ["admin", "supervisor"] },
    ] },
    { label: "Setup", items: [
      { href: "/sites", label: "Sites & programs", icon: "sites", roles: ["admin", "supervisor"] },
      { href: "/services", label: "245D services", icon: "catalog" },
      { href: "/settings", label: "Settings", icon: "settings", roles: ["admin"] },
      { href: "/audit", label: "Audit log", icon: "history", roles: ["admin"] },
    ] },
  ];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <aside className={cx("sticky top-0 hidden h-screen shrink-0 flex-col border-r border-nav-border bg-nav text-nav-text transition-[width] duration-200 md:flex", collapsed ? "w-16" : "w-60")}>
      <div className={cx("flex h-14 items-center gap-2.5 border-b border-nav-border", collapsed ? "justify-center px-0" : "px-4")}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-[12px] font-bold text-white">D</span>
        {!collapsed && <div className="min-w-0 leading-tight"><div className="truncate text-[13.5px] font-semibold text-nav-text-strong">{orgName}</div><div className="text-[11px] text-nav-text">245D EHR</div></div>}
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((g, gi) => {
          const items = g.items.filter((i) => !i.roles || i.roles.includes(role));
          if (!items.length) return null;
          return (
            <div key={gi} className={cx(gi > 0 && "mt-4")}>
              {g.label && !collapsed && <div className="mb-1 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-nav-group">{g.label}</div>}
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
                        {!collapsed && it.soon && <span className="rounded bg-nav-hover px-1.5 text-[10px] font-semibold uppercase tracking-wide text-nav-group">soon</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <button onClick={toggle} className={cx("flex h-11 items-center gap-2 border-t border-nav-border text-[12px] text-nav-text hover:bg-nav-hover hover:text-nav-text-strong", collapsed ? "justify-center" : "px-4")} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed ? <Icon.chevronRight size={16} /> : <><Icon.chevronLeft size={16} />Collapse</>}
      </button>
    </aside>
  );
}
