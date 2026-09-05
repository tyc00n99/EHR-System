"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";

const SECTIONS: [string, string][] = [
  ["/owner", "Agency performance"], ["/attention", "Review queue"], ["/clients", "Clients"], ["/clock", "Clock in / out"], ["/visits", "Notes & EVV"], ["/scheduling", "Scheduling"],
  ["/billing", "Billing"], ["/staff", "Staff"], ["/compliance", "Compliance"], ["/reports", "Reports"], ["/sites", "Sites & programs"], ["/services", "245D services"],
  ["/settings", "Settings"], ["/audit", "Audit log"], ["/agreements", "Authorizations"], ["/me", "My profile"], ["/search", "Search"],
];

/** Neon-style breadcrumb in the top bar: logo / organization [plan] / current area [role]. */
export function TopbarCrumbs({ orgName, roleLabel }: { orgName: string; roleLabel: string }) {
  const pathname = usePathname();
  const section = SECTIONS.find(([p]) => pathname === p || pathname.startsWith(p + "/"))?.[1] ?? "Dashboard";
  return (
    <div className="hidden min-w-0 items-center gap-1.5 text-[13.5px] lg:flex">
      <span className="text-hint">/</span>
      <Link href="/" className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-hover">
        <span className="truncate font-medium text-text-strong">{orgName}</span>
        <span className="rounded border border-line bg-panel px-1.5 text-[10.5px] font-medium leading-4 text-muted-foreground">245D</span>
        <ChevronsUpDown className="size-3.5 text-hint" />
      </Link>
      <span className="text-hint">/</span>
      <span className="flex items-center gap-1.5 rounded-md px-1.5 py-1">
        <span className="truncate font-medium text-text-strong">{section}</span>
        <span className="rounded border border-line bg-panel px-1.5 text-[10.5px] font-medium leading-4 text-muted-foreground">{roleLabel}</span>
      </span>
    </div>
  );
}
