"use client";

/**
 * The open conversation: header, messages grouped by day and by sender, and the composer. The
 * composer sends text, @mentions and files in one post. Typing "@" (or pressing the @ button) opens
 * a list of the people who can read this conversation; picking one inserts "@Name" and records who
 * was meant, so a mention survives two people sharing a first name.
 *
 * Oct 18, 2026 (the user's combined view): hovering a message shows React · Reply in thread ·
 * Mention; a shift swap request is a card someone who manages the schedule approves in place;
 * voice notes play with their transcript beneath; typing "/" offers shortcuts. The same pane, in
 * its "side" form, shows a reply thread beside the conversation.
 */
import { ArrowLeft, AtSign, Download, FileText, Link2, ListTree, Loader2, MessageSquareReply, Mic, MoreHorizontal, Plus, SendHorizontal, Smile, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useImperativeHandle, useRef, useState, useTransition, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { toast } from "sonner";
import { cx } from "@/components/kit";
import { PdfPages } from "@/components/pdf-pages";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ChannelInfo, ChatMessage, MessageContact } from "@/db/message-queries";
import { markChatThreadRead, markThreadRead, postMessage, renameThread, replyInThread, toggleReaction } from "./actions";
import { ago, ChannelTile, dayOf, Face, fileSize, isChannelHome, MentionText, roleWord, timeOf } from "./chat-bits";
import type { OpenView } from "./messenger";
import { REACTIONS } from "./reactions";
import { SwapCardView, SwapDialog } from "./swap";
import { MAX_FILE_BYTES, MAX_FILES, PART_BYTES } from "./upload/shared";
import { VoiceNote, VoiceRecorder, type RecordedVoice } from "./voice";

const IMAGE = /^image\/(png|jpe?g|webp|gif)$/;
const PDF = "application/pdf";
type Attachment = ChatMessage["attachments"][number];

/** What the hover bar's Mention asks of the composer. */
export interface ComposerApi { mention: (p: MessageContact) => void }

export function ConversationPane({ meId, now, open, backHref, canSchedule, canSwap, variant = "main", onClose, onOpenThread, onChannelSettings, onNewThread }: {
  meId: string;
  now: number;
  open: NonNullable<OpenView>;
  backHref: string;
  /** May approve shift swaps (manages the schedule). */
  canSchedule: boolean;
  /** Has a caregiver record, so has shifts to offer with /swap. */
  canSwap: boolean;
  /** "side": a reply thread drawn beside the conversation, with a close button. */
  variant?: "main" | "side";
  onClose?: () => void;
  /** Open a reply thread (beside the conversation on a wide screen). */
  onOpenThread: (threadId: string) => void;
  onChannelSettings: (c: ChannelInfo) => void;
  /** Start another thread in this thread's channel (the composer's thread button and /thread). */
  onNewThread?: () => void;
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<ComposerApi | null>(null);
  // A clicked attachment opens here, over the conversation, rather than in a new tab (user, Oct 16, 2026).
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const msgs = open.messages;
  const lastId = msgs.length ? msgs[msgs.length - 1].id : null;
  const targetId = open.kind === "dm" ? open.contact.userId : open.thread.id;
  const side = variant === "side";

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
  const parentId = open.kind === "thread" ? open.thread.parentMessageId : null;
  const me = msgs.find((m) => m.sender.userId === meId)?.sender.name;
  // Threads hang off messages in a channel's own conversation; a direct message has no channel.
  const canThread = !side && home;

  // Group: day → runs of one sender within five minutes. A reply thread's parent stands alone.
  const days: { day: string; runs: { sender: ChatMessage["sender"]; at: string; items: ChatMessage[] }[] }[] = [];
  for (const m of msgs) {
    const day = dayOf(m.at);
    let d = days[days.length - 1];
    if (!d || d.day !== day) { d = { day, runs: [] }; days.push(d); }
    const run = d.runs[d.runs.length - 1];
    const prev = run?.items[run.items.length - 1];
    if (run && prev && prev.id !== parentId && m.kind !== "swap" && prev.kind !== "swap" && run.sender.userId === m.sender.userId && new Date(m.at).getTime() - new Date(prev.at).getTime() < 5 * 60_000) run.items.push(m);
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

  function mention(p: MessageContact) {
    composer.current?.mention(p);
  }

  return (
    <>
      {side && open.kind === "thread" ? (
        <header className="mx-5 flex shrink-0 items-center gap-3 border-b border-line py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted">Thread · {open.thread.channel.name}</p>
            <h2 className="truncate text-[18px] font-semibold text-text-strong">{open.thread.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close thread" className="grid size-9 place-items-center rounded-full border border-line text-text-strong hover:bg-tab-hover"><X className="size-4" /></button>
        </header>
      ) : (
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
      )}

      <div ref={scroller} className={cx("min-h-0 flex-1 overflow-y-auto py-4", side ? "px-5" : "px-5 md:px-8")}>
        {msgs.length === 0 && <p className="py-10 text-center text-[15px] text-muted">{home ? `This is the start of ${open.kind === "thread" ? open.thread.channel.name : ""}. Say hello.` : "No messages yet. Say hello."}</p>}
        {days.map((d) => (
          <div key={d.day}>
            <div className="my-5 flex items-center gap-3 text-[13px] font-medium uppercase tracking-[0.08em] text-muted"><span className="h-px flex-1 bg-line-soft" />{d.day}<span className="h-px flex-1 bg-line-soft" /></div>
            {d.runs.map((r) => (
              <div key={r.items[0].id}>
                <div className="mb-4 flex gap-3.5">
                  <Face initials={r.sender.initials} size={side ? 32 : 40} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[16px] font-semibold text-text-strong">{r.sender.userId === meId ? "You" : r.sender.name}</span>
                      {r.sender.userId !== meId && !side && <span className="text-[14px] text-muted">{roleWord(r.sender)} ·</span>}
                      <span className="text-[14px] text-muted">{timeOf(r.at)}</span>
                    </div>
                    <div className="space-y-1">
                      {r.items.map((m) => (
                        <MessageItem key={m.id} m={m} meId={meId} meName={me} now={now} canSchedule={canSchedule}
                          canThread={canThread && m.id !== parentId} showReplies={m.id !== parentId} canMention={m.sender.userId !== meId && audience.some((p) => p.userId === m.sender.userId)}
                          onView={setViewing} onMention={() => mention(m.sender)} onOpenThread={onOpenThread} />
                      ))}
                    </div>
                  </div>
                </div>
                {r.items[0].id === parentId && (
                  <div className="mb-4 flex items-center gap-3 text-[14px] text-muted"><span>{msgs.length - 1} {msgs.length === 2 ? "reply" : "replies"}</span><span className="h-px flex-1 bg-line-soft" /></div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {open.kind === "dm" && !open.canReply
        ? <p className="mx-5 mb-6 shrink-0 rounded-2xl border border-line px-5 py-4 text-[15px] text-muted md:mx-8">This login is no longer active, so replies are closed.</p>
        : <Composer
            api={composer}
            compact={side}
            recipient={open.kind === "dm" ? { face: <Face initials={open.contact.initials} size={26} />, name: open.contact.name, note: roleWord(open.contact) } : { face: <ChannelTile icon={open.thread.channel.icon} tint={open.thread.channel.tint} size={26} />, name: home ? open.thread.channel.name : `${open.thread.channel.name} › ${open.thread.title}`, note: `${audience.length + 1} ${audience.length === 0 ? "person" : "people"} can read this` }}
            to={open.kind === "dm" ? open.contact.userId : null}
            thread={open.kind === "thread" ? open.thread.id : null}
            personId={open.kind === "thread" ? open.thread.channel.personId : null}
            audience={audience}
            canSwap={canSwap && !side}
            placeholder={side ? "Reply in thread…" : open.kind === "dm" ? `Message ${open.contact.name.split(" ")[0]} · type / for shortcuts` : "Message · type / for shortcuts"}
            onNewThread={open.kind === "thread" && !side ? onNewThread : undefined}
          />}
      {viewing && <AttachmentViewer file={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

/** One message: its body (text, voice note or swap card), files, reactions and reply link, with the hover bar. */
function MessageItem({ m, meId, meName, now, canSchedule, canThread, showReplies, canMention, onView, onMention, onOpenThread }: {
  m: ChatMessage; meId: string; meName?: string; now: number; canSchedule: boolean; canThread: boolean; showReplies: boolean; canMention: boolean;
  onView: (a: Attachment) => void; onMention: () => void; onOpenThread: (threadId: string) => void;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const mine = m.sender.userId === meId;
  const audio = m.kind === "voice" ? m.attachments.find((a) => a.contentType.startsWith("audio/")) : undefined;
  const files = m.attachments.filter((a) => a !== audio);

  function react(emoji: string) {
    setPickerOpen(false);
    start(async () => { const r = await toggleReaction(m.id, emoji); if ("error" in r) toast.error(r.error); else router.refresh(); });
  }
  function thread() {
    if (m.replies) { onOpenThread(m.replies.threadId); return; }
    start(async () => { const r = await replyInThread(m.id); if ("error" in r) toast.error(r.error); else onOpenThread(r.threadId); });
  }

  return (
    <div className="group relative -mx-2 max-w-[min(100%,780px)] rounded-xl px-2 py-1 hover:bg-[color-mix(in_srgb,var(--text-strong)_3%,transparent)] focus-within:bg-[color-mix(in_srgb,var(--text-strong)_3%,transparent)]">
      {m.kind === "swap" && m.swap ? (
        <SwapCardView swap={m.swap} mine={mine} canDecide={canSchedule} meName={meName} note={m.body.split("\n").slice(1).join("\n")} />
      ) : m.kind === "voice" && audio ? (
        <VoiceNote id={m.id} src={`/messages/files/${audio.id}`} transcript={m.body} mine={mine} />
      ) : m.body ? (
        <div className={cx("w-fit max-w-full whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-[16.5px] leading-[1.55] text-text-strong", mine ? "border border-text-strong/15" : "border border-line")}>
          <MentionText body={m.body} names={m.mentions.map((x) => x.name)} meName={meName} />
        </div>
      ) : null}
      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {files.map((a) => IMAGE.test(a.contentType) ? (
            <button key={a.id} type="button" onClick={() => onView(a)} title={a.fileName} className="block overflow-hidden rounded-xl border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated file; not for next/image's optimizer */}
              <img src={`/messages/files/${a.id}`} alt={a.fileName} className="max-h-56 max-w-[280px] object-cover" />
            </button>
          ) : (
            <button key={a.id} type="button" onClick={() => onView(a)} className="flex max-w-[320px] items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-2.5 text-left hover:bg-tab-hover">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line text-text-strong"><FileText className="size-5" /></span>
              <span className="min-w-0"><span className="block truncate text-[15px] font-medium text-text-strong">{a.fileName}</span><span className="text-[13px] text-muted">{fileSize(a.sizeBytes)}</span></span>
            </button>
          ))}
        </div>
      )}
      {m.reactions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {m.reactions.map((r) => (
            <button key={r.emoji} type="button" disabled={busy} onClick={() => react(r.emoji)} title={r.names.join(", ")} aria-pressed={r.mine}
              className={cx("inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[14px]", r.mine ? "border-[var(--brand,#0098c0)] bg-[color-mix(in_srgb,var(--brand,#0098c0)_8%,transparent)] text-text-strong" : "border-line text-text hover:border-text-strong/40")}>
              <span aria-hidden>{r.emoji}</span><span className="text-[13px] font-medium tabular-nums">{r.count}</span>
            </button>
          ))}
        </div>
      )}
      {m.replies && showReplies && (
        <button type="button" onClick={() => onOpenThread(m.replies!.threadId)} className="mt-1.5 inline-flex items-center gap-2 rounded-lg py-1 pr-2 text-[14px] font-medium text-[var(--brand-ink,#00708e)] hover:underline">
          <span className="flex">{m.replies.faces.map((f, i) => <span key={f + i} className={cx("grid size-6 place-items-center rounded-full bg-card text-[11px] font-semibold text-text-strong ring-1 ring-line", i > 0 && "-ml-1.5")}>{f}</span>)}</span>
          {m.replies.count} {m.replies.count === 1 ? "reply" : "replies"}
          <span className="font-normal text-muted">· last {ago(m.replies.lastAt, now)}</span>
        </button>
      )}

      {/* The hover bar: React · Reply in thread · Mention. Keyboard users reach it by tabbing into the message. */}
      <div className={cx("absolute right-2 top-1 z-10 flex gap-0.5 rounded-xl border border-line bg-card p-1 shadow-[0_6px_16px_rgba(35,42,58,0.10)] opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100", pickerOpen && "opacity-100")}>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger render={<button type="button" aria-label="React" title="React" className="grid size-8 place-items-center rounded-lg text-text-strong hover:bg-tab-hover" />}><Smile className="size-[18px]" strokeWidth={1.8} /></PopoverTrigger>
          <PopoverContent align="end" className="flex w-auto gap-1 p-1.5">
            {REACTIONS.map((e) => (
              <button key={e} type="button" onClick={() => react(e)} aria-label={`React ${e}`} className={cx("grid size-9 place-items-center rounded-lg text-[20px] hover:bg-tab-hover", m.reactions.some((r) => r.emoji === e && r.mine) && "bg-tab-hover")}>{e}</button>
            ))}
          </PopoverContent>
        </Popover>
        {canThread && (
          <button type="button" onClick={thread} disabled={busy} aria-label="Reply in thread" title="Reply in thread" className="grid size-8 place-items-center rounded-lg text-text-strong hover:bg-tab-hover">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <MessageSquareReply className="size-[18px]" strokeWidth={1.8} />}
          </button>
        )}
        {canMention && (
          <button type="button" onClick={onMention} aria-label={`Mention ${m.sender.name}`} title={`Mention ${m.sender.name.split(" ")[0]}`} className="grid size-8 place-items-center rounded-lg text-text-strong hover:bg-tab-hover"><AtSign className="size-[18px]" strokeWidth={1.8} /></button>
        )}
      </div>
    </div>
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


/** "/" shortcuts (Oct 18, 2026): each one either fills the box with a starting line or opens what it names. */
interface Shortcut { cmd: string; label: string; run: "swap" | "voice" | "thread" | { text: string } }
const SHORTCUTS: Shortcut[] = [
  { cmd: "swap", label: "Ask to swap one of your shifts", run: "swap" },
  { cmd: "late", label: "Tell the team you're running late", run: { text: "Running late. I'll be there by " } },
  { cmd: "voice", label: "Record a voice note", run: "voice" },
  { cmd: "thread", label: "Start a topic in this channel", run: "thread" },
  { cmd: "supplies", label: "Ask for supplies", run: { text: "Supplies needed: " } },
  { cmd: "call", label: "Ask for a call back", run: { text: "Please call me when you have a minute." } },
];

function Composer({ api, compact, recipient, to, thread, personId, audience, canSwap, placeholder, onNewThread }: {
  api: Ref<ComposerApi | null>;
  compact: boolean;
  recipient: { face: ReactNode; name: string; note: string };
  to: string | null;
  thread: string | null;
  /** The client behind a client channel, so /swap offers only that client's shifts. */
  personId: string | null;
  audience: MessageContact[];
  canSwap: boolean;
  placeholder: string;
  onNewThread?: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const [picked, setPicked] = useState<Record<string, string>>({}); // name → userId
  const [query, setQuery] = useState<{ text: string; start: number } | null>(null);
  const [hi, setHi] = useState(0);
  const [recording, setRecording] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const matches = query ? audience.filter((p) => p.name.toLowerCase().includes(query.text.toLowerCase())).slice(0, 8) : [];
  // The shortcut list shows while the whole draft is "/" and a word.
  const slash = /^\/(\w*)$/.exec(draft);
  const shortcuts = slash
    ? SHORTCUTS.filter((s) => (s.run !== "swap" || canSwap) && (s.run !== "thread" || onNewThread) && s.cmd.startsWith(slash[1].toLowerCase()))
    : [];

  useImperativeHandle(api, () => ({
    mention(p: MessageContact) {
      const pad = draft && !/\s$/.test(draft) ? " " : "";
      const next = `${draft}${pad}@${p.name} `;
      setDraft(next);
      setPicked((s) => ({ ...s, [p.name]: p.userId }));
      requestAnimationFrame(() => { box.current?.focus(); box.current?.setSelectionRange(next.length, next.length); });
    },
  }), [draft]);

  function readQuery(value: string, caret: number) {
    const before = value.slice(0, caret);
    const m = /(^|\s)@([\w.'-]*)$/.exec(before);
    if (m) { setQuery({ text: m[2], start: caret - m[2].length - 1 }); setHi(0); }
    else { setQuery(null); setHi(0); }
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

  function runShortcut(s: Shortcut) {
    setDraft("");
    setHi(0);
    if (s.run === "swap") setSwapping(true);
    else if (s.run === "voice") setRecording(true);
    else if (s.run === "thread") onNewThread?.();
    else {
      const text = s.run.text;
      setDraft(text);
      requestAnimationFrame(() => { box.current?.focus(); box.current?.setSelectionRange(text.length, text.length); });
    }
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

  function base() {
    const form = new FormData();
    if (to) form.set("to", to);
    if (thread) form.set("thread", thread);
    return form;
  }

  function send() {
    if (pending || uploading || (!draft.trim() && files.length === 0)) return;
    if (failed) { toast.error("Remove the file that failed to upload, or attach it again."); return; }
    const form = base();
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

  function sendVoice(v: RecordedVoice) {
    const p: Pending = { id: crypto.randomUUID(), file: v.file, sent: 0, error: null };
    startTransition(async () => {
      try { await uploadParts(p, () => undefined); } catch { toast.error("The voice note did not upload. Try again."); return; }
      const form = base();
      form.set("kind", "voice");
      form.set("body", v.transcript);
      form.set("uploads", JSON.stringify([{ id: p.id, name: v.file.name, type: v.file.type, size: v.file.size }]));
      const res = await postMessage(form);
      if ("error" in res) toast.error(res.error);
      else { setRecording(false); router.refresh(); }
    });
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    const list = shortcuts.length ? shortcuts : query ? matches : [];
    if (list.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % list.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + list.length) % list.length); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (shortcuts.length) runShortcut(shortcuts[hi % shortcuts.length]); else choose(matches[hi % matches.length]);
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); if (shortcuts.length) setDraft(""); else setQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  }

  const ready = (draft.trim().length > 0 || files.length > 0) && !uploading && !slash;
  const iconBtn = "grid size-9 place-items-center rounded-full text-text-strong hover:bg-tab-hover";

  if (recording) {
    return (
      <div className={cx("shrink-0", compact ? "px-4 pb-4" : "px-4 pb-5 md:px-8 md:pb-7")}>
        <VoiceRecorder sending={pending} onSend={sendVoice} onCancel={() => setRecording(false)} />
      </div>
    );
  }

  return (
    <div className={cx("shrink-0", compact ? "px-4 pb-4" : "px-4 pb-5 md:px-8 md:pb-7")}>
      <div className="relative rounded-2xl border border-line bg-card focus-within:border-text-strong">
        {/* The reference's "To …" line: who this lands with, before a word is typed. */}
        {!compact && (
          <div className="mx-4 flex min-w-0 items-center gap-2.5 border-b border-line-soft py-2.5 md:mx-5">
            <span className="text-[14px] text-muted">To</span>
            {recipient.face}
            <span className="truncate text-[15px] font-medium text-text-strong">{recipient.name}</span>
            <span className="hidden truncate text-[14px] text-muted sm:inline">{recipient.note}</span>
          </div>
        )}
        {shortcuts.length > 0 && (
          <div role="listbox" aria-label="Shortcuts" className="absolute bottom-full left-3 z-20 mb-2 w-[min(380px,calc(100%-1.5rem))] overflow-hidden rounded-xl border border-line bg-card p-1 shadow-lg">
            <p className="px-3 pb-1 pt-1.5 text-[13px] text-muted">Shortcuts</p>
            {shortcuts.map((s, i) => (
              <button key={s.cmd} role="option" aria-selected={i === hi % shortcuts.length} onMouseDown={(e) => { e.preventDefault(); runShortcut(s); }}
                className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", i === hi % shortcuts.length ? "bg-[color-mix(in_srgb,var(--brand,#0098c0)_10%,transparent)]" : "hover:bg-tab-hover")}>
                <span className={cx("w-20 shrink-0 text-[15px] font-semibold", i === hi % shortcuts.length ? "text-[var(--brand-ink,#00708e)]" : "text-text-strong")}>/{s.cmd}</span>
                <span className="truncate text-[14.5px] text-text-strong">{s.label}</span>
              </button>
            ))}
          </div>
        )}
        {query && (
          <div role="listbox" aria-label="Mention someone" className="absolute bottom-full left-3 z-20 mb-2 w-72 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-lg">
            {matches.length === 0
              ? <p className="px-3 py-2 text-[14px] text-muted">Nobody here by that name.</p>
              : matches.map((p, i) => (
                <button key={p.userId} role="option" aria-selected={i === hi % matches.length} onMouseDown={(e) => { e.preventDefault(); choose(p); }}
                  className={cx("flex w-full items-center gap-2.5 px-3 py-2 text-left", i === hi % matches.length ? "bg-tab-hover" : "hover:bg-tab-hover")}>
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
          rows={compact ? 1 : 2}
          value={draft}
          placeholder={placeholder}
          aria-label="Message"
          onChange={(e) => { setDraft(e.target.value); readQuery(e.target.value, e.target.selectionStart); }}
          onClick={(e) => readQuery(draft, e.currentTarget.selectionStart)}
          onKeyDown={onKey}
          className={cx("own-focus block max-h-48 w-full resize-none bg-transparent px-4 pt-3 text-[16.5px] leading-[1.55] text-text-strong outline-none placeholder:text-muted md:px-5", compact ? "min-h-[48px]" : "min-h-[72px]")}
        />
        <div className="flex items-center gap-0.5 px-2.5 pb-2 md:px-3">
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => { pick(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          <button type="button" onClick={() => fileInput.current?.click()} aria-label="Attach files" title={`Attach files (up to ${MAX_FILES}, 10 MB each)`} className={iconBtn}><Plus className="size-5" strokeWidth={1.8} /></button>
          <button type="button" onClick={startMention} aria-label="Mention someone" title="Mention someone" className={iconBtn}><AtSign className="size-5" strokeWidth={1.8} /></button>
          <button type="button" onClick={() => setRecording(true)} aria-label="Record a voice note" title="Record a voice note" className={iconBtn}><Mic className="size-5" strokeWidth={1.8} /></button>
          {onNewThread && <button type="button" onClick={onNewThread} aria-label="Start a new thread in this channel" title="New thread in this channel" className={iconBtn}><ListTree className="size-5" strokeWidth={1.8} /></button>}
          {compact && (
            <button type="button" onClick={send} disabled={!ready || pending} aria-label="Send" className="ml-auto grid size-9 place-items-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-45">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
            </button>
          )}
        </div>
      </div>
      {!compact && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="hidden text-[14px] text-muted sm:block">Enter sends · Shift + Enter starts a new line · / for shortcuts</p>
          <button type="button" onClick={send} disabled={!ready || pending} title={uploading ? "Waiting for the upload to finish" : "Send (Enter)"}
            className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-45">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}Send <SendHorizontal className="size-4" strokeWidth={2} />
          </button>
        </div>
      )}
      {swapping && <SwapDialog personId={personId} to={to} thread={thread} onClose={() => setSwapping(false)} />}
    </div>
  );
}
