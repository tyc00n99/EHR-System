"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, Card, Textarea } from "@/components/kit";
import { setActivityLibrary } from "../actions";

/** Supervisor editor for the daily-activity statements caregivers can pick on a note. */
export function ActivityLibrary({ personId, firstName, library, defaults, manage }: { personId: string; firstName: string; library: string[]; defaults: string[]; manage: boolean }) {
  const custom = library.length > 0;
  const [text, setText] = useState(custom ? library.join("\n") : "");
  const [pending, start] = useTransition();
  const current = custom ? library : defaults;
  return (
    <Card title="Daily activity library" description={`What caregivers can pick under Daily activities on ${firstName}'s notes. Write {name} where ${firstName}'s name should go.`} className="mt-6">
      <ul className="max-h-64 divide-y divide-line-soft overflow-y-auto">
        {current.map((a) => <li key={a} className="px-5 py-2 text-[13px]">{a.replace(/\{name\}/g, firstName)}</li>)}
      </ul>
      {manage && (
        <form className="border-t border-line-soft px-5 py-4" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await setActivityLibrary(personId, text); if (r.errors) toast.error(r.message ?? "Could not save."); else toast.success(r.message ?? "Saved."); }); }}>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={custom ? "" : "Leave empty to keep the default list, or paste your own, one activity per line."} className="min-h-32" />
          <div className="mt-3 flex items-center gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : custom ? "Save library" : "Use this list"}</Button>
            {custom && <Button type="button" variant="outline" disabled={pending} onClick={() => { setText(""); start(async () => { const r = await setActivityLibrary(personId, ""); toast.success(r.message ?? "Reset."); }); }}>Back to defaults</Button>}
          </div>
        </form>
      )}
    </Card>
  );
}
