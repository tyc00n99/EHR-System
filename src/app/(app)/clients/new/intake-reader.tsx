"use client";

import { startTransition, useActionState } from "react";
import { cx } from "@/components/kit";
import { Icon } from "@/components/icons";
import type { Person } from "@/db/schema";
import type { ActionState } from "@/lib/validation";
import { readIntakeFile, type IntakeReadState } from "../actions";
import { PersonForm } from "../person-form";

/**
 * "Start from a referral packet": choose the county's referral, the CSSP or a prior provider's
 * record and the new-client form below fills in from it. The packet is not stored here — the
 * record does not exist yet — so the band reminds the person to file it under Documents after
 * saving. Everything the reader found that has no field on this form (diagnoses, medications)
 * is listed so it is not lost.
 */

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const LABELS: Partial<Record<keyof Person, string>> = {
  firstName: "first name", lastName: "last name", preferredName: "preferred name", dob: "date of birth", sexAtBirth: "sex at birth", pmi: "PMI", waiverProgram: "waiver",
  county: "county", serviceStartDate: "service start", address1: "address", address2: "apt / unit", city: "city", state: "state", zip: "ZIP", phone: "phone", email: "email",
  caseManagerName: "case manager", caseManagerPhone: "case manager phone", caseManagerEmail: "case manager email",
  guardianName: "guardian", guardianRelationship: "guardian relationship", guardianPhone: "guardian phone", guardianEmail: "guardian email",
  emergencyContactName: "emergency contact", emergencyContactRelationship: "emergency contact relationship", emergencyContactPhone: "emergency contact phone", emergencyContactEmail: "emergency contact email",
};

export function IntakeReader({ action, aiReady }: { action: Action; aiReady: boolean }) {
  const [rs, runRead, reading] = useActionState(readIntakeFile, {} as IntakeReadState);
  const r = rs.read;
  const defaults: Partial<Person> = {};
  if (r) {
    for (const k of Object.keys(LABELS) as (keyof typeof LABELS)[]) {
      const v = (r as Record<string, unknown>)[k];
      if (v != null && v !== "") (defaults as Record<string, unknown>)[k] = k === "pmi" ? String(v).replace(/\D/g, "") : k === "state" ? String(v).toUpperCase().slice(0, 2) : v;
    }
  }
  const read = (f: File) => { const fd = new FormData(); fd.append("file", f); startTransition(() => runRead(fd)); };
  const filled = (Object.keys(defaults) as (keyof typeof LABELS)[]).map((k) => LABELS[k]).filter(Boolean);

  return (
    <div>
      {/* The packet is a drop zone, not the browser's bare "Choose File" control (Sept 29, 2026). */}
      <label
        onDragOver={(ev) => { if (aiReady) ev.preventDefault(); }}
        onDrop={(ev) => { ev.preventDefault(); const f = ev.dataTransfer.files?.[0]; if (f && aiReady && !reading) read(f); }}
        className={cx("flex items-center gap-4 rounded-xl border-2 border-dashed border-line bg-card-soft px-5 py-4 transition-colors", aiReady && !reading ? "cursor-pointer hover:border-primary hover:bg-primary-soft" : "opacity-70")}
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-card text-primary shadow-[var(--shadow-sm)]"><Icon.doc size={20} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-text-strong">Start from a referral packet</span>
          <span className="mt-0.5 block text-[13.5px] text-muted-foreground">
            {aiReady ? "Drop the county referral, CSSP or a prior provider's record here, or click to choose. The form fills in; you check it." : "Document reading is off. An admin can turn it on with ANTHROPIC_API_KEY. Type the client in below."}
          </span>
        </span>
        {aiReady && <span className="hidden shrink-0 rounded-lg border border-line bg-card px-3 py-1.5 text-[13.5px] font-medium text-text-strong sm:block">Choose file</span>}
        <input
          type="file" accept=".pdf,image/*" aria-label="Referral packet" disabled={!aiReady || reading} className="sr-only"
          onChange={(ev) => { const f = ev.currentTarget.files?.[0]; if (f) read(f); }}
        />
      </label>
      <div className="mb-5">
        {reading && <p className="mt-2 flex items-center gap-2 text-[13.5px] text-primary"><span className="inline-block size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" /> Reading {rs.fileName ?? "the document"}…</p>}
        {!reading && rs.readId && (
          <div className={cx("mt-3 rounded-lg px-3 py-2.5 text-[13.5px]", r ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
            {r ? (
              <>
                <div className="font-medium">Read {rs.fileName}. Check every field below before saving.</div>
                {r.summary && <div className="mt-0.5">{r.summary}</div>}
                <div className="mt-1">{filled.length ? `Filled in: ${filled.join(", ")}.` : "Nothing on the page matched a field on this form."}</div>
                {r.diagnoses.length > 0 && <div className="mt-1">Diagnoses on the page — add them under Profile → Medical information after saving: {r.diagnoses.map((d) => (d.code ? `${d.code} ${d.description}` : d.description)).join("; ")}.</div>}
                {r.medications.length > 0 && <div className="mt-1">Medications on the page — add them under Medication after saving: {r.medications.join("; ")}.</div>}
                {r.notes && <div className="mt-1">Reviewer note: {r.notes}</div>}
                <div className="mt-1">After saving, file the packet itself under Documents so it stays with the record.</div>
              </>
            ) : <div>{rs.message}</div>}
          </div>
        )}
      </div>
      <PersonForm key={rs.readId ?? 0} action={action} defaults={defaults} cancelHref="/clients" />
    </div>
  );
}
