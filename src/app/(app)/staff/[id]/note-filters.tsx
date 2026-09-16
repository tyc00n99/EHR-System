"use client";

import { useRouter } from "next/navigation";
import { FilterMenu } from "@/components/filter-menu";

/**
 * Filters for the staff record's Notes tab: which client, which service. Both live in the query
 * string, so a filtered list can be linked to and survives closing a note preview.
 */
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
      <FilterMenu aria-label="Filter by client" value={client} onChange={(v) => go({ client: v })} options={[{ value: "", label: "All clients" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]} />
      <FilterMenu aria-label="Filter by service" value={code} onChange={(v) => go({ code: v })} options={[{ value: "", label: "All services" }, ...codes.map((c) => ({ value: c.code, label: c.label, hint: c.code }))]} />
      {active && (
        <button type="button" onClick={() => go({ client: "", code: "" })} className="h-9 rounded-lg px-2.5 text-[14px] font-medium text-primary hover:bg-primary-soft">
          Clear
        </button>
      )}
    </div>
  );
}
