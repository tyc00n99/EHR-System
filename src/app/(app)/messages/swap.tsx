"use client";

/**
 * Shift swaps in Messages (Oct 18, 2026): a caregiver offers one of their upcoming shifts to a
 * colleague who is already assigned and oriented to that client, and anyone who manages the
 * schedule approves or declines it from the card in the chat. Approving moves the shift.
 */
import { ArrowRight, Check, Loader2, Repeat2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { cx, Select, Textarea } from "@/components/kit";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { SwapCard, SwapOption } from "@/db/message-queries";
import { decideSwap, requestSwap, swapOptions, withdrawSwap } from "./actions";

const ZONE = "America/Chicago";
const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short", month: "short", day: "numeric" }).format(new Date(iso));
const timeLabel = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
export const shiftLabel = (start: string, end: string) => `${dayLabel(start)} · ${timeLabel(start)} to ${timeLabel(end)}`;

const STATUS: Record<Exclude<SwapCard["status"], "pending">, { label: (by: string | null) => string; tone: string }> = {
  approved: { label: (by) => `Approved by ${by ?? "the office"} · schedule updated`, tone: "text-ok" },
  declined: { label: (by) => `Declined by ${by ?? "the office"}`, tone: "text-danger" },
  withdrawn: { label: () => "Withdrawn", tone: "text-muted" },
};

/** The card a swap request is drawn as. */
export function SwapCardView({ swap, mine, canDecide, meName, note }: { swap: SwapCard; mine: boolean; canDecide: boolean; meName?: string; note: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true; warning?: string } | { error: string }>, done: string) => start(async () => {
    const r = await fn();
    if ("error" in r) toast.error(r.error);
    else { toast.success(r.warning ? `${done} ${r.warning}` : done); router.refresh(); }
  });
  const decidedBy = swap.decidedBy && swap.decidedBy === meName ? "you" : swap.decidedBy;
  return (
    <div className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-line">
      <div className="px-4 py-3.5">
        <div className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-[0.08em] text-[var(--brand-ink,#00708e)]"><Repeat2 className="size-4" /> Shift swap request</div>
        <div className="mt-1.5 text-[16.5px] font-semibold text-text-strong">{shiftLabel(swap.startAt, swap.endAt)}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[14.5px] text-text">
          <span>{swap.clientName}</span><span className="text-muted">·</span>
          <span>{swap.fromName}</span><ArrowRight className="size-3.5 text-muted" aria-label="to" /><span>{swap.toName}</span>
        </div>
        <div className={cx("mt-1 text-[14px]", swap.toOriented ? "text-muted" : "text-warn")}>
          {swap.toOriented ? `${swap.toName.split(" ")[0]} is oriented to ${swap.clientName.split(" ")[0]}` : `${swap.toName.split(" ")[0]} is no longer oriented to ${swap.clientName.split(" ")[0]}`}
        </div>
        {note && <p className="mt-2 whitespace-pre-wrap text-[15px] text-text-strong">{note}</p>}
      </div>
      <div className="border-t border-line-soft px-3 py-2.5">
        {swap.status === "pending" ? (
          canDecide ? (
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => run(() => decideSwap(swap.id, true), "Swap approved. The schedule is updated.")}
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-[15px] font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Approve swap
              </button>
              <button type="button" disabled={busy} onClick={() => run(() => decideSwap(swap.id, false), "Swap declined.")}
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line text-[15px] font-medium text-text-strong hover:bg-tab-hover disabled:opacity-50">
                <X className="size-4" /> Decline
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-[14px] text-muted">Waiting for the office to approve</span>
              {mine && <button type="button" disabled={busy} onClick={() => run(() => withdrawSwap(swap.id), "Request withdrawn.")} className="h-8 rounded-lg px-3 text-[14px] font-medium text-text-strong hover:bg-tab-hover">Withdraw</button>}
            </div>
          )
        ) : (
          <p className={cx("flex items-center gap-1.5 px-1 text-[14.5px] font-medium", STATUS[swap.status].tone)}>
            {swap.status === "approved" && <Check className="size-4" />}{STATUS[swap.status].label(decidedBy)}
          </p>
        )}
      </div>
    </div>
  );
}

/** "/swap": pick one of my upcoming shifts and the colleague who takes it, then post the card here. */
export function SwapDialog({ personId, to, thread, onClose }: { personId: string | null; to: string | null; thread: string | null; onClose: () => void }) {
  const router = useRouter();
  const [options, setOptions] = useState<SwapOption[] | null>(null);
  const [shiftId, setShiftId] = useState("");
  const [toStaffId, setToStaffId] = useState("");
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    void swapOptions(personId).then((r) => {
      if ("error" in r) { toast.error(r.error); closeRef.current(); return; }
      setOptions(r.options);
      const first = r.options.find((o) => o.takers.length > 0) ?? r.options[0];
      if (first) { setShiftId(first.shiftId); setToStaffId(first.takers[0]?.staffId ?? ""); }
    });
  }, [personId]);

  const chosen = options?.find((o) => o.shiftId === shiftId) ?? null;

  function send() {
    start(async () => {
      const r = await requestSwap({ shiftId, toStaffId, to, thread, note });
      if ("error" in r) toast.error(r.error);
      else { toast.success("Swap request sent."); onClose(); router.refresh(); }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent overlayClassName="bg-black/20 supports-backdrop-filter:backdrop-blur-sm" className="block w-[calc(100%-2rem)] p-0 sm:max-w-[520px]">
        <DialogTitle className="border-b border-line px-6 py-4 text-[19px] font-semibold text-text-strong">Ask to swap a shift</DialogTitle>
        <div className="px-6 py-5">
          {options === null ? (
            <p className="flex items-center gap-2 text-[15px] text-muted"><Loader2 className="size-4 animate-spin" /> Finding your shifts…</p>
          ) : options.length === 0 ? (
            <p className="text-[15px] text-text">You have no scheduled shifts in the next 30 days{personId ? " with this client" : ""}.</p>
          ) : (
            <>
              <label className="block">
                <span className="mb-1.5 block text-[14px] font-medium text-text-strong">Your shift</span>
                <Select value={shiftId} onChange={(e) => { setShiftId(e.target.value); setToStaffId(options.find((o) => o.shiftId === e.target.value)?.takers[0]?.staffId ?? ""); }}>
                  {options.map((o) => <option key={o.shiftId} value={o.shiftId}>{`${o.clientName} · ${shiftLabel(o.startAt, o.endAt)}`}</option>)}
                </Select>
              </label>
              <label className="mt-4 block">
                <span className="mb-1.5 block text-[14px] font-medium text-text-strong">Who takes it</span>
                {chosen && chosen.takers.length === 0
                  ? <p className="rounded-xl border border-line px-3 py-2.5 text-[14.5px] text-text">Nobody else is assigned and oriented to {chosen.clientName.split(" ")[0]}. Ask the office instead.</p>
                  : <Select value={toStaffId} onChange={(e) => setToStaffId(e.target.value)}>
                      {chosen?.takers.map((t) => <option key={t.staffId} value={t.staffId}>{t.name}</option>)}
                    </Select>}
                <span className="mt-1.5 block text-[13.5px] text-muted">Only colleagues assigned and oriented to this client are listed.</span>
              </label>
              <label className="mt-4 block">
                <span className="mb-1.5 block text-[14px] font-medium text-text-strong">Note <span className="font-normal text-muted">· optional</span></span>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="Why, or anything they should know" />
              </label>
            </>
          )}
          <div className="mt-6 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="h-10 rounded-lg px-4 text-[15px] font-medium text-text hover:bg-tab-hover">Cancel</button>
            <button type="button" disabled={busy || !shiftId || !toStaffId} onClick={send} className="h-10 rounded-lg bg-primary px-5 text-[15px] font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">{busy ? "Sending…" : "Send request"}</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
