import Link from "next/link";
import { getOrganization, listAgreementsWithUsage } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { labelForCode } from "@/lib/hcpcs";
import { cx } from "@/components/kit";
import { Icon } from "@/components/icons";
import { listCancellationReasons } from "../actions";
import { CalendarSettings, CancellationReasons, EventTypes } from "./settings-panels";

export const metadata = { title: "Schedule settings" };

const TABS = [
  ["types", "Event types"],
  ["reasons", "Cancellation reasons"],
  ["calendar", "Calendar settings"],
] as const;

export default async function ScheduleSettingsPage({ searchParams }: PageProps<"/scheduling/settings">) {
  await requireUser(["admin", "supervisor"]);
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && TABS.some(([t]) => t === sp.tab) ? sp.tab : "types";

  const [org, agreements, reasons] = await Promise.all([getOrganization(), listAgreementsWithUsage(), listCancellationReasons()]);

  // One card per service the agency is actually authorized to deliver, with how many clients hold it.
  const byCode = new Map<string, { code: string; label: string; modifiers: string; clients: Set<string> }>();
  for (const a of agreements) {
    if (a.agreement.status !== "active") continue;
    const mods = a.agreement.modifiers.join(" ");
    const key = a.agreement.serviceCode + mods;
    if (!byCode.has(key)) byCode.set(key, { code: a.agreement.serviceCode, label: labelForCode(a.agreement.serviceCode, a.agreement.modifiers), modifiers: mods, clients: new Set() });
    byCode.get(key)!.clients.add(a.agreement.personId);
  }
  const services = [...byCode.values()].map((s) => ({ code: s.code, label: s.label, modifiers: s.modifiers, clients: s.clients.size })).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-4 border-b border-line px-6 py-3.5">
        <Link href="/scheduling" aria-label="Back to the schedule" className="flex size-9 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-hover hover:text-text-strong">
          <Icon.chevronLeft size={16} />
        </Link>
        <h1 className="text-[26px] leading-none">Schedule Settings</h1>
      </header>

      <nav className="flex shrink-0 gap-1.5 px-6 pt-4">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/scheduling/settings?tab=${key}`}
            className={cx("flex h-9 items-center rounded-lg px-3.5 text-[15px] font-medium", tab === key ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-hover hover:text-text")}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {tab === "types" && <EventTypes services={services} />}
        {tab === "reasons" && <CancellationReasons reasons={reasons.map((r) => ({ id: r.id, label: r.label, active: r.active }))} />}
        {tab === "calendar" && <CalendarSettings startHour={org?.scheduleStartHour ?? 6} endHour={org?.scheduleEndHour ?? 21} days={org?.scheduleDays ?? [0, 1, 2, 3, 4, 5, 6]} />}
      </div>
    </div>
  );
}
