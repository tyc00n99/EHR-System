"use server";

import { redirect } from "next/navigation";
import { completePasswordReset } from "@/lib/reset";
import type { ActionState } from "@/lib/validation";

export async function resetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (!token) return { message: "This link is missing its token. Open the link from the email again." };
  if (password.length < 8) return { message: "Use at least 8 characters." };
  if (password !== confirm) return { message: "The two passwords don't match." };

  const result = await completePasswordReset(token, password);
  if (!result.ok) return { message: result.message };
  redirect("/login?reset=1");
}
