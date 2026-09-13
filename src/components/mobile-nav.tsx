"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, User } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Icon } from "./icons";
import { cx } from "./kit";
import { gearGroups, primaryNav, type Role } from "@/lib/nav";

/**
 * The phone's tab bar. It shows the same destinations as the top bar, because a caregiver's four
 * fit a phone exactly; office roles get the first four plus a menu for the rest.
 */
export function MobileNav({ role, review }: { role: Role; review: number }) {
  const pathname = usePathname();
  const primary = primaryNav(role);
  const items = role === "dsp" ? primary : primary.slice(0, 4);
  const rest = role === "dsp" ? [] : primary.slice(4);
  const more = [
    ...rest.map((d) => ({ href: d.href, label: d.label })),
    ...gearGroups(role).flatMap((g) => g.items.map((i) => ({ href: i.href, label: i.label }))),
    { href: "/me", label: "My profile" },
  ];
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  return (
    <nav aria-label="Mobile navigation" className="sticky bottom-0 z-20 flex border-t border-line bg-page md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {items.map((d) => {
        const Ic = Icon[d.icon];
        const on = active(d.href);
        return (
          <Link key={d.href} href={d.href} aria-current={on ? "page" : undefined} className={cx("relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[13px] font-medium", on ? "bg-primary-soft text-primary" : "text-muted-foreground")}>
            <Ic size={20} />
            {d.label}
            {d.badge === "review" && review > 0 && <span className="absolute right-[22%] top-2 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-danger px-1 text-[13px] text-white">{review}</span>}
          </Link>
        );
      })}
      {more.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<button aria-label="More navigation" className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[13px] font-medium text-muted-foreground" />}><Menu size={20} />More</DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="max-h-[65vh] w-60 overflow-y-auto">
            {more.map((item) => <DropdownMenuItem key={item.href} render={<Link href={item.href} aria-current={active(item.href) ? "page" : undefined} />}>{item.href === "/me" && <User size={16} />}{item.label}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );
}
