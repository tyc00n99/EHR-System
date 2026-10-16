"use client";

/**
 * The open conversation: header, messages grouped by day and by sender, and the composer. The
 * composer sends text, @mentions and files in one post. Typing "@" (or pressing the @ button) opens
 * a list of the people who can read this conversation; picking one inserts "@Name" and records who
 * was meant, so a mention survives two people sharing a first name.
 */
import { ArrowLeft, AtSign, FileText, Link2, ListTree, MoreHorizontal, Plus, SendHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { cx } from "@/components/kit";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ChannelInfo, ChatMessage, MessageContact } from "@/db/message-queries";
import { markChatThreadRead, markThreadRead, postMessage, renameThread } from "./actions";
import { ChannelTile, dayOf, Face, fileSize, MentionText, roleWord, timeOf } from "./chat-bits";
import type { OpenView } from "./messenger";

const IMAGE = /^image\/(png|jpe?g|webp|gif)$/;

export function ConversationPane({ meId, open, backHref, onChannelSettings }: {
  meId: string;
  open: NonNullable<OpenView>;
  backHref: string;
  onChannelSettings: (c: ChannelInfo) => void;
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const msgs = open.messages;
  const lastId = msgs.length ? msgs[msgs.length - 1].id : null;
  const targetId = open.kind === "dm" ? open.contact.userId : open.thread.id;

  // Read from the bottom, the way a chat is read.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  // Opening a conversation marks it read.
  useEffect(() => {
    if (open.kind === "dm") void markThreadRead(targetId);
    else void markChatThreadRead(targetId);
  }, [open.kind, targetId, lastId]);

  const audience: MessageContact[] = open.kind === "dm" ? [open.contact] : open.audience;
  const me = msgs.find((m) => m.sender.userId === meId)?.sender.name;

  // Group: day → runs of one sender within five minutes.
  const days: { day: string; runs: { sender: ChatMessage["sender"]; at: string; items: ChatMessage[] }[] }[] = [];
  for (const m of msgs) {
    const day = dayOf(m.at);
    let d = days[days.length - 1];
    if (!d || d.day !== day) { d = { day, runs: [] }; days.push(d); }
    const run = d.runs[d.runs.length - 1];
    if (run && run.sender.userId === m.sender.userId && new Date(m.at).getTime() - new Date(run.items[run.items.length - 1].at).getTime() < 5 * 60_000) run.items.push(m);
    else d.runs.push({ sender: m.sender, at: m.at, items: [m] });
  }

  function copyLink() {
    void navigator.clipboard?.writeText(window.location.href).then(() => toast.success("Link copied. It opens only for people who can read this."));
  }

  function rename() {
    if (open.kind !== "thread") return;
    const name = window.prompt("Rename this thread", open.thread.title);
    if (!name || name.trim() === open.thread.title) return;
    void renameThread(open.thread.id, name).then((r) => { if ("error" in r) toast.error(r.error); else router.refresh(); });
  }

  return (
    <>
      <header className="flex shrink-0 items-center gap-4 border-b border-line px-5 py-4 md:px-7">
        <Link href={backHref} aria-label="Back to conversations" className="grid size-9 place-items-center rounded-full hover:bg-tab-hover md:hidden"><ArrowLeft className="size-5" /></Link>
        {open.kind === "thread"
          ? <span className="hidden size-14 shrink-0 place-items-center rounded-full bg-card-soft text-text-strong sm:grid"><ListTree className="size-6" strokeWidth={1.7} /></span>
          : <Face initials={open.contact.initials} size={52} />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[22px] font-semibold tracking-[-0.01em] text-text-strong">{open.kind === "thread" ? open.thread.title : open.contact.name}</h2>
          <p className="mt-0.5 flex min-w-0 items-center gap-2 text-[15px] text-text">
            {open.kind === "thread" ? (
              <>
                <ChannelTile icon={open.thread.channel.icon} tint={open.thread.channel.tint} size={22} />
                <span className="truncate">{open.thread.channel.name} · Started by {open.thread.startedBy.split(" ")[0]} at {timeOf(open.thread.createdAt)}</span>
              </>
            ) : <span className="truncate">{roleWord(open.contact)}</span>}
          </p>
        </div>
        <button onClick={copyLink} aria-label="Copy link" title="Copy link" className="grid size-10 place-items-center rounded-full text-text-strong hover:bg-tab-hover"><Link2 className="size-5" /></button>
        {open.kind === "thread" && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<button aria-label="Thread options" className="grid size-10 place-items-center rounded-full text-text-strong hover:bg-tab-hover" />}><MoreHorizontal className="size-5" /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={rename}>Rename thread</DropdownMenuItem>
                {open.thread.channel.canManage && <DropdownMenuItem onClick={() => onChannelSettings(open.thread.channel)}>Channel settings</DropdownMenuItem>}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-7">
        {msgs.length === 0 && <p className="py-10 text-center text-[15px] text-muted">No messages yet. Say hello.</p>}
        {days.map((d) => (
          <div key={d.day}>
            <div className="my-4 flex items-center gap-3 text-[13px] font-medium text-muted"><span className="h-px flex-1 bg-line" />{d.day}<span className="h-px flex-1 bg-line" /></div>
            {d.runs.map((r) => (
              <div key={r.items[0].id} className="mb-5 flex gap-3.5">
                <Face initials={r.sender.initials} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[16px] font-medium text-text-strong">{r.sender.userId === meId ? "You" : r.sender.name}</span>
                    {r.sender.userId !== meId && <span className="text-[15px] text-muted">{roleWord(r.sender)}</span>}
                    <span className="text-[13px] text-muted">{timeOf(r.at)}</span>
                  </div>
                  <div className="space-y-2">
                    {r.items.map((m) => (
                      <div key={m.id} className="max-w-[min(100%,680px)]">
                        {m.body && (
                          <div className="w-fit max-w-full whitespace-pre-wrap break-words rounded-2xl bg-card-soft px-5 py-3 text-[16px] leading-relaxed text-text-strong">
                            <MentionText body={m.body} names={m.mentions.map((x) => x.name)} meName={me} />
                          </div>
                        )}
                        {m.attachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {m.attachments.map((a) => IMAGE.test(a.contentType) ? (
                              <a key={a.id} href={`/messages/files/${a.id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line">
                                {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated file; not for next/image's optimizer */}
                                <img src={`/messages/files/${a.id}`} alt={a.fileName} className="max-h-56 max-w-[280px] object-cover" />
                              </a>
                            ) : (
                              <a key={a.id} href={`/messages/files/${a.id}`} target="_blank" rel="noreferrer" className="flex max-w-[320px] items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-2.5 hover:bg-tab-hover">
                                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><FileText className="size-5" /></span>
                                <span className="min-w-0"><span className="block truncate text-[15px] font-medium text-text-strong">{a.fileName}</span><span className="text-[13px] text-muted">{fileSize(a.sizeBytes)}</span></span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {open.kind === "dm" && !open.canReply
        ? <p className="shrink-0 border-t border-line px-7 py-4 text-[15px] text-muted">This login is no longer active, so replies are closed.</p>
        : <Composer to={open.kind === "dm" ? open.contact.userId : null} thread={open.kind === "thread" ? open.thread.id : null} audience={audience} placeholder={open.kind === "dm" ? `Message ${open.contact.name.split(" ")[0]}…` : "Message…"} />}
    </>
  );
}

function Composer({ to, thread, audience, placeholder }: { to: string | null; thread: string | null; audience: MessageContact[]; placeholder: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [picked, setPicked] = useState<Record<string, string>>({}); // name → userId
  const [query, setQuery] = useState<{ text: string; start: number } | null>(null);
  const [hi, setHi] = useState(0);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const matches = query ? audience.filter((p) => p.name.toLowerCase().includes(query.text.toLowerCase())).slice(0, 8) : [];

  function readQuery(value: string, caret: number) {
    const before = value.slice(0, caret);
    const m = /(^|\s)@([\w.'-]*)$/.exec(before);
    if (m) { setQuery({ text: m[2], start: caret - m[2].length - 1 }); setHi(0); }
    else setQuery(null);
  }

  function choose(p: MessageContact) {
    if (!query) return;
    const el = box.current;
    const caret = el?.selectionStart ?? draft.length;
    const next = `${draft.slice(0, query.start)}@${p.name} ${draft.slice(caret)}`;
    setDraft(next);
    setPicked((s) => ({ ...s, [p.name]: p.userId }));
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = query.start + p.name.length + 2;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  function startMention() {
    const el = box.current;
    const caret = el?.selectionStart ?? draft.length;
    const pad = caret > 0 && !/\s$/.test(draft.slice(0, caret)) ? " " : "";
    const next = `${draft.slice(0, caret)}${pad}@${draft.slice(caret)}`;
    setDraft(next);
    setQuery({ text: "", start: caret + pad.length });
    setHi(0);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(caret + pad.length + 1, caret + pad.length + 1); });
  }

  function send() {
    if (pending || (!draft.trim() && files.length === 0)) return;
    const form = new FormData();
    if (to) form.set("to", to);
    if (thread) form.set("thread", thread);
    form.set("body", draft);
    form.set("mentions", JSON.stringify(Object.entries(picked).filter(([name]) => draft.includes(`@${name}`)).map(([, id]) => id)));
    for (const f of files) form.append("files", f);
    const keep = { draft, files, picked };
    setDraft(""); setFiles([]); setPicked({}); setQuery(null);
    startTransition(async () => {
      const res = await postMessage(form);
      if ("error" in res) { toast.error(res.error); setDraft(keep.draft); setFiles(keep.files); setPicked(keep.picked); }
      else router.refresh();
    });
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (query && matches.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % matches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + matches.length) % matches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(matches[hi]); return; }
      if (e.key === "Escape") { e.preventDefault(); setQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  }

  const ready = draft.trim().length > 0 || files.length > 0;

  return (
    <div className="shrink-0 px-4 pb-4 md:px-7 md:pb-6">
      <div className="relative rounded-2xl border border-line bg-card-soft focus-within:border-primary focus-within:ring-4 focus-within:ring-primary-soft">
        {query && (
          <div role="listbox" aria-label="Mention someone" className="absolute bottom-full left-3 mb-2 w-72 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-lg">
            {matches.length === 0
              ? <p className="px-3 py-2 text-[14px] text-muted">Nobody here by that name.</p>
              : matches.map((p, i) => (
                <button key={p.userId} role="option" aria-selected={i === hi} onMouseDown={(e) => { e.preventDefault(); choose(p); }}
                  className={cx("flex w-full items-center gap-2.5 px-3 py-2 text-left", i === hi ? "bg-tab-hover" : "hover:bg-tab-hover")}>
                  <Face initials={p.initials} size={28} />
                  <span className="min-w-0"><span className="block truncate text-[15px] font-medium text-text-strong">{p.name}</span><span className="block truncate text-[13px] text-muted">{roleWord(p)}</span></span>
                </button>
              ))}
          </div>
        )}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="flex max-w-[260px] items-center gap-2 rounded-lg border border-line bg-card py-1.5 pl-2.5 pr-1.5 text-[13px]">
                <FileText className="size-4 shrink-0 text-primary" />
                <span className="truncate font-medium text-text-strong">{f.name}</span>
                <span className="shrink-0 text-muted">{fileSize(f.size)}</span>
                <button aria-label={`Remove ${f.name}`} onClick={() => setFiles((s) => s.filter((_, j) => j !== i))} className="grid size-6 place-items-center rounded hover:bg-tab-hover"><X className="size-3.5" /></button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={box}
          rows={2}
          value={draft}
          placeholder={placeholder}
          aria-label="Message"
          onChange={(e) => { setDraft(e.target.value); readQuery(e.target.value, e.target.selectionStart); }}
          onClick={(e) => readQuery(draft, e.currentTarget.selectionStart)}
          onKeyDown={onKey}
          className="own-focus block max-h-48 min-h-[56px] w-full resize-none bg-transparent px-5 pt-4 text-[16px] text-text-strong outline-none placeholder:text-muted"
        />
        <div className="flex items-center gap-1 px-3 pb-2.5">
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => { const list = Array.from(e.target.files ?? []); setFiles((s) => [...s, ...list].slice(0, 6)); e.target.value = ""; }} />
          <button type="button" onClick={() => fileInput.current?.click()} aria-label="Attach files" title="Attach files (up to 6, 10 MB each)" className="grid size-10 place-items-center rounded-full text-text-strong hover:bg-tab-hover"><Plus className="size-6" strokeWidth={1.8} /></button>
          <button type="button" onClick={startMention} aria-label="Mention someone" title="Mention someone" className="grid size-10 place-items-center rounded-full text-text-strong hover:bg-tab-hover"><AtSign className="size-5" /></button>
          <span className="flex-1" />
          <button type="button" onClick={send} disabled={!ready || pending} aria-label="Send" title="Send (Enter)"
            className={cx("grid size-10 place-items-center rounded-full transition-colors", ready ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "text-muted")}>
            <SendHorizontal className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
