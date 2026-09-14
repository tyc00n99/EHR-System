"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { indexClientDocument } from "@/app/(app)/clients/document-actions";
import { indexStaffDocument } from "@/app/(app)/staff/document-actions";

/**
 * Beside every filed document: "Searchable" once its text has been read, with the reader's one-line
 * description as the tooltip; otherwise a Read button for files uploaded before reading existed.
 */
export function DocumentTextChip({ kind, id, ownerId, hasText, summary, aiReady }: { kind: "client" | "staff"; id: string; ownerId: string; hasText: boolean; summary: string | null; aiReady: boolean }) {
  const [pending, start] = useTransition();
  if (hasText) return <span title={summary ?? undefined} className="inline-flex h-7 items-center rounded-full bg-ok-soft px-2.5 text-[13px] font-medium text-ok">Searchable</span>;
  if (!aiReady) return null;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { const r = kind === "client" ? await indexClientDocument(id, ownerId) : await indexStaffDocument(id, ownerId); if (r.ok) toast.success("Read. The document is searchable now."); else toast.error(r.error ?? "Could not read it."); })}
      className="inline-flex h-7 items-center rounded-full border border-line bg-card px-2.5 text-[13px] font-medium text-text-strong hover:bg-hover disabled:opacity-60"
    >
      {pending ? "Reading…" : "Read"}
    </button>
  );
}
