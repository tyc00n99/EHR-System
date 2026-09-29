"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge, Button, Field, Select } from "@/components/kit";
import { Icon } from "@/components/icons";
import { Rule } from "@/components/rule";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { fmtDate } from "@/lib/format";
import { addAssignment, endAssignment, markOriented } from "../../staff/actions";

export interface TeamMember { assignmentId: string; staffId: string; name: string; title: string | null; orientedOn: string | null }

/**
 * Managing the care team from the client's Profile (user, Sept 29, 2026: "why am I not able to edit
 * the care team on here?"). The same assignments the staff record edits, seen from the person's side:
 * add a caregiver, record orientation, end an assignment — in a centred window over a blurred page.
 * Every write is the staff record's own audited action.
 */
export function CareTeamManager({ personId, personName, team, candidates }: { personId: string; personName: string; team: TeamMember[]; candidates: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [staffId, setStaffId] = useState("");
  const run = (fn: () => Promise<unknown>, ok: string) => start(async () => { await fn(); toast.success(ok); router.refresh(); });
  const first = personName.split(" ")[0];

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[13px] font-medium text-primary hover:underline">Manage care team →</button>
      {open && (
        <Dialog open onOpenChange={(o) => { if (!o) setOpen(false); }}>
          <DialogContent showCloseButton={false} overlayClassName="bg-black/20 supports-backdrop-filter:backdrop-blur-sm" className="block max-h-[calc(100vh-3rem)] w-[calc(100%-2rem)] overflow-y-auto p-0 sm:max-w-[680px]">
            <DialogTitle className="sr-only">Care team</DialogTitle>
            <div className="flex items-start gap-3 border-b border-line px-6 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[19px] font-semibold text-text-strong">Care team <Rule name="orientation" /></div>
                <p className="mt-1 text-[13px] text-muted-foreground">Assigned and oriented is what lets a caregiver clock in with {first}.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-hover hover:text-text-strong"><Icon.plus size={17} className="rotate-45" /></button>
            </div>

            {team.length === 0 ? (
              <p className="px-6 py-5 text-[14px] text-muted-foreground">Nobody is assigned to {first} yet, so no one can clock in.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {team.map((m) => (
                  <li key={m.assignmentId} className="flex flex-wrap items-center gap-3 px-6 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-text-strong">{m.name}</div>
                      <div className="text-[13px] text-muted-foreground">{m.orientedOn ? `Oriented ${fmtDate(m.orientedOn)}` : `Not yet oriented to ${first}'s plan and needs`}{m.title ? ` · ${m.title}` : ""}</div>
                    </div>
                    {m.orientedOn ? <Badge tone="ok">Cleared to work</Badge> : (
                      <button type="button" disabled={pending} onClick={() => run(() => markOriented(m.assignmentId, m.staffId), `${m.name} oriented today`)} className="inline-flex h-8 items-center rounded-md bg-primary-soft px-3 text-[13px] font-medium text-primary hover:bg-primary-soft/70 disabled:opacity-50">Mark oriented today</button>
                    )}
                    <button type="button" disabled={pending} onClick={() => { if (confirm(`Take ${m.name} off ${first}'s care team? They will no longer be able to clock in with ${first}.`)) run(() => endAssignment(m.assignmentId, m.staffId), `${m.name} removed from the care team`); }} className="text-[13px] font-medium text-danger hover:underline disabled:opacity-50">Remove</button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-end gap-3 border-t border-line bg-sidebar px-6 py-4">
              <Field label="Add a caregiver" className="min-w-64 flex-1">
                <Select value={staffId} onChange={(e) => setStaffId(e.target.value)} disabled={candidates.length === 0}>
                  <option value="">{candidates.length === 0 ? "Every active team member is already assigned" : "Choose a team member…"}</option>
                  {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Button variant="secondary" className="h-9" disabled={pending || !staffId} onClick={() => { const name = candidates.find((c) => c.id === staffId)?.name ?? "Caregiver"; run(async () => { await addAssignment(staffId, personId); setStaffId(""); }, `${name} added. Mark them oriented once they have been.`); }}>{pending ? "Saving…" : "Add"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
