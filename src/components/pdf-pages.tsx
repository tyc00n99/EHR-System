"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

export type PdfFit = "page" | "width";

/**
 * Draws a PDF's pages onto canvases with pdf.js, so the zoom is ours to decide. Safari's own
 * viewer ignores every zoom hint a page can pass it; this one fits the whole page by default
 * and can fit the width instead. Pages render at device pixel ratio so text stays crisp.
 */
export function PdfPages({ src, fit, onFirstPage }: { src: string; fit: PdfFit; onFirstPage?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const d = await pdfjs.getDocument({ url: src, withCredentials: true }).promise;
        if (cancelled) { void d.destroy(); return; }
        loaded = d;
        setDoc(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the PDF.");
      }
    })();
    return () => { cancelled = true; void loaded?.destroy(); };
  }, [src]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // ResizeObserver reports once on observe, which is how the first size arrives.
    const ro = new ResizeObserver(([entry]) => { const r = entry.contentRect; setSize({ w: r.width, h: r.height }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = 16;
  return (
    <div ref={box} className="size-full overflow-auto bg-panel" style={{ padding: pad }}>
      {error && <p className="p-4 text-[14px] text-danger">{error}</p>}
      {doc && size.w > 0 && Array.from({ length: doc.numPages }, (_, i) => (
        <Page key={i} doc={doc} index={i + 1} boxW={size.w - pad * 2} boxH={size.h - pad * 2} fit={fit} onRendered={i === 0 ? onFirstPage : undefined} />
      ))}
    </div>
  );
}

function Page({ doc, index, boxW, boxH, fit, onRendered }: { doc: PDFDocumentProxy; index: number; boxW: number; boxH: number; fit: PdfFit; onRendered?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const onRenderedRef = useRef(onRendered);
  useEffect(() => { onRenderedRef.current = onRendered; });
  useEffect(() => {
    let cancelled = false;
    let task: RenderTask | null = null;
    void doc.getPage(index).then((page) => {
      const c = canvas.current;
      if (cancelled || !c) return;
      const base = page.getViewport({ scale: 1 });
      const scale = fit === "width" ? boxW / base.width : Math.min(boxW / base.width, boxH / base.height);
      const vp = page.getViewport({ scale: Math.max(scale, 0.2) });
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.floor(vp.width * dpr);
      c.height = Math.floor(vp.height * dpr);
      c.style.width = `${Math.floor(vp.width)}px`;
      c.style.height = `${Math.floor(vp.height)}px`;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      task = page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      task.promise.then(() => { if (!cancelled) onRenderedRef.current?.(); }).catch(() => {});
    });
    return () => { cancelled = true; task?.cancel(); };
  }, [doc, index, boxW, boxH, fit]);
  return <canvas ref={canvas} className="mx-auto mb-4 block bg-white shadow-[var(--shadow-md)] last:mb-0" />;
}
