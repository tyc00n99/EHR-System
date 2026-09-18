"use server";

import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { isWorkspace, WORKSPACE_COOKIE } from "@/lib/workspace";

/** Remembers which side the person wants to see. A cookie, so server pages can read it on first paint. */
export async function setWorkspace(value: string): Promise<void> {
  await requireUser();
  if (!isWorkspace(value)) return;
  (await cookies()).set(WORKSPACE_COOKIE, value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
}
