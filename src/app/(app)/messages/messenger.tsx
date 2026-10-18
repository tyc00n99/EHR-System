"use client";

/**
 * Messages. Oct 16, 2026: Slack-style content (Home / Recent / Unread / @me; direct messages, then
 * each channel with its threads). Oct 18, 2026: laid out on the user's "Retainr" reference: a title
 * and count line over two panes on a grey page, the list as a soft panel of cards (the open one
 * outlined in ink), the conversation in a white card with a framed "To …" composer. Selection lives in the URL. The page re-reads itself
 * every 25 seconds while visible, so new messages arrive without a reload.
 */
import { ChevronDown, ChevronRight, Hash, Lock, MessageCircle, MoreHorizontal, Plus, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "@/components/kit";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ChannelInfo, ChatMessage, Conversation, MentionItem, MessageContact, ThreadSummary } from "@/db/message-queries";
import { ago, ChannelTile, Face, isChannelHome, MentionText, roleWord } from "./chat-bits";
import { ConversationPane } from "./conversation";
import { ChannelDialog, NewMessageDialog, NewThreadDialog } from "./dialogs";

type DmRow = Omit<Conversation, "lastAt"> & { lastAt: string };
type Tab = "home" | "recent" | "unread" | "me";

export type OpenView =
  | { kind: "dm"; contact: MessageContact; canReply: boolean; messages: ChatMessage[] }
  | { kind: "thread"; thread: { id: string; title: string; createdAt: string; startedBy: string; channel: ChannelInfo }; messages: ChatMessage[]; audience: MessageContact[] }
  | null;

type Dialog =
  | { kind: "dm" }
  | { kind: "thread"; channelId?: string }
  | { kind: "channel"; channel?: ChannelInfo }
  | null;

export function Messenger({ meId, now, tab, canCreateChannels, dms, contacts, channels, threads, mentions, open }: {
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
  open: OpenView;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [dialog, setDialog] = useState<Dialog>(null);
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
  const openDm = (userId: string) => href({ dm: userId, thread: null, channel: null });
  const openThread = (id: string) => href({ thread: id, dm: null, channel: null });
  const openChannel = (id: string) => href({ channel: id, thread: null, dm: null });
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
        node: () => <ListRow face={isChannelHome(t.title) && ch ? <ChannelTile icon={ch.icon} tint={ch.tint} size={40} /> : <Face initials={t.lastSenderInitials} size={40} badge={ch && <ChannelTile icon={ch.icon} tint={ch.tint} size={18} />} />} title={isChannelHome(t.title) && ch ? ch.name : t.title} preview={t.lastSender || t.lastFromMe ? `${t.lastFromMe ? "You" : t.lastSender}: ${t.lastBody || "Sent an attachment"}` : "No messages yet"} when={ago(t.lastAt, now)} unread={t.unread} tag={ch && <Tag tint={ch.tint}>{isChannelHome(t.title) ? (ch.personId ? "Client channel" : "Channel") : ch.name}</Tag>} />,
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
            <ChannelTile icon={c.icon} tint={c.tint} size={40} />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className={cx("truncate text-[16.5px] text-text-strong", unread ? "font-semibold" : "font-medium")}>{c.name}</span>
                {c.isPrivate && <Lock className="size-3.5 shrink-0 text-text" aria-label="Private channel" />}
              </span>
              <span className="mt-1 flex flex-wrap gap-1.5">
                <Tag tint={c.tint}>{c.personId ? "Client channel" : c.isPrivate ? "Private channel" : "Channel"}</Tag>
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
                className={cx("-mx-1.5 flex rounded-xl border px-2.5 py-2", t.id === activeThread ? "border-text-strong bg-card" : "border-transparent hover:bg-tab-hover")}>
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
            <button onClick={() => setDialog({ kind: "thread", channelId: c.id })} className="flex items-center gap-1.5 rounded-lg px-1 py-1.5 text-[14px] font-medium text-primary hover:bg-tab-hover">
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
  const total = dms.length + threads.filter((t) => !isChannelHome(t.title) || t.lastBody).length;
  const listTitle = { home: "Inbox", recent: "Recent", unread: "Unread", me: "Mentions" }[tab];
  const listCount = tab === "me" ? unreadMentions : unreadConversations;

  return (
    <div className="-mx-4 -mb-28 -mt-5 flex min-h-0 flex-1 flex-col bg-card-soft px-4 pb-24 pt-5 shadow-[0_0_0_100vmax_var(--card-soft)] [clip-path:inset(0_-100vmax)] md:-mx-8 md:-mt-6 md:px-8 md:pt-7">
      {/* ---------------- title, count line, search and New ---------------- */}
      <div className={cx("mb-5 flex-wrap items-end gap-x-6 gap-y-3", open ? "hidden md:flex" : "flex")}>
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <h1 className="text-[28px] font-semibold tracking-[-0.015em] text-text-strong">Messages</h1>
          <p className="mt-1 text-[15px] text-muted">
            {unreadConversations ? `${unreadConversations} unread` : "All caught up"} · {total} {total === 1 ? "conversation" : "conversations"}
            {unreadMentions > 0 && ` · ${unreadMentions} ${unreadMentions === 1 ? "mention" : "mentions"}`}
          </p>
        </div>
        <div className="relative min-w-0 flex-1 sm:w-[340px] sm:flex-none">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }} placeholder="Search people, channels, threads" aria-label="Search conversations"
            className="own-focus h-11 w-full rounded-full border border-line bg-card pl-11 pr-10 text-[15px] text-text-strong outline-none placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-primary-soft" />
          {q && <button aria-label="Clear search" onClick={() => setQ("")} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-tab-hover"><X className="size-4" /></button>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<button className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-[15px] font-medium text-text-strong hover:bg-tab-hover" />}>
            <Plus className="size-4" strokeWidth={2} /> New <ChevronDown className="size-4 text-muted" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setDialog({ kind: "dm" })}>New direct message</DropdownMenuItem>
              {channels.length > 0 && <DropdownMenuItem onClick={() => setDialog({ kind: "thread" })}>New thread in a channel</DropdownMenuItem>}
              {canCreateChannels && <DropdownMenuItem onClick={() => setDialog({ kind: "channel" })}>New channel</DropdownMenuItem>}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex min-h-0 flex-1 gap-5">
        {/* ---------------- the list ---------------- */}
        <aside className={cx("min-h-0 w-full flex-col rounded-3xl bg-card/55 md:w-[420px] md:shrink-0", open ? "hidden md:flex" : "flex")}>
          <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[17px] font-semibold text-text-strong">{listTitle}</h2>
              {listCount > 0 && <Count n={listCount} />}
            </div>
            <nav aria-label="Filter conversations" className="flex gap-0.5 rounded-full bg-card-soft p-1">
              {tabs.map((t) => (
                <Link key={t.key} href={href({ tab: t.key === "home" ? null : t.key })} aria-current={tab === t.key ? "page" : undefined}
                  className={cx("shrink-0 rounded-full px-3 py-1 text-[14px] font-medium", tab === t.key ? "bg-card text-text-strong shadow-sm" : "text-muted hover:text-text-strong")}>
                  {t.label}{t.n ? <span className="ml-1 text-primary">{t.n}</span> : null}
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
                  <button onClick={() => setDialog({ kind: "channel" })} className="flex w-full items-center gap-2 rounded-2xl border border-dashed border-line px-4 py-3 text-[14px] font-medium text-primary hover:bg-card">
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
                          {m.unread && <Tag tint="primary">Unread</Tag>}
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
        <section className={cx("min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl bg-card", open ? "flex" : "hidden md:flex")}>
          {open ? (
            <ConversationPane
              key={open.kind === "dm" ? `dm:${open.contact.userId}` : `t:${open.thread.id}`}
              meId={meId}
              open={open}
              backHref={href({ dm: null, thread: null, channel: null })}
              onChannelSettings={(c) => setDialog({ kind: "channel", channel: c })}
              onNewThread={() => setDialog({ kind: "thread", channelId: open.kind === "thread" ? open.thread.channel.id : undefined })}
            />
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <div className="mx-auto grid size-16 place-items-center rounded-full bg-primary-soft text-primary"><MessageCircle className="size-8" strokeWidth={1.6} /></div>
                <p className="mt-4 text-[18px] font-semibold text-text-strong">Pick a conversation</p>
                <p className="mt-1 text-[15px] text-muted">Or start one with New, above.</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {dialog?.kind === "dm" && <NewMessageDialog contacts={contacts} onClose={() => setDialog(null)} onPick={(id) => { setDialog(null); router.push(openDm(id)); }} />}
      {dialog?.kind === "thread" && <NewThreadDialog channels={channels} channelId={dialog.channelId} onClose={() => setDialog(null)} onCreated={(id) => { setDialog(null); router.push(openThread(id)); }} />}
      {dialog?.kind === "channel" && <ChannelDialog channel={dialog.channel} contacts={contacts} meId={meId} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); router.refresh(); }} />}
    </div>
  );
}

/** One card in the list; the open one is white and outlined in ink, as the reference marks it. */
const cardCls = (active: boolean) => cx("block rounded-2xl border px-4 py-3.5 transition-colors", active ? "border-text-strong bg-card" : "border-transparent bg-card/70 hover:border-line hover:bg-card");

function SectionLabel({ icon, children, title }: { icon: ReactNode; children: ReactNode; title?: string }) {
  return <div title={title} className="flex items-center gap-2 px-2 pb-0.5 pt-3 text-[13px] font-medium uppercase tracking-[0.08em] text-muted first:pt-1">{icon}{children}</div>;
}

function Count({ n }: { n: number }) {
  return <span className="grid h-6 min-w-6 place-items-center rounded-md bg-primary px-1.5 text-[13px] font-semibold text-primary-foreground">{n > 99 ? "99+" : n}</span>;
}

const TAG_TINTS: Record<string, string> = {
  primary: "bg-primary-soft text-primary",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-card-soft text-text",
};

/** The small uppercase label under a card's preview (the reference's "HIGH IMPACT" chip), in the app's status tints. */
function Tag({ children, tint = "neutral" }: { children: ReactNode; tint?: string }) {
  return <span className={cx("inline-flex max-w-full items-center truncate rounded-md px-2 py-0.5 text-[13px] font-medium uppercase tracking-[0.06em]", TAG_TINTS[tint] ?? TAG_TINTS.neutral)}>{children}</span>;
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
