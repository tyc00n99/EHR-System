"use client";

import { useTransition } from "react";
import { setAgreementStatus } from "../actions";

export function AgreementStatusButton({ id, personId, status }: { id: string; personId: string; status: string }) {
  const [pending, start] = useTransition();
  const cls = "text-xs font-medium hover:underline disabled:opacity-50";
  if (status === "active") {
    return (
      <button disabled={pending} className={`${cls} text-danger`} onClick={() => { if (confirm("Cancel this service agreement? Visits can no longer be recorded against it.")) start(() => setAgreementStatus(id, personId, "cancelled")); }}>
        Cancel
      </button>
    );
  }
  return <button disabled={pending} className={`${cls} text-primary`} onClick={() => start(() => setAgreementStatus(id, personId, "active"))}>Reactivate</button>;
}
