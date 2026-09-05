"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Pencil } from "lucide-react";
import { DownloadButton } from "@/components/download-button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * Reads `?note=<visitId>` and shows that note as the finished PDF, so a supervisor can review
 * exactly what the county would receive. Mounted once in the shell, so any note list can link to it.
 */
export function NotePreview() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const id = params.get("note");
  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("note");
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  };
  if (!id) return null;
  const src = `/visits/${id}/note.pdf`;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="flex h-[90vh] w-[min(96vw,1060px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogTitle className="flex h-12 shrink-0 items-center gap-3 whitespace-nowrap border-b border-line-soft bg-page pl-4 pr-14 text-[13.5px] font-medium">
          <span className="min-w-0 flex-1 truncate">Daily service note</span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <Link href={`${pathname}?visit=${id}`} scroll={false} onClick={close} className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--radius-btn)] border border-line px-2.5 text-[12.5px] font-medium hover:bg-hover"><Pencil className="size-3.5" /> Open record</Link>
            <DownloadButton href={src} className="h-7 px-2.5 text-[12.5px]">Download</DownloadButton>
          </span>
        </DialogTitle>
        <iframe src={`${src}#toolbar=0&view=FitH`} title="Daily service note" className="min-h-0 flex-1 bg-panel" />
      </DialogContent>
    </Dialog>
  );
}
