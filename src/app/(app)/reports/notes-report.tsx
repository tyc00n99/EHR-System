"use client";

import { useState } from "react";
import { DownloadButton } from "@/components/download-button";
import { Field, Input, Select } from "@/components/kit";

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
        <Select value={clientId} onChange={(e) => { setClientId(e.target.value); setCode(""); }}>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name} · PMI {c.pmi}</option>)}
        </Select>
      </Field>
      <Field label="Service type">
        <Select value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">All services</option>
          {client?.services.map((s) => <option key={s.code} value={s.code}>{s.label} · {s.code}</option>)}
        </Select>
      </Field>
      <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      <DownloadButton href={url} icon="doc" className={clientId ? "" : "pointer-events-none opacity-50"}>Notes PDF</DownloadButton>
    </div>
  );
}
