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
  // A file that has been read is the normal state and says nothing; only the exception is marked.
  if (hasText) return null;
  void summary;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px]">
      <span className="opacity-60">text not read</span>
      {aiReady && (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { const r = kind === "client" ? await indexClientDocument(id, ownerId) : await indexStaffDocument(id, ownerId); if (r.ok) toast.success("Read. The document is searchable now."); else toast.error(r.error ?? "Could not read it."); })}
          className="font-medium text-primary hover:underline disabled:opacity-60"
        >
          {pending ? "Reading…" : "Read"}
        </button>
      )}
    </span>
  );
}
