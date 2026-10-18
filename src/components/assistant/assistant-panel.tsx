"use client";

import { useState } from "react";
import { ArrowUp, ChevronRight, Sparkles } from "lucide-react";
import type { Ability } from "@/lib/abilities";
import { AssistantChat, type Suggestion } from "./assistant-chat";

/**
 * The assistant lives on the office home page only (Oct 18, 2026, user: "The AI assistant should
 * only be on this screen, nowhere else") — the top-strip launcher, the ⌘J shortcut and the
 * slide-over panel are gone. The home screen is the assistant: greeting, one ask bar and the
 * suggestion list centred in the viewport; the conversation takes the page over once something is
 * asked. The note-writing helper inside the service record is separate and stays.
 */

function homeSuggestions(abilities: readonly Ability[]): Suggestion[] {
  if (abilities.includes("review")) return [
    { label: "What needs me today?", detail: "Unsigned notes, returned notes and missed shifts", prompt: "What needs my attention today? Group it by what is most urgent and tell me where to start." },
    { label: "Documentation gaps", detail: "Completed visits still missing a note", prompt: "Find documentation gaps across the agency in the last 14 days and summarize the patterns: which caregivers, which kinds of gaps." },
    { label: "Authorizations running out", detail: "Units at 75% or ending within 60 days", prompt: "Which authorizations are running low on units or ending soon?" },
    { label: "Trends this month", detail: "Hours, units and notes against last month", prompt: "Compare this month's notes with last month's: volume, unsigned notes, returns and manual entries. What stands out?" },
  ];
  return [
    { label: "My schedule this week", detail: "What is booked and with whom", prompt: "What is on my schedule this week?" },
    { label: "Help with a note", detail: "Where to get help writing a note", prompt: "How do I get help writing my note?" },
  ];
}

export function HomeAssistant({ abilities, name }: { abilities: readonly Ability[]; name: string }) {
  const [draft, setDraft] = useState("");
  const [opener, setOpener] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const suggestions = homeSuggestions(abilities);
  const start = (q: string) => { if (!q.trim()) return; setOpener(q.trim()); setStarted(true); };

  if (started) return (
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col text-left">
      <AssistantChat context={{ path: "/" }} canSave={false} suggestions={suggestions} autoAsk={opener} onAutoAsked={() => setOpener(null)} />
    </div>
  );

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 pb-[6vh]">
      <p className="text-center text-[32px] font-bold tracking-tight text-primary">Welcome, {name}</p>
      <form
        className="own-focus mt-7 flex w-full max-w-2xl items-center gap-3 rounded-full border border-line bg-card py-2 pl-5 pr-2 shadow-sm transition-colors focus-within:border-gray-400"
        onSubmit={(e) => { e.preventDefault(); start(draft); }}
      >
        <Sparkles className="size-4 shrink-0 text-primary" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask a question or ask for a draft…"
          aria-label="Message the assistant"
          className="h-9 min-w-0 flex-1 bg-transparent text-[15px] text-text-strong placeholder:text-hint focus:outline-none"
        />
        <button type="submit" disabled={!draft.trim()} aria-label="Send" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-30">
          <ArrowUp className="size-4" />
        </button>
      </form>
      <div className="mt-4 w-full max-w-2xl divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
        {suggestions.map((s) => (
          <button key={s.label} type="button" onClick={() => start(s.prompt)} className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-hover">
            <Sparkles className="size-3.5 shrink-0 text-primary" />
            <span className="shrink-0 text-[14px] font-semibold text-text-strong">{s.label}</span>
            {s.detail && <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{s.detail}</span>}
            <ChevronRight className="size-4 shrink-0 text-hint" />
          </button>
        ))}
      </div>
    </div>
  );
}
