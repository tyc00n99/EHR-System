"use client";

import { Pencil, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, Card, Input } from "@/components/kit";
import { setActivityLibrary } from "../actions";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Supervisor editor for the daily-activity statements caregivers can pick on a note.
 *
 * The list is edited one row at a time — add, edit, remove — and every row is shown and typed
 * with the person's real first name. Storage still uses the {name} token (so the default list can
 * serve every client), but that is a detail of the save: the name is swapped for the token on the
 * way in and back on the way out, and nobody has to write it.
 */
export function ActivityLibrary({ personId, firstName, library, defaults, manage }: { personId: string; firstName: string; library: string[]; defaults: string[]; manage: boolean }) {
  const custom = library.length > 0;
  const rows = (custom ? library : defaults).map((a) => a.replace(/\{name\}/g, firstName));
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const [pending, start] = useTransition();
  const nameRe = new RegExp(`\\b${escapeRe(firstName)}\\b`, "g");

  const save = (next: string[], done: string) =>
    start(async () => {
      const r = await setActivityLibrary(personId, next.map((l) => l.replace(nameRe, "{name}")).join("\n"));
      if (r.errors) toast.error(r.message ?? "Could not save.");
      else { toast.success(done); setDraft(""); setEditing(null); }
    });

  return (
    <Card title="Daily activity library" description={`What caregivers can pick under Daily activities on ${firstName}'s notes.${custom ? "" : " This is the standard list; change anything and it becomes this client's own."}`} className="mt-6">
      <ol className="divide-y divide-line-soft">
        {rows.map((a, i) => (
          <li key={`${i}-${a}`} className="flex items-center gap-3 px-5 py-2 text-[13.5px]">
            <span className="w-6 shrink-0 text-right text-[13px] tabular-nums">{i + 1}.</span>
            {editing?.index === i ? (
              <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); const t = editing.text.trim(); if (t.length < 3) return; save(rows.map((r, j) => (j === i ? t : r)), "Activity updated."); }}>
                <Input autoFocus value={editing.text} onChange={(e) => setEditing({ index: i, text: e.target.value })} maxLength={240} className="h-8 flex-1" />
                <Button type="submit" className="h-8" disabled={pending}>Save</Button>
                <Button type="button" variant="ghost" className="h-8" onClick={() => setEditing(null)}>Cancel</Button>
              </form>
            ) : (<>
              <span className="min-w-0 flex-1">{a}</span>
              {manage && (
                <span className="flex shrink-0 items-center gap-1">
                  <button type="button" aria-label="Edit activity" disabled={pending} onClick={() => setEditing({ index: i, text: a })} className="flex size-7 items-center justify-center rounded-md hover:bg-hover"><Pencil size={14} /></button>
                  <button type="button" aria-label="Remove activity" disabled={pending} onClick={() => save(rows.filter((_, j) => j !== i), "Activity removed.")} className="flex size-7 items-center justify-center rounded-md hover:bg-hover hover:text-danger"><X size={15} /></button>
                </span>
              )}
            </>)}
          </li>
        ))}
      </ol>
      {manage && (
        <form className="border-t border-line-soft px-5 py-4" onSubmit={(e) => { e.preventDefault(); const t = draft.trim(); if (t.length < 3) { toast.error("Write the activity first."); return; } save([...rows, t], "Activity added."); }}>
          <div className="flex items-center gap-2">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={240} placeholder={`Walked with ${firstName} to the mailbox and back`} aria-label="New activity" className="h-9 flex-1" />
            <Button type="submit" className="h-9 shrink-0" disabled={pending}>{pending ? "Saving…" : "Add"}</Button>
            {custom && <Button type="button" variant="outline" className="h-9 shrink-0" disabled={pending} onClick={() => save([], "Standard list restored.")}>Back to standard list</Button>}
          </div>
          <p className="mt-1.5 text-[13px]">Write it the way it should read on a note, using {firstName}&apos;s name.</p>
        </form>
      )}
    </Card>
  );
}
