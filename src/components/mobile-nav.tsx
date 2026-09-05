"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, FileText, Home, Menu, Users, User, ListChecks } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { cx } from "./kit";

export function MobileNav({ role }: { role: "admin" | "supervisor" | "dsp" }) {
  const pathname = usePathname();
  const office = role !== "dsp";
  const items = office
    ? [{ href: "/", label: "Today", icon: Home }, { href: "/clients", label: "Clients", icon: Users }, { href: "/visits", label: "Notes", icon: FileText }, { href: "/attention", label: "Review", icon: ListChecks }]
    : [{ href: "/", label: "Home", icon: Home }, { href: "/clients", label: "Clients", icon: Users }, { href: "/clock", label: "Clock", icon: Clock }, { href: "/visits", label: "Notes", icon: FileText }];
  const more = [
    { href: "/scheduling", label: "Scheduling" },
    ...(office ? [{ href: "/billing", label: "Billing" }, { href: "/staff", label: "Staff" }, { href: "/compliance", label: "Compliance" }, { href: "/reports", label: "Reports" }, { href: "/sites", label: "Sites & programs" }] : []),
    ...(role === "admin" ? [{ href: "/owner", label: "Owner insights" }, { href: "/settings", label: "Settings" }, { href: "/audit", label: "Audit log" }] : []),
    { href: "/services", label: "245D services" }, { href: "/me", label: "My profile" },
  ];
  const active = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href) || (href === "/visits" && pathname.startsWith("/notes"));
  return <nav aria-label="Mobile navigation" className="sticky bottom-0 z-20 flex border-t border-line bg-page md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
    {items.map(({ href, label, icon: Ic }) => <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className={cx("flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium", active(href) ? "bg-primary-soft text-primary" : "text-muted-foreground")}><Ic size={20} />{label}</Link>)}
    <DropdownMenu>
      <DropdownMenuTrigger render={<button aria-label="More navigation" className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground" />}><Menu size={20} />More</DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="max-h-[65vh] w-60 overflow-y-auto">
        {more.map((item) => <DropdownMenuItem key={item.href} render={<Link href={item.href} aria-current={active(item.href) ? "page" : undefined} />}>{item.href === "/me" && <User size={16} />}{item.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  </nav>;
}
