import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Scheduling" };

export default async function SchedulingPage() {
  await requireUser(["admin", "supervisor"]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Scheduling" meta={<span>Next milestone. Not yet available.</span>} />
      <Card title="What ships here" padded>
        <ul className="list-disc space-y-1.5 pl-5 text-[13.5px]">
          <li>Weekly shift calendar per caregiver and per client, built from assignments and authorized units.</li>
          <li>Open-shift board with caregiver eligibility checks: assigned, oriented, compliant, no overlap.</li>
          <li>Authorization pacing: warns when a client&apos;s scheduled units would exhaust the agreement before its end date.</li>
          <li>Clock-in compares against the schedule so late or missed shifts surface in Needs attention.</li>
        </ul>
        <p className="mt-4 text-[13px] text-muted">Until then, caregivers see their assigned clients on Home and clock in from there.</p>
      </Card>
    </div>
  );
}
