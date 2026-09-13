"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Rule } from "@/components/rule";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { AssignmentPanel } from "./panels";

type PanelProps = Parameters<typeof AssignmentPanel>[0];

/**
 * "Manage" on the Overview's Assigned clients card. Opens the assignment panel in a drawer over
 * the record instead of on a tab of its own, so assigning someone never takes you off the page
 * you were reading. Same drawer shape as the availability editor.
 */
export function ManageAssignments(props: PanelProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[13px] font-medium text-primary hover:underline">Manage</button>
      {open && (
        <Sheet open onOpenChange={(o) => { if (!o) setOpen(false); }}>
          <SheetContent side="right" showCloseButton={false} className="w-full overflow-y-auto p-0 data-[side=right]:sm:max-w-[640px]">
            <SheetTitle className="sr-only">Manage assigned clients</SheetTitle>
            <div className="flex items-center gap-3 border-b border-line px-6 py-4">
              <div>
                <div className="flex items-center gap-2 text-[19px] font-semibold text-text-strong">Assigned clients <Rule name="orientation" /></div>
                <p className="mt-0.5 text-[14px] text-muted-foreground">Caregivers can only clock in with people assigned to them, after orientation to that person.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-hover hover:text-text-strong">
                <Icon.plus size={17} className="rotate-45" />
              </button>
            </div>
            <div className="px-6 py-5">
              <AssignmentPanel {...props} />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
