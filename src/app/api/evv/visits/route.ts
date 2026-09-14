import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import { actorFor, authenticate, fail, ok, readJson } from "@/evv/api";
import { hasEvvPermission } from "@/evv/permissions";
import { createVisit } from "@/evv/visits";

const createSchema = z.object({
  id: z.uuid().optional(),
  personId: z.uuid(),
  staffId: z.uuid().optional(),
  serviceAgreementId: z.uuid().optional(),
  serviceCode: z.string().optional(),
  modifiers: z.array(z.string()).optional(),
  shiftId: z.uuid().optional(),
  scheduledStartAt: z.string().datetime({ offset: true }).optional(),
  scheduledEndAt: z.string().datetime({ offset: true }).optional(),
  payerId: z.uuid().optional(),
  liveIn: z.boolean().optional(),
});

/** POST /api/evv/visits — plan a visit (optionally with a client-generated id for offline use). */
export async function POST(req: Request) {
  try {
    const { ctx, user } = await authenticate(req, "evv.clock_in");
    const body = createSchema.parse(await readJson(req));
    const actor = actorFor(user, body.staffId ?? null);
    const visit = await createVisit(ctx, { ...body, staffId: actor.staffId, scheduledStartAt: body.scheduledStartAt ? new Date(body.scheduledStartAt) : null, scheduledEndAt: body.scheduledEndAt ? new Date(body.scheduledEndAt) : null });
    return ok({ visit }, 201);
  } catch (e) { return fail(e); }
}

/** GET /api/evv/visits?from&to — a caregiver's own visits, or everyone's for office roles. */
export async function GET(req: Request) {
  try {
    const { ctx, user } = await authenticate(req, "evv.view_own");
    const url = new URL(req.url);
    const from = url.searchParams.get("from"), to = url.searchParams.get("to");
    const conds = [eq(schema.evvVisits.organizationId, ctx.orgId)];
    if (!hasEvvPermission(user, "evv.view_all")) conds.push(eq(schema.evvVisits.staffId, user.staffId ?? "00000000-0000-0000-0000-000000000000"));
    if (from) conds.push(gte(schema.evvVisits.serviceDate, from));
    if (to) conds.push(lte(schema.evvVisits.serviceDate, to));
    const rows = await ctx.db.select().from(schema.evvVisits).where(and(...conds)).orderBy(desc(schema.evvVisits.createdAt)).limit(200);
    return ok({ visits: rows });
  } catch (e) { return fail(e); }
}
