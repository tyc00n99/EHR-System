"use client";

import { useRouter } from "next/navigation";
import { cx } from "@/components/kit";

/**
 * Filters for the staff record's Notes tab: which client, which service. Both live in the query
 * string, so a filtered list can be linked to and survives closing a note preview.
 */
const CONTROL = "own-focus h-9 rounded-lg border border-line bg-card px-3 text-[14px] text-text transition-[box-shadow,border-color] focus:border-primary focus:ring-4 focus:ring-primary-soft";

export function NoteFilters({
  staffId, client, code, clients, codes,
}: {
  staffId: string;
  client: string;
  code: string;
  clients: { id: string; name: string }[];
  codes: { code: string; label: string }[];
}) {
  const router = useRouter();
  const go = (patch: { client?: string; code?: string }) => {
    const p = new URLSearchParams({ tab: "visits", client, code, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    router.push(`/staff/${staffId}?${p}`, { scroll: false });
  };
  const active = Boolean(client || code);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={client} onChange={(e) => go({ client: e.target.value })} aria-label="Filter by client" className={cx(CONTROL, "max-w-[220px]")}>
        <option value="">All clients</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select value={code} onChange={(e) => go({ code: e.target.value })} aria-label="Filter by service" className={cx(CONTROL, "max-w-[300px]")}>
        <option value="">All services</option>
        {codes.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.label}</option>)}
      </select>
      {active && (
        <button type="button" onClick={() => go({ client: "", code: "" })} className="h-9 rounded-lg px-2.5 text-[14px] font-medium text-primary hover:bg-primary-soft">
          Clear
        </button>
      )}
    </div>
  );
}
