"use client";

/**
 * Voice notes (Oct 18, 2026, from the user's pick of the combined Messages view): a recording with
 * its written transcript, so a caregiver can talk instead of type and the office can read it at a
 * glance. Chrome transcribes on the device (`processLocally`). Other browsers, Safari among them,
 * fall back to their own speech recognition, as note dictation already does (user, Oct 18: the
 * transcript has to work everywhere); Safari sends that audio to Apple and Chrome's fallback to
 * Google, which waits on the same business-associate decision as dictation and the assistant.
 * The person checks, and can correct, the transcript before it is sent.
 */
import { Loader2, Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cx } from "@/components/kit";

const MAX_SECONDS = 180;

/* ---------- speech recognition (on-device in Chrome via `processLocally`), typed by hand ---------- */

interface RecognitionResultList { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } }
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onresult: ((e: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
interface RecognitionCtor {
  new (): Recognition;
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string>;
  install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
}

/** On-device recognition where the browser has it, else the browser's own; null when it has neither. */
async function recognizer(): Promise<Recognition | null> {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  let local = false;
  if (Ctor.available && "processLocally" in Ctor.prototype) {
    const opts = { langs: ["en-US"], processLocally: true };
    try {
      let state = await Ctor.available(opts);
      if (state === "downloadable" && Ctor.install) state = (await Ctor.install(opts)) ? "available" : state;
      local = state === "available";
    } catch { local = false; }
  }
  const r = new Ctor();
  r.lang = "en-US";
  r.continuous = true;
  r.interimResults = true;
  if (local) r.processLocally = true;
  return r;
}

function pickMime(): string {
  for (const t of ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export interface RecordedVoice { file: File; transcript: string; seconds: number }

/**
 * The recorder that replaces the message box while a voice note is made: a live timer and the
 * words as they are heard, then a review step with the transcript in an editable box.
 */
export function VoiceRecorder({ onSend, onCancel, sending }: { onSend: (v: RecordedVoice) => void; onCancel: () => void; sending: boolean }) {
  const [phase, setPhase] = useState<"starting" | "recording" | "review">("starting");
  const [seconds, setSeconds] = useState(0);
  const [heard, setHeard] = useState("");
  const [interim, setInterim] = useState("");
  const [transcript, setTranscript] = useState("");
  const [canTranscribe, setCanTranscribe] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const recog = useRef<Recognition | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const heardRef = useRef("");
  const startedAt = useRef(0);
  // Read through a ref so a new callback from the parent never restarts the microphone.
  const cancelRef = useRef(onCancel);
  useEffect(() => { cancelRef.current = onCancel; });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        const mime = pickMime();
        const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
        r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
        r.onstop = () => {
          const type = (r.mimeType || mime || "audio/webm").split(";")[0];
          const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
          setFile(new File(chunks.current, `Voice note.${ext}`, { type }));
          s.getTracks().forEach((t) => t.stop());
        };
        r.start(500);
        rec.current = r;
        startedAt.current = Date.now();
        setPhase("recording");
        const g = await recognizer();
        if (cancelled) return;
        setCanTranscribe(Boolean(g));
        if (g) {
          g.onresult = (e) => {
            let fin = heardRef.current, mid = "";
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const piece = e.results[i][0].transcript;
              if (e.results[i].isFinal) fin = `${fin} ${piece}`.trim(); else mid += piece;
            }
            heardRef.current = fin;
            setHeard(fin);
            setInterim(mid);
          };
          g.onerror = () => undefined;
          // Safari ends recognition after a pause even when continuous; pick it up again while recording.
          g.onend = () => { if (!cancelled && recog.current === g && rec.current?.state === "recording") { try { g.start(); } catch { /* already running */ } } };
          g.start();
          recog.current = g;
        }
      } catch {
        if (!cancelled) { toast.error("The microphone is blocked. Allow it in the browser's site settings to record."); cancelRef.current(); }
      }
    })();
    return () => {
      cancelled = true;
      recog.current?.abort();
      if (rec.current?.state === "recording") rec.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => {
      const s = (Date.now() - startedAt.current) / 1000;
      setSeconds(s);
      if (s >= MAX_SECONDS) stop();
    }, 250);
    return () => clearInterval(t);
  });

  function stop() {
    if (rec.current?.state === "recording") rec.current.stop();
    recog.current?.stop();
    setTranscript(`${heardRef.current} ${interim}`.trim());
    setPhase("review");
  }

  return (
    <div className="rounded-2xl border border-line bg-card px-4 py-3 md:px-5">
      {phase !== "review" ? (
        <div className="flex items-center gap-3">
          <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
            <Mic className="size-5" />
            {phase === "recording" && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-danger/20" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium text-text-strong">{phase === "starting" ? "Starting the microphone…" : `Recording · ${clock(seconds)}`}</p>
            <p className="truncate text-[14px] text-muted" aria-live="polite">
              {canTranscribe === false ? "This device can't write a transcript. The recording still sends." : heard || interim ? <>{heard} <span className="opacity-60">{interim}</span></> : "Speak, and the words appear here."}
            </p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Discard recording" className="grid size-10 place-items-center rounded-full text-text-strong hover:bg-tab-hover"><Trash2 className="size-5" /></button>
          <button type="button" onClick={stop} disabled={phase !== "recording"} className="inline-flex h-10 items-center gap-2 rounded-xl bg-text-strong px-4 text-[15px] font-medium text-card disabled:opacity-45"><Square className="size-3.5 fill-current" /> Stop</button>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 text-[14px] text-muted"><Mic className="size-4" /> Voice note · {clock(seconds)}</div>
          <label className="mt-2 block">
            <span className="text-[14px] font-medium text-text-strong">Transcript <span className="font-normal text-muted">· check it before sending</span></span>
            <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={3} placeholder={canTranscribe ? "Nothing was heard." : "No transcript on this device. Type a line if it helps."}
              className="own-focus mt-1.5 block w-full resize-none rounded-xl border border-line bg-transparent px-3 py-2 text-[15.5px] leading-[1.5] text-text-strong outline-none focus:border-text-strong" />
          </label>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button type="button" onClick={onCancel} className="h-10 rounded-xl px-4 text-[15px] font-medium text-text hover:bg-tab-hover">Discard</button>
            <button type="button" disabled={!file || sending} onClick={() => file && onSend({ file, transcript: transcript.trim(), seconds })}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-[15px] font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-45">
              {sending || !file ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}Send voice note
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Bars that stand for the recording, the same shape every time for the same note. */
function bars(seed: string, n = 28) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: n }, () => { h = (h * 1103515245 + 12345) >>> 0; return 0.3 + ((h >>> 16) % 70) / 100; });
}

/** A voice note in the conversation: play/pause, progress over the bars, length, and the transcript under it. */
export function VoiceNote({ id, src, transcript, mine }: { id: string; src: string; transcript: string; mine: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [t, setT] = useState(0);
  const [len, setLen] = useState(0);
  const shape = bars(id);
  const done = len ? t / len : 0;

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) { setLoading(true); void a.play().catch(() => { setLoading(false); toast.error("That voice note could not be played."); }); }
    else a.pause();
  }

  return (
    <div className="max-w-[min(100%,420px)]">
      <div className={cx("flex items-center gap-3 rounded-2xl border px-3 py-2.5", mine ? "border-text-strong/15" : "border-line")}>
        <button type="button" onClick={toggle} aria-label={playing ? "Pause voice note" : "Play voice note"} className="grid size-10 shrink-0 place-items-center rounded-full bg-text-strong text-card">
          {loading ? <Loader2 className="size-4 animate-spin" /> : playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
        </button>
        <div className="flex h-8 flex-1 items-center gap-[3px]" aria-hidden>
          {shape.map((v, i) => (
            <span key={i} className={cx("w-[3px] rounded-full", i / shape.length < done ? "bg-[var(--brand-ink,#00708e)]" : "bg-line")} style={{ height: `${v * 100}%` }} />
          ))}
        </div>
        <span className="w-10 shrink-0 text-right text-[13px] tabular-nums text-muted">{clock(playing || t ? t : len)}</span>
        <audio ref={audio} src={src} preload="metadata"
          onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setLen(d); }}
          onDurationChange={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setLen(d); }}
          onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
          onPlaying={() => { setPlaying(true); setLoading(false); }}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setT(0); }} />
      </div>
      <p className="mt-1.5 px-1 text-[15px] leading-[1.5] text-text">
        {transcript ? <>&ldquo;{transcript}&rdquo;</> : <span className="text-muted">No transcript</span>}
        <span className="ml-1.5 text-[13px] text-muted">· transcript</span>
      </p>
    </div>
  );
}
