"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { Button, cx } from "@/components/kit";

/**
 * Dictation for the progress review (Oct 18, 2026): the browser's speech recognition turns speech
 * into words, then `clean` (Claude) fixes punctuation and filler. The result is appended to the
 * field for the caregiver to read; nothing is saved until they save the note.
 */

interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function Dictation({ onText, clean, disabled }: { onText: (text: string) => void; clean?: (spoken: string) => Promise<{ text?: string; message?: string }>; disabled?: boolean }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [interim, setInterim] = useState("");
  const rec = useRef<Recognition | null>(null);
  const heard = useRef("");

  // Feature detection has to wait for the browser; the server render shows no button.
  useEffect(() => { const t = setTimeout(() => setSupported(Boolean(recognitionCtor())), 0); return () => { clearTimeout(t); rec.current?.abort(); }; }, []);

  const finish = async () => {
    setListening(false);
    setInterim("");
    const spoken = heard.current.trim();
    heard.current = "";
    if (!spoken) return;
    if (!clean) { onText(spoken); return; }
    setCleaning(true);
    const r = await clean(spoken).catch(() => ({ message: "Clean-up failed, so the words were added as heard." }) as { text?: string; message?: string });
    setCleaning(false);
    onText(r.text ?? spoken);
    if (r.text) toast.success("Added to the progress review. Read it before you sign.");
    else toast.message(r.message ?? "Added as heard.");
  };

  const start = () => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = true;
    heard.current = "";
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) heard.current += `${res[0].transcript} `;
        else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") toast.error("The microphone is blocked. Allow it for this site in the browser's settings.");
      else if (e.error !== "no-speech" && e.error !== "aborted") toast.error("Dictation stopped. Try again.");
    };
    r.onend = () => { rec.current = null; void finish(); };
    rec.current = r;
    try { r.start(); setListening(true); } catch { rec.current = null; }
  };

  const stop = () => rec.current?.stop();

  if (!supported) return null;
  return (
    <>
      <Button type="button" variant="secondary" disabled={disabled || cleaning} onClick={listening ? stop : start} aria-pressed={listening} className={cx("h-7 gap-1.5 text-[13px]", listening && "border-brand text-brand-ink")}>
        {cleaning ? <Loader2 className="size-3.5 animate-spin" /> : listening ? <Square className="size-3 fill-current" /> : <Mic className="size-3.5" />}
        {cleaning ? "Cleaning up…" : listening ? "Stop" : "Dictate"}
      </Button>
      {listening && (
        <span role="status" className="sr-only">Listening</span>
      )}
      {listening && interim && <span className="hidden max-w-64 truncate text-[13px] text-muted-foreground sm:inline">{interim}</span>}
    </>
  );
}
