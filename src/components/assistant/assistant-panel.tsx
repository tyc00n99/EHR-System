"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import type { Ability } from "@/lib/abilities";
import type { AssistantContext } from "@/lib/ai/assistant/types";
import { AssistantChat, type Suggestion } from "./assistant-chat";

/**
 * The assistant on every screen (Oct 18, 2026): a button in the top strip (or ⌘J) slides a panel in
 * from the right. The page underneath stays usable — it is not a dialog — and the panel reads where
 * you are from the URL, so on Kevin's record it is "about Kevin" and its suggestions change with it.
 * Any screen can open it with a question already asked: `openAssistant("…")`.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const OPEN_EVENT = "evvora:assistant";

export function openAssistant(prompt?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { prompt } }));
}

function contextFrom(path: string): AssistantContext {
  const client = new RegExp(`^/clients/(${UUID})`).exec(path);
  const staff = new RegExp(`^/staff/(${UUID})`).exec(path);
  return { path, personId: client?.[1], staffId: staff?.[1] };
}

function suggestionsFor(ctx: AssistantContext, abilities: readonly Ability[], name?: string): Suggestion[] {
  const reviewer = abilities.includes("edit_visits");
  const who = name ?? "this client";
  if (ctx.personId && reviewer) return [
    { label: "Summarize progress", prompt: `Summarize ${who}'s progress over the last 90 days: each outcome, what the notes and answers show, and anything that changed. Cite the records.` },
    { label: "Draft a progress summary", prompt: `Draft a progress summary report for ${who} covering the last 90 days, for the support team and case manager.` },
    { label: "Find documentation gaps", prompt: `Find documentation gaps for ${who} in the last 30 days, including required documents and authorizations, and tell me what to fix first.` },
    { label: "Draft an incident report", prompt: `Help me draft an incident report for ${who}. Ask me what happened first if you need to.` },
    { label: "Medication adherence", prompt: `How has ${who}'s medication record looked over the last 30 days? Call out refusals, held and missed doses.` },
  ];
  if (ctx.personId) return [
    { label: "Before my visit", prompt: `What should I know before my visit with ${who} today: outcomes to work on, medications due and daily activities?` },
    { label: "Draft an incident report", prompt: `Help me draft an incident report for ${who}. Ask me what happened first.` },
  ];
  if (ctx.staffId && abilities.includes("view_team")) return [
    { label: "Documentation quality", prompt: `How has ${name ?? "this caregiver"}'s documentation looked over the last 30 days? Point out patterns and notes to follow up on.` },
    { label: "Personnel file", prompt: `What is open or due soon in ${name ?? "this staff member"}'s personnel file?` },
  ];
  if (abilities.includes("review")) return [
    { label: "What needs me today?", prompt: "What needs my attention today? Group it by what is most urgent and tell me where to start." },
    { label: "Documentation gaps", prompt: "Find documentation gaps across the agency in the last 14 days and summarize the patterns: which caregivers, which kinds of gaps." },
    { label: "Authorizations running out", prompt: "Which authorizations are running low on units or ending soon?" },
    { label: "Trends this month", prompt: "Compare this month's notes with last month's: volume, unsigned notes, returns and manual entries. What stands out?" },
  ];
  return [
    { label: "My schedule this week", prompt: "What is on my schedule this week?" },
    { label: "Help with a note", prompt: "How do I get help writing my note?" },
  ];
}

export function AssistantLauncher({ abilities, names, enabled }: { abilities: readonly Ability[]; names: { href: string; label: string }[]; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [queued, setQueued] = useState<string | null>(null);
  const path = usePathname();
  const params = useSearchParams();
  const ctx = contextFrom(path);
  const visit = params.get("visit");
  const name = names.find((n) => n.href === (ctx.personId ? `/clients/${ctx.personId}` : ctx.staffId ? `/staff/${ctx.staffId}` : ""))?.label;
  const label = ctx.personId ? name ?? "this client" : ctx.staffId ? name ?? "this staff member" : undefined;
  const key = ctx.personId ?? ctx.staffId ?? "agency";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setOpen((o) => !o); } else if (e.key === "Escape") setOpen(false); };
    const onOpen = (e: Event) => { setOpen(true); const p = (e as CustomEvent<{ prompt?: string }>).detail?.prompt; if (p) setQueued(p); };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(OPEN_EVENT, onOpen); };
  }, []);

  if (!enabled) return null;
  const suggestions = suggestionsFor(ctx, abilities, name?.split(" ")[0]);
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-keyshortcuts="Meta+J" title="Assistant (⌘J)" className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium hover:bg-hover ${open ? "border-brand text-brand-ink" : "border-line text-text"}`}>
        <Sparkles className="size-4" /><span className="hidden sm:inline">Assistant</span>
      </button>
      {open && (
        <aside aria-label="Assistant" className="fixed inset-x-0 bottom-0 top-[56px] z-40 flex flex-col border-l border-line bg-card shadow-xl sm:left-auto sm:w-[440px]">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
            <Sparkles className="size-4 text-brand-ink" />
            <span className="text-[14px] font-medium text-text-strong">Assistant</span>
            {visit && <span className="truncate text-[13px] text-muted-foreground">· the note has its own assistant under Progress review</span>}
            <span className="flex-1" />
            <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="flex size-8 items-center justify-center rounded-full text-text hover:bg-hover"><X className="size-4" /></button>
          </div>
          <PanelBody key={key} ctx={ctx} label={label} suggestions={suggestions} canSave={abilities.includes("manage_people")} queued={queued} onQueuedTaken={() => setQueued(null)} />
        </aside>
      )}
    </>
  );
}

function PanelBody({ ctx, label, suggestions, canSave, queued, onQueuedTaken }: { ctx: AssistantContext; label?: string; suggestions: Suggestion[]; canSave: boolean; queued: string | null; onQueuedTaken: () => void }) {
  return <AssistantChat context={ctx} suggestions={suggestions} canSave={canSave} contextLabel={label} heading={label ? `What do you need for ${label.split(" ")[0]}?` : "What should we work on?"} autoAsk={queued} onAutoAsked={onQueuedTaken} />;
}

/**
 * The assistant on the office home page (Oct 18, 2026, user: "right under Welcome Mustafa"): the
 * same chat as the side panel, inline in a card under the greeting, so the home screen opens on it.
 */
export function HomeAssistant({ abilities }: { abilities: readonly Ability[] }) {
  return (
    <div className="flex h-[min(540px,64vh)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-card text-left shadow-sm">
      <AssistantChat
        context={{ path: "/" }}
        canSave={false}
        heading="What should we work on?"
        suggestions={suggestionsFor({ path: "/" }, abilities)}
      />
    </div>
  );
}
