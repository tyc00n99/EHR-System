"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { cx } from "@/components/kit";

/**
 * The EVV screen's frame (Oct 18, 2026, user: flush left, and the shield folds the menu away and
 * back; Oct 19: the shield looked wrong as a control; the toggle is now a small circle sitting on the
 * menu's dividing line, halfway down the window, like the client profile's divider). From lg up the
 * menu runs down the window's left edge, full height, beside the screen; the circle collapses it to a
 * 64px strip, giving the table the width. Below lg
 * the menu sits above the screen, folded behind one line.
 */
export function EvvFrame({ side, children }: { side: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div data-full-bleed className={cx("lg:-mb-28 lg:-ml-8 lg:-mt-6 lg:grid lg:flex-1", open ? "lg:grid-cols-[264px_minmax(0,1fr)]" : "lg:grid-cols-[64px_minmax(0,1fr)]")}>
      <div className="hidden border-line lg:block lg:border-r">
        <div className="sticky top-0 px-3 pb-6 pt-5">
          {open && <div className="mb-4 px-2.5 py-2 text-[17px] font-medium text-text-strong">EVV</div>}
          {open && side}
        </div>
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label={open ? "Hide the EVV menu" : "Show the EVV menu"} title={open ? "Hide menu" : "Show menu"}
        className={cx("fixed top-1/2 z-20 hidden size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground lg:flex", open ? "left-[264px]" : "left-[64px]")}>
        <ChevronLeft size={15} aria-hidden className={open ? "" : "rotate-180"} />
      </button>
      <details className="mb-4 rounded-xl border border-line px-3 py-2 lg:hidden">
        <summary className="cursor-pointer text-[15px] font-medium text-text-strong">EVV menu</summary>
        <div className="pt-3">{side}</div>
      </details>
      <div className="min-w-0 lg:px-8 lg:pb-28 lg:pt-6">{children}</div>
    </div>
  );
}
