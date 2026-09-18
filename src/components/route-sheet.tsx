"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * A centred record window whose open state lives in a URL search param, so it survives refresh and is
 * linkable. It was a narrow right-hand drawer until 2026-09-18; the service record has two-column
 * sections and a medication grid that only read well with the full width of the screen.
 */
export function RouteSheet({ param, title, children, width = "sm:max-w-[960px]" }: { param: string; title: string; children: ReactNode; width?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const close = () => { const next = new URLSearchParams(sp.toString()); next.delete(param); router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false }); };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent showCloseButton={false} className={`block h-[calc(100vh-3rem)] w-[calc(100%-2rem)] overflow-y-auto p-0 ${width}`}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
