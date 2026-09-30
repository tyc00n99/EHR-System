"use client";

import { useActionState } from "react";
import { Field, FormError, Input } from "@/components/kit";
import { resetAction } from "./actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetAction, {});
  return (
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormError message={state.message} />
      <Field label="New password" hint="At least 8 characters">
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} autoFocus />
      </Field>
      <Field label="Type it again">
        <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-full bg-[#0098c0] text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-[#0081a5] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Set password and log in"}
      </button>
    </form>
  );
}
