"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { runClaims, voidBatch } from "@/billing/claims";
import { clearinghouseFromEnv } from "@/billing/clearinghouse";
import { defaultOrganizationId } from "@/evv/context";
import { requireAbility } from "@/lib/auth";

export type ClaimActionResult = { ok: true; message: string; batchId?: string } | { ok: false; problems: string[] };

async function run(visitIds: string[], method: "clearinghouse" | "download"): Promise<ClaimActionResult> {
  const user = await requireAbility("billing");
  const db = await getDb();
  const adapter = clearinghouseFromEnv();
  const r = await runClaims(db, { orgId: await defaultOrganizationId(db), actor: { userId: user.id }, adapter, visitIds, method });
  if (!r.ok) return r;
  revalidatePath("/billing");
  const what = `${r.claims} claim${r.claims === 1 ? "" : "s"} (${r.lines} line${r.lines === 1 ? "" : "s"})`;
  return { ok: true, batchId: r.batchId, message: method === "download" ? `${what} saved as an 837P file. Upload it to Waystar.` : adapter.key === "mock" ? `${what} kept by the mock clearinghouse. Nothing was sent to Waystar.` : `${what} sent to ${adapter.label}.` };
}

/** Sends the chosen notes to the clearinghouse as one 837P. */
export async function sendClaims(visitIds: string[]): Promise<ClaimActionResult> {
  return run(visitIds, "clearinghouse");
}

/** Builds the 837P for a manual upload to Waystar's portal and records the notes as billed. */
export async function downloadClaims(visitIds: string[]): Promise<ClaimActionResult> {
  return run(visitIds, "download");
}

/** Takes a file back: its claims are voided and its notes return to Ready to send. */
export async function takeBackBatch(batchId: string): Promise<ClaimActionResult> {
  const user = await requireAbility("billing");
  const db = await getDb();
  const r = await voidBatch(db, await defaultOrganizationId(db), { userId: user.id }, batchId);
  if (!r.ok) return { ok: false, problems: [r.message ?? "Could not take this file back."] };
  revalidatePath("/billing");
  return { ok: true, message: "Taken back. Those notes are ready to send again." };
}
