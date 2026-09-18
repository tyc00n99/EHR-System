"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";
import { primaryNav, type NavCounts, type Role } from "@/lib/nav";
import type { Workspace } from "@/lib/workspace";
import { useModulePanel } from "@/components/module-panel";

/**
 * The destination rail: icons only, down the left, the way Passage Health does it.
 *
 * 80px wide with 22px icons, measured off the reference (79px rail, 22px glyphs, a 48px
 * active pill). It reads the same `primaryNav()` the phone's tab bar reads, so a role can never be offered a
 * destination in one place and denied it in another. Labels live in the tooltip and the accessible
 * name rather than on screen, which is what buys back the width.
 */
export function SideRail({ role, workspace, counts, orgName, footer }: { role: Role; workspace: Workspace; counts: NavCounts; orgName: string; footer?: ReactNode }) {
  const pathname = usePathname();
  const panel = useModulePanel();
  // The hovered tile's label. Rendered through a portal at the top of the document with fixed
  // coordinates: Safari clipped a tooltip that merely overflowed the rail, and the module panel
  // beside the rail painted over what was left of it.
  const [tip, setTip] = useState<{ label: string; x: number; y: number } | null>(null);
  const showTip = (label: string) => (e: MouseEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ label, x: r.right + 8, y: r.top + r.height / 2 }); };
  const hideTip = () => setTip(null);
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
    <nav aria-label="Main" className="relative z-40 hidden h-screen w-20 shrink-0 flex-col items-center gap-1.5 border-r border-line bg-sidebar py-3 md:flex">
      <Link href="/" title={orgName} aria-label="EVVora home" className="mb-2 flex size-16 items-center justify-center overflow-hidden rounded-xl border border-line-soft">
        {/* The app icon, cropped to the mark (public/evvora-tile.png) so the E+VV fills the tile
            instead of sitting in the icon's own padding, and drawn at 64px on the 80px rail. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/evvora-tile.png" alt="" width={64} height={64} className="size-full object-cover" />
      </Link>
      {primaryNav(role, workspace).map((d) => {
        const Ic = Icon[d.icon];
        const active = isActive(d.href, d.also);
        const badge = d.badge ? counts[d.badge] : 0;
        const overlay = panelFor(d.href);
        const itemClass = cx(
              "group relative flex size-12 items-center justify-center rounded-lg transition-colors",
              active ? "bg-tab-hover text-primary after:absolute after:inset-x-3 after:bottom-1.5 after:h-[3px] after:rounded-full after:bg-primary" : "text-muted-foreground hover:bg-tab-hover hover:text-text-strong",
            );
        const inner = (<>
            <Ic size={22} />
            {badge > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-danger px-1 text-[13px] font-medium leading-none text-white">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
        </>);
        return overlay ? (
          <button key={d.href} type="button" onClick={() => panel.setOpen(panel.open === overlay ? null : overlay)} onMouseEnter={active ? undefined : showTip(d.label)} onMouseLeave={hideTip} aria-label={d.label} aria-expanded={panel.open === overlay} className={itemClass}>
            {inner}
          </button>
        ) : (
          <Link key={d.href} href={d.href} onMouseEnter={active ? undefined : showTip(d.label)} onMouseLeave={hideTip} aria-label={d.label} aria-current={active ? "page" : undefined} className={itemClass}>
            {inner}
          </Link>
        );
      })}
      {footer && <div className="mt-auto flex w-full flex-col items-center gap-1.5 border-t border-line pt-2.5">{footer}</div>}
      {/* The label lives here rather than in `title`: the native tooltip takes a second to appear and
          cannot be styled, which makes an icon-only rail feel unlabelled. */}
      {tip && createPortal(
        <span role="tooltip" style={{ left: tip.x, top: tip.y }} className="pointer-events-none fixed z-[60] -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-[13px] font-medium text-gray-100 shadow-lg">{tip.label}</span>,
        document.body,
      )}
    </nav>
  );
}
