"use client";

import { startTransition, useActionState } from "react";
import { cx } from "@/components/kit";
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
  const filled = (Object.keys(defaults) as (keyof typeof LABELS)[]).map((k) => LABELS[k]).filter(Boolean);

  return (
    <div className="max-w-4xl">
      <div className="mb-6 rounded-xl border border-line bg-card-soft p-5">
        <div className="text-[17px] font-semibold text-text-strong">Start from a referral packet</div>
        <p className="mt-1 text-[14px] text-muted-foreground">
          {aiReady ? "Choose the county referral, the CSSP or a prior provider's record — a PDF or a photo — and the form below fills in from it. Review every field before saving; the reader drafts, you confirm." : "Document reading is off. An admin can turn it on by adding ANTHROPIC_API_KEY to the app's environment settings. Type the client in below."}
        </p>
        <input
          type="file" accept=".pdf,image/*" aria-label="Referral packet" disabled={!aiReady || reading}
          onChange={(ev) => { const f = ev.currentTarget.files?.[0]; if (f) { const fd = new FormData(); fd.append("file", f); startTransition(() => runRead(fd)); } }}
          className="mt-3 block h-10 w-full max-w-md rounded-lg border border-line bg-card px-2 pt-1.5 text-[13px] file:mr-2 file:rounded file:border-0 file:bg-panel file:px-2 file:py-0.5 file:text-[13px] disabled:opacity-60"
        />
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
