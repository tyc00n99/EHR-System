"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/** A right-hand panel whose open state lives in a URL search param, so it survives refresh and is linkable. */
export function RouteSheet({ param, title, children, width = "sm:max-w-2xl" }: { param: string; title: string; children: ReactNode; width?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const close = () => { const next = new URLSearchParams(sp.toString()); next.delete(param); router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false }); };
  return (
    <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent side="right" className={`w-full overflow-y-auto p-0 ${width}`} showCloseButton={false}>
        <SheetTitle className="sr-only">{title}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}
