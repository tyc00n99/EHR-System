import { authenticate, fail, ok } from "@/evv/api";
import { complianceSummary } from "@/evv/reporting";
import { localDate } from "@/evv/time";

/** GET /api/evv/compliance/summary?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(req: Request) {
  try {
    const { ctx } = await authenticate(req, "evv.view_compliance");
    const url = new URL(req.url);
    const today = localDate(new Date());
    const from = url.searchParams.get("from") ?? `${today.slice(0, 7)}-01`;
    const to = url.searchParams.get("to") ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return Response.json({ error: { code: "VALIDATION", message: "from and to must be YYYY-MM-DD" } }, { status: 422 });
    return ok(await complianceSummary(ctx, from, to));
  } catch (e) { return fail(e); }
}
