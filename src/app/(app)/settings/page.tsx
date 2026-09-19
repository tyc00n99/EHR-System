import { Card, PageHeader, Properties, Tabs } from "@/components/kit";
import { getOrganization, listDocumentTypes } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { PAY_PERIOD, currentPayPeriod } from "@/lib/pay-period";
import { DocumentTypesEditor } from "./document-types";
import { OrgForm } from "./org-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  await requireUser(["admin"]);
  const sp = await searchParams;
  const tab = sp.tab === "documents" ? "documents" : "organization";
  const [org, types] = await Promise.all([getOrganization(), tab === "documents" ? listDocumentTypes() : Promise.resolve([])]);
  return (
    <div>
      <PageHeader title="Settings" meta={<span>{org.name}</span>} />
      <Tabs tabs={[{ key: "organization", label: "Organization" }, { key: "documents", label: "Client documents" }]} current={tab} base="/settings" />
      {tab === "organization" && (
        <div className="grid max-w-4xl gap-4 lg:grid-cols-[1fr_320px]">
          <Card title="Organization" description="License holder details" padded><OrgForm org={org} /></Card>
          <div className="space-y-4">
            <Card title="Pay periods" padded>
              <Properties labelWidth={96} items={[{ icon: "calendar", label: "Length", value: `${PAY_PERIOD.lengthDays} days` }, { icon: "calendar", label: "Anchor", value: PAY_PERIOD.anchor }, { icon: "clock", label: "Current", value: currentPayPeriod().label }]} />
              <p className="mt-3 text-[13px] text-muted-foreground">Biweekly, Sunday through Saturday. Ask your administrator to change this; it affects billing, payroll, and every dashboard.</p>
            </Card>
            <Card title="Data protection" padded>
              <ul className="space-y-1.5 text-[13px] text-muted-foreground"><li>Staff SSNs encrypted at rest (AES-256-GCM).</li><li>Every write to a client, staff, or visit record is audited with actor, before, and after.</li><li>Client files served only to assigned caregivers and office staff.</li><li>Sessions expire after 12 hours.</li></ul>
            </Card>
          </div>
        </div>
      )}
      {tab === "documents" && <DocumentTypesEditor types={types} />}
    </div>
  );
}
