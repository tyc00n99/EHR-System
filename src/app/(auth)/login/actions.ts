"use server";

import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import type { ActionState } from "@/lib/validation";

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "");
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { message: "Enter your email and password." };
  const result = await signIn(email, password);
  if (!result.ok) return { message: result.message };
  redirect("/");
}
