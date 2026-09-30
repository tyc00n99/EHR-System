"use client";

import { useActionState } from "react";
import { Field, FormError, Input } from "@/components/kit";
import { forgotAction } from "./actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotAction, {});
  if (state.ok) {
    return (
      <p className="rounded-lg bg-[#e3efe6] px-3 py-2.5 text-[13.5px] font-medium text-[#1f7a55]">
        If that email is on a staff record, a reset link is on its way. The link works for 30 minutes — check spam if it doesn&rsquo;t arrive.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.message} />
      <Field label="Email">
        <Input name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-full bg-[#0b2672] text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-[#5656b9] disabled:opacity-60"
      >
        {pending ? "Sending…" : "Email me a reset link"}
      </button>
    </form>
  );
}
