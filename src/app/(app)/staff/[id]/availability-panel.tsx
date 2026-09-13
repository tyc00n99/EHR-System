"use client";

import { useState } from "react";
import { AvailabilityEditor, type Schedule } from "../../clients/[id]/availability-editor";
import { saveStaffAvailability } from "../actions";

/** The "Edit availability" button on a staff record and the drawer it opens. */
export function StaffAvailabilityButton({ staffId, schedule, hasAny }: { staffId: string; schedule: Schedule; hasAny: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[13px] font-medium text-primary hover:underline">
        {hasAny ? "Edit availability" : "Add availability"}
      </button>
      {open && <AvailabilityEditor personId={staffId} field="staffId" save={saveStaffAvailability} initial={schedule} onDone={() => setOpen(false)} />}
    </>
  );
}
