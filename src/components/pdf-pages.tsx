"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFWorker, RenderTask } from "pdfjs-dist";

export type PdfFit = "page" | "width";

/*
 * Speed (Sept 21, 2026, user: "make switching very fast"). Three things made a step between notes
 * take a second and a half even with the bytes already in the browser: pdf.js started a new
 * worker per document, parsed the document and rebuilt its embedded fonts every time, and then
 * rasterised. So: one worker for the page; parsed documents are kept (never destroyed while the
 * page lives, bounded); and finished page bitmaps are kept per document, fit, zoom and box size,
 * so showing a note again is a single drawImage. `prerender` lets the viewer draw the neighbours
 * off-screen while the current note is being read.
 */
let sharedWorker: PDFWorker | undefined;
const docs = new Map<string, Promise<PDFDocumentProxy>>();
const DOCS_MAX = 40;
interface Rendered { width: number; height: number; bitmap: ImageBitmap }
const pages = new Map<string, Rendered[]>();
const PAGES_MAX = 16;
let lastBox = { w: 0, h: 0 };
const dpr = () => (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
const pageKey = (src: string, fit: PdfFit, zoom: number, w: number, h: number) => `${src}|${fit}|${zoom}|${Math.round(w)}x${Math.round(h)}|${dpr()}`;

async function pdfjs() {
  const m = await import("pdfjs-dist");
  m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  sharedWorker ??= new m.PDFWorker();
  return m;
}

function getDoc(src: string, bytes?: () => Promise<ArrayBuffer>): Promise<PDFDocumentProxy> {
  const hit = docs.get(src);
  if (hit) return hit;
  const p = (async () => {
    const m = await pdfjs();
    // pdf.js takes ownership of a buffer it is handed (it is transferred to the worker), so a
    // cached buffer must be copied or the cache would be left holding an empty one.
    return bytes
      ? m.getDocument({ data: new Uint8Array((await bytes()).slice(0)), worker: sharedWorker }).promise
      : m.getDocument({ url: src, withCredentials: true, worker: sharedWorker }).promise;
  })();
  docs.set(src, p);
  p.catch(() => docs.delete(src));
  if (docs.size > DOCS_MAX) { const oldest = docs.keys().next().value; if (oldest) { void docs.get(oldest)?.then((d) => d.destroy()).catch(() => {}); docs.delete(oldest); } }
  return p;
}

function remember(key: string, list: Rendered[]) {
  pages.set(key, list);
  if (pages.size > PAGES_MAX) { const oldest = pages.keys().next().value; if (oldest) { for (const r of pages.get(oldest) ?? []) r.bitmap.close(); pages.delete(oldest); } }
}

function scaleFor(base: { width: number; height: number }, fit: PdfFit, zoom: number, boxW: number, boxH: number) {
  return Math.max((fit === "width" ? boxW / base.width : Math.min(boxW / base.width, boxH / base.height)) * zoom, 0.2);
}

/** Render a page to a bitmap at the device's pixel ratio. */
async function rasterise(doc: PDFDocumentProxy, index: number, fit: PdfFit, zoom: number, boxW: number, boxH: number): Promise<Rendered> {
  const page = await doc.getPage(index);
  const vp = page.getViewport({ scale: scaleFor(page.getViewport({ scale: 1 }), fit, zoom, boxW, boxH) });
  const r = dpr();
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(vp.width * r);
  canvas.height = Math.floor(vp.height * r);
  const ctx = canvas.getContext("2d")!;
  // "print" intent draws in one go instead of pacing itself with animation frames, which stall
  // in a background tab (and made a step take a second or more there).
  const task: RenderTask = page.render({ canvasContext: ctx, viewport: vp, intent: "print", transform: r !== 1 ? [r, 0, 0, r, 0, 0] : undefined });
  await task.promise;
  return { width: Math.floor(vp.width), height: Math.floor(vp.height), bitmap: await createImageBitmap(canvas) };
}

/**
 * Draw a document's pages off-screen at the size the viewer is currently using, so a later
 * mount of the same document is instant. Skips work already done or in progress.
 */
const inflight = new Set<string>();
export async function prerender(src: string, bytes: () => Promise<ArrayBuffer>, fit: PdfFit, zoom: number) {
  if (lastBox.w === 0) return;
  const pad = 16;
  const boxW = lastBox.w - pad * 2, boxH = lastBox.h - pad * 2;
  const key = pageKey(src, fit, zoom, boxW, boxH);
  if (pages.has(key) || inflight.has(key)) return;
  inflight.add(key);
  try {
    const doc = await getDoc(src, bytes);
    const list: Rendered[] = [];
    for (let i = 1; i <= doc.numPages; i++) list.push(await rasterise(doc, i, fit, zoom, boxW, boxH));
    remember(key, list);
  } catch { /* a missed prerender just means a normal render later */ } finally { inflight.delete(key); }
}

/**
 * Draws a PDF's pages onto canvases with pdf.js, so the zoom is ours to decide. Safari's own
 * viewer ignores every zoom hint a page can pass it; this one fits the whole page by default
 * and can fit the width instead. `src` is the PDF's URL; `bytes`, when given, supplies the
 * document instead (from a cache) and `src` then only identifies it. `zoom` multiplies the
 * fitted scale: 1 is the fit, 2 is twice it.
 */
export function PdfPages({ src, bytes, fit, zoom = 1, onFirstPage }: { src: string; bytes?: () => Promise<ArrayBuffer>; fit: PdfFit; zoom?: number; onFirstPage?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  // Start at the size the last viewer had. ResizeObserver only reports while the page is painting
  // (never in a background tab), and the box is the same from one note to the next, so waiting for
  // it would stall a step made while the tab is hidden; the observer still corrects the size.
  const [size, setSize] = useState(() => lastBox);
  const [rendered, setRendered] = useState<{ key: string; list: Rendered[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onFirstPageRef = useRef(onFirstPage);
  useEffect(() => { onFirstPageRef.current = onFirstPage; });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // ResizeObserver reports once on observe, which is how the first size arrives.
    const ro = new ResizeObserver(([entry]) => { const r = entry.contentRect; lastBox = { w: r.width, h: r.height }; setSize({ w: r.width, h: r.height }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = 16;
  const boxW = size.w - pad * 2, boxH = size.h - pad * 2;
  const key = size.w > 0 ? pageKey(src, fit, zoom, boxW, boxH) : null;

  // A finished set of bitmaps for this key is used straight from the cache during render (no
  // state, no effect — the React Compiler lint forbids setState in an effect); only a miss renders.
  const hit = key ? pages.get(key) : undefined;
  useEffect(() => {
    if (!key || pages.has(key)) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await getDoc(src, bytes);
        if (cancelled) return;
        // The first page goes up as soon as it is ready; the rest follow.
        const first = await rasterise(doc, 1, fit, zoom, boxW, boxH);
        if (cancelled) { first.bitmap.close(); return; }
        const list = [first];
        setRendered({ key, list: [...list] });
        for (let i = 2; i <= doc.numPages; i++) {
          const r = await rasterise(doc, i, fit, zoom, boxW, boxH);
          if (cancelled) { r.bitmap.close(); return; }
          list.push(r);
          setRendered({ key, list: [...list] });
        }
        remember(key, list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the PDF.");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `bytes` is a stable loader for `src`
  }, [key, src, fit, zoom, boxW, boxH]);

  const shown = hit ?? (rendered && rendered.key === key ? rendered.list : null);

  // Zoomed past the box, the page stays centred: the inner wrapper is as wide as its content, so
  // auto margins centre it while it fits and it scrolls both ways once it does not. After a zoom
  // change the scroll position is put at the middle, so the centre of the page stays in view.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
  }, [zoom, fit, shown]);

  return (
    <div ref={box} className="size-full overflow-auto bg-panel" style={{ padding: pad }}>
      {error && <p className="p-4 text-[14px] text-danger">{error}</p>}
      <div className="mx-auto w-max">
        {shown?.map((r, i) => <Bitmap key={i} r={r} onDrawn={i === 0 ? () => onFirstPageRef.current?.() : undefined} />)}
      </div>
    </div>
  );
}

/** One page: a finished bitmap blitted onto a canvas. */
function Bitmap({ r, onDrawn }: { r: Rendered; onDrawn?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    c.width = r.bitmap.width; c.height = r.bitmap.height;
    c.getContext("2d")?.drawImage(r.bitmap, 0, 0);
    onDrawn?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDrawn is a one-shot notification
  }, [r]);
  return <canvas ref={canvas} className="mb-4 block bg-white shadow-[var(--shadow-md)] last:mb-0" style={{ width: r.width, height: r.height }} />;
}
