"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";
import { primaryNav, type NavCounts, type Role } from "@/lib/nav";

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
  const isActive = (href: string, also?: string[]) =>
    href === "/" ? pathname === "/" : [href, ...(also ?? [])].some((h) => pathname === h || pathname.startsWith(h + "/"));

  return (
    <nav aria-label="Main" className="sticky top-0 z-30 hidden h-screen w-20 shrink-0 flex-col items-center gap-1.5 border-r border-line bg-sidebar py-3 md:flex">
      <Link href="/" title={orgName} className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground">
        D
      </Link>
      {primaryNav(role).map((d) => {
        const Ic = Icon[d.icon];
        const active = isActive(d.href, d.also);
        const badge = d.badge ? counts[d.badge] : 0;
        return (
          <Link
            key={d.href}
            href={d.href}
            aria-label={d.label}
            aria-current={active ? "page" : undefined}
            className={cx(
              "group relative flex size-12 items-center justify-center rounded-lg transition-colors",
              active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-hover hover:text-text-strong",
            )}
          >
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
          </Link>
        );
      })}
      {footer && <div className="mt-auto flex w-full flex-col items-center gap-1.5 border-t border-line pt-2.5">{footer}</div>}
    </nav>
  );
}
