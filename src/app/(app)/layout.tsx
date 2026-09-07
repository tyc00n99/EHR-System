import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import type { PaletteEntry } from "@/components/command-palette";
import { getOrganization, listPeople, listStaff } from "@/db/queries";
import { attentionItems } from "@/lib/attention";
import { requireUser } from "@/lib/auth";
import { NO_COUNTS, type NavCounts } from "@/lib/nav";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [user, org] = await Promise.all([requireUser(), getOrganization()]);
  const office = user.role !== "dsp";
  const [items, people, staff] = await Promise.all([office ? attentionItems() : [], office ? listPeople() : [], office ? listStaff() : []]);

  // Every number in the top bar and the section row comes from the list the bell already builds,
  // so the two can never disagree and nothing extra is queried to draw the nav.
  const of = (kind: string) => items.filter((i) => i.kind === kind).length;
  const status = (s: string) => people.filter((p) => p.status === s).length;
  const counts: NavCounts = office
    ? {
        review: items.length,
        unsigned: of("unsigned"),
        returned: of("returned"),
        manual: of("manual"),
        missed: of("missed_shift"),
        compliance: of("compliance"),
        authorizations: of("authorization"),
        clientsAll: people.length,
        clientsActive: status("active"),
        clientsIntake: status("intake"),
        clientsDischarged: status("discharged"),
      }
    : NO_COUNTS;

  const palette: PaletteEntry[] = [
    ...people.map((p) => ({ id: p.id, label: `${p.firstName} ${p.lastName}`, hint: `PMI ${p.pmi} · ${p.waiverProgram}`, href: `/clients/${p.id}`, group: "Clients" as const })),
    ...staff.map((s) => ({ id: s.id, label: `${s.firstName} ${s.lastName}`, hint: s.title, href: `/staff/${s.id}`, group: "Staff" as const })),
  ];
  return <AppShell user={user} orgName={org.name} counts={counts} palette={palette}>{children}</AppShell>;
}
