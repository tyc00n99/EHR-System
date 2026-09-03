import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import type { PaletteEntry } from "@/components/command-palette";
import { getOrganization, listPeople, listStaff } from "@/db/queries";
import { attentionItems } from "@/lib/attention";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [user, org] = await Promise.all([requireUser(), getOrganization()]);
  const office = user.role !== "dsp";
  const [attention, people, staff] = await Promise.all([office ? attentionItems().then((a) => a.length) : 0, office ? listPeople() : [], office ? listStaff() : []]);
  const palette: PaletteEntry[] = [
    ...people.map((p) => ({ id: p.id, label: `${p.firstName} ${p.lastName}`, hint: `PMI ${p.pmi} · ${p.waiverProgram}`, href: `/clients/${p.id}`, group: "Clients" as const })),
    ...staff.map((s) => ({ id: s.id, label: `${s.firstName} ${s.lastName}`, hint: s.title, href: `/staff/${s.id}`, group: "Staff" as const })),
  ];
  return <AppShell user={user} orgName={org.name} attention={attention} palette={palette}>{children}</AppShell>;
}
