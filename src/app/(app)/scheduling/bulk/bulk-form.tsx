"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";
import { bulkCancelShifts } from "../actions";

/**
 * Bulk action, laid out as the reference does: the criteria in a narrow left column, the matching
 * events in a table on the right, and nothing selectable until the mandatory fields are filled.
 * Only Cancel is offered, because it is the only bulk change to a schedule that is safe to make
 * without reopening each event — everything else needs eligibility checked one visit at a time.
 */

export interface BulkEvent {
  id: string;
  date: string;        // display
  iso: string;         // yyyy-mm-dd for filtering
  staff: string;
  staffId: string;
  client: string;
  personId: string;
  type: string;
  status: string;
  location: string;
}

const field = "h-10 w-full rounded-lg border border-line bg-card px-3 text-[14.5px] text-text outline-none focus:border-primary";

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return <div className="mb-1.5 text-[14.5px] text-text-strong">{children}{required && <span className="text-danger"> *</span>}</div>;
}

export function BulkForm({
  events, clients, staff, reasons,
}: {
  events: BulkEvent[];
  clients: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  reasons: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(bulkCancelShifts, {});
  const [by, setBy] = useState("");
  const [who, setWho] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const ready = Boolean(by && who && fromDate && toDate);
  const matching = useMemo(() => {
    if (!ready) return [];
    return events.filter((e) => {
      if (e.iso < fromDate || e.iso > toDate) return false;
      return by === "client" ? e.personId === who : e.staffId === who;
    });
  }, [events, ready, fromDate, toDate, by, who]);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) { toast.success(state.message); router.push("/scheduling"); }
    else toast.error(state.message);
  }, [state, router]);

  // Narrowing the criteria drops anything that no longer matches, without an effect to reset it.
  const selected = picked.filter((id) => matching.some((m) => m.id === id));
  const allOn = matching.length > 0 && selected.length === matching.length;

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-4 border-b border-line px-6 py-3.5">
        <Link href="/scheduling" aria-label="Back to the schedule" className="flex size-9 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-hover hover:text-text-strong">
          <Icon.chevronLeft size={16} />
        </Link>
        <h1 className="mr-auto text-[26px] leading-none">Bulk action</h1>
        <button
          disabled={pending || selected.length === 0}
          className="flex h-10 items-center rounded-lg bg-danger px-4 text-[14.5px] font-medium text-white enabled:hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "Cancelling…" : `Cancel event${selected.length === 1 ? "" : "s"}${selected.length ? ` · ${selected.length}` : ""}`}
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto px-6 py-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div>
          <div className="mb-4">
            <Label required>Action type</Label>
            <select className={field} defaultValue="cancel">
              <option value="cancel">Cancel</option>
            </select>
          </div>

          <div className="mb-4">
            <Label required>Impacted dates</Label>
            <div className="flex items-center gap-2">
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="From" className={field} />
              <span className="text-[14px] text-muted-foreground">to</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="To" className={field} />
            </div>
          </div>

          <h2 className="mb-3 mt-6 text-[21px] leading-none">Cancel details</h2>

          <div className="mb-4">
            <Label required>Cancelled by</Label>
            <select name="cancelledBy" value={by} onChange={(e) => { setBy(e.target.value); setWho(""); }} className={field}>
              <option value="">Select</option>
              <option value="client">Client</option>
              <option value="team_member">Team member</option>
            </select>
          </div>

          <div className="mb-4">
            <Label required>{by === "team_member" ? "Which team member?" : "Which client?"}</Label>
            <select value={who} onChange={(e) => setWho(e.target.value)} disabled={!by} className={cx(field, !by && "bg-panel text-hint")}>
              <option value="">{by ? "Select" : "Choose who cancelled first"}</option>
              {(by === "team_member" ? staff : clients).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          <div className="mb-4">
            <Label required>Cancellation reason</Label>
            <select name="cancelReasonId" className={field} defaultValue="">
              <option value="">Select a cancellation reason</option>
              {reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Reasons are set in <Link href="/scheduling/settings?tab=reasons" className="font-medium text-primary hover:underline">Schedule settings</Link>.
            </p>
          </div>

          <div className="mb-4">
            <Label>Description</Label>
            <textarea name="cancelNote" rows={3} placeholder="Enter a description" className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[14.5px] outline-none placeholder:text-hint focus:border-primary" />
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-4 rounded-lg border border-warn bg-warn-soft px-4 py-3">
            <p className="flex gap-2 text-[14px] text-text-strong">
              <Icon.flag size={16} className="mt-0.5 shrink-0 text-warn" />
              Cancelled events stay on the schedule, shown in red, and can be rebooked.
            </p>
            <p className="mt-2 pl-6 text-[14px] text-text-strong">
              A cancelled event still counts against nothing — the authorization units are only used by a note, so cancelling frees them back up.
            </p>
          </div>

          <div className="mb-2 flex items-center gap-4">
            <h2 className="text-[21px] leading-none">Events</h2>
            <label className="flex items-center gap-2 text-[14.5px] text-text-strong">
              <input
                type="checkbox"
                checked={allOn}
                onChange={(e) => setPicked(e.target.checked ? matching.map((m) => m.id) : [])}
                disabled={matching.length === 0}
                className="size-4 accent-[var(--primary)]"
              />
              Select all
            </label>
          </div>

          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead className="bg-panel">
                <tr>
                  <th className="w-10 border-b border-line px-3 py-2" />
                  {["Team member", "Client", "Date", "Event type", "Event status", "Location type"].map((h) => (
                    <th key={h} className="border-b border-line px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matching.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-[14px] text-muted-foreground">
                    {ready ? "No events match those dates." : "Complete the mandatory fields to see matching events"}
                  </td></tr>
                )}
                {matching.map((e) => {
                  const on = selected.includes(e.id);
                  return (
                    <tr key={e.id} className="border-b border-line-soft last:border-0 hover:bg-hover">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setPicked((p) => (on ? p.filter((x) => x !== e.id) : [...p, e.id]))}
                          aria-label={`Select ${e.client} on ${e.date}`}
                          className="size-4 accent-[var(--primary)]"
                        />
                        {on && <input type="hidden" name="ids[]" value={e.id} />}
                      </td>
                      <td className="px-3 py-2 text-text-strong">{e.staff}</td>
                      <td className="px-3 py-2 text-text-strong">{e.client}</td>
                      <td className="ident px-3 py-2 text-muted-foreground">{e.date}</td>
                      <td className="px-3 py-2 text-muted-foreground">{e.type}</td>
                      <td className="px-3 py-2 text-muted-foreground">{e.status}</td>
                      <td className="px-3 py-2 text-muted-foreground">{e.location}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </form>
  );
}
