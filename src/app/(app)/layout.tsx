import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getOrganization } from "@/db/queries";
import { attentionItems } from "@/lib/attention";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [user, org] = await Promise.all([requireUser(), getOrganization()]);
  const attention = user.role === "dsp" ? 0 : (await attentionItems()).length;
  return <AppShell user={user} orgName={org.name} attention={attention}>{children}</AppShell>;
}
