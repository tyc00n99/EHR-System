"use client";

/**
 * Slack-shaped direct messages (Oct 2026): conversations down the left, the open thread on the
 * right with day dividers and grouped messages, the composer pinned at the bottom. Enter sends,
 * Shift+Enter breaks a line. The page re-reads itself every 25 seconds while visible, so a reply
 * shows up without anyone pressing anything.
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/kit";
import type { Conversation, MessageContact } from "@/db/message-queries";
import { markThreadRead, sendMessage } from "./actions";

interface Msg { id: string; senderId: string; body: string; at: string }
type ConversationRow = Omit<Conversation, "lastAt"> & { lastAt: string };

const ZONE = "America/Chicago";
const dayOf = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: ZONE, year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date(iso));
const timeOf = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" }).format(new Date(iso));

function Avatar({ initials, size = "size-9" }: { initials: string; size?: string }) {
  return <span className={cx(size, "grid shrink-0 place-items-center rounded-lg bg-primary-soft text-[13px] font-semibold text-primary")}>{initials}</span>;
}

function roleWord(c: MessageContact) {
  return c.title ?? (c.role === "admin" ? "Administrator" : c.role === "supervisor" ? "Supervisor" : "Direct support");
}

export function Messenger({ meId, meName, conversations, contacts, open, thread }: {
  meId: string;
  meName: string;
  conversations: ConversationRow[];
  contacts: MessageContact[];
  open: MessageContact | null;
  thread: Msg[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = thread.length ? thread[thread.length - 1].id : null;

  // Stay at the bottom of the thread, the way a chat is read.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, open?.userId]);

  // Opening a thread marks what they sent as read.
  useEffect(() => {
    if (open) void markThreadRead(open.userId);
  }, [open?.userId, lastId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Light polling so a reply arrives on its own while the page is open.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 25000);
    return () => clearInterval(t);
  }, [router]);

  function send() {
    if (!open || !draft.trim() || pending) return;
    const body = draft;
    setDraft("");
    setError(null);
    startTransition(async () => {
      const res = await sendMessage(open.userId, body);
      if ("error" in res) { setError(res.error); setDraft(body); }
      else router.refresh();
    });
  }

  const groups = useMemo(() => {
    const days: { day: string; runs: { senderId: string; at: string; items: Msg[] }[] }[] = [];
    for (const m of thread) {
      const day = dayOf(m.at);
      let d = days[days.length - 1];
      if (!d || d.day !== day) { d = { day, runs: [] }; days.push(d); }
      const run = d.runs[d.runs.length - 1];
      if (run && run.senderId === m.senderId && new Date(m.at).getTime() - new Date(run.items[run.items.length - 1].at).getTime() < 5 * 60 * 1000) run.items.push(m);
      else d.runs.push({ senderId: m.senderId, at: m.at, items: [m] });
    }
    return days;
  }, [thread]);

  const shown = contacts.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()));
  const started = new Set(conversations.map((c) => c.contact.userId));

  return (
    <div className="-mb-28 flex min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-card">
      {/* Conversations */}
      <aside className={cx("flex w-full shrink-0 flex-col border-r border-line md:w-72", open && "hidden md:flex")}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h1 className="text-[17px] font-semibold text-text-strong">Messages</h1>
          <button type="button" onClick={() => { setPicking((v) => !v); setFilter(""); }} className="rounded-md border border-line bg-card px-2.5 py-1 text-[13px] font-medium hover:bg-tab-hover">
            {picking ? "Back" : "+ New"}
          </button>
        </div>
        {picking ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-line p-2">
              <input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a person" className="w-full rounded-md border border-line bg-card px-2.5 py-1.5 text-[14px] outline-none focus:border-primary" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {shown.map((c) => (
                <button key={c.userId} type="button" className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-tab-hover" onClick={() => { setPicking(false); router.push(`/messages?with=${c.userId}`); }}>
                  <Avatar initials={c.initials} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium text-text-strong">{c.name}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">{roleWord(c)}{started.has(c.userId) ? " · already messaging" : ""}</span>
                  </span>
                </button>
              ))}
              {shown.length === 0 && <p className="px-4 py-6 text-[13.5px] text-muted-foreground">Nobody matches.</p>}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {conversations.map((c) => (
              <button key={c.contact.userId} type="button" onClick={() => router.push(`/messages?with=${c.contact.userId}`)}
                className={cx("flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-tab-hover", open?.userId === c.contact.userId && "bg-tab-hover")}>
                <Avatar initials={c.contact.initials} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cx("truncate text-[14px] text-text-strong", c.unread ? "font-semibold" : "font-medium")}>{c.contact.name}</span>
                    <span className="shrink-0 text-[12.5px] text-muted-foreground">{timeOf(c.lastAt)}</span>
                  </span>
                  <span className={cx("block truncate text-[13px]", c.unread ? "font-medium text-text-strong" : "text-muted-foreground")}>
                    {c.lastFromMe ? `You: ${c.lastBody}` : c.lastBody}
                  </span>
                </span>
                {c.unread > 0 && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11.5px] font-semibold text-primary-foreground">{c.unread}</span>}
              </button>
            ))}
            {conversations.length === 0 && (
              <p className="px-4 py-6 text-[13.5px] text-muted-foreground">No conversations yet. Press + New and write to someone on the team.</p>
            )}
          </div>
        )}
      </aside>

      {/* Thread */}
      <section className={cx("flex min-w-0 flex-1 flex-col", !open && "hidden md:flex")}>
        {open ? (
          <>
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-2.5">
              <button type="button" onClick={() => router.push("/messages")} className="md:hidden rounded-md border border-line px-2 py-1 text-[13px]">‹</button>
              <Avatar initials={open.initials} />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold text-text-strong">{open.name}</div>
                <div className="truncate text-[13px] text-muted-foreground">{roleWord(open)}</div>
              </div>
            </div>
            <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {groups.length === 0 && <p className="py-8 text-center text-[13.5px] text-muted-foreground">This is the start of your conversation with {open.name}.</p>}
              {groups.map((d) => (
                <div key={d.day}>
                  <div className="my-3 flex items-center gap-3 text-[12.5px] font-medium text-muted-foreground">
                    <span className="h-px flex-1 bg-line" /><span>{d.day}</span><span className="h-px flex-1 bg-line" />
                  </div>
                  {d.runs.map((run) => {
                    const mine = run.senderId === meId;
                    const who = mine ? meName : open.name;
                    const initials = mine ? meName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() : open.initials;
                    return (
                      <div key={run.items[0].id} className="mb-3 flex gap-2.5">
                        <Avatar initials={initials} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[14px] font-semibold text-text-strong">{who}</span>
                            <span className="text-[12.5px] text-muted-foreground">{timeOf(run.at)}</span>
                          </div>
                          {run.items.map((m) => (
                            <p key={m.id} className="whitespace-pre-wrap text-[14.5px] leading-[1.5] text-text [overflow-wrap:anywhere]">{m.body}</p>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="border-t border-line p-3">
              {error && <p className="mb-1.5 text-[13px] text-danger">{error}</p>}
              <div className="flex items-end gap-2 rounded-xl border border-line bg-card px-3 py-2 focus-within:border-primary">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  rows={Math.min(6, Math.max(1, draft.split("\n").length))}
                  placeholder={`Message ${open.name}`}
                  className="max-h-40 min-h-[26px] flex-1 resize-none bg-transparent text-[14.5px] outline-none"
                />
                <button type="button" onClick={send} disabled={pending || !draft.trim()}
                  className="rounded-lg bg-primary px-3.5 py-1.5 text-[13.5px] font-semibold text-primary-foreground disabled:opacity-40">
                  {pending ? "Sending…" : "Send"}
                </button>
              </div>
              <p className="mt-1 px-1 text-[12.5px] text-muted-foreground">Enter sends · Shift+Enter starts a new line</p>
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div>
              <p className="text-[15px] font-medium text-text-strong">Pick a conversation</p>
              <p className="mt-1 max-w-sm text-[13.5px] text-muted-foreground">Choose someone on the left, or press + New to write to the team.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
