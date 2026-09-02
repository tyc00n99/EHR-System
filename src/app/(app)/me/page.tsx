import Link from "next/link";
import { Badge, Card, Empty, PageHeader, PageIcon, Properties, type Tone } from "@/components/ui";
import { getStaff, listAssignmentsForStaff, listCredentials } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { credentialLabel, evaluateCompliance, type ComplianceStatus } from "@/lib/credentials";
import { fmtDate, fullName } from "@/lib/format";
import { PasswordForm } from "./password-form";

export const metadata = { title: "My profile" };

const TONE: Record<ComplianceStatus, Tone> = { ok: "ok", due_soon: "warn", overdue: "danger", missing: "danger" };
const LABEL: Record<ComplianceStatus, string> = { ok: "current", due_soon: "due soon", overdue: "overdue", missing: "missing" };
const ROLE = { admin: "Administrator", supervisor: "Supervisor", dsp: "Direct support professional" } as const;

export default async function MePage() {
  const user = await requireUser();
  const s = user.staffId ? await getStaff(user.staffId) : null;
  const [credentials, assignments] = s ? await Promise.all([listCredentials(s.id), listAssignmentsForStaff(s.id)]) : [[], []];
  const items = s ? evaluateCompliance(s.hireDate, credentials) : [];
  const name = user.staffName ?? user.email;

  return (
    <div>
      <PageHeader icon={<PageIcon text={name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("")} tone="accent" />} title={name} meta={<><span>{ROLE[user.role]}</span><span className="text-hint">·</span><span>{user.email}</span></>} />
      <div className="grid gap-6 lg:grid-cols-[300px_1fr] lg:gap-8">
        <aside className="space-y-3">
          {s && (
            <Card title="Profile" padded>
              <Properties labelWidth={96} items={[
                { icon: "id", label: s.npi ? "NPI" : "UMPI", value: <span className="tabular-nums">{s.npi ?? s.umpi}</span> },
                { icon: "calendar", label: "Born", value: fmtDate(s.dob) },
                { icon: "id", label: "SSN", value: <span className="tabular-nums">•••-••-{s.ssnLast4}</span> },
                { icon: "pin", label: "Address", value: [s.address1, s.address2, `${s.city}, ${s.state} ${s.zip}`].filter(Boolean).join(", ") },
                { icon: "phone", label: "Phone", value: s.phone },
                { icon: "mail", label: "Email", value: s.email },
                { icon: "calendar", label: "Hired", value: fmtDate(s.hireDate) },
              ]} />
              <p className="mt-3 text-xs text-muted">Ask an administrator to change these.</p>
            </Card>
          )}
          <Card title="Change password" padded><PasswordForm /></Card>
        </aside>
        <div className="min-w-0 space-y-6">
          {s ? (
            <>
              <Card title="My compliance" description="Training and clearances required for your role">
                <ul className="divide-y divide-line-soft">
                  {items.map((i) => (
                    <li key={i.type} className="flex items-start gap-3 px-5 py-3">
                      <Badge tone={TONE[i.status]}>{LABEL[i.status]}</Badge>
                      <div className="min-w-0 flex-1"><div className="font-medium text-text-strong">{i.label}</div><div className="text-[13px] text-muted">{i.detail}</div></div>
                      {i.due && <span className={`shrink-0 text-[13px] tabular-nums ${i.status === "overdue" ? "text-danger" : "text-muted"}`}>{fmtDate(i.due)}</span>}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="My clients" description="People assigned to you">
                {assignments.filter((a) => a.assignment.active).length === 0 ? <Empty icon="clients" title="No clients assigned yet">A supervisor assigns clients to you.</Empty> : (
                  <ul className="divide-y divide-line-soft">
                    {assignments.filter((a) => a.assignment.active).map((a) => (
                      <li key={a.assignment.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div><Link href={`/clients/${a.person.id}`} className="font-medium text-text-strong hover:underline">{fullName(a.person)}</Link><div className="text-[13px] text-muted">{a.person.waiverProgram} · {a.person.county} County</div></div>
                        {a.assignment.orientedOn ? <Badge tone="ok">oriented {fmtDate(a.assignment.orientedOn)}</Badge> : <Badge tone="warn">orientation pending</Badge>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="My training record">
                {credentials.length === 0 ? <Empty icon="doc" title="Nothing recorded yet" /> : (
                  <ul className="divide-y divide-line-soft">
                    {credentials.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3"><div><div className="font-medium text-text-strong">{c.title}</div><div className="text-[13px] text-muted">{credentialLabel(c.type)} · {fmtDate(c.completedOn)}{c.hours ? ` · ${c.hours} h` : ""}</div></div>{c.expiresOn && <span className="text-[13px] text-muted tabular-nums">expires {fmtDate(c.expiresOn)}</span>}</li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          ) : (
            <Card padded><p className="text-muted">This login is not linked to a staff record.</p></Card>
          )}
        </div>
      </div>
    </div>
  );
}
