"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { cx } from "@/components/kit";

/**
 * The EVV screen's frame (Oct 18, 2026, user: flush left, and the shield folds the menu away and
 * back). From lg up the menu runs down the window's left edge, full height, beside the screen; the
 * shield at its top collapses it to a 64px strip holding only the shield, giving the table the
 * width. Below lg the menu sits above the screen, folded behind one line.
 */
export function EvvFrame({ side, children }: { side: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div data-full-bleed className={cx("lg:-mb-28 lg:-ml-8 lg:-mt-6 lg:grid lg:flex-1", open ? "lg:grid-cols-[264px_minmax(0,1fr)]" : "lg:grid-cols-[64px_minmax(0,1fr)]")}>
      <div className="hidden border-line lg:block lg:border-r">
        <div className="sticky top-0 px-3 pb-6 pt-5">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
            aria-label={open ? "Fold the EVV menu away" : "Show the EVV menu"} title={open ? "Fold the menu away" : "Show the menu"}
            className={cx("mb-4 flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[17px] font-medium text-text-strong transition-colors hover:bg-tab-hover", !open && "mx-auto")}>
            <ShieldCheck size={20} aria-hidden className="text-primary" />
            {open && <span>EVV</span>}
          </button>
          {open && side}
        </div>
      </div>
      <details className="mb-4 rounded-xl border border-line px-3 py-2 lg:hidden">
        <summary className="cursor-pointer text-[15px] font-medium text-text-strong">EVV menu</summary>
        <div className="pt-3">{side}</div>
      </details>
      <div className="min-w-0 lg:px-8 lg:pb-28 lg:pt-6">{children}</div>
    </div>
  );
}
