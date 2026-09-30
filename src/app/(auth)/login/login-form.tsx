"use client";

import { useActionState } from "react";
import { Field, FormError, Input } from "@/components/kit";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.message} />
      <Field label="Email">
        <Input name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <div>
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <div className="mt-1.5 text-right">
          <a href="/forgot" className="text-[13px] font-semibold text-[#0098c0] hover:underline">
            Forgot password?
          </a>
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-full bg-[#0098c0] text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-[#0081a5] disabled:opacity-60"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
