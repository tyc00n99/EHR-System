import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { listPeople, listStaff } from "@/db/queries";
import { defaultOrganizationId, makeCtx } from "@/evv/context";
import { hasEvvPermission } from "@/evv/permissions";
import { complianceSummary } from "@/evv/reporting";
import { queueCounts, reviewQueue, submissionGroupCounts, visitDetail } from "@/evv/review";
import { redirect } from "next/navigation";
import { localDate } from "@/evv/time";
import { EvvError } from "@/evv/visits";
import { requireAbility } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { ComplianceTab } from "./compliance";
import { Queue } from "./queue";
import { getPayRules } from "@/db/pay-queries";
import { VisitDrawer } from "./visit-drawer";
import { EvvSidebar } from "./evv-sidebar";
import { EvvFrame as Frame } from "./evv-frame";

export const metadata = { title: "EVV" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

/**
 * Electronic visit verification for the office: the estimated compliance report (the front page)
 * and the review queue, with the EVV sidebar beside both. The rules, policy, provider data and aggregator integration live under Settings. Works at any
 * width — the queue is a list of cards, not a wide table — so a supervisor can clear exceptions
 * from a phone.
 */
export default async function EvvPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAbility("review");
  const sp = await searchParams;
  // Compliance is the front page (Oct 19, 2026, user): plain /evv opens the report; any queue
  // filter in the URL (old links such as ?manualOrCorrected=true) still opens the queue.
  const queueKeys = Object.keys(sp).filter((k) => !["tab", "visit", "from", "to"].includes(k));
  const tab = one(sp.tab) ?? (queueKeys.length ? "queue" : "compliance");
  const db = await getDb();
  const ctx = makeCtx(db, await defaultOrganizationId(db), user.id);
  const [people, staff] = await Promise.all([listPeople(), listStaff()]);
  const names = {
    person: Object.fromEntries(people.map((p) => [p.id, fullName(p)])),
    staff: Object.fromEntries(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`])),
  };

  const visitId = one(sp.visit);
  let detail: Awaited<ReturnType<typeof visitDetail>> | null = null;
  if (visitId) {
    try { detail = await visitDetail(ctx, visitId); } catch (e) { if (!(e instanceof EvvError)) throw e; }
  }
  const users = detail ? await db.select({ id: schema.users.id, email: schema.users.email, staffId: schema.users.staffId }).from(schema.users).where(and(eq(schema.users.active, true), inArray(schema.users.role, ["admin", "supervisor"]))) : [];
  const drawer = detail ? (
    <VisitDrawer detail={detail} names={names} reviewers={users.map((u) => ({ id: u.id, label: (u.staffId && names.staff[u.staffId]) || u.email }))} canCorrect={hasEvvPermission(user, "evv.correct")} canResubmit={hasEvvPermission(user, "evv.resubmit")} backHref={`/evv${Object.entries(sp).filter(([k, v]) => k !== "visit" && typeof v === "string").map(([k, v], i) => `${i ? "&" : "?"}${k}=${encodeURIComponent(v as string)}`).join("")}`} />
  ) : null;

  if (tab === "compliance") {
    const today = localDate(new Date());
    const from = one(sp.from) ?? `${today.slice(0, 7)}-01`, to = one(sp.to) ?? today;
    return <>{drawer}<Frame side={<EvvSidebar screen="compliance" filter={{}} />}><ComplianceTab summary={await complianceSummary(ctx, from, to)} names={names} /></Frame></>;
  }
  // Settings and Integration live under Settings now; keep old links working.
  if (tab === "settings") redirect("/settings?tab=evv");
  if (tab === "integration") redirect("/settings?tab=integrations");

  const filter = Object.fromEntries(Object.entries(sp).filter(([k, v]) => k !== "tab" && k !== "visit" && typeof v === "string" && v !== ""));
  // The table pages on the client, so load up to the schema's cap rather than the default 50.
  const [queue, counts, groupCounts] = await Promise.all([reviewQueue(ctx, { limit: "200", ...filter }), queueCounts(ctx, filter), submissionGroupCounts(ctx, filter)]);
  return <>{drawer}<Frame side={<EvvSidebar screen="queue" filter={filter as Record<string, string>} counts={counts} groupCounts={groupCounts} />}><Queue queue={queue} counts={counts} filter={filter as Record<string, string>} names={names} people={people.map((p) => ({ id: p.id, name: fullName(p) }))} staff={staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))} payRules={await getPayRules()} /></Frame></>;
}

