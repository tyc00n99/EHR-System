"use client";

/**
 * Messages (Oct 16, 2026), laid out on the user's Slack-style reference in the app's own colours:
 * the list on the left (Home / Recent / Unread / @me; direct messages, then each channel with its
 * threads), the open conversation on the right. Selection lives in the URL. The page re-reads itself
 * every 25 seconds while visible, so new messages arrive without a reload.
 */
import { ChevronDown, ChevronRight, Hash, Lock, MessageCircle, MoreHorizontal, Plus, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/kit";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ChannelInfo, ChatMessage, Conversation, MentionItem, MessageContact, ThreadSummary } from "@/db/message-queries";
import { ago, ChannelTile, Face, isChannelHome, MentionText } from "./chat-bits";
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
  // The search beside the + (the reference's magnifier): a filter over names, previews and channels.
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const searchBox = useRef<HTMLInputElement>(null);
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
      node: () => <ListRow face={<Face initials={d.contact.initials} />} title={d.contact.name} preview={`${d.lastFromMe ? "You: " : ""}${d.lastBody || "Sent an attachment"}`} when={ago(d.lastAt, now)} unread={d.unread} />,
    });
    for (const t of threads) {
      const ch = channelById.get(t.channelId);
      if (isChannelHome(t.title) && !t.lastBody) continue; // an untouched channel chat is not "recent"
      rows.push({
        key: `t:${t.id}`, at: t.lastAt, unread: t.unread, active: t.id === activeThread, href: isChannelHome(t.title) && ch ? openChannel(ch.id) : openThread(t.id),
        node: () => <ListRow face={isChannelHome(t.title) && ch ? <ChannelTile icon={ch.icon} tint={ch.tint} size={52} /> : <Face initials={t.lastSenderInitials} badge={ch && <ChannelTile icon={ch.icon} tint={ch.tint} size={20} />} />} title={isChannelHome(t.title) && ch ? ch.name : t.title} preview={t.lastSender || t.lastFromMe ? `${t.lastFromMe ? "You" : t.lastSender}: ${t.lastBody || "Sent an attachment"}` : "No messages yet"} when={ago(t.lastAt, now)} unread={t.unread} />,
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
                  <div key={c.id} className="mt-2">
                    <div className={cx("group mx-3 flex items-center gap-1 rounded-2xl pl-1 pr-2 py-1", channelActive ? "bg-tab-hover" : "hover:bg-tab-hover")}>
                      <button onClick={() => setCollapsed((s) => ({ ...s, [c.id]: isOpen }))} aria-expanded={isOpen} aria-label={isOpen ? `Hide threads in ${c.name}` : `Show threads in ${c.name}`} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-black/5">
                        {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                      <Link href={openChannel(c.id)} aria-current={channelActive ? "page" : undefined} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1.5 text-left">
                        <ChannelTile icon={c.icon} tint={c.tint} size={32} />
                        <span className={cx("truncate text-[19px] text-text-strong", unread ? "font-semibold" : "font-medium")}>{c.name}</span>
                        {c.isPrivate && <Lock className="size-4 shrink-0 text-text" aria-label="Private channel" />}
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
                    </div>
                    {isOpen && (
                      <>
                        {own.map((t) => (
                          <Link key={t.id} href={openThread(t.id)} className={rowCls(t.id === activeThread)}>
                            <ListRow
                              face={<Face initials={t.lastSenderInitials} badge={<ChannelTile icon={c.icon} tint={c.tint} size={20} />} />}
                              title={t.title}
                              preview={t.lastSender || t.lastFromMe ? `${t.lastFromMe ? "You" : t.lastSender}: ${t.lastBody || "Sent an attachment"}` : "No messages yet"}
                              when={ago(t.lastAt, now)}
                              unread={t.unread}
                            />
                          </Link>
                        ))}
                        <button onClick={() => setDialog({ kind: "thread", channelId: c.id })} className="ml-[68px] flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[14px] font-medium text-primary hover:bg-tab-hover">
                          <Plus className="size-4" /> New thread
                        </button>
                      </>
                    )}
                  </div>
                );
              };
  const clientChannels = channels.filter((c) => c.personId);
  const otherChannels = channels.filter((c) => !c.personId);

  const tabs: { key: Tab; label: string }[] = [
    { key: "home", label: "Home" },
    { key: "recent", label: "Recent" },
    { key: "unread", label: unreadConversations ? `Unread ${unreadConversations}` : "Unread" },
    { key: "me", label: unreadMentions ? `@me ${unreadMentions}` : "@me" },
  ];

  return (
    <div className="-mx-4 -mt-2 flex min-h-0 flex-1 overflow-hidden bg-card md:-mx-6">
      {/* ---------------- the list ---------------- */}
      <aside className={cx("flex min-h-0 w-full flex-col border-r border-line md:w-[400px] md:shrink-0", open && "hidden md:flex")}>
        <div className="flex items-center justify-between px-6 pb-3 pt-6">
          <h1 className="text-[28px] font-semibold tracking-[-0.015em] text-text-strong">Chat</h1>
          <div className="flex items-center gap-1">
          <button aria-label="Search conversations" aria-pressed={searching} onClick={() => { setSearching((s) => !s); if (searching) setQ(""); requestAnimationFrame(() => searchBox.current?.focus()); }} className={cx("grid size-10 place-items-center rounded-full text-text-strong hover:bg-tab-hover", searching && "bg-card-soft")}><Search className="size-6" strokeWidth={1.8} /></button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<button aria-label="New conversation" title="New" className="grid size-10 place-items-center rounded-full text-text-strong hover:bg-tab-hover" />}><Plus className="size-6" strokeWidth={1.8} /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setDialog({ kind: "dm" })}>New direct message</DropdownMenuItem>
                {channels.length > 0 && <DropdownMenuItem onClick={() => setDialog({ kind: "thread" })}>New thread in a channel</DropdownMenuItem>}
                {canCreateChannels && <DropdownMenuItem onClick={() => setDialog({ kind: "channel" })}>New channel</DropdownMenuItem>}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>
        {searching && (
          <div className="relative px-6 pb-3">
            <Search className="pointer-events-none absolute left-9 top-1/2 size-4 -translate-y-[calc(50%+6px)] text-muted" />
            <input ref={searchBox} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); setSearching(false); } }} placeholder="Search conversations" aria-label="Search conversations" className="own-focus h-10 w-full rounded-full border border-line bg-card-soft pl-10 pr-9 text-[15px] text-text-strong outline-none placeholder:text-muted focus:border-primary" />
            {q && <button aria-label="Clear search" onClick={() => setQ("")} className="absolute right-8 top-1/2 grid size-7 -translate-y-[calc(50%+6px)] place-items-center rounded-full text-muted hover:bg-tab-hover"><X className="size-4" /></button>}
          </div>
        )}

        <nav aria-label="Filter conversations" className="flex gap-1 overflow-x-auto px-5 pb-4">
          {tabs.map((t) => (
            <Link key={t.key} href={href({ tab: t.key === "home" ? null : t.key })} aria-current={tab === t.key ? "page" : undefined}
              className={cx("shrink-0 rounded-full px-5 py-2.5 text-[17px] font-medium", tab === t.key ? "bg-card-soft text-text-strong" : "text-text hover:bg-tab-hover")}>
              {t.label}
            </Link>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          {tab === "home" && (
            <>
              {(!needle || dms.some((d) => hit(d.contact.name, d.lastBody))) && <SectionLabel icon={<MessageCircle className="size-5" strokeWidth={1.8} />}>Direct messages</SectionLabel>}
              {dms.length === 0 && !needle && <p className="px-5 pb-2 text-[14px] text-muted">No direct messages yet. Press + to start one.</p>}
              {dms.filter((d) => hit(d.contact.name, d.lastBody)).map((d) => (
                <Link key={d.contact.userId} href={openDm(d.contact.userId)} className={rowCls(d.contact.userId === activeDm)}>
                  <ListRow face={<Face initials={d.contact.initials} />} title={d.contact.name} preview={`${d.lastFromMe ? "You: " : ""}${d.lastBody || "Sent an attachment"}`} when={ago(d.lastAt, now)} unread={d.unread} />
                </Link>
              ))}

              {clientChannels.length > 0 && (!needle || clientChannels.some((c) => hit(c.name) || threads.some((t) => t.channelId === c.id && hit(t.title)))) && (
                <>
                  <SectionLabel icon={<Users className="size-5" strokeWidth={1.8} />} title="Each client's channel holds everyone assigned to them.">Clients</SectionLabel>
                  {clientChannels.map(renderChannel)}
                </>
              )}
              {(otherChannels.length > 0 || canCreateChannels) && (!needle || otherChannels.some((c) => hit(c.name) || threads.some((t) => t.channelId === c.id && hit(t.title)))) && <SectionLabel icon={<Hash className="size-5" strokeWidth={1.8} />}>Channels</SectionLabel>}
              {otherChannels.map(renderChannel)}
              {otherChannels.length === 0 && canCreateChannels && !needle && (
                <button onClick={() => setDialog({ kind: "channel" })} className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2.5 text-[14px] font-medium text-primary hover:bg-tab-hover">
                  <Plus className="size-4" /> Create a team channel
                </button>
              )}
            </>
          )}

          {(tab === "recent" || tab === "unread") && (
            <>
              {(tab === "unread" ? flat.filter((r) => r.unread > 0) : flat).map((r) => (
                <Link key={r.key} href={r.href} className={rowCls(r.active)}>{r.node(r.active)}</Link>
              ))}
              {tab === "unread" && flat.every((r) => r.unread === 0) && <p className="px-5 py-6 text-[15px] text-muted">You are all caught up.</p>}
              {tab === "recent" && flat.length === 0 && <p className="px-5 py-6 text-[15px] text-muted">Nothing here yet.</p>}
            </>
          )}

          {tab === "me" && (
            <>
              {mentions.length === 0 && <p className="px-5 py-6 text-[15px] text-muted">When someone @mentions you, it shows up here.</p>}
              {mentions.map((m) => (
                <Link key={m.messageId} href={m.threadId ? openThread(m.threadId) : openDm(m.dmWith!)} className={rowCls(false)}>
                  <div className="flex w-full gap-3.5">
                    <Face initials={m.sender.initials} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cx("truncate text-[16px] text-text-strong", m.unread ? "font-semibold" : "font-medium")}>
                          {m.sender.name}
                          <span className="font-normal text-muted"> {m.threadId ? `in ${m.channelName} › ${m.threadTitle}` : "· direct message"}</span>
                        </span>
                        <span className="shrink-0 text-[13px] text-muted">{ago(m.at, now)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[15px] text-text">{m.body}</p>
                    </div>
                    {m.unread && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                  </div>
                </Link>
              ))}
            </>
          )}
        </div>
      </aside>

      {/* ---------------- the conversation ---------------- */}
      <section className={cx("min-h-0 min-w-0 flex-1 flex-col", open ? "flex" : "hidden md:flex")}>
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
              <p className="mt-1 text-[15px] text-muted">Or start one with the + beside Chat.</p>
            </div>
          </div>
        )}
      </section>

      {dialog?.kind === "dm" && <NewMessageDialog contacts={contacts} onClose={() => setDialog(null)} onPick={(id) => { setDialog(null); router.push(openDm(id)); }} />}
      {dialog?.kind === "thread" && <NewThreadDialog channels={channels} channelId={dialog.channelId} onClose={() => setDialog(null)} onCreated={(id) => { setDialog(null); router.push(openThread(id)); }} />}
      {dialog?.kind === "channel" && <ChannelDialog channel={dialog.channel} contacts={contacts} meId={meId} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); router.refresh(); }} />}
    </div>
  );
}

const rowCls = (active: boolean) => cx("mx-3 flex rounded-2xl px-3 py-3.5", active ? "bg-tab-hover" : "hover:bg-tab-hover");

function SectionLabel({ icon, children, title }: { icon: ReactNode; children: ReactNode; title?: string }) {
  return <div title={title} className="flex items-center gap-3 px-6 pb-2 pt-4 text-[19px] font-medium text-text-strong">{icon}{children}</div>;
}

function Count({ n }: { n: number }) {
  return <span className="grid h-7 min-w-7 place-items-center rounded-full bg-primary px-2 text-[14px] font-semibold text-primary-foreground">{n > 99 ? "99+" : n}</span>;
}

function ListRow({ face, title, preview, when, unread }: { face: ReactNode; title: string; preview: string; when: string; unread: number }) {
  return (
    <div className="flex w-full min-w-0 gap-4">
      {face}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cx("truncate text-[18px] text-text-strong", unread ? "font-semibold" : "font-medium")}>{title}</span>
          <span className="shrink-0 text-[15px] text-muted">{when}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-[16px] text-text"><MentionText body={preview} names={[]} /></span>
          {unread > 0 && <Count n={unread} />}
        </div>
      </div>
    </div>
  );
}
