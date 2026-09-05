"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/kit";
import { setClientCode } from "../actions";

export function ClientCodePanel({ personId, hasCode, setAt, sentAt, sentTo, phone, consent }: { personId: string; hasCode: boolean; setAt: string | null; sentAt: string | null; sentTo: string | null; phone: string | null; consent: boolean }) {
  const [code, setCode] = useState<string>();
  const [texted, setTexted] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [pending, start] = useTransition();
  const generate = () => {
    if (hasCode && !confirm("Generate a new code? The old code stops working immediately.")) return;
    start(async () => { const r = await setClientCode(personId); setCode(r.texted ? undefined : r.code); setTexted(Boolean(r.texted)); setMsg(r.message); });
  };
  return (
    <div>
      {texted ? (
        <div className="rounded-lg border border-ok/30 bg-ok-soft px-3 py-2.5 text-[13px] text-ok">New code texted to the client. Staff never see it.</div>
      ) : code ? (
        <div className="flex items-center gap-3 rounded-lg border border-ok/30 bg-ok-soft px-3 py-2.5">
          <span className="rounded-md border border-ok/30 bg-page px-2.5 py-1 font-mono text-[18px] font-semibold tracking-[0.18em] text-text-strong">{code}</span>
          <span className="text-[12.5px] leading-4 text-ok">New signing code. Give it to the person now; it is not shown again.</span>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">{hasCode ? `Code set ${setAt}${sentAt ? `, texted to ${sentTo}` : phone ? ", not texted yet" : ". No mobile number on file, so read it to the client"}. The person enters it on the staff phone to sign each shift note.` : "No signing code yet. Without one the person cannot sign shift notes."}</p>
      )}
      {msg && <p className="mt-2 text-[13px] text-danger">{msg}</p>}
      {!sentAt && (
        <p className="mt-2 text-[13px] text-muted-foreground">
          {!phone ? "No mobile number on file, so codes have to be read to the client." : !consent ? "The client has not agreed to receive texts, so codes have to be read to them." : "Codes will be texted once texting is switched on."}
        </p>
      )}
      <Button variant={hasCode ? "outline" : "primary"} className="mt-3" disabled={pending} onClick={generate}>{pending ? "Generating…" : hasCode ? "Generate a new code" : "Generate signing code"}</Button>
    </div>
  );
}
