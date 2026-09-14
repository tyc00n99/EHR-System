import { admin, createWorld, dsp, event, type World } from "./harness";
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { MockAggregatorAdapter } from "@/evv/adapters/mock";
import { correctVisit } from "@/evv/corrections";
import { clockIn, clockOut } from "@/evv/ingest";
import { hasEvvPermission } from "@/evv/permissions";
import { reviewQueue, visitDetail } from "@/evv/review";
import { processQueue } from "@/evv/submission";
import { createVisit, EvvError, loadVisit } from "@/evv/visits";

let w: World;
before(async () => { w = await createWorld(); });

test("26. cross-tenant access: tenant B sees nothing of tenant A's visits, events, queue or submissions", async () => {
  w.set("2026-09-14T15:00:00Z");
  const v = await createVisit(w.ctx(w.a), { personId: w.a.personId, staffId: w.a.staffId, serviceAgreementId: w.a.agreementId });
  await clockIn(w.ctx(w.a), v.id, event(w), dsp(w.a)); w.advance(30);
  await clockOut(w.ctx(w.a), v.id, event(w), dsp(w.a));
  const b = w.ctx(w.b);
  assert.equal(await loadVisit(b, v.id), null);
  await assert.rejects(visitDetail(b, v.id), (e: EvvError) => e.status === 404);
  await assert.rejects(clockOut(b, v.id, event(w), admin(w.b)), (e: EvvError) => e.status === 404);
  await assert.rejects(correctVisit(b, v.id, { reasonCode: "WRONG_TIME", explanation: "attempt from another tenant", changes: { clockOutAt: "2026-09-14T17:00:00Z" } }), (e: EvvError) => e.status === 404);
  assert.equal((await reviewQueue(b, {})).count, 0);
  const mock = new MockAggregatorAdapter();
  assert.equal((await processQueue(b, mock)).processed, 0, "tenant B's worker does not drain tenant A's queue");
  assert.equal(mock.calls.length, 0);
  assert.equal((await processQueue(w.ctx(w.a), mock)).processed, 1);
  // Tenant B's own rows carry B's id and A cannot read them either.
  const vb = await createVisit(b, { personId: w.b.personId, staffId: w.b.staffId, serviceAgreementId: w.b.agreementId });
  assert.equal(vb.organizationId, w.b.orgId); assert.equal(await loadVisit(w.ctx(w.a), vb.id), null);
  const [audit] = await w.db.select().from(schema.evvAuditEvents).where(eq(schema.evvAuditEvents.evvVisitId, vb.id));
  assert.equal(audit.organizationId, w.b.orgId);
});

test("permissions: caregivers clock and see their own; supervisors review; only admins configure", () => {
  const dspUser = { role: "dsp" as const, staffId: "s" }, noStaff = { role: "dsp" as const, staffId: null }, sup = { role: "supervisor" as const, staffId: null }, adm = { role: "admin" as const, staffId: null };
  assert.ok(hasEvvPermission(dspUser, "evv.clock_in") && hasEvvPermission(dspUser, "evv.view_own"));
  assert.ok(!hasEvvPermission(dspUser, "evv.view_all") && !hasEvvPermission(dspUser, "evv.correct") && !hasEvvPermission(dspUser, "evv.review"));
  assert.ok(!hasEvvPermission(noStaff, "evv.clock_in"), "a login with no caregiver record cannot clock");
  assert.ok(hasEvvPermission(sup, "evv.review") && hasEvvPermission(sup, "evv.correct") && hasEvvPermission(sup, "evv.resubmit"));
  assert.ok(!hasEvvPermission(sup, "evv.configure") && !hasEvvPermission(sup, "evv.manage_integration"));
  assert.ok(hasEvvPermission(adm, "evv.configure") && hasEvvPermission(adm, "evv.manage_integration"));
});

test("an unassigned caregiver's event for another caregiver's visit is refused with 403, not stored", async () => {
  w.set("2026-09-15T15:00:00Z");
  const v = await createVisit(w.ctx(w.a), { personId: w.a.secondPersonId, staffId: w.a.staffId, serviceAgreementId: null, serviceCode: "S5135", modifiers: ["UC"] });
  await assert.rejects(clockIn(w.ctx(w.a), v.id, event(w), { userId: null, staffId: w.a.secondStaffId, role: "dsp" }), (e: EvvError) => e.status === 403);
  assert.equal((await w.db.select().from(schema.evvEvents).where(eq(schema.evvEvents.evvVisitId, v.id))).length, 0);
});
