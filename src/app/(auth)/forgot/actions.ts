"use server";

import { headers } from "next/headers";
import { requestPasswordReset } from "@/lib/reset";
import type { ActionState } from "@/lib/validation";

export async function forgotAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim();
  if (!email) return { message: "Enter the email on your staff record." };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  await requestPasswordReset(email, `${proto}://${host}`);

  // The same answer whether or not the email exists — this form must never confirm a login.
  return { ok: true };
}
