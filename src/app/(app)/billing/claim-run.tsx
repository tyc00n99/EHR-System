"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/kit";
import { downloadClaims, sendClaims, takeBackBatch, type ClaimActionResult } from "./actions";

function report(r: ClaimActionResult) {
  if (r.ok) toast.success(r.message);
  else toast.error(r.problems.length === 1 ? r.problems[0] : "Nothing was sent", { description: r.problems.length > 1 ? r.problems.join(" · ") : undefined, duration: 10_000 });
}

/** "Send to Waystar" for every ready line on screen. */
export function SendButton({ visitIds, label, connected }: { visitIds: string[]; label: string; connected: boolean }) {
  const [pending, start] = useTransition();
  const n = visitIds.length;
  if (!n) return null;
  return (
    <Button disabled={pending} title={connected ? undefined : `${label} is not connected yet; Download 837P works meanwhile`} onClick={() => {
      if (!confirm(`Send ${n} line${n === 1 ? "" : "s"} to ${label}? They leave Ready to send once they go.`)) return;
      start(async () => report(await sendClaims(visitIds)));
    }}>{pending ? "Sending…" : `Send ${n} to ${label}`}</Button>
  );
}

/** Builds the 837P, records the lines as billed, and downloads the file for a manual upload. */
export function DownloadButton({ visitIds }: { visitIds: string[] }) {
  const [pending, start] = useTransition();
  if (!visitIds.length) return null;
  return (
    <Button variant="outline" disabled={pending} onClick={() => {
      if (!confirm("Download an 837P of every ready line for Waystar's portal? The lines are marked as billed; take the file back if you don't upload it.")) return;
      start(async () => {
        const r = await downloadClaims(visitIds);
        report(r);
        if (r.ok && r.batchId) { const a = document.createElement("a"); a.href = `/billing/batches/${r.batchId}/837`; a.click(); }
      });
    }}>{pending ? "Preparing…" : "Download 837P"}</Button>
  );
}

export function TakeBack({ batchId }: { batchId: string }) {
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <button type="button" disabled={pending} className="text-[13px] font-medium text-muted-foreground hover:text-danger hover:underline disabled:opacity-50" onClick={() => {
      if (!confirm("Take this whole file back? Its claims are voided in EVVora and the notes return to Ready to send. Only do this if Waystar never received it, or it was withdrawn there.")) return;
      start(async () => { const r = await takeBackBatch(batchId); report(r); if (r.ok) setGone(true); });
    }}>{pending ? "Taking back…" : "Take back"}</button>
  );
}
