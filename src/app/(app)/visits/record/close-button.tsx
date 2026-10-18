"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

export function CloseSheetButton({ children }: { children: ReactNode }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  return <button aria-label="Close" onClick={() => { const n = new URLSearchParams(sp.toString()); n.delete("visit"); router.replace(n.size ? `${pathname}?${n}` : pathname, { scroll: false }); }} className="flex size-9 items-center justify-center rounded-full text-text hover:bg-hover">{children}</button>;
}
