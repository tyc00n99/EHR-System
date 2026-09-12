"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";
import { revealClientCode, setClientCode } from "../actions";

/**
 * The client's signing code.
 *
 * The code is hidden until someone asks for it, because it is the control that stops a caregiver
 * signing a note on the client's behalf. Asking is allowed — the client forgets, and staff have to
 * read it out — but every look is written to the audit log, so "who saw this code" is answerable.
 */
export function ClientCodePanel({
  personId, hasCode, setAt, rotatesOn, sentAt, sentTo, phone, consent, manage,
}: {
  personId: string; hasCode: boolean; setAt: string | null; rotatesOn: string | null;
  sentAt: string | null; sentTo: string | null; phone: string | null; consent: boolean; manage: boolean;
}) {
  const [code, setCode] = useState<string>();
  const [fresh, setFresh] = useState(false);
  const [pending, start] = useTransition();

  const generate = () => {
    if (hasCode && !confirm("Generate a new code? The old one stops working immediately.")) return;
    start(async () => {
      const r = await setClientCode(personId);
      if (r.code) { setCode(r.code); setFresh(true); }
      if (r.texted) toast.success("New code texted to the client.");
      else if (r.message) toast.message(r.message);
    });
  };

  const reveal = () => {
    if (code) { setCode(undefined); setFresh(false); return; }
    start(async () => {
      const r = await revealClientCode(personId);
      if (r.code) setCode(r.code);
      else if (r.message) toast.error(r.message);
    });
  };

  const delivery = sentAt
    ? { tone: "ok" as const, text: `Texted to ${sentTo} on ${sentAt}.` }
    : !phone
      ? { tone: "warn" as const, text: "No mobile number on file, so this has to be read to the client." }
      : !consent
        ? { tone: "warn" as const, text: "The client has not agreed to receive texts, so this has to be read to them." }
        : { tone: "warn" as const, text: "Texting is not switched on yet, so this has to be read to the client." };

  if (!hasCode) {
    return (
      <div>
        <p className="text-[12.5px] text-muted-foreground">No signing code yet. Without one this person cannot sign a shift note.</p>
        {manage && (
          <button type="button" onClick={generate} disabled={pending} className="mt-2 inline-flex h-8 items-center rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60">
            {pending ? "Generating…" : "Generate a code"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={cx("ident flex h-9 flex-1 items-center justify-center rounded-md border text-[17px] tracking-[0.22em]", code ? "border-primary bg-primary-soft text-primary" : "border-line bg-panel text-hint")}>
          {code ?? "••••••"}
        </span>
        {manage && (
          <button
            type="button"
            onClick={reveal}
            disabled={pending}
            aria-label={code ? "Hide the signing code" : "Show the signing code"}
            className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line text-muted-foreground hover:bg-hover hover:text-text-strong disabled:opacity-60"
          >
            <Icon.search size={15} />
          </button>
        )}
      </div>

      {fresh && <p className="mt-1.5 text-[12px] text-ok">New code. Give it to the person now.</p>}

      <dl className="mt-2.5 grid grid-cols-[78px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[12px]">
        <dt className="text-muted-foreground">Set</dt>
        <dd className="ident m-0 text-text-strong">{setAt}</dd>
        {rotatesOn && (<>
          <dt className="text-muted-foreground">Rotates</dt>
          <dd className="ident m-0 text-text-strong">{rotatesOn}</dd>
        </>)}
      </dl>

      <p className={cx("mt-2 text-[12px]", delivery.tone === "ok" ? "text-muted-foreground" : "text-warn")}>{delivery.text}</p>

      {manage && (
        <button type="button" onClick={generate} disabled={pending} className="mt-2.5 inline-flex h-8 items-center rounded-md border border-line bg-card px-3 text-[12.5px] font-medium text-text-strong hover:bg-hover disabled:opacity-60">
          {pending ? "Generating…" : "Generate a new code"}
        </button>
      )}
    </div>
  );
}
