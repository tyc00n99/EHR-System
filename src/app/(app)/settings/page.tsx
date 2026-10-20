import { Card, PageHeader, Properties, Tabs } from "@/components/kit";
import { getOrganization, listDocumentTypes, listRoleAbilities } from "@/db/queries";
import { requireAbility } from "@/lib/auth";
import Link from "next/link";
import { currentPayPeriod, describePayRule, payPeriodContaining } from "@/lib/pay-period";
import { getOvertimeRules, getPayRules, listPaySchedules } from "@/db/pay-queries";
import { PaySettings } from "./pay-settings";
import { DocumentTypesEditor } from "./document-types";
import { OrgForm } from "./org-form";
import { RolesEditor } from "./roles-editor";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { listPeople, listStaff } from "@/db/queries";
import { adapterFromEnv } from "@/evv/adapters";
import { defaultOrganizationId, getPolicy, getProfile, getRules, makeCtx } from "@/evv/context";
import { listLiveInRelationships } from "@/evv/live-in";
import { recentSubmissions } from "@/evv/review";
import { fullName } from "@/lib/format";
import { SettingsTab as EvvSettings } from "../evv/settings";
import { IntegrationTab } from "../evv/integration";

/** EVV's enrollment data, policy, service rules and live-in list (moved here from the EVV page, Oct 18, 2026). */
async function EvvSection({ userId }: { userId: string }) {
  const db = await getDb();
  const ctx = makeCtx(db, await defaultOrganizationId(db), userId);
  const [{ profile, identifiers }, policy, rules, liveIns, payers, people, staff] = await Promise.all([getProfile(ctx), getPolicy(ctx, "MN"), getRules(ctx), listLiveInRelationships(ctx), db.select().from(schema.evvPayers).where(eq(schema.evvPayers.organizationId, ctx.orgId)), listPeople(), listStaff()]);
  return <EvvSettings profile={profile} identifiers={identifiers} payers={payers} policy={policy} rules={rules} liveIns={liveIns} people={people.map((p) => ({ id: p.id, name: fullName(p) }))} staff={staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))} />;
}

/** How visits reach the HHAeXchange aggregator (moved here from the EVV page, Oct 18, 2026). */
async function IntegrationsSection({ userId }: { userId: string }) {
  const db = await getDb();
  const ctx = makeCtx(db, await defaultOrganizationId(db), userId);
  const adapter = adapterFromEnv();
  const [health, { profile, identifiers }, submissions, people, staff] = await Promise.all([adapter.health(), getProfile(ctx), recentSubmissions(ctx), listPeople(), listStaff()]);
  const names = { person: Object.fromEntries(people.map((p) => [p.id, fullName(p)])), staff: Object.fromEntries(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`])) };
  return <IntegrationTab adapterKey={adapter.key} health={health} profile={profile} identifierCount={identifiers.length} submissions={submissions} names={names} />;
}

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await requireAbility("settings");
  const sp = await searchParams;
  const tab = sp.tab === "documents" ? "documents" : sp.tab === "roles" ? "roles" : sp.tab === "pay" ? "pay" : sp.tab === "evv" ? "evv" : sp.tab === "integrations" ? "integrations" : "organization";
  const [org, types, overrides, payRules, schedules, overtime] = await Promise.all([getOrganization(), tab === "documents" ? listDocumentTypes() : Promise.resolve([]), tab === "roles" ? listRoleAbilities() : Promise.resolve([]), getPayRules(), tab === "pay" ? listPaySchedules() : Promise.resolve([]), getOvertimeRules()]);
  const current = currentPayPeriod(payRules);
  const ruleNow = [...payRules].reverse().find((r) => r.effectiveFrom <= current.startDate) ?? payRules[0];
  return (
    <div>
      <PageHeader title="Settings" meta={<span>{org.name}</span>} />
      <Tabs tabs={[{ key: "organization", label: "Organization" }, { key: "documents", label: "Client documents" }, { key: "roles", label: "Roles" }, { key: "pay", label: "Pay and overtime" }, { key: "evv", label: "EVV" }, { key: "integrations", label: "Integrations" }]} current={tab} base="/settings" />
      {tab === "organization" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card title="Organization" description="License holder details" padded><OrgForm org={org} /></Card>
          <div className="space-y-4">
            <Card title="Pay periods" padded>
              <Properties labelWidth={96} items={[{ icon: "calendar", label: "Schedule", value: describePayRule(ruleNow) }, { icon: "clock", label: "Current", value: current.label }, { icon: "clock", label: "Overtime", value: `After ${overtime.weeklyHours} h a week${overtime.dailyHours != null ? ` or ${overtime.dailyHours} h a day` : ""}, ${overtime.multiplier}×` }]} />
              <Link href="/settings?tab=pay" className="mt-3 inline-block text-[13px] font-medium text-primary hover:underline">Change pay periods and overtime →</Link>
            </Card>
            <Card title="Data protection" padded>
              <ul className="space-y-1.5 text-[13px] text-muted-foreground"><li>Staff SSNs encrypted at rest (AES-256-GCM).</li><li>Every write to a client, staff, or visit record is audited with actor, before, and after.</li><li>Client files served only to assigned caregivers and office staff.</li><li>Sessions expire after 12 hours.</li></ul>
            </Card>
          </div>
        </div>
      )}
      {tab === "documents" && <DocumentTypesEditor types={types} />}
      {tab === "roles" && <RolesEditor overrides={overrides} />}
      {tab === "evv" && <EvvSection userId={user.id} />}
      {tab === "integrations" && <IntegrationsSection userId={user.id} />}
      {tab === "pay" && <PaySettings schedules={schedules.map((s) => ({ id: s.id, effectiveFrom: s.effectiveFrom, frequency: s.frequency, anchorDate: s.anchorDate }))} overtime={overtime} />}
    </div>
  );
}
