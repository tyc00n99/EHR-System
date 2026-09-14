"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";
import { primaryNav, type NavCounts, type Role } from "@/lib/nav";
import { useModulePanel } from "@/components/module-panel";

/**
 * The destination rail: icons only, down the left, the way Passage Health does it.
 *
 * 80px wide with 22px icons, measured off the reference (79px rail, 22px glyphs, a 48px
 * active pill). It reads the same `primaryNav()` the phone's tab bar reads, so a role can never be offered a
 * destination in one place and denied it in another. Labels live in the tooltip and the accessible
 * name rather than on screen, which is what buys back the width.
 */
export function SideRail({ role, counts, orgName, footer }: { role: Role; counts: NavCounts; orgName: string; footer?: ReactNode }) {
  const pathname = usePathname();
  const panel = useModulePanel();
  // A record of this module is open: its icon should reveal the list over the record, not leave it.
  const panelFor = (href: string): "clients" | "team" | null => {
    const m = pathname.match(/^\/(clients|staff)\/([^/]+)/);
    if (!m || m[2] === "new") return null;
    if (href === "/clients" && m[1] === "clients") return "clients";
    if (href === "/staff" && m[1] === "staff") return "team";
    return null;
  };
  const isActive = (href: string, also?: string[]) =>
    href === "/" ? pathname === "/" : [href, ...(also ?? [])].some((h) => pathname === h || pathname.startsWith(h + "/"));

  return (
    <nav aria-label="Main" className="sticky top-0 z-30 hidden h-screen w-20 shrink-0 flex-col items-center gap-1.5 border-r border-line bg-sidebar py-3 md:flex">
      <Link href="/" title={orgName} aria-label="EVVora home" className="mb-2 flex size-10 items-center justify-center overflow-hidden rounded-lg border border-line-soft">
        {/* The app icon itself (public/evvora-icon-1024.png, served at 192), so the tile matches the
            favicon and the home-screen icon rather than being a third mark. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/icon-192.png" alt="" width={40} height={40} className="size-full object-cover" />
      </Link>
      {primaryNav(role).map((d) => {
        const Ic = Icon[d.icon];
        const active = isActive(d.href, d.also);
        const badge = d.badge ? counts[d.badge] : 0;
        const overlay = panelFor(d.href);
        const itemClass = cx(
              "group relative flex size-12 items-center justify-center rounded-lg transition-colors",
              active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-hover hover:text-text-strong",
            );
        const inner = (<>
            <Ic size={22} />
            {badge > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-danger px-1 text-[13px] font-medium leading-none text-white">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
            {/* The label lives here rather than in `title`: the native tooltip takes a second to
                appear and cannot be styled, which makes an icon-only rail feel unlabelled. */}
            {!active && (
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-[13px] font-medium text-gray-100 shadow-lg group-hover:block"
              >
                {d.label}
              </span>
            )}
        </>);
        return overlay ? (
          <button key={d.href} type="button" onClick={() => panel.setOpen(panel.open === overlay ? null : overlay)} aria-label={d.label} aria-expanded={panel.open === overlay} className={itemClass}>
            {inner}
          </button>
        ) : (
          <Link key={d.href} href={d.href} aria-label={d.label} aria-current={active ? "page" : undefined} className={itemClass}>
            {inner}
          </Link>
        );
      })}
      {footer && <div className="mt-auto flex w-full flex-col items-center gap-1.5 border-t border-line pt-2.5">{footer}</div>}
    </nav>
  );
}
