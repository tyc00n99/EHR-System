"use client";

import { FilterMenu } from "@/components/filter-menu";
import { useState } from "react";
import { DownloadButton } from "@/components/download-button";
import { Field } from "@/components/kit";
import { DateInput } from "@/components/date-input";

export interface NotesReportClient { id: string; name: string; pmi: string; services: { code: string; label: string }[] }

/**
 * Progress-notes export picker. Builds the same PDF the client Notes tab downloads,
 * filtered to one service type and a date range, so the county gets exactly the notes it asked for.
 */
export function NotesReport({ clients, defaultFrom, defaultTo }: { clients: NotesReportClient[]; defaultFrom: string; defaultTo: string }) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const client = clients.find((c) => c.id === clientId);
  const [code, setCode] = useState("");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const url = clientId ? `/clients/${clientId}/notes.pdf?${new URLSearchParams({ ...(code ? { code } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) })}` : "#";
  return (
    <div className="grid gap-4 px-5 py-4 md:grid-cols-[1.6fr_1.8fr_1fr_1fr_auto] md:items-end">
      <Field label="Client">
        <FilterMenu aria-label="Client" value={clientId} onChange={(v) => { setClientId(v); setCode(""); }} className="w-full" options={clients.map((c) => ({ value: c.id, label: c.name, hint: `PMI ${c.pmi}` }))} />
      </Field>
      <Field label="Service type">
        <FilterMenu aria-label="Service type" value={code} onChange={setCode} className="w-full" options={[{ value: "", label: "All services" }, ...(client?.services ?? []).map((s) => ({ value: s.code, label: s.label, hint: s.code }))]} />
      </Field>
      <Field label="From"><DateInput value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label="To"><DateInput value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      <DownloadButton href={url} icon="doc" className={clientId ? "" : "pointer-events-none opacity-50"}>Notes PDF</DownloadButton>
    </div>
  );
}
