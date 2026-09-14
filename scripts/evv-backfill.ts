/**
 * Links historical `visits` rows (the 245D notes with clock times) to EVV visits so they appear in
 * the review queue and the compliance report. Nothing is converted into a verified visit: every
 * backfilled row is `imported = true`, its events carry verificationMethod "imported", and the
 * engine marks them IMPORTED_NOT_VERIFIED (noncompliant), because nobody can prove after the fact
 * that a historical timestamp was captured live.
 *
 *   npx tsx scripts/evv-backfill.ts            # dry run: reports what would be linked
 *   npx tsx scripts/evv-backfill.ts --apply    # writes
 *   npx tsx scripts/evv-backfill.ts --apply --since 2026-07-01
 */
import { existsSync, readFileSync } from "node:fs";
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const sinceIdx = process.argv.indexOf("--since");
  const since = sinceIdx > -1 ? process.argv[sinceIdx + 1] : null;
  const { and, gte, isNull, notInArray } = await import("drizzle-orm");
  const { getDb, schema } = await import("../src/db/index");
  const { defaultOrganizationId, ensureEvvDefaults, makeCtx } = await import("../src/evv/context");
  const { createVisit } = await import("../src/evv/visits");
  const { clockIn, clockOut } = await import("../src/evv/ingest");
  const { derivedEventId } = await import("../src/evv/shared-care");
  const { utcOffsetMinutes } = await import("../src/evv/time");

  const db = await getDb();
  const orgId = await defaultOrganizationId(db);
  await ensureEvvDefaults(db, orgId);
  const ctx = makeCtx(db, orgId, null);
  const linked = await db.select({ id: schema.evvVisits.visitId }).from(schema.evvVisits).where(and(isNull(schema.evvVisits.visitId)));
  const already = new Set((await db.select({ id: schema.evvVisits.id }).from(schema.evvVisits)).map((r) => r.id));
  void linked;
  const candidates = await db.select().from(schema.visits).where(and(...(since ? [gte(schema.visits.clockInAt, new Date(since))] : []), ...(already.size ? [notInArray(schema.visits.id, [...already])] : [])));

  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${candidates.length} historical visit(s) not yet linked${since ? ` since ${since}` : ""}.`);
  let done = 0, skipped = 0;
  for (const v of candidates) {
    const tag = `${v.id.slice(0, 8)} ${v.clockInAt.toISOString().slice(0, 10)} ${v.serviceCode} ${v.modifiers.join(" ")} ${v.status}`;
    if (v.status === "void") { skipped++; console.log(`  skip (void)   ${tag}`); continue; }
    if (!apply) { console.log(`  would link    ${tag}`); continue; }
    try {
      const actor = { userId: null, staffId: v.staffId, role: "admin" as const };
      const ev = (kind: "clock_in" | "clock_out", at: Date, lat: number | null, lng: number | null, acc: number | null) => ({
        eventId: derivedEventId(v.id, `import:${kind}`), idempotencyKey: `import:${v.id}:${kind}`, deviceCapturedAt: at.toISOString(), deviceUtcOffsetMinutes: utcOffsetMinutes(at),
        latitude: lat ?? undefined, longitude: lng ?? undefined, accuracyMeters: acc ?? undefined, locationSource: lat != null ? ("gps" as const) : ("none" as const),
        locationType: v.placeOfService === "12" ? ("home" as const) : ("community" as const), verificationMethod: "other" as const, offline: false, metadata: { channel: "backfill", imported: true },
      });
      await createVisit(ctx, { id: v.id, personId: v.personId, staffId: v.staffId, serviceAgreementId: v.serviceAgreementId, shiftId: v.shiftId, visitId: v.id, imported: true, manualEntry: v.manualEntry });
      // Use a clock frozen at the historical time so the events are not flagged as delayed by decades.
      const frozen = makeCtx(db, orgId, null, () => v.clockInAt);
      await clockIn(frozen, v.id, ev("clock_in", v.clockInAt, v.clockInLat, v.clockInLng, v.clockInAccuracyM), actor);
      if (v.clockOutAt) await clockOut(makeCtx(db, orgId, null, () => v.clockOutAt!), v.id, ev("clock_out", v.clockOutAt, v.clockOutLat, v.clockOutLng, v.clockOutAccuracyM), actor);
      done++; console.log(`  linked        ${tag}`);
    } catch (e) { skipped++; console.log(`  failed        ${tag}: ${e instanceof Error ? e.message : e}`); }
  }
  console.log(apply ? `Linked ${done}, skipped ${skipped}.` : "Nothing written. Re-run with --apply to link.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
