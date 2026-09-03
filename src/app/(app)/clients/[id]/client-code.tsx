"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/kit";
import { setClientCode } from "../actions";

export function ClientCodePanel({ personId, hasCode, setAt }: { personId: string; hasCode: boolean; setAt: string | null }) {
  const [code, setCode] = useState<string>();
  const [msg, setMsg] = useState<string>();
  const [pending, start] = useTransition();
  const generate = () => {
    if (hasCode && !confirm("Generate a new code? The old code stops working immediately.")) return;
    start(async () => { const r = await setClientCode(personId); setCode(r.code); setMsg(r.message); });
  };
  return (
    <div>
      {code ? (
        <div className="rounded-md border border-ok/30 bg-ok-soft p-3">
          <div className="text-[13px] text-ok">New signing code. Give it to the person now. It is not shown again.</div>
          <div className="mt-1 text-[28px] font-bold tracking-[0.2em] text-text-strong tabular-nums">{code}</div>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">{hasCode ? `Code set ${setAt}. The person enters it on the staff phone to sign each shift note.` : "No signing code yet. Without one the person cannot sign shift notes."}</p>
      )}
      {msg && <p className="mt-2 text-[13px] text-danger">{msg}</p>}
      <Button variant={hasCode ? "outline" : "primary"} className="mt-3" disabled={pending} onClick={generate}>{pending ? "Generating…" : hasCode ? "Generate a new code" : "Generate signing code"}</Button>
    </div>
  );
}
