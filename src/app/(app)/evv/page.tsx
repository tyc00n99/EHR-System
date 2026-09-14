import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { listPeople, listStaff } from "@/db/queries";
import { adapterFromEnv } from "@/evv/adapters";
import { defaultOrganizationId, getPolicy, getProfile, getRules, makeCtx } from "@/evv/context";
import { listLiveInRelationships } from "@/evv/live-in";
import { hasEvvPermission } from "@/evv/permissions";
import { complianceSummary } from "@/evv/reporting";
import { recentSubmissions, reviewQueue, visitDetail } from "@/evv/review";
import { localDate } from "@/evv/time";
import { EvvError } from "@/evv/visits";
import { requireUser } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { ComplianceTab } from "./compliance";
import { IntegrationTab } from "./integration";
import { Queue } from "./queue";
import { SettingsTab } from "./settings";
import { VisitDrawer } from "./visit-drawer";

export const metadata = { title: "EVV" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

/**
 * Electronic visit verification for the office: the review queue, the estimated compliance
 * report, and (admins) the rules, policy, provider data and aggregator integration. Works at any
 * width — the queue is a list of cards, not a wide table — so a supervisor can clear exceptions
 * from a phone.
 */
export default async function EvvPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser(["admin", "supervisor"]);
  const sp = await searchParams;
  const admin = hasEvvPermission(user, "evv.configure");
  const tab = one(sp.tab) ?? "queue";
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
    return <>{drawer}<ComplianceTab summary={await complianceSummary(ctx, from, to)} names={names} /></>;
  }
  if (tab === "settings" && admin) {
    const [{ profile, identifiers }, policy, rules, liveIns, payers] = await Promise.all([getProfile(ctx), getPolicy(ctx, "MN"), getRules(ctx), listLiveInRelationships(ctx), db.select().from(schema.evvPayers).where(eq(schema.evvPayers.organizationId, ctx.orgId))]);
    return <SettingsTab profile={profile} identifiers={identifiers} payers={payers} policy={policy} rules={rules} liveIns={liveIns} people={people.map((p) => ({ id: p.id, name: fullName(p) }))} staff={staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))} />;
  }
  if (tab === "integration" && admin) {
    const adapter = adapterFromEnv();
    const [health, { profile, identifiers }, submissions] = await Promise.all([adapter.health(), getProfile(ctx), recentSubmissions(ctx)]);
    return <IntegrationTab adapterKey={adapter.key} health={health} profile={profile} identifierCount={identifiers.length} submissions={submissions} names={names} />;
  }

  const filter = Object.fromEntries(Object.entries(sp).filter(([k, v]) => k !== "tab" && k !== "visit" && typeof v === "string" && v !== ""));
  const queue = await reviewQueue(ctx, filter);
  return <>{drawer}<Queue queue={queue} filter={filter as Record<string, string>} names={names} people={people.map((p) => ({ id: p.id, name: fullName(p) }))} staff={staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))} /></>;
}
