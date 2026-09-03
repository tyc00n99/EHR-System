"use client";

import { useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cx } from "@/components/kit";
import { setPersonStatus } from "../actions";

const LABEL = { intake: "Intake", active: "Active", discharged: "Discharged" } as const;
const TONE = { intake: "bg-primary-soft text-primary", active: "bg-ok-soft text-ok", discharged: "bg-panel text-gray-700" } as const;

export function StatusControl({ personId, status }: { personId: string; status: keyof typeof LABEL }) {
  const [pending, start] = useTransition();
  const change = (next: keyof typeof LABEL) => {
    if (next === status) return;
    if (next === "discharged" && !confirm("Discharge this client? Caregivers lose access, scheduling stops, and the record stays for audits.")) return;
    start(async () => { const r = await setPersonStatus(personId, next); toast.success(r.message ?? "Updated"); });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button disabled={pending} className={cx("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium disabled:opacity-60", TONE[status])} />}>{LABEL[status]} <ChevronDown className="size-3" /></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {(Object.keys(LABEL) as (keyof typeof LABEL)[]).map((k) => <DropdownMenuItem key={k} onClick={() => change(k)} className={k === status ? "font-medium" : ""}>{LABEL[k]}{k === "discharged" && <span className="ml-auto text-[11px] text-muted-foreground">records the date</span>}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
