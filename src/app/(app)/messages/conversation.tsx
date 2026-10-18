"use client";

/**
 * The open conversation: header, messages grouped by day and by sender, and the composer. The
 * composer sends text, @mentions and files in one post. Typing "@" (or pressing the @ button) opens
 * a list of the people who can read this conversation; picking one inserts "@Name" and records who
 * was meant, so a mention survives two people sharing a first name.
 */
import { ArrowLeft, AtSign, Download, FileText, Link2, ListTree, Loader2, MoreHorizontal, Plus, SendHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { cx } from "@/components/kit";
import { PdfPages } from "@/components/pdf-pages";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ChannelInfo, ChatMessage, MessageContact } from "@/db/message-queries";
import { markChatThreadRead, markThreadRead, postMessage, renameThread } from "./actions";
import { ChannelTile, dayOf, Face, fileSize, isChannelHome, MentionText, roleWord, timeOf } from "./chat-bits";
import type { OpenView } from "./messenger";
import { MAX_FILE_BYTES, MAX_FILES, PART_BYTES } from "./upload/shared";

const IMAGE = /^image\/(png|jpe?g|webp|gif)$/;
const PDF = "application/pdf";
type Attachment = ChatMessage["attachments"][number];

export function ConversationPane({ meId, open, backHref, onChannelSettings, onNewThread }: {
  meId: string;
  open: NonNullable<OpenView>;
  backHref: string;
  onChannelSettings: (c: ChannelInfo) => void;
  /** Start another thread in this thread's channel (the composer's thread button). */
  onNewThread?: () => void;
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  // A clicked attachment opens here, over the conversation, rather than in a new tab (user, Oct 16, 2026).
  const [viewing, setViewing] = useState<Attachment | null>(null);
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
  const home = open.kind === "thread" && isChannelHome(open.thread.title);
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
      <header className="mx-5 flex shrink-0 items-center gap-4 border-b border-line py-5 md:mx-8 md:pt-7">
        <Link href={backHref} aria-label="Back to conversations" className="grid size-9 place-items-center rounded-full hover:bg-tab-hover md:hidden"><ArrowLeft className="size-5" /></Link>
        {open.kind === "thread"
          ? home
            ? <span className="hidden sm:block"><ChannelTile icon={open.thread.channel.icon} tint={open.thread.channel.tint} size={52} /></span>
            : <span className="hidden size-[52px] shrink-0 place-items-center rounded-full border border-line text-text-strong sm:grid"><ListTree className="size-6" strokeWidth={1.7} /></span>
          : <Face initials={open.contact.initials} size={52} />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[23px] font-semibold tracking-[-0.015em] text-text-strong">{open.kind === "thread" ? (home ? open.thread.channel.name : open.thread.title) : open.contact.name}</h2>
          <p className="mt-0.5 flex min-w-0 items-center gap-2 text-[15px] text-muted">
            {open.kind === "thread" ? home ? (
              <span className="truncate">{open.thread.channel.isPrivate ? "Private channel" : "Channel"} · {audience.length + 1} {audience.length === 0 ? "person" : "people"}</span>
            ) : (
              <>
                <ChannelTile icon={open.thread.channel.icon} tint={open.thread.channel.tint} size={20} />
                <span className="truncate">{open.thread.channel.name} · Started by {open.thread.startedBy.split(" ")[0]} at {timeOf(open.thread.createdAt)}</span>
              </>
            ) : <span className="truncate">{roleWord(open.contact)} · {msgs.length ? `Last message ${dayOf(msgs[msgs.length - 1].at)} at ${timeOf(msgs[msgs.length - 1].at)}` : "No messages yet"}</span>}
          </p>
        </div>
        <span className="hidden shrink-0 rounded-md border border-line px-2 py-0.5 text-[13px] font-medium uppercase tracking-[0.06em] text-text lg:inline">
          {open.kind === "dm" ? "Direct message" : home ? (open.thread.channel.personId ? "Client channel" : open.thread.channel.isPrivate ? "Private channel" : "Channel") : "Thread"}
        </span>
        <button onClick={copyLink} aria-label="Copy link" title="Copy link" className="grid size-10 place-items-center rounded-full text-text-strong hover:bg-tab-hover"><Link2 className="size-5" /></button>
        {open.kind === "thread" && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<button aria-label="Thread options" className="grid size-10 place-items-center rounded-full text-text-strong hover:bg-tab-hover" />}><MoreHorizontal className="size-5" /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                {!home && <DropdownMenuItem onClick={rename}>Rename thread</DropdownMenuItem>}
                {open.thread.channel.canManage && <DropdownMenuItem onClick={() => onChannelSettings(open.thread.channel)}>Channel settings</DropdownMenuItem>}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-8">
        {msgs.length === 0 && <p className="py-10 text-center text-[15px] text-muted">{home ? `This is the start of ${open.kind === "thread" ? open.thread.channel.name : ""}. Say hello.` : "No messages yet. Say hello."}</p>}
        {days.map((d) => (
          <div key={d.day}>
            <div className="my-5 flex items-center gap-3 text-[13px] font-medium uppercase tracking-[0.08em] text-muted"><span className="h-px flex-1 bg-line-soft" />{d.day}<span className="h-px flex-1 bg-line-soft" /></div>
            {d.runs.map((r) => (
              <div key={r.items[0].id} className="mb-5 flex gap-3.5">
                <Face initials={r.sender.initials} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[16px] font-semibold text-text-strong">{r.sender.userId === meId ? "You" : r.sender.name}</span>
                    {r.sender.userId !== meId && <span className="text-[14px] text-muted">{roleWord(r.sender)} ·</span>}
                    <span className="text-[14px] text-muted">{timeOf(r.at)}</span>
                  </div>
                  <div className="space-y-2">
                    {r.items.map((m) => (
                      <div key={m.id} className="max-w-[min(100%,760px)]">
                        {m.body && (
                          <div className={cx("w-fit max-w-full whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-[16.5px] leading-[1.55] text-text-strong", r.sender.userId === meId ? "border border-text-strong/15" : "border border-line")}>
                            <MentionText body={m.body} names={m.mentions.map((x) => x.name)} meName={me} />
                          </div>
                        )}
                        {m.attachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {m.attachments.map((a) => IMAGE.test(a.contentType) ? (
                              <button key={a.id} type="button" onClick={() => setViewing(a)} title={a.fileName} className="block overflow-hidden rounded-xl border border-line">
                                {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated file; not for next/image's optimizer */}
                                <img src={`/messages/files/${a.id}`} alt={a.fileName} className="max-h-56 max-w-[280px] object-cover" />
                              </button>
                            ) : (
                              <button key={a.id} type="button" onClick={() => setViewing(a)} className="flex max-w-[320px] items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-2.5 text-left hover:bg-tab-hover">
                                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line text-text-strong"><FileText className="size-5" /></span>
                                <span className="min-w-0"><span className="block truncate text-[15px] font-medium text-text-strong">{a.fileName}</span><span className="text-[13px] text-muted">{fileSize(a.sizeBytes)}</span></span>
                              </button>
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
        ? <p className="mx-5 mb-6 shrink-0 rounded-2xl border border-line px-5 py-4 text-[15px] text-muted md:mx-8">This login is no longer active, so replies are closed.</p>
        : <Composer recipient={open.kind === "dm" ? { face: <Face initials={open.contact.initials} size={26} />, name: open.contact.name, note: roleWord(open.contact) } : { face: <ChannelTile icon={open.thread.channel.icon} tint={open.thread.channel.tint} size={26} />, name: home ? open.thread.channel.name : `${open.thread.channel.name} › ${open.thread.title}`, note: `${audience.length + 1} ${audience.length === 0 ? "person" : "people"} can read this` }} to={open.kind === "dm" ? open.contact.userId : null} thread={open.kind === "thread" ? open.thread.id : null} audience={audience} placeholder={open.kind === "dm" ? `Message ${open.contact.name.split(" ")[0]}…` : "Message…"} onNewThread={open.kind === "thread" ? onNewThread : undefined} />}
      {viewing && <AttachmentViewer file={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

/**
 * A file from a message, shown in place: pictures and PDFs are drawn in a window over the
 * conversation; anything else is offered as a download, since the browser cannot draw it. The
 * Download button saves the file without leaving the screen (the route already names it).
 */
function AttachmentViewer({ file, onClose }: { file: Attachment; onClose: () => void }) {
  const src = `/messages/files/${file.id}`;
  const isImage = IMAGE.test(file.contentType);
  const isPdf = file.contentType === PDF;
  const [ready, setReady] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* A picture gets a window its own size (user, Oct 16: "why is there so much extra space?"); a PDF needs the tall one. */}
      <DialogContent className={cx("flex max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none", isImage ? "h-auto w-auto max-h-[92vh] max-w-[min(96vw,1600px)]" : "h-[90vh] w-[min(96vw,1060px)]")}>
        <DialogTitle className="flex h-12 shrink-0 items-center gap-3 whitespace-nowrap border-b border-line-soft bg-page pl-4 pr-14 text-[13.5px] font-medium">
          <span className="min-w-0 flex-1 truncate">{file.fileName}</span>
          <span className="shrink-0 text-muted">{fileSize(file.sizeBytes)}</span>
          <a href={src} download={file.fileName} className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--radius-btn)] border border-line px-2.5 text-[13px] font-medium hover:bg-hover"><Download className="size-3.5" /> Download</a>
        </DialogTitle>
        <div className={cx("relative min-h-0 flex-1", isImage ? "bg-card" : "bg-panel")}>
          {isPdf && (
            <>
              {!ready && <div className="absolute inset-0 flex items-center justify-center gap-2 text-[14px] text-muted"><Loader2 className="size-4 animate-spin" aria-hidden /> Opening…</div>}
              <PdfPages src={src} fit="width" onFirstPage={() => setReady(true)} />
            </>
          )}
          {isImage && (
            // eslint-disable-next-line @next/next/no-img-element -- private, auth-gated file
            <img src={src} alt={file.fileName} className="block max-h-[calc(92vh-3rem)] max-w-[min(96vw,1600px)] object-contain" />
          )}
          {!isPdf && !isImage && (
            <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
              <span className="grid size-14 place-items-center rounded-xl bg-card-soft text-text-strong"><FileText className="size-7" /></span>
              <p className="text-[15px] text-text-strong">This kind of file cannot be shown here.</p>
              <a href={src} download={file.fileName} className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-btn)] bg-primary px-4 text-[14px] font-medium text-primary-foreground hover:bg-primary-hover"><Download className="size-4" /> Download {file.fileName}</a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A file in the composer: uploaded in parts the moment it is picked, so Send has nothing left to carry. */
interface Pending { id: string; file: File; sent: number; error: string | null }

async function uploadParts(p: Pending, onPart: (sent: number) => void) {
  const parts = Math.ceil(p.file.size / PART_BYTES);
  for (let i = 0; i < parts; i++) {
    const res = await fetch("/messages/upload", { method: "POST", headers: { "x-upload-id": p.id, "x-upload-part": String(i), "content-type": "application/octet-stream" }, body: p.file.slice(i * PART_BYTES, (i + 1) * PART_BYTES) });
    if (!res.ok) throw new Error(res.status === 413 ? "too large" : `upload failed (${res.status})`);
    onPart(i + 1);
  }
}

function Composer({ recipient, to, thread, audience, placeholder, onNewThread }: { recipient: { face: ReactNode; name: string; note: string }; to: string | null; thread: string | null; audience: MessageContact[]; placeholder: string; onNewThread?: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
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

  const partsOf = (f: File) => Math.ceil(f.size / PART_BYTES);
  const uploading = files.some((p) => !p.error && p.sent < partsOf(p.file));
  const failed = files.some((p) => p.error);

  function pick(list: File[]) {
    const room = MAX_FILES - files.length;
    if (list.length > room) toast.error(`Attach up to ${MAX_FILES} files at a time.`);
    const added: Pending[] = [];
    for (const file of list.slice(0, Math.max(0, room))) {
      if (file.size > MAX_FILE_BYTES) { toast.error(`${file.name} is over 10 MB.`); continue; }
      if (file.size === 0) { toast.error(`${file.name} is empty.`); continue; }
      added.push({ id: crypto.randomUUID(), file, sent: 0, error: null });
    }
    if (added.length === 0) return;
    setFiles((s) => [...s, ...added]);
    for (const p of added) {
      void uploadParts(p, (sent) => setFiles((s) => s.map((x) => (x.id === p.id ? { ...x, sent } : x))))
        .catch((e: Error) => setFiles((s) => s.map((x) => (x.id === p.id ? { ...x, error: e.message === "too large" ? "Over 10 MB" : "Upload failed" } : x))));
    }
  }

  function remove(p: Pending) {
    setFiles((s) => s.filter((x) => x.id !== p.id));
    void fetch(`/messages/upload?id=${p.id}`, { method: "DELETE" }).catch(() => {});
  }

  function send() {
    if (pending || uploading || (!draft.trim() && files.length === 0)) return;
    if (failed) { toast.error("Remove the file that failed to upload, or attach it again."); return; }
    const form = new FormData();
    if (to) form.set("to", to);
    if (thread) form.set("thread", thread);
    form.set("body", draft);
    form.set("mentions", JSON.stringify(Object.entries(picked).filter(([name]) => draft.includes(`@${name}`)).map(([, id]) => id)));
    form.set("uploads", JSON.stringify(files.map((p) => ({ id: p.id, name: p.file.name, type: p.file.type, size: p.file.size }))));
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

  const ready = (draft.trim().length > 0 || files.length > 0) && !uploading;

  return (
    <div className="shrink-0 px-4 pb-5 md:px-8 md:pb-7">
      <div className="relative rounded-2xl border border-line bg-card focus-within:border-text-strong">
        {/* The reference's "To …" line: who this lands with, before a word is typed. */}
        <div className="mx-4 flex min-w-0 items-center gap-2.5 border-b border-line-soft py-2.5 md:mx-5">
          <span className="text-[14px] text-muted">To</span>
          {recipient.face}
          <span className="truncate text-[15px] font-medium text-text-strong">{recipient.name}</span>
          <span className="hidden truncate text-[14px] text-muted sm:inline">{recipient.note}</span>
        </div>
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
            {files.map((p) => {
              const parts = partsOf(p.file);
              const busy = !p.error && p.sent < parts;
              return (
                <span key={p.id} className={cx("relative flex max-w-[260px] items-center gap-2 overflow-hidden rounded-lg border bg-card py-1.5 pl-2.5 pr-1.5 text-[13px]", p.error ? "border-danger" : "border-line")}>
                  {busy ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-label="Uploading" /> : <FileText className={cx("size-4 shrink-0", p.error ? "text-danger" : "text-primary")} />}
                  <span className="truncate font-medium text-text-strong">{p.file.name}</span>
                  <span className={cx("shrink-0", p.error ? "text-danger" : "text-muted")}>{p.error ?? (busy ? `${Math.round((p.sent / parts) * 100)}%` : fileSize(p.file.size))}</span>
                  <button aria-label={`Remove ${p.file.name}`} onClick={() => remove(p)} className="grid size-6 place-items-center rounded hover:bg-tab-hover"><X className="size-3.5" /></button>
                  {busy && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-primary transition-[width]" style={{ width: `${(p.sent / parts) * 100}%` }} />}
                </span>
              );
            })}
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
          className="own-focus block max-h-48 min-h-[72px] w-full resize-none bg-transparent px-4 pt-3 text-[16.5px] leading-[1.55] text-text-strong outline-none placeholder:text-muted md:px-5"
        />
        <div className="flex items-center gap-0.5 px-2.5 pb-2 md:px-3">
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => { pick(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          <button type="button" onClick={() => fileInput.current?.click()} aria-label="Attach files" title={`Attach files (up to ${MAX_FILES}, 10 MB each)`} className="grid size-9 place-items-center rounded-full text-text-strong hover:bg-tab-hover"><Plus className="size-5" strokeWidth={1.8} /></button>
          <button type="button" onClick={startMention} aria-label="Mention someone" title="Mention someone" className="grid size-9 place-items-center rounded-full text-text-strong hover:bg-tab-hover"><AtSign className="size-5" strokeWidth={1.8} /></button>
          {onNewThread && <button type="button" onClick={onNewThread} aria-label="Start a new thread in this channel" title="New thread in this channel" className="grid size-9 place-items-center rounded-full text-text-strong hover:bg-tab-hover"><ListTree className="size-5" strokeWidth={1.8} /></button>}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="hidden text-[14px] text-muted sm:block">Enter sends · Shift + Enter starts a new line</p>
        <button type="button" onClick={send} disabled={!ready || pending} title={uploading ? "Waiting for the upload to finish" : "Send (Enter)"}
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-45">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}Send <SendHorizontal className="size-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
