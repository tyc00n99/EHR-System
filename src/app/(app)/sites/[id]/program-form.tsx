"use client";

import { useActionState, useTransition } from "react";
import { Button, Field, FormError, Input, Select } from "@/components/ui";
import { SERVICE_TYPES } from "@/lib/services";
import type { ActionState } from "@/lib/validation";
import { toggleProgram } from "../actions";

export function ProgramForm({ action }: { action: (p: ActionState, fd: FormData) => Promise<ActionState> }) {
  const [state, submit, pending] = useActionState(action, {});
  const e = state.errors ?? {};
  return (
    <form action={submit}>
      <FormError message={state.message} />
      <div className="grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
        <Field label="Service type" error={e.serviceTypeId}>
          <Select name="serviceTypeId" defaultValue="">
            <option value="" disabled>Choose…</option>
            <optgroup label="Basic support services">{SERVICE_TYPES.filter((s) => s.category === "basic").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
            <optgroup label="Intensive support services">{SERVICE_TYPES.filter((s) => s.category === "intensive").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
          </Select>
        </Field>
        <Field label="Program name" error={e.name}><Input name="name" required /></Field>
        <Button type="submit" variant="secondary" disabled={pending} className="h-9">{pending ? "Adding…" : "Add program"}</Button>
      </div>
    </form>
  );
}

export function ProgramToggle({ id, siteId, active }: { id: string; siteId: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(() => toggleProgram(id, siteId, !active))} className="text-xs font-medium text-accent hover:underline disabled:opacity-50">
      {active ? "Deactivate" : "Activate"}
    </button>
  );
}
