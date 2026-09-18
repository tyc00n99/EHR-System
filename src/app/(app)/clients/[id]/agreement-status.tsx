"use client";

import { useState, useTransition } from "react";
import { setAgreementArchived, setAgreementStatus } from "../actions";

export function AgreementStatusButton({ id, personId, status }: { id: string; personId: string; status: string }) {
  const [pending, start] = useTransition();
  const cls = "text-[13px] font-medium hover:underline disabled:opacity-50";
  if (status === "active") {
    return (
      <button disabled={pending} className={`${cls} text-danger`} onClick={() => { if (confirm("Cancel this service agreement? Visits can no longer be recorded against it.")) start(() => setAgreementStatus(id, personId, "cancelled")); }}>
        Cancel agreement
      </button>
    );
  }
  return <button disabled={pending} className={`${cls} text-primary`} onClick={() => start(() => setAgreementStatus(id, personId, "active"))}>Reactivate</button>;
}

/** Archive a non-active agreement, or bring an archived one back. Nothing is deleted either way. */
export function AgreementArchiveButton({ id, personId, archived }: { id: string; personId: string; archived: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        disabled={pending}
        className="text-[13px] font-medium text-muted-foreground hover:underline disabled:opacity-50"
        onClick={() => start(async () => { const r = await setAgreementArchived(id, personId, !archived); setMsg(r.message); })}
      >
        {archived ? "Restore" : "Archive"}
      </button>
      {msg && <span className="text-[13px] text-danger">{msg}</span>}
    </span>
  );
}
