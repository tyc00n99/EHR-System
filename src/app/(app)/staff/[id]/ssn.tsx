"use client";

import { useState, useTransition } from "react";
import { revealSsn } from "../actions";

export function SsnField({ staffId, last4, canReveal }: { staffId: string; last4: string; canReveal: boolean }) {
  const [ssn, setSsn] = useState<string>();
  const [pending, start] = useTransition();
  if (ssn) return <span className="tabular-nums">{ssn} <button onClick={() => setSsn(undefined)} className="ml-1 text-xs text-muted hover:underline">hide</button></span>;
  return (
    <span className="tabular-nums">
      •••-••-{last4}
      {canReveal && <button disabled={pending} onClick={() => { if (confirm("Reveal the full SSN? This is recorded in the audit log.")) start(async () => { const r = await revealSsn(staffId); setSsn(r.ssn ?? r.message); }); }} className="ml-2 text-xs font-medium text-accent hover:underline disabled:opacity-50">{pending ? "…" : "reveal"}</button>}
    </span>
  );
}
