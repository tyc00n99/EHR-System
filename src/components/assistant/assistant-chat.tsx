"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Check, ChevronDown, Copy, FileText, Loader2, Sparkles, Square, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Textarea, cx } from "@/components/kit";
import { saveDraftToDocuments } from "@/app/(app)/assistant/actions";
import { DRAFT_LABEL, REF_PATTERN, type AssistantContext, type AssistantDraft, type AssistantEvent, type AssistantSource, type NoteDraftFacts } from "@/lib/ai/assistant/types";

/**
 * The assistant's conversation (Oct 18, 2026): used by the side panel on every page and inline in
 * the service record. It streams answers from /assistant/chat, draws the records each answer
 * cites as chips that open them, and shows drafts as editable cards. A draft only reaches the
 * record when the person presses "Use in note" (they still sign the note) or ticks "I reviewed
 * this" and files it in the client's Documents.
 *
 * Nothing here is kept in browser storage: a conversation can hold PHI, so it lives in memory and
 * is gone when the page is closed.
 */

export interface Suggestion { label: string; prompt: string; detail?: string }

/** Where an approved progress-review draft goes: the open note's field. */
export interface DraftTarget {
  label: string;
  apply: (text: string) => void;
  facts: () => NoteDraftFacts;
}

interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  status?: string;
  drafts: AssistantDraft[];
  error?: string;
  pending?: boolean;
}

export function AssistantChat({ context, suggestions, target, canSave, heading = "What should we work on?", contextLabel, compact = false, autoAsk, onAutoAsked }: {
  context: AssistantContext;
  suggestions: Suggestion[];
  target?: DraftTarget;
  /** Whether this person may file drafts in a client's Documents (`manage_people`). */
  canSave: boolean;
  heading?: string;
  contextLabel?: string;
  compact?: boolean;
  /** A question to ask as soon as the chat is on screen (from `openAssistant(prompt)`). */
  autoAsk?: string | null;
  onAutoAsked?: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sources, setSources] = useState<Record<string, AssistantSource>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  useEffect(() => () => abort.current?.abort(), []);

  useEffect(() => {
    if (!autoAsk) return;
    const t = setTimeout(() => { onAutoAsked?.(); void ask(autoAsk); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAsk]);

  const patch = (id: string, f: (t: Turn) => Turn) => setTurns((cur) => cur.map((t) => (t.id === id ? f(t) : t)));

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const userTurn: Turn = { id: crypto.randomUUID(), role: "user", text: q, drafts: [] };
    const answer: Turn = { id: crypto.randomUUID(), role: "assistant", text: "", drafts: [], pending: true, status: "Thinking" };
    const history = [...turns, userTurn].filter((t) => t.text.trim()).map((t) => ({ role: t.role, text: t.text }));
    setTurns((cur) => [...cur, userTurn, answer]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch("/assistant/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turns: history, context: { ...context, noteDraft: target?.facts() } }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const msg = await res.json().then((j: { message?: string }) => j.message).catch(() => null);
        patch(answer.id, (t) => ({ ...t, pending: false, status: undefined, error: msg ?? "The assistant could not answer. Try again." }));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const e = JSON.parse(line) as AssistantEvent;
          if (e.type === "text") patch(answer.id, (t) => ({ ...t, text: t.text + e.delta, status: undefined }));
          else if (e.type === "status") patch(answer.id, (t) => ({ ...t, status: e.label }));
          else if (e.type === "sources") setSources((cur) => ({ ...cur, ...Object.fromEntries(e.sources.map((s) => [s.ref, s])) }));
          else if (e.type === "draft") patch(answer.id, (t) => ({ ...t, drafts: [...t.drafts, e.draft] }));
          else if (e.type === "error") patch(answer.id, (t) => ({ ...t, error: e.message }));
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) patch(answer.id, (t) => ({ ...t, error: "The connection dropped. Try again." }));
    } finally {
      patch(answer.id, (t) => ({ ...t, pending: false, status: undefined }));
      setBusy(false);
      abort.current = null;
    }
  }

  const empty = turns.length === 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className={cx("min-h-0 flex-1 overflow-y-auto", compact ? "max-h-[420px]" : "")}>
        {empty ? (
          <div className={cx("flex flex-col items-center text-center", compact ? "px-1 py-3" : "px-5 pb-4 pt-10")}>
            {!compact && <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-panel text-text-strong"><Sparkles className="size-5" /></div>}
            <div className={cx("font-medium text-text-strong", compact ? "text-[14px]" : "text-[19px]")}>{heading}</div>
            {!compact && <p className="mt-1.5 max-w-[34ch] text-[13px] leading-5 text-muted-foreground">Answers come from the records you can open, with links to each one. Drafts wait for your review.</p>}
          </div>
        ) : (
          <div className={cx("space-y-5", compact ? "py-2" : "px-5 py-5")}>
            {turns.map((t) => t.role === "user"
              ? <div key={t.id} className="flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-panel px-3.5 py-2 text-[14px] leading-6 text-text-strong">{t.text}</div></div>
              : <AnswerTurn key={t.id} turn={t} sources={sources} target={target} canSave={canSave} context={context} />)}
          </div>
        )}
      </div>

      <div className={cx("shrink-0", compact ? "pt-2" : "px-4 pb-4 pt-2")}>
        {(empty || !busy) && suggestions.length > 0 && (
          <div className={cx("mb-2 flex gap-1.5", empty ? "flex-wrap justify-center" : "overflow-x-auto pb-1")}>
            {suggestions.map((s) => (
              <button key={s.label} type="button" onClick={() => ask(s.prompt)} disabled={busy} className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-[13px] font-medium text-text hover:bg-hover disabled:opacity-50">
                <Sparkles className="size-3.5 text-muted-foreground" />{s.label}
              </button>
            ))}
          </div>
        )}
        {/* A div, not a form: this chat also sits inside the service record's own form. */}
        {/* own-focus: the global :focus-visible outline would draw a hard rectangle around the inner
            textarea; the wrapper's border change is the focus cue instead. */}
        <div className="own-focus rounded-2xl border border-line bg-card px-3 pb-2 pt-2.5 transition-colors focus-within:border-gray-400">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(input); } }}
            rows={compact ? 1 : 2}
            placeholder={contextLabel ? `Ask about ${contextLabel}, or ask for a draft…` : "Ask a question or ask for a draft…"}
            aria-label="Message the assistant"
            className="block max-h-40 w-full resize-none bg-transparent text-[14px] leading-6 text-text-strong placeholder:text-hint focus:outline-none"
          />
          <div className="mt-1 flex items-center gap-2">
            {contextLabel && <span className="inline-flex h-6 min-w-0 items-center gap-1 rounded-full bg-panel px-2 text-[13px] text-text"><span className="size-1.5 shrink-0 rounded-full bg-brand" /><span className="truncate">{contextLabel}</span></span>}
            <span className="flex-1" />
            {busy
              ? <button type="button" onClick={() => abort.current?.abort()} aria-label="Stop" className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover"><Square className="size-3 fill-current" /></button>
              : <button type="button" onClick={() => ask(input)} disabled={!input.trim()} aria-label="Send" className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-30"><ArrowUp className="size-4" /></button>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */

function AnswerTurn({ turn, sources, target, canSave, context }: { turn: Turn; sources: Record<string, AssistantSource>; target?: DraftTarget; canSave: boolean; context: AssistantContext }) {
  const cited = [...new Set([...turn.text.matchAll(REF_PATTERN)].map((m) => m[1]))].filter((r) => sources[r]);
  return (
    <div className="space-y-3">
      {turn.text && <RichText text={turn.text} sources={sources} />}
      {turn.pending && turn.status && (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />{turn.status}…</div>
      )}
      {turn.drafts.map((d) => <DraftCard key={d.id} draft={d} sources={sources} target={target} canSave={canSave} context={context} />)}
      {turn.error && <div className="flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{turn.error}</div>}
      {!turn.pending && cited.length > 0 && <SourceList refs={cited} sources={sources} />}
    </div>
  );
}

/** "Based on N records": the evidence behind an answer, one click from each record. */
function SourceList({ refs, sources, title }: { refs: string[]; sources: Record<string, AssistantSource>; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-line">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-medium text-text">
        <FileText className="size-3.5 text-muted-foreground" />{title ?? `Based on ${refs.length} record${refs.length === 1 ? "" : "s"}`}
        <ChevronDown className={cx("ml-auto size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="border-t border-line px-1.5 py-1">
          {refs.map((r) => { const s = sources[r]; return s ? <li key={r}><SourceLink source={s} className="flex w-full items-baseline gap-2 rounded-lg px-1.5 py-1.5 text-left text-[13px] hover:bg-hover"><span className="font-medium text-text-strong">{s.label}</span>{s.detail && <span className="truncate text-muted-foreground">{s.detail}</span>}</SourceLink></li> : null; })}
        </ul>
      )}
    </div>
  );
}

function SourceLink({ source, className, children }: { source: AssistantSource; className?: string; children: ReactNode }) {
  const router = useRouter();
  // A note opens in the preview over the current page, the way a note row does everywhere else.
  const go = () => { if (source.href.startsWith("?")) window.history.pushState(null, "", `${window.location.pathname}${source.href}`); else router.push(source.href); };
  return <button type="button" onClick={go} title={source.detail ? `${source.label} · ${source.detail}` : source.label} className={className}>{children}</button>;
}

function Chip({ source }: { source: AssistantSource }) {
  return (
    <SourceLink source={source} className="mx-0.5 inline-flex h-5 max-w-[14rem] translate-y-[-1px] items-center rounded-full border border-line bg-card px-1.5 align-middle text-[13px] font-medium leading-none text-brand-ink hover:border-brand hover:bg-hover">
      <span className="truncate">{source.kind === "note" ? source.detail ?? source.label : source.label}</span>
    </SourceLink>
  );
}

/** Paragraphs, bullets, **bold**, and [ref] chips. The model writes plain text; nothing is parsed as HTML. */
function RichText({ text, sources }: { text: string; sources: Record<string, AssistantSource> }) {
  const inline = (s: string, key: string) => {
    const out: ReactNode[] = [];
    const parts = s.split(/(\*\*[^*]+\*\*|\[(?:client|note|goal|auth|mar|doc|staff|queue|schedule):[a-z0-9-]+\])/g);
    parts.forEach((p, i) => {
      if (!p) return;
      const bold = /^\*\*(.+)\*\*$/.exec(p);
      const ref = /^\[(.+)\]$/.exec(p);
      if (bold) out.push(<strong key={`${key}${i}`} className="font-semibold text-text-strong">{bold[1]}</strong>);
      else if (ref && sources[ref[1]]) out.push(<Chip key={`${key}${i}`} source={sources[ref[1]]} />);
      else if (ref) out.push(null);
      else out.push(<Fragment key={`${key}${i}`}>{p}</Fragment>);
    });
    return out;
  };
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2.5 text-[14px] leading-6 text-text-strong">
      {blocks.map((b, i) => {
        const lines = b.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          const ordered = /^\s*\d+\./.test(lines[0]);
          const List = ordered ? "ol" : "ul";
          return <List key={i} className={cx("space-y-1 pl-5", ordered ? "list-decimal" : "list-disc")}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""), `${i}-${j}-`)}</li>)}</List>;
        }
        if (lines.length === 1 && /^#{1,4}\s+/.test(lines[0])) return <div key={i} className="pt-1 text-[14px] font-semibold">{lines[0].replace(/^#+\s+/, "")}</div>;
        return <p key={i} className="whitespace-pre-wrap">{inline(b, `${i}-`)}</p>;
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */

function DraftCard({ draft, sources, target, canSave, context }: { draft: AssistantDraft; sources: Record<string, AssistantSource>; target?: DraftTarget; canSave: boolean; context: AssistantContext }) {
  const [body, setBody] = useState(draft.body);
  const [title, setTitle] = useState(draft.title);
  const [reviewed, setReviewed] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "used" | "saved">("idle");
  const isNote = draft.kind === "progress_review";
  const forOpenNote = isNote && target && (!draft.visitId || draft.visitId === context.visitId);
  const personId = draft.personId ?? context.personId;
  const placeholders = (body.match(/\[[^\]\n]{2,80}\]/g) ?? []).filter((p) => !/^\[[a-z]+:[a-z0-9-]+\]$/.test(p));
  const refs = draft.sources.filter((r) => sources[r]);

  const save = async () => {
    if (!personId) return;
    setState("saving");
    const r = await saveDraftToDocuments({ personId, kind: draft.kind === "progress_review" ? "other" : draft.kind, title, body, reviewed: reviewed as true });
    if (r.ok) { setState("saved"); toast.success(r.message); } else { setState("idle"); toast.error(r.message); }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Draft title" className="min-w-0 flex-1 bg-transparent text-[14px] font-medium text-text-strong focus:outline-none" />
        <Badge tone="neutral">{DRAFT_LABEL[draft.kind]}</Badge>
      </div>
      <div className="space-y-3 p-3.5">
        <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground"><Sparkles className="size-3.5 text-brand-ink" /><span className="font-medium uppercase tracking-wide text-brand-ink">Draft</span> · not saved · edit anything before you use it</div>
        <Textarea value={body} onChange={(e) => { setBody(e.target.value); if (state === "used") setState("idle"); }} className="min-h-56 text-[14px] leading-6" aria-label="Draft text" />
        {(draft.missing.length > 0 || placeholders.length > 0) && (
          <div className="rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn">
            <div className="mb-1 flex items-center gap-1.5 font-medium"><TriangleAlert className="size-3.5" />Needs details the record does not have</div>
            {draft.missing.length > 0 && <ul className="list-disc space-y-0.5 pl-5">{draft.missing.map((m) => <li key={m}>{m}</li>)}</ul>}
            {placeholders.length > 0 && <div className={draft.missing.length > 0 ? "mt-1" : ""}>Still to fill in the text: {[...new Set(placeholders)].join(", ")}</div>}
          </div>
        )}
        {refs.length > 0 && <SourceList refs={refs} sources={sources} title={`Drafted from ${refs.length} record${refs.length === 1 ? "" : "s"}`} />}

        {!isNote && personId && canSave && state !== "saved" && (
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-text">
            <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" />
            I reviewed this draft, checked it against the record, and it is accurate.
          </label>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {forOpenNote && (
            <Button type="button" onClick={() => { target!.apply(body); setState("used"); toast.success(`Placed in ${target!.label}. Read it once more, then save and sign the note.`); }} className="h-[34px] rounded-full px-4">
              {state === "used" ? <><Check className="size-4" />In the note</> : <>Use in {target!.label.toLowerCase()}</>}
            </Button>
          )}
          {!isNote && personId && canSave && (
            state === "saved"
              ? <span className="inline-flex h-[34px] items-center gap-1.5 text-[13px] font-medium text-ok"><Check className="size-4" />Saved to Documents</span>
              : <Button type="button" onClick={save} disabled={!reviewed || state === "saving"} className="h-[34px] rounded-full px-4">{state === "saving" ? <Loader2 className="size-4 animate-spin" /> : null}Save to client documents</Button>
          )}
          <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(body).then(() => toast.success("Copied."), () => toast.error("Could not copy."))} className="h-[34px] rounded-full px-4"><Copy className="size-3.5" />Copy</Button>
        </div>
        {isNote && !forOpenNote && <p className="text-[13px] text-muted-foreground">Open the note to place this draft in its progress review.</p>}
        {!isNote && !canSave && personId && <p className="text-[13px] text-muted-foreground">Copy it into your report, or ask a supervisor to file it. Your role cannot add client documents.</p>}
      </div>
    </div>
  );
}
