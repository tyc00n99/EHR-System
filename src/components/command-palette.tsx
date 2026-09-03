"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Building2, Clock, FileText, Home, LayoutDashboard, ListChecks, Search, Settings, ShieldCheck, TrendingUp, Users, UserSquare2, Wallet } from "lucide-react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";

export interface PaletteEntry { id: string; label: string; hint?: string; href: string; group: "Clients" | "Staff" }

const NAV = [
  ["Home", "/", Home], ["Owner insights", "/owner", TrendingUp], ["Needs attention", "/attention", Bell], ["Clients", "/clients", Users], ["Clock in / out", "/clock", Clock], ["Visits & EVV", "/visits", ListChecks], ["Billing", "/billing", Wallet], ["Staff", "/staff", UserSquare2], ["Compliance", "/compliance", ShieldCheck], ["Reports", "/reports", LayoutDashboard], ["Sites & programs", "/sites", Building2], ["245D services", "/services", FileText], ["Settings", "/settings", Settings],
] as const;

export function CommandPalette({ entries, role }: { entries: PaletteEntry[]; role: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const go = (href: string) => { setOpen(false); router.push(href); };
  const office = role !== "dsp";
  return (
    <>
      <button onClick={() => setOpen(true)} className="hidden h-9 w-full max-w-md items-center gap-2 rounded-md border border-line bg-gray-100 px-3 text-[13px] text-hint hover:bg-page md:flex">
        <Search className="size-3.5 text-gray-400" /><span className="flex-1 text-left">Search clients, staff, agreements…</span><kbd className="rounded border border-line bg-page px-1.5 font-mono text-[10.5px] text-muted-foreground">⌘K</kbd>
      </button>
      {open && <CommandDialog open onOpenChange={setOpen} title="Search" description="Jump to a client, staff member, or page">
        <Command>
        <CommandInput placeholder="Type a name, PMI, agreement number, or page…" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          {office && entries.some((e) => e.group === "Clients") && (
            <CommandGroup heading="Clients">
              {entries.filter((e) => e.group === "Clients").map((e) => <CommandItem key={e.id} value={`${e.label} ${e.hint ?? ""}`} onSelect={() => go(e.href)}><Users className="size-4 text-gray-500" /><span>{e.label}</span>{e.hint && <span className="ml-auto text-xs text-muted-foreground">{e.hint}</span>}</CommandItem>)}
            </CommandGroup>
          )}
          {office && entries.some((e) => e.group === "Staff") && (
            <CommandGroup heading="Staff">
              {entries.filter((e) => e.group === "Staff").map((e) => <CommandItem key={e.id} value={`${e.label} ${e.hint ?? ""}`} onSelect={() => go(e.href)}><UserSquare2 className="size-4 text-gray-500" /><span>{e.label}</span>{e.hint && <span className="ml-auto text-xs text-muted-foreground">{e.hint}</span>}</CommandItem>)}
            </CommandGroup>
          )}
          <CommandSeparator />
          <CommandGroup heading="Go to">
            {NAV.map(([label, href, Ic]) => <CommandItem key={href} value={`go ${label}`} onSelect={() => go(href)}><Ic className="size-4 text-gray-500" />{label}</CommandItem>)}
          </CommandGroup>
        </CommandList>
        </Command>
      </CommandDialog>}
    </>
  );
}
