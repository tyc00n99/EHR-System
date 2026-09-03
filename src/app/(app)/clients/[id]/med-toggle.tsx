"use client";

import { useTransition } from "react";
import { Pill } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/kit";
import { setMedicationSupport } from "../actions";

export function MedicationSupportToggle({ personId, on, manage }: { personId: string; on: boolean; manage: boolean }) {
  const [pending, start] = useTransition();
  if (!manage) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 text-[13px]">
      <Pill className="size-4 text-muted-foreground" />
      <span className="flex-1 text-muted-foreground">{on ? "Staff administer or assist with medications for this person. The MAR is required (245D.05)." : "No medication support for this person. Turn it on if staff will administer or assist with medications."}</span>
      <Button variant="outline" className="h-8" disabled={pending} onClick={() => start(async () => { const r = await setMedicationSupport(personId, !on); toast.success(r.message ?? "Updated"); })}>{on ? "Turn off" : "Turn on medication support"}</Button>
    </div>
  );
}
