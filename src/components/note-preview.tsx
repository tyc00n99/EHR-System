"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { DownloadButton } from "@/components/download-button";
import { PdfPages, type PdfFit } from "@/components/pdf-pages";
import { cx } from "@/components/kit";
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
  // Closing only touches the URL: no server render, so the list underneath does not flash.
  const recordHref = (() => { const n = new URLSearchParams(params.toString()); n.delete("note"); n.set("visit", id ?? ""); return `${pathname}?${n}`; })();
  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("note");
    window.history.replaceState(null, "", next.size ? `${pathname}?${next}` : pathname);
  };
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
            <Link href={recordHref} scroll={false} onClick={close} className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--radius-btn)] border border-line px-2.5 text-[13px] font-medium hover:bg-hover"><Pencil className="size-3.5" /> Open record</Link>
            <DownloadButton href={src} className="h-7 px-2.5 text-[13px]">Download</DownloadButton>
          </span>
        </DialogTitle>
        <div className="relative min-h-0 flex-1 bg-panel">
          {loaded !== id && <div className="absolute inset-0 flex items-center justify-center gap-2 text-[14px] text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> Preparing the note…</div>}
          <PdfPages key={id} src={src} fit={fit} onFirstPage={() => setLoaded(id)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
