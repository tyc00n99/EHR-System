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

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  await requireAbility("settings");
  const sp = await searchParams;
  const tab = sp.tab === "documents" ? "documents" : sp.tab === "roles" ? "roles" : sp.tab === "pay" ? "pay" : "organization";
  const [org, types, overrides, payRules, schedules, overtime] = await Promise.all([getOrganization(), tab === "documents" ? listDocumentTypes() : Promise.resolve([]), tab === "roles" ? listRoleAbilities() : Promise.resolve([]), getPayRules(), tab === "pay" ? listPaySchedules() : Promise.resolve([]), getOvertimeRules()]);
  const current = currentPayPeriod(payRules);
  const ruleNow = [...payRules].reverse().find((r) => r.effectiveFrom <= current.startDate) ?? payRules[0];
  return (
    <div>
      <PageHeader title="Settings" meta={<span>{org.name}</span>} />
      <Tabs tabs={[{ key: "organization", label: "Organization" }, { key: "documents", label: "Client documents" }, { key: "roles", label: "Roles" }, { key: "pay", label: "Pay and overtime" }]} current={tab} base="/settings" />
      {tab === "organization" && (
        <div className="grid max-w-4xl gap-4 lg:grid-cols-[1fr_320px]">
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
      {tab === "pay" && <PaySettings schedules={schedules.map((s) => ({ id: s.id, effectiveFrom: s.effectiveFrom, frequency: s.frequency, anchorDate: s.anchorDate }))} overtime={overtime} />}
    </div>
  );
}
