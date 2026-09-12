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
 * It reads the same `primaryNav()` the phone's tab bar reads, so a role can never be offered a
 * destination in one place and denied it in another. Labels live in the tooltip and the accessible
 * name rather than on screen, which is what buys back the width.
 */
export function SideRail({ role, counts, orgName, footer }: { role: Role; counts: NavCounts; orgName: string; footer?: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string, also?: string[]) =>
    href === "/" ? pathname === "/" : [href, ...(also ?? [])].some((h) => pathname === h || pathname.startsWith(h + "/"));

  return (
    <nav aria-label="Main" className="sticky top-0 hidden h-screen w-14 shrink-0 flex-col items-center gap-1 border-r border-line bg-sidebar py-2.5 md:flex">
      <Link href="/" title={orgName} className="mb-1.5 flex size-8 items-center justify-center rounded-md bg-primary text-[12px] font-medium text-primary-foreground">
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
              "group relative flex size-9 items-center justify-center rounded-md transition-colors",
              active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-hover hover:text-text-strong",
            )}
          >
            <Ic size={18} />
            {badge > 0 && (
              <span className="absolute right-1 top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-danger px-1 text-[9.5px] font-medium leading-none text-white">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
            {/* The label lives here rather than in `title`: the native tooltip takes a second to
                appear and cannot be styled, which makes an icon-only rail feel unlabelled. */}
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full z-40 ml-2 hidden whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-[12px] font-medium text-gray-100 shadow-md group-hover:block"
            >
              {d.label}
            </span>
            {active && <span aria-hidden className="absolute -right-2.5 size-1.5 rounded-full bg-primary" />}
          </Link>
        );
      })}
      {footer && <div className="mt-auto flex flex-col items-center gap-1 border-t border-line pt-2">{footer}</div>}
    </nav>
  );
}
