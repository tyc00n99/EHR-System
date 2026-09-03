"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Badge, Button, Field, FormError, Input, Select, Textarea } from "@/components/kit";
import type { ActionState } from "@/lib/validation";
import { cancelShift, createShifts, markMissed } from "./actions";

const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" });

function useClose(params: string[]) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  return () => { const n = new URLSearchParams(sp.toString()); params.forEach((p) => n.delete(p)); router.replace(n.size ? `${pathname}?${n}` : pathname, { scroll: false }); };
}

export function ShiftSheet({ shift, office }: { shift: { id: string; status: string; start: string; end: string; note: string | null; seriesId: string | null; client: string; personId: string; staff: string; staffId: string; service: string; agreementNumber: string; visitId: string | null }; office: boolean }) {
  const close = useClose(["shift"]);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionState>) => start(async () => { const r = await fn(); toast[r.errors ? "error" : "success"](r.message ?? "Done"); if (!r.errors) close(); });
  const hours = ((new Date(shift.end).getTime() - new Date(shift.start).getTime()) / 3_600_000).toFixed(1);
  return (
    <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-md" showCloseButton={false}>
        <SheetTitle className="sr-only">Shift</SheetTitle>
        <div className="flex items-center gap-3 bg-nav px-5 py-3 text-white"><div className="min-w-0 flex-1"><div className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/60">Shift</div><div className="truncate text-[15px] font-semibold">{shift.client}</div></div><button onClick={close} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-md text-white/80 hover:bg-white/10"><X className="size-4" /></button></div>
        <div className="space-y-4 px-5 py-5 text-[13px]">
          <div className="flex flex-wrap gap-1"><Badge tone={shift.status === "completed" ? "ok" : shift.status === "cancelled" ? "neutral" : shift.status === "missed" ? "danger" : shift.status === "in_progress" ? "accent" : "accent"}>{shift.status.replace("_", " ")}</Badge>{shift.seriesId && <Badge>repeats weekly</Badge>}</div>
          <dl className="space-y-2">
            <div className="flex gap-3"><dt className="w-24 text-muted-foreground">When</dt><dd className="font-medium text-text-strong">{fmt.format(new Date(shift.start))} – {new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(shift.end))} <span className="font-normal text-muted-foreground">· {hours} h</span></dd></div>
            <div className="flex gap-3"><dt className="w-24 text-muted-foreground">Caregiver</dt><dd><Link href={`/staff/${shift.staffId}`} className="text-primary hover:underline">{shift.staff}</Link></dd></div>
            <div className="flex gap-3"><dt className="w-24 text-muted-foreground">Client</dt><dd><Link href={`/clients/${shift.personId}`} className="text-primary hover:underline">{shift.client}</Link></dd></div>
            <div className="flex gap-3"><dt className="w-24 text-muted-foreground">Service</dt><dd>{shift.service} <span className="text-muted-foreground">· {shift.agreementNumber}</span></dd></div>
            {shift.note && <div className="flex gap-3"><dt className="w-24 text-muted-foreground">Note</dt><dd>{shift.note}</dd></div>}
            <div className="flex gap-3"><dt className="w-24 text-muted-foreground">Visit</dt><dd>{shift.visitId ? <Link href={`/visits/${shift.visitId}`} className="text-primary hover:underline">Open the service record</Link> : <span className="text-muted-foreground">Not clocked in yet</span>}</dd></div>
          </dl>
          {office && shift.status === "scheduled" && (
            <div className="flex flex-wrap gap-2 border-t border-line-soft pt-4">
              <Button variant="outline" className="h-8" disabled={pending} onClick={() => { if (confirm("Cancel this shift?")) run(() => cancelShift(shift.id, "one")); }}>Cancel shift</Button>
              {shift.seriesId && <Button variant="outline" className="h-8" disabled={pending} onClick={() => { if (confirm("Cancel this and all later shifts in the series?")) run(() => cancelShift(shift.id, "series")); }}>Cancel series</Button>}
              {new Date(shift.end) < new Date() && <Button variant="danger" className="h-8" disabled={pending} onClick={() => run(() => markMissed(shift.id))}>Mark missed</Button>}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function NewShiftSheet({ defaultDate, staff, agreements }: { defaultDate: string; staff: { id: string; name: string }[]; agreements: { id: string; personId: string; personName: string; label: string }[] }) {
  const close = useClose(["new", "date"]);
  const [state, submit, pending] = useActionState(async (p: ActionState, fd: FormData) => { const r = await createShifts(p, fd); if (r.message && !r.errors) { toast.success(r.message); close(); } return r; }, {});
  const people = useMemo(() => Array.from(new Map(agreements.map((a) => [a.personId, a.personName])).entries()), [agreements]);
  const [personId, setPersonId] = useState(people[0]?.[0] ?? "");
  const options = agreements.filter((a) => a.personId === personId);
  const e = state.errors ?? {};
  return (
    <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-md" showCloseButton={false}>
        <SheetTitle className="sr-only">New shift</SheetTitle>
        <div className="flex items-center gap-3 bg-nav px-5 py-3 text-white"><div className="flex-1 text-[15px] font-semibold">New shift</div><button onClick={close} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-md text-white/80 hover:bg-white/10"><X className="size-4" /></button></div>
        <form action={submit} className="space-y-4 px-5 py-5">
          <FormError message={state.errors ? state.message : state.message} />
          <Field label="Client" error={e.personId}><Select name="personId" value={personId} onChange={(ev) => setPersonId(ev.target.value)}>{people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></Field>
          <Field label="Service" error={e.serviceAgreementId} hint={options.length > 1 ? "This client is authorized for more than one service. Pick the one this shift delivers." : "From the client's active authorization."}><Select name="serviceAgreementId" key={personId} defaultValue={options[0]?.id ?? ""}>{options.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select></Field>
          <Field label="Caregiver" error={e.staffId} hint="Must be assigned, oriented to this client, and current on compliance."><Select name="staffId" defaultValue="">{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Date" error={e.date}><Input name="date" type="date" defaultValue={defaultDate} required /></Field>
            <Field label="Start" error={e.start}><Input name="start" type="time" defaultValue="09:00" required /></Field>
            <Field label="End" error={e.end}><Input name="end" type="time" defaultValue="12:00" required /></Field>
          </div>
          <Field label="Repeat weekly for" error={e.repeatWeeks} hint="Stops at the agreement end date. Skips weeks where the caregiver is already booked."><Select name="repeatWeeks" defaultValue="1">{[1, 2, 4, 8, 12, 26].map((n) => <option key={n} value={n}>{n === 1 ? "Just this once" : `${n} weeks`}</option>)}</Select></Field>
          <Field label="Note for the caregiver" error={e.note}><Textarea name="note" className="min-h-14" /></Field>
          <div className="flex gap-2"><Button type="submit" disabled={pending}>{pending ? "Scheduling…" : "Schedule"}</Button><Button type="button" variant="ghost" onClick={close}>Cancel</Button></div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
