"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/kit";

/**
 * A caregiver renders under one identifier, an NPI or a UMPI, never both (Sept 28, 2026, user's
 * request). One menu picks which, one box takes it; the form still receives `npi` and `umpi`
 * (the other one empty), so the schema's "one of them" rule and every reader are unchanged.
 */
export function RenderingIdField({ npi = "", umpi = "", errors = {} }: { npi?: string | null; umpi?: string | null; errors?: { npi?: string; umpi?: string } }) {
  const [kind, setKind] = useState<"npi" | "umpi">(umpi && !npi ? "umpi" : "npi");
  const [value, setValue] = useState(kind === "umpi" ? (umpi ?? "") : (npi ?? ""));
  const isNpi = kind === "npi";
  return (
    <>
      <input type="hidden" name="npi" value={isNpi ? value.trim() : ""} />
      <input type="hidden" name="umpi" value={isNpi ? "" : value.trim().toUpperCase()} />
      <Field label="Identifier" className="md:col-span-2">
        <Select value={kind} onChange={(e) => { setKind(e.target.value as "npi" | "umpi"); setValue(""); }} aria-label="Which identifier">
          <option value="npi">NPI</option>
          <option value="umpi">UMPI</option>
        </Select>
      </Field>
      <Field label={isNpi ? "NPI number" : "UMPI"} error={errors.npi || errors.umpi} hint={isNpi ? "10 digits" : "10 characters from MHCP enrollment"} className="md:col-span-4">
        <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode={isNpi ? "numeric" : undefined} className={isNpi ? "tabular-nums" : "uppercase"} placeholder={isNpi ? "1234567890" : "A123456789"} required aria-label={isNpi ? "NPI number" : "UMPI"} />
      </Field>
    </>
  );
}
