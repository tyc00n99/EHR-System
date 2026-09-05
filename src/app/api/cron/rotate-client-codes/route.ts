import { and, eq, isNull, lt, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getOrganization } from "@/db/queries";
import { CODE_ROTATION_DAYS, issueClientCode } from "@/lib/client-code";
import { smsConfigured } from "@/lib/sms";

/**
 * Rotates signing codes on a schedule and texts the new one to the person.
 *
 * Only active clients with a mobile number are rotated, because a code nobody can receive is a
 * code nobody can sign with. Runs from Vercel Cron; CRON_SECRET must match so the route cannot be
 * triggered by anyone who finds the URL.
 */
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const given = auth?.startsWith("Bearer ") ? auth.slice(7) : new URL(req.url).searchParams.get("key");
  if (!secret || given !== secret) return Response.json({ error: "Not authorised." }, { status: 401 });
  if (!smsConfigured()) return Response.json({ rotated: 0, skipped: "Texting is not configured, so no code was changed." });

  const db = await getDb();
  const org = await getOrganization();
  const cutoff = new Date(Date.now() - CODE_ROTATION_DAYS * 86_400_000);
  const due = await db
    .select({ id: schema.people.id, firstName: schema.people.firstName, lastName: schema.people.lastName, phone: schema.people.phone, smsConsent: schema.people.smsConsent })
    .from(schema.people)
    .where(and(eq(schema.people.status, "active"), or(isNull(schema.people.signatureCodeSetAt), lt(schema.people.signatureCodeSetAt, cutoff))));

  const results: { client: string; texted: boolean; reason?: string }[] = [];
  for (const p of due) {
    if (!p.phone) { results.push({ client: `${p.firstName} ${p.lastName}`, texted: false, reason: "No mobile number on file." }); continue; }
    if (!p.smsConsent) { results.push({ client: `${p.firstName} ${p.lastName}`, texted: false, reason: "Has not agreed to receive texts." }); continue; }
    const issued = await issueClientCode(db, null, p, org.name);
    results.push({ client: `${p.firstName} ${p.lastName}`, texted: issued.texted, reason: issued.reason });
  }
  return Response.json({ due: due.length, rotated: results.filter((r) => r.texted).length, results });
}
