"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Minus, Pencil, Plus } from "lucide-react";
import { DownloadButton } from "@/components/download-button";
import { PdfPages, prerender, type PdfFit } from "@/components/pdf-pages";
import { cx } from "@/components/kit";
import { useNoteStrip } from "@/components/note-strip";
import { getNoteBytes, prefetchNoteBytes } from "@/components/note-bytes";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * Reads `?note=<visitId>` and shows that note as the finished PDF, so a supervisor can review
 * exactly what the county would receive. Mounted once in the shell, so any note list can link to it.
 */
export function NotePreview() {
  const params = useSearchParams();
  const pathname = usePathname();
  const id = params.get("note");
  const [loaded, setLoaded] = useState<string | null>(null);
  const [fit, setFit] = useState<PdfFit>("page");
  // Zoom inside the viewer (user, Sept 21): steps of 25% from half to three times the fit.
  const [zoom, setZoom] = useState(1);
  const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
  const zoomStep = (dir: 1 | -1) => setZoom((z) => { const i = ZOOMS.findIndex((x) => x >= z - 1e-6); const j = Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? ZOOMS.length - 1 : i) + dir)); return ZOOMS[j]; });
  // Closing only touches the URL: no server render, so the list underneath does not flash.
  const recordHref = (() => { const n = new URLSearchParams(params.toString()); n.delete("note"); n.set("visit", id ?? ""); return `${pathname}?${n}`; })();
  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("note");
    window.history.replaceState(null, "", next.size ? `${pathname}?${next}` : pathname);
  };
  // The filmstrip (user's pick "C", Sept 21, 2026): the rows of the notes table underneath, in its
  // order. Moving only touches the URL, like opening a note from a row does, so nothing re-renders
  // on the server and the list stays where it was.
  const strip = useNoteStrip();
  const at = id ? strip.findIndex((n) => n.id === id) : -1;
  const go = (nid: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("note", nid);
    window.history.pushState(null, "", `${pathname}?${next}`);
  };
  const prev = at > 0 ? strip[at - 1] : null, nextNote = at >= 0 && at < strip.length - 1 ? strip[at + 1] : null;
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!id) return;
    stripRef.current?.querySelector<HTMLElement>(`[data-note="${id}"]`)?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [id]);
  // Fetch the neighbours while this one is being read, and once this one is on screen draw the
  // nearest two off-screen at the current size, so a step is a single blit.
  useEffect(() => {
    if (at < 0) return;
    for (const k of [1, -1, 2, -2]) { const n = strip[at + k]; if (n) prefetchNoteBytes(n.id); }
  }, [at, strip]);
  useEffect(() => {
    if (at < 0 || loaded !== id) return;
    let stop = false;
    (async () => {
      for (const k of [1, -1, 2, -2]) {
        const n = strip[at + k];
        if (!n || stop) continue;
        await prerender(`/visits/${n.id}/note.pdf`, () => getNoteBytes(n.id), fit, zoom);
      }
    })();
    return () => { stop = true; };
  }, [at, strip, loaded, id, fit, zoom]);
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey) return;
      // ⌘/Ctrl with + − 0 zooms the note, not the browser.
      if ((e.metaKey || e.ctrlKey) && !["=", "+", "-", "0"].includes(e.key)) return;
      if (e.key === "ArrowLeft" && prev) { e.preventDefault(); go(prev.id); }
      if (e.key === "ArrowRight" && nextNote) { e.preventDefault(); go(nextNote.id); }
      if (e.key === "=" || e.key === "+") { e.preventDefault(); zoomStep(1); }
      if (e.key === "-") { e.preventDefault(); zoomStep(-1); }
      if (e.key === "0") { e.preventDefault(); setZoom(1); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- go reads the current params on each call
  }, [id, prev, nextNote]);
  if (!id) return null;
  const src = `/visits/${id}/note.pdf`;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="flex h-[90vh] w-[min(96vw,1060px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogTitle className="flex h-12 shrink-0 items-center gap-3 whitespace-nowrap border-b border-line-soft bg-page pl-4 pr-14 text-[13.5px] font-medium">
          <span className="min-w-0 flex-1 truncate">Daily service note</span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <span className="mr-1 inline-flex h-7 overflow-hidden rounded-md border border-line text-[13px] font-medium" role="group" aria-label="Zoom">
              <button type="button" onClick={() => setFit("page")} aria-pressed={fit === "page"} className={cx("px-2.5", fit === "page" ? "bg-primary-soft text-primary" : "hover:bg-hover")}>Fit page</button>
              <button type="button" onClick={() => setFit("width")} aria-pressed={fit === "width"} className={cx("border-l border-line px-2.5", fit === "width" ? "bg-primary-soft text-primary" : "hover:bg-hover")}>Fit width</button>
            </span>
            <span className="mr-1 inline-flex h-7 items-center overflow-hidden rounded-md border border-line text-[13px] font-medium" role="group" aria-label="Zoom level">
              <button type="button" onClick={() => zoomStep(-1)} disabled={zoom <= 0.5} aria-label="Zoom out" title="Zoom out (−)" className="flex h-full w-7 items-center justify-center hover:bg-hover disabled:opacity-40"><Minus className="size-3.5" /></button>
              <button type="button" onClick={() => setZoom(1)} title="Reset zoom (0)" className="h-full min-w-[46px] border-x border-line px-1.5 tabular-nums hover:bg-hover">{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={() => zoomStep(1)} disabled={zoom >= 3} aria-label="Zoom in" title="Zoom in (+)" className="flex h-full w-7 items-center justify-center hover:bg-hover disabled:opacity-40"><Plus className="size-3.5" /></button>
            </span>
            <Link href={recordHref} scroll={false} onClick={close} className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--radius-btn)] border border-line px-2.5 text-[13px] font-medium hover:bg-hover"><Pencil className="size-3.5" /> Open record</Link>
            <DownloadButton href={src} className="h-7 px-2.5 text-[13px]">Download</DownloadButton>
          </span>
        </DialogTitle>
        <div className="relative min-h-0 flex-1 bg-panel" onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomStep(e.deltaY < 0 ? 1 : -1); } }}>
          {loaded !== id && <div className="absolute inset-0 flex items-center justify-center gap-2 text-[14px] text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> Preparing the note…</div>}
          <PdfPages key={id} src={src} bytes={() => getNoteBytes(id)} fit={fit} zoom={zoom} onFirstPage={() => setLoaded(id)} />
        </div>
        {strip.length > 1 && (
          <div className="flex h-14 shrink-0 items-center gap-1.5 border-t border-line bg-page px-2.5">
            <button type="button" onClick={() => prev && go(prev.id)} disabled={!prev} aria-label="Previous note" title="Previous note (←)" className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-tab-hover hover:text-text-strong disabled:opacity-30"><ChevronLeft className="size-4" /></button>
            <div ref={stripRef} className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {strip.map((n) => {
                const on = n.id === id;
                return (
                  <button key={n.id} type="button" data-note={n.id} onClick={() => go(n.id)} aria-current={on ? "true" : undefined} title={`${n.day} · ${n.time} · ${n.client} · ${n.staff}`} className={cx("flex h-9 shrink-0 flex-col justify-center rounded-lg border px-3 text-left leading-[1.15]", on ? "border-transparent bg-primary-soft text-primary" : "border-line bg-card hover:bg-tab-hover")}>
                    <span className="text-[13px] font-medium">{n.day}{n.unsigned && <span aria-label="Unsigned" className="ml-1 inline-block size-1.5 rounded-full bg-danger align-middle" />}</span>
                    <span className={cx("text-[13px]", on ? "text-primary/80" : "text-muted-foreground")}>{n.time.split(" – ")[0]} · {n.staff.split(" ").map((w, i, a) => (i === a.length - 1 ? `${w[0]}.` : w)).join(" ")}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => nextNote && go(nextNote.id)} disabled={!nextNote} aria-label="Next note" title="Next note (→)" className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-tab-hover hover:text-text-strong disabled:opacity-30"><ChevronRight className="size-4" /></button>
            <span className="ml-1 shrink-0 text-[13px] tabular-nums text-muted-foreground">{at + 1} of {strip.length}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
