"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";
import { primaryNav, sectionRow, type NavCounts, type Role } from "@/lib/nav";

/** The tabs across the top bar. Hidden on phones, where the bottom tab bar takes over. */
export function TopNav({ role, counts }: { role: Role; counts: NavCounts }) {
  const pathname = usePathname();
  const isActive = (href: string, also?: string[]) =>
    href === "/" ? pathname === "/" : [href, ...(also ?? [])].some((h) => pathname === h || pathname.startsWith(h + "/"));
  return (
    <nav aria-label="Main" className="hidden min-w-0 items-center gap-0.5 md:flex">
      {primaryNav(role).map((d) => {
        const Ic = Icon[d.icon];
        const active = isActive(d.href, d.also);
        const badge = d.badge ? counts[d.badge] : 0;
        return (
          <Link
            key={d.href}
            href={d.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13.5px] transition-colors",
              active ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:bg-hover hover:text-text-strong",
            )}
          >
            <Ic size={15} />
            <span className="hidden lg:inline">{d.label}</span>
            {badge > 0 && (
              <span className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-medium text-white">{badge}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The second row. Only sections with real depth get one, so it appears and disappears rather than
 * sitting there empty — that absence is how you know Today has nothing hiding under it.
 */
export function SectionNav({ role, counts }: { role: Role; counts: NavCounts }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const entries = sectionRow(pathname, role, counts);
  if (!entries) return null;
  return (
    <nav aria-label="Section" className="z-10 flex h-10 items-center gap-5 overflow-x-auto border-b border-line bg-sidebar px-4 md:px-5">
      {entries.map((e) => {
        const active = e.match ? e.match(pathname, params) : pathname === e.href;
        return (
          <Link
            key={e.href}
            href={e.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex h-full shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 text-[13px] transition-colors",
              active ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-text-strong",
            )}
          >
            {e.label}
            {e.count != null && (
              <span className={cx("inline-flex h-[17px] items-center rounded-full border px-1.5 text-[11px] tabular-nums", e.hot ? "border-danger/30 bg-danger-soft text-danger" : "border-line bg-panel text-muted-foreground")}>{e.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
