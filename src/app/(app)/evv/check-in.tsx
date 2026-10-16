import { Badge, Card } from "@/components/kit";
import type { ComplianceSummary } from "@/evv/reporting";

/**
 * The six "Provider Check-In" items from the MN DHS Fall 2026 EVV Provider Notice, each read
 * against this range's numbers so the quarter's review is a glance rather than a hunt. Two items
 * (the HHAeXchange monthly reports, and whether every NPI/UMPI is connected to the HHAX portal)
 * can only be checked in HHAeXchange, so they carry the link rather than a verdict.
 */
const DHS_THRESHOLD = 80;
type Tone = "ok" | "warn" | "danger" | "neutral";

export function QuarterlyCheckIn({ s }: { s: ComplianceSummary }) {
  const t = s.totals;
  const authIssues = s.topExceptionReasons.filter((r) => r.type.startsWith("AUTHORIZATION") || r.type === "SERVICE_CODE_MISMATCH").reduce((n, r) => n + r.count, 0);
  const manualShare = t.complete ? Math.round((t.manualOrCorrected / t.complete) * 100) : 0;
  const unknownIds = s.byBillingId.filter((r) => !r.billingId).reduce((n, r) => n + r.required, 0);
  const pctText = s.estimatedCompliancePercent == null ? "no completed EVV visits in this range" : `${s.estimatedCompliancePercent}% estimated`;

  const items: { title: string; reading: string; tone: Tone; href?: string; linkLabel?: string }[] = [
    {
      title: "Visits and authorizations",
      reading: `${t.incomplete} incomplete visit${t.incomplete === 1 ? "" : "s"} · ${authIssues} authorization problem${authIssues === 1 ? "" : "s"}`,
      tone: t.incomplete || authIssues ? "warn" : "ok",
      href: "/evv", linkLabel: "Review queue",
    },
    {
      title: `Compliance percentage against ${DHS_THRESHOLD}%`,
      reading: pctText,
      tone: s.estimatedCompliancePercent == null ? "neutral" : s.estimatedCompliancePercent >= DHS_THRESHOLD ? "ok" : "danger",
    },
    {
      title: "Manual activity",
      reading: `${t.manualOrCorrected} manual or corrected of ${t.complete} completed (${manualShare}%) — each one counts against the percentage`,
      tone: manualShare === 0 ? "ok" : manualShare < 10 ? "warn" : "danger",
      href: "/evv?manualOrCorrected=true", linkLabel: "See them",
    },
    {
      title: "Data transmission",
      reading: t.accepted === 0 && t.complete > 0
        ? `Nothing has reached HHAeXchange: ${t.unsubmitted} unsubmitted, ${t.rejected} rejected. Visits only count once the aggregator holds them.`
        : `${t.accepted} accepted · ${t.rejected} rejected · ${t.unsubmitted} unsubmitted`,
      tone: t.complete === 0 ? "neutral" : t.rejected || t.unsubmitted ? "danger" : "ok",
      href: "/evv?tab=integration", linkLabel: "Integration",
    },
    {
      title: "Compliance reports",
      reading: "Read the monthly HHAeXchange report for missing visits, payer-specific issues and anything unexpected. DHS determines compliance from those reports, not from this screen.",
      tone: "neutral",
      href: "https://hhaexchange.my.site.com/s/login/", linkLabel: "HHAeXchange portal",
    },
    {
      title: "Enrollment",
      reading: unknownIds
        ? `${unknownIds} visit${unknownIds === 1 ? "" : "s"} with no NPI or UMPI on the caregiver — DHS cannot match those`
        : "Every visit carries an NPI or UMPI. Confirm each one under your tax ID is connected to the HHAeXchange portal and matches MHCP enrollment.",
      tone: unknownIds ? "danger" : "ok",
      href: "/evv?tab=settings", linkLabel: "Settings",
    },
  ];

  const badge: Record<Tone, { tone: "ok" | "warn" | "danger" | "neutral"; label: string }> = {
    ok: { tone: "ok", label: "OK" }, warn: { tone: "warn", label: "Check" }, danger: { tone: "danger", label: "Act" }, neutral: { tone: "neutral", label: "Review" },
  };

  return (
    <Card title="Quarterly check-in" description={`The six items DHS asks providers to review each quarter (Fall 2026 EVV Provider Notice), read against this range. The ${DHS_THRESHOLD}% requirement took effect July 1, 2026; data is due by the 14th of the following month.`} className="mb-5">
      <ol className="divide-y divide-line-soft">
        {items.map((it, i) => (
          <li key={it.title} className="flex items-start gap-4 px-5 py-3">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-card-soft text-[13px] font-semibold text-text-strong">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-medium text-text-strong">{it.title}</span>
                <Badge tone={badge[it.tone].tone}>{badge[it.tone].label}</Badge>
              </div>
              <p className="mt-0.5 text-[13.5px] text-text">{it.reading}</p>
            </div>
            {it.href && (
              it.href.startsWith("http")
                ? <a href={it.href} target="_blank" rel="noreferrer" className="shrink-0 text-[13px] font-medium text-primary hover:underline">{it.linkLabel} ↗</a>
                : <a href={it.href} className="shrink-0 text-[13px] font-medium text-primary hover:underline">{it.linkLabel}</a>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
