"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input } from "@/components/ui";
import { changePassword } from "./actions";

export function PasswordForm() {
  const [state, submit, pending] = useActionState(changePassword, {});
  const e = state.errors ?? {};
  return (
    <form action={submit} className="space-y-3">
      {state.message && !state.errors && <div className="rounded-md bg-ok-soft px-3 py-2 text-[13px] text-ok">{state.message}</div>}
      {state.errors && <FormError message="Check the fields below." />}
      <Field label="Current password" error={e.current}><Input name="current" type="password" autoComplete="current-password" required /></Field>
      <Field label="New password" error={e.next} hint="At least 10 characters"><Input name="next" type="password" autoComplete="new-password" required /></Field>
      <Field label="Confirm new password" error={e.confirm}><Input name="confirm" type="password" autoComplete="new-password" required /></Field>
      <Button type="submit" variant="outline" disabled={pending} className="w-full">{pending ? "Saving…" : "Change password"}</Button>
    </form>
  );
}
