"use client";

/**
 * Messages. Oct 16, 2026: Slack-style content (Home / Recent / Unread / @me; direct messages, then
 * each channel with its threads). Oct 18, 2026: laid out on the user's "Retainr" reference: a title
 * and count line over two panes on a grey page, the list as a soft panel of cards (the open one
 * outlined in ink), the conversation in a white card with a framed "To …" composer. Selection lives in the URL. The page re-reads itself
 * every 25 seconds while visible, so new messages arrive without a reload.
 */
import { ChevronDown, ChevronRight, Hash, ListTree, Lock, MessageCircle, MoreHorizontal, PenSquare, Plus, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "@/components/kit";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ChannelInfo, ChatMessage, Conversation, MentionItem, MessageContact, OnShift, ThreadSummary } from "@/db/message-queries";
import { ago, ChannelTile, Face, isChannelHome, MentionText, roleWord } from "./chat-bits";
import { ConversationPane } from "./conversation";
import { ChannelDialog, NewMessageDialog, NewThreadDialog } from "./dialogs";

type DmRow = Omit<Conversation, "lastAt"> & { lastAt: string };
type Tab = "home" | "recent" | "unread" | "me";

export type OpenView =
  | { kind: "dm"; contact: MessageContact; canReply: boolean; messages: ChatMessage[] }
  | { kind: "thread"; thread: { id: string; title: string; createdAt: string; startedBy: string; parentMessageId: string | null; channel: ChannelInfo }; messages: ChatMessage[]; audience: MessageContact[] }
  | null;

type Dialog =
  | { kind: "dm" }
  | { kind: "thread"; channelId?: string }
  | { kind: "channel"; channel?: ChannelInfo; group?: boolean }
  | null;

export function Messenger({ meId, now, tab, canCreateChannels, dms, contacts, channels, threads, mentions, onShift, canSchedule, canSwap, open, side }: {
  meId: string;
  /** Server time of this render, for relative times; refreshed with every poll. */
  now: number;
  tab: Tab;
  canCreateChannels: boolean;
  dms: DmRow[];
  contacts: MessageContact[];
  channels: ChannelInfo[];
  threads: ThreadSummary[];
  mentions: MentionItem[];
  /** Who is working today (office staff only; empty for caregivers). */
  onShift: OnShift[];
  canSchedule: boolean;
  canSwap: boolean;
  open: OpenView;
  /** A reply thread open beside the conversation (`?side=`). */
  side: OpenView;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // The search in the page header: a filter over names, previews, channels and thread titles.
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const hit = (...parts: (string | null | undefined)[]) => !needle || parts.some((x) => x?.toLowerCase().includes(needle));

  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 25000);
    return () => clearInterval(t);
  }, [router]);

  const href = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    q.delete("with");
    for (const [k, v] of Object.entries(next)) { if (v === null) q.delete(k); else q.set(k, v); }
    const s = q.toString();
    return s ? `/messages?${s}` : "/messages";
  };
  const openDm = (userId: string) => href({ dm: userId, thread: null, channel: null, side: null });
  const openThread = (id: string) => href({ thread: id, dm: null, channel: null, side: null });
  const openChannel = (id: string) => href({ channel: id, thread: null, dm: null, side: null });
  // A reply thread opens beside the conversation where there is room for it, and in its place where there is not.
  const openReplies = (id: string) => router.push(window.matchMedia("(min-width: 1280px)").matches ? href({ side: id }) : openThread(id));
  // A thread with an empty title is the channel's own conversation: listed as the channel, not as a thread.
  const homeOf = (channelId: string) => threads.find((t) => t.channelId === channelId && isChannelHome(t.title)) ?? null;
  const activeDm = open?.kind === "dm" ? open.contact.userId : null;
  const activeThread = open?.kind === "thread" ? open.thread.id : null;

  const channelById = new Map(channels.map((c) => [c.id, c]));
  const unreadConversations = dms.filter((d) => d.unread > 0).length + threads.filter((t) => t.unread > 0).length;
  const unreadMentions = mentions.filter((m) => m.unread).length;

  // One flat, newest-first list for the Recent and Unread tabs.
  const flat = (() => {
    const rows: { key: string; at: string; unread: number; node: (active: boolean) => ReactNode; active: boolean; href: string }[] = [];
    for (const d of dms) rows.push({
      key: `dm:${d.contact.userId}`, at: d.lastAt, unread: d.unread, active: d.contact.userId === activeDm, href: openDm(d.contact.userId),
      node: () => <ListRow face={<Face initials={d.contact.initials} size={40} />} title={d.contact.name} preview={`${d.lastFromMe ? "You: " : ""}${d.lastBody || "Sent an attachment"}`} when={ago(d.lastAt, now)} unread={d.unread} tag={<Tag>{roleWord(d.contact)}</Tag>} />,
    });
    for (const t of threads) {
      const ch = channelById.get(t.channelId);
      if (isChannelHome(t.title) && !t.lastBody) continue; // an untouched channel chat is not "recent"
      rows.push({
        key: `t:${t.id}`, at: t.lastAt, unread: t.unread, active: t.id === activeThread, href: isChannelHome(t.title) && ch ? openChannel(ch.id) : openThread(t.id),
        node: () => <ListRow face={ch ? <ChannelTile icon={ch.icon} tint="neutral" size={40} /> : <Face initials={t.lastSenderInitials} size={40} />} title={isChannelHome(t.title) && ch ? ch.name : t.title} preview={t.lastSender || t.lastFromMe ? `${t.lastFromMe ? "You" : t.lastSender}: ${t.lastBody || "Sent an attachment"}` : "No messages yet"} when={ago(t.lastAt, now)} unread={t.unread} tag={ch && <Tag>{isChannelHome(t.title) ? (ch.personId ? "Client channel" : "Channel") : ch.name}</Tag>} />,
      });
    }
    return rows.filter((r) => { if (r.key.startsWith("dm:")) return hit(dms.find((d) => `dm:${d.contact.userId}` === r.key)?.contact.name); const t = threads.find((x) => `t:${x.id}` === r.key); return hit(t && isChannelHome(t.title) ? channelById.get(t.channelId)?.name : t?.title); }).sort((a, b) => b.at.localeCompare(a.at));
  })();

  const renderChannel = (c: ChannelInfo) => {
    const home = homeOf(c.id);
    const own = threads.filter((t) => t.channelId === c.id && !isChannelHome(t.title) && (hit(c.name) || hit(t.title)));
    if (needle && !hit(c.name) && own.length === 0) return null;
    const isOpen = needle ? true : collapsed[c.id] === undefined ? own.some((t) => t.id === activeThread) : !collapsed[c.id];
    const channelActive = home !== null && home.id === activeThread;
    const unread = own.reduce((n, t) => n + t.unread, 0) + (home?.unread ?? 0);
    return (
      <div key={c.id} className={cardCls(channelActive)}>
        <div className="group flex items-center gap-1">
          <Link href={openChannel(c.id)} aria-current={channelActive ? "page" : undefined} className="flex min-w-0 flex-1 items-center gap-3 py-0.5 text-left">
            <ChannelTile icon={c.icon} tint="neutral" size={40} />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className={cx("truncate text-[16.5px] text-text-strong", unread ? "font-semibold" : "font-medium")}>{c.name}</span>
                {c.isPrivate && <Lock className="size-3.5 shrink-0 text-text" aria-label="Private channel" />}
              </span>
              <span className="mt-1 flex flex-wrap gap-1.5">
                <Tag>{c.personId ? "Client channel" : c.isPrivate ? "Private channel" : "Channel"}</Tag>
                {own.length > 0 && <Tag>{own.length} {own.length === 1 ? "thread" : "threads"}</Tag>}
              </span>
            </span>
          </Link>
          {unread > 0 && !channelActive && <Count n={unread} />}
          <DropdownMenu>
            <DropdownMenuTrigger render={<button aria-label={`${c.name} options`} className="grid size-8 place-items-center rounded-full text-muted opacity-0 hover:bg-tab-hover focus-visible:opacity-100 group-hover:opacity-100 data-[popup-open]:opacity-100" />}><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setDialog({ kind: "thread", channelId: c.id })}>New thread here</DropdownMenuItem>
                {c.canManage && <DropdownMenuItem onClick={() => setDialog({ kind: "channel", channel: c })}>Channel settings</DropdownMenuItem>}
                {c.personId && <DropdownMenuItem render={<Link href={`/clients/${c.personId}`} />}>Open client record</DropdownMenuItem>}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <button onClick={() => setCollapsed((s) => ({ ...s, [c.id]: isOpen }))} aria-expanded={isOpen} aria-label={isOpen ? `Hide threads in ${c.name}` : `Show threads in ${c.name}`} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-tab-hover">
            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        </div>
        {isOpen && (
          <div className="mt-3 space-y-1 border-t border-line-soft pt-2">
            {own.map((t) => (
              <Link key={t.id} href={openThread(t.id)} aria-current={t.id === activeThread ? "page" : undefined}
                className={cx("-mx-1.5 flex rounded-xl border px-2.5 py-2", "border-transparent", t.id === activeThread ? "bg-[color-mix(in_srgb,var(--warn)_20%,var(--card))]" : "hover:bg-[color-mix(in_srgb,var(--warn)_20%,var(--card))]")}>
                <ListRow
                  compact
                  face={<Face initials={t.lastSenderInitials} size={32} />}
                  title={t.title}
                  preview={t.lastSender || t.lastFromMe ? `${t.lastFromMe ? "You" : t.lastSender}: ${t.lastBody || "Sent an attachment"}` : "No messages yet"}
                  when={ago(t.lastAt, now)}
                  unread={t.unread}
                />
              </Link>
            ))}
            <button onClick={() => setDialog({ kind: "thread", channelId: c.id })} className="flex items-center gap-1.5 rounded-lg px-1 py-1.5 text-[14px] font-medium text-text-strong hover:bg-tab-hover">
              <Plus className="size-4" /> New thread
            </button>
          </div>
        )}
      </div>
    );
  };
  const clientChannels = channels.filter((c) => c.personId);
  const otherChannels = channels.filter((c) => !c.personId);

  const tabs: { key: Tab; label: string; n?: number }[] = [
    { key: "home", label: "Home" },
    { key: "recent", label: "Recent" },
    { key: "unread", label: "Unread", n: unreadConversations },
    { key: "me", label: "@me", n: unreadMentions },
  ];
  const onShiftNow = onShift.filter((p) => p.state === "on").length;
  const total = dms.length + threads.filter((t) => !isChannelHome(t.title) || t.lastBody).length;
  const listTitle = { home: "Inbox", recent: "Recent", unread: "Unread", me: "Mentions" }[tab];
  const listCount = tab === "me" ? unreadMentions : unreadConversations;

  return (
    <div data-full-bleed className="-mb-28 flex min-h-0 flex-1 flex-col pb-24 md:pt-1">
      {/* ---------------- title, count line, search and New ---------------- */}
      <div className={cx("mb-5 flex-wrap items-end gap-x-6 gap-y-3", open ? "hidden md:flex" : "flex")}>
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <h1 className="text-[28px] font-semibold tracking-[-0.015em] text-text-strong">Messages</h1>
          <p className="mt-1 text-[15px] text-muted">
            {unreadConversations ? `${unreadConversations} unread` : "All caught up"}
            {onShift.length > 0 ? ` · ${onShiftNow} on shift` : ` · ${total} ${total === 1 ? "conversation" : "conversations"}`}
            {unreadMentions > 0 && ` · ${unreadMentions} ${unreadMentions === 1 ? "mention" : "mentions"}`}
          </p>
        </div>
        <div className="relative min-w-0 flex-1 sm:w-[340px] sm:flex-none">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }} placeholder="Search people, channels, threads" aria-label="Search conversations"
            className="own-focus h-11 w-full rounded-full border border-line pl-11 pr-10 text-[15px] text-text-strong outline-none placeholder:text-muted focus:border-text-strong" />
          {q && <button aria-label="Clear search" onClick={() => setQ("")} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-tab-hover"><X className="size-4" /></button>}
        </div>
        {/* "Start something new" (Oct 18, 2026): one door for a chat, a group or a thread, each saying what it is. */}
        <Popover open={newOpen} onOpenChange={setNewOpen}>
          <PopoverTrigger render={<button className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-[15px] font-medium text-primary-foreground hover:bg-primary-hover" />}>
            <PenSquare className="size-4" strokeWidth={2} /> New
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[300px] p-2">
            <p className="px-3 pb-1 pt-1.5 text-[13px] text-muted">Start something new</p>
            <NewOption icon={<MessageCircle className="size-5" strokeWidth={1.8} />} title="Chat" note="Message one person" onClick={() => { setNewOpen(false); setDialog({ kind: "dm" }); }} />
            {canCreateChannels && <NewOption icon={<Users className="size-5" strokeWidth={1.8} />} title="Group" note="A few people, with a name" onClick={() => { setNewOpen(false); setDialog({ kind: "channel", group: true }); }} />}
            {channels.length > 0 && <NewOption icon={<ListTree className="size-5" strokeWidth={1.8} />} title="Thread" note="A topic inside a channel" onClick={() => { setNewOpen(false); setDialog({ kind: "thread", channelId: open?.kind === "thread" ? open.thread.channel.id : undefined }); }} />}
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex min-h-0 flex-1 gap-5">
        {/* ---------------- the list ---------------- */}
        <aside className={cx("min-h-0 w-full flex-col rounded-2xl border border-line md:w-[420px] md:shrink-0", open ? "hidden md:flex" : "flex")}>
          {onShift.length > 0 && <OnShiftStrip people={onShift} now={now} hrefFor={openDm} />}
          <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[17px] font-semibold text-text-strong">{listTitle}</h2>
              {listCount > 0 && <Count n={listCount} />}
            </div>
            <nav aria-label="Filter conversations" className="flex gap-0.5 rounded-full border border-line p-1">
              {tabs.map((t) => (
                <Link key={t.key} href={href({ tab: t.key === "home" ? null : t.key })} aria-current={tab === t.key ? "page" : undefined}
                  className={cx("shrink-0 rounded-full px-3 py-1 text-[14px] font-medium", tab === t.key ? "bg-[var(--brand-ink,#00708e)] text-white" : "text-muted hover:text-text-strong")}>
                  {t.label}{t.n ? <span className="ml-1 font-semibold">{t.n}</span> : null}
                </Link>
              ))}
            </nav>
          </div>

          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pb-5">
            {tab === "home" && (
              <>
                {(!needle || dms.some((d) => hit(d.contact.name, d.lastBody))) && <SectionLabel icon={<MessageCircle className="size-4" strokeWidth={1.8} />}>Direct messages</SectionLabel>}
                {dms.length === 0 && !needle && <p className="px-2 pb-1 text-[14px] text-muted">No direct messages yet. Press New to start one.</p>}
                {dms.filter((d) => hit(d.contact.name, d.lastBody)).map((d) => (
                  <Link key={d.contact.userId} href={openDm(d.contact.userId)} aria-current={d.contact.userId === activeDm ? "page" : undefined} className={cardCls(d.contact.userId === activeDm)}>
                    <ListRow face={<Face initials={d.contact.initials} size={40} />} title={d.contact.name} preview={`${d.lastFromMe ? "You: " : ""}${d.lastBody || "Sent an attachment"}`} when={ago(d.lastAt, now)} unread={d.unread} tag={<Tag>{roleWord(d.contact)}</Tag>} />
                  </Link>
                ))}

                {clientChannels.length > 0 && (!needle || clientChannels.some((c) => hit(c.name) || threads.some((t) => t.channelId === c.id && hit(t.title)))) && (
                  <>
                    <SectionLabel icon={<Users className="size-4" strokeWidth={1.8} />} title="Each client's channel holds everyone assigned to them.">Clients</SectionLabel>
                    {clientChannels.map(renderChannel)}
                  </>
                )}
                {(otherChannels.length > 0 || canCreateChannels) && (!needle || otherChannels.some((c) => hit(c.name) || threads.some((t) => t.channelId === c.id && hit(t.title)))) && <SectionLabel icon={<Hash className="size-4" strokeWidth={1.8} />}>Channels</SectionLabel>}
                {otherChannels.map(renderChannel)}
                {otherChannels.length === 0 && canCreateChannels && !needle && (
                  <button onClick={() => setDialog({ kind: "channel" })} className="flex w-full items-center gap-2 rounded-2xl border border-dashed border-line px-4 py-3 text-[14px] font-medium text-text-strong hover:border-text-strong/40">
                    <Plus className="size-4" /> Create a team channel
                  </button>
                )}
              </>
            )}

            {(tab === "recent" || tab === "unread") && (
              <>
                {(tab === "unread" ? flat.filter((r) => r.unread > 0) : flat).map((r) => (
                  <Link key={r.key} href={r.href} aria-current={r.active ? "page" : undefined} className={cardCls(r.active)}>{r.node(r.active)}</Link>
                ))}
                {tab === "unread" && flat.every((r) => r.unread === 0) && <p className="px-2 py-6 text-center text-[15px] text-muted">You are all caught up.</p>}
                {tab === "recent" && flat.length === 0 && <p className="px-2 py-6 text-center text-[15px] text-muted">Nothing here yet.</p>}
              </>
            )}

            {tab === "me" && (
              <>
                {mentions.length === 0 && <p className="px-2 py-6 text-center text-[15px] text-muted">When someone @mentions you, it shows up here.</p>}
                {mentions.map((m) => (
                  <Link key={m.messageId} href={m.threadId ? openThread(m.threadId) : openDm(m.dmWith!)} className={cardCls(false)}>
                    <div className="flex w-full min-w-0 gap-3.5">
                      <Face initials={m.sender.initials} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={cx("truncate text-[16.5px] text-text-strong", m.unread ? "font-semibold" : "font-medium")}>{m.sender.name}</span>
                          <span className="shrink-0 text-[14px] text-muted">{ago(m.at, now)}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[15px] text-text">{m.body}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Tag>{m.threadId ? `${m.channelName} › ${m.threadTitle || "Channel"}` : "Direct message"}</Tag>
                          {m.unread && <Tag>Unread</Tag>}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </>
            )}
          </div>
        </aside>

        {/* ---------------- the conversation ---------------- */}
        <section className={cx("min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line", open ? "flex" : "hidden md:flex")}>
          {open ? (
            <ConversationPane
              key={open.kind === "dm" ? `dm:${open.contact.userId}` : `t:${open.thread.id}`}
              meId={meId}
              now={now}
              open={open}
              canSchedule={canSchedule}
              canSwap={canSwap}
              onOpenThread={openReplies}
              backHref={href({ dm: null, thread: null, channel: null, side: null })}
              onChannelSettings={(c) => setDialog({ kind: "channel", channel: c })}
              onNewThread={() => setDialog({ kind: "thread", channelId: open.kind === "thread" ? open.thread.channel.id : undefined })}
            />
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <div className="mx-auto grid size-16 place-items-center rounded-full border border-line text-text-strong"><MessageCircle className="size-8" strokeWidth={1.6} /></div>
                <p className="mt-4 text-[18px] font-semibold text-text-strong">Pick a conversation</p>
                <p className="mt-1 text-[15px] text-muted">Or start one with New, above.</p>
              </div>
            </div>
          )}
        </section>

        {/* ---------------- a reply thread, beside the conversation ---------------- */}
        {side && side.kind === "thread" && (
          <aside className="hidden min-h-0 w-[400px] shrink-0 flex-col overflow-hidden rounded-2xl border border-line xl:flex">
            <ConversationPane
              key={`side:${side.thread.id}`}
              variant="side"
              meId={meId}
              now={now}
              open={side}
              canSchedule={canSchedule}
              canSwap={canSwap}
              onOpenThread={openReplies}
              onClose={() => router.push(href({ side: null }))}
              backHref={href({ side: null })}
              onChannelSettings={(c) => setDialog({ kind: "channel", channel: c })}
            />
          </aside>
        )}
      </div>

      {dialog?.kind === "dm" && <NewMessageDialog contacts={contacts} onClose={() => setDialog(null)} onPick={(id) => { setDialog(null); router.push(openDm(id)); }} />}
      {dialog?.kind === "thread" && <NewThreadDialog channels={channels} channelId={dialog.channelId} onClose={() => setDialog(null)} onCreated={(id) => { setDialog(null); router.push(openThread(id)); }} />}
      {dialog?.kind === "channel" && <ChannelDialog channel={dialog.channel} group={dialog.group} contacts={contacts} meId={meId} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); router.refresh(); }} />}
    </div>
  );
}

/** One card in the list: a hairline at rest, a light orange fill on hover and while open (user, Oct 18: no blue border). */

const cardCls = (active: boolean) => cx("block rounded-2xl border border-line px-4 py-3.5 transition-colors", active ? "bg-[color-mix(in_srgb,var(--warn)_12%,var(--card))]" : "hover:bg-[color-mix(in_srgb,var(--warn)_12%,var(--card))]");

function SectionLabel({ icon, children, title }: { icon: ReactNode; children: ReactNode; title?: string }) {
  return <div title={title} className="flex items-center gap-2 px-2 pb-0.5 pt-3 text-[13px] font-medium uppercase tracking-[0.08em] text-[var(--brand-ink,#00708e)] first:pt-1">{icon}{children}</div>;
}

function Count({ n }: { n: number }) {
  return <span className="grid h-6 min-w-6 place-items-center rounded-md bg-text-strong px-1.5 text-[13px] font-semibold text-card">{n > 99 ? "99+" : n}</span>;
}

/** The small uppercase label under a card's preview: one neutral look on every tab (user, Oct 18). */
function Tag({ children }: { children: ReactNode }) {
  return <span className="inline-flex max-w-full items-center truncate rounded-md border border-line px-2 py-0.5 text-[13px] font-medium uppercase tracking-[0.06em] text-text">{children}</span>;
}

function ListRow({ face, title, preview, when, unread, tag, compact }: { face: ReactNode; title: string; preview: string; when: string; unread: number; tag?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx("flex w-full min-w-0", compact ? "gap-3" : "gap-3.5")}>
      {face}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cx("truncate text-text-strong", compact ? "text-[15px]" : "text-[16.5px]", unread ? "font-semibold" : "font-medium")}>{title}</span>
          <span className="shrink-0 text-[14px] text-muted">{when}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className={cx("truncate text-text", compact ? "text-[14px]" : "text-[15px]")}><MentionText body={preview} names={[]} /></span>
          {unread > 0 && <Count n={unread} />}
        </div>
        {tag && <div className="mt-2 flex">{tag}</div>}
      </div>
    </div>
  );
}

function NewOption({ icon, title, note, onClick }: { icon: ReactNode; title: string; note: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-text-strong hover:bg-[color-mix(in_srgb,var(--brand,#0098c0)_8%,transparent)]">
      <span className="mt-0.5 text-[var(--brand-ink,#00708e)]">{icon}</span>
      <span><span className="block text-[15.5px] font-semibold">{title}</span><span className="block text-[14px] text-muted">{note}</span></span>
    </button>
  );
}

const RING: Record<OnShift["state"], string> = {
  on: "ring-ok",
  late: "ring-warn",
  later: "ring-line",
};

/**
 * "On shift now" (Oct 18, 2026, the user's favourite part of the combined view): a face per
 * caregiver working today, ringed green when clocked in, amber when a shift has started with no
 * clock-in, grey with the start time when they are due later. A face opens a direct message.
 */
function OnShiftStrip({ people, now, hrefFor }: { people: OnShift[]; now: number; hrefFor: (userId: string) => string }) {
  const time = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).format(new Date(iso)).replace(":00", "");
  return (
    <div className="border-b border-line-soft px-5 pb-4 pt-5">
      <div className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-[var(--brand-ink,#00708e)]">On shift now</div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 pt-1">
        {people.map((p) => {
          const note = p.state === "on" ? `With ${p.clientName} since ${time(p.at)}` : p.state === "late" ? `Due at ${p.clientName}'s at ${time(p.at)} · not clocked in (${Math.max(1, Math.round((now - new Date(p.at).getTime()) / 60000))} min)` : `With ${p.clientName} at ${time(p.at)}`;
          const label = p.state === "late" ? "Late" : p.state === "later" ? time(p.at) : p.name.split(" ")[0];
          const face = (
            <>
              <span className={cx("grid size-[50px] place-items-center rounded-full bg-card text-[17px] font-semibold text-text-strong ring-2 ring-offset-2 ring-offset-card", RING[p.state])}>{p.initials}</span>
              <span className={cx("mt-2 block max-w-[64px] truncate text-center text-[13px]", p.state === "late" ? "font-semibold text-warn" : "text-text")}>{label}</span>
            </>
          );
          return p.userId ? (
            <Link key={p.staffId} href={hrefFor(p.userId)} title={`${p.name} · ${note}`} aria-label={`${p.name}, ${note}. Message them.`} className="flex shrink-0 flex-col items-center rounded-xl px-1 py-0.5 hover:bg-tab-hover">{face}</Link>
          ) : (
            <span key={p.staffId} title={`${p.name} · ${note} · no login`} className="flex shrink-0 flex-col items-center px-1 py-0.5 opacity-80">{face}</span>
          );
        })}
      </div>
    </div>
  );
}
