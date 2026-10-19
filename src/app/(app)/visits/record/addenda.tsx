"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, Textarea } from "@/components/kit";
import { addNoteAddendum } from "../record-actions";

export interface AddendumView { id: string; body: string; author: string; at: string }

/** Addenda under a note: the record of every change made after it was approved for billing. */
export function Addenda({ visitId, items, canAdd }: { visitId: string; items: AddendumView[]; canAdd: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  if (!items.length && !canAdd) return null;
  return (
    <section className="rounded-md border border-line bg-card">
      <div className="flex items-center justify-between border-b border-line-soft px-3 py-2">
        <div className="text-[13px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Addenda{items.length ? ` · ${items.length}` : ""}</div>
        {canAdd && !open && <button type="button" onClick={() => setOpen(true)} className="text-[13px] font-medium text-primary hover:underline">+ Add addendum</button>}
      </div>
      {items.length === 0 && !open && <p className="px-3 py-2.5 text-[13px] text-muted-foreground">No addenda. The note above is as it was approved.</p>}
      {items.length > 0 && (
        <ul className="divide-y divide-line-soft">
          {items.map((a) => <li key={a.id} className="px-3 py-2.5 text-[13px]"><div className="text-muted-foreground">{a.at} · {a.author}</div><div className="mt-0.5 whitespace-pre-line text-text">{a.body}</div></li>)}
        </ul>
      )}
      {open && (
        <form className="grid gap-2 border-t border-line-soft px-3 py-3" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addNoteAddendum(visitId, text);
            if (r.message === "Addendum added.") { toast.success(r.message); setText(""); setOpen(false); } else toast.error(r.message ?? "Could not add the addendum.");
          });
        }}>
          <Textarea aria-label="Addendum" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="What this adds or corrects, and why." />
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending || text.trim().length < 3}>{pending ? "Adding…" : "Add addendum"}</Button></div>
        </form>
      )}
    </section>
  );
}
