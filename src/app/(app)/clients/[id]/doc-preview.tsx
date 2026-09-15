"use client";

import { useState } from "react";
import { Eye, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * Opens a PDF or image in a dialog. `variant="icon"` is a small page icon meant to sit in front of
 * a document's title; a file that cannot be previewed (Word) opens in a new tab instead.
 */
export function PreviewButton({ href, title, mime, variant = "pill" }: { href: string; title: string; mime: string; variant?: "pill" | "icon" }) {
  const [open, setOpen] = useState(false);
  const previewable = mime === "application/pdf" || mime.startsWith("image/");
  if (!previewable) {
    if (variant === "icon") return <a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${title}`} title="Open" className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-card hover:bg-hover"><FileText className="size-5" /></a>;
    return null;
  }
  return (
    <>
      {variant === "icon"
        ? <button type="button" onClick={() => setOpen(true)} aria-label={`Open ${title}`} title="Open" className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-card hover:bg-hover"><FileText className="size-5" /></button>
        : <button onClick={() => setOpen(true)} className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-page px-2.5 text-[13px] font-medium hover:bg-hover"><Eye className="size-3.5" /> Preview</button>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[85vh] w-[min(96vw,1000px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
          <DialogTitle className="flex h-12 shrink-0 items-center truncate border-b border-line-soft bg-page pl-4 pr-12 text-[13.5px] font-medium">{title}</DialogTitle>
          {mime.startsWith("image/") ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={href} alt={title} className="min-h-0 flex-1 object-contain" /> : <iframe src={`${href}#toolbar=0`} title={title} className="h-full w-full" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
