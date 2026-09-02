import Link from "next/link";
import { Badge, Card, PageHeader, cx, type Tone } from "@/components/ui";
import { listAllCredentials, listStaff } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { CREDENTIAL_TYPES, evaluateCompliance, type ComplianceStatus } from "@/lib/credentials";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Compliance" };
const TONE: Record<ComplianceStatus, Tone> = { ok: "ok", due_soon: "warn", overdue: "danger", missing: "danger" };
const SHORT: Record<ComplianceStatus, string> = { ok: "OK", due_soon: "Due", overdue: "Late", missing: "None" };

export default async function CompliancePage() {
  await requireUser(["admin", "supervisor"]);
  const [staffRows, creds] = await Promise.all([listStaff(true), listAllCredentials()]);
  const rows = staffRows.map((s) => ({ s, items: evaluateCompliance(s.hireDate, creds.get(s.id) ?? []) }));
  const columns = CREDENTIAL_TYPES.filter((c) => c.type !== "other" && c.type !== "auto_insurance").map((c) => ({ type: c.type, label: c.label }));
  const totals = { late: rows.filter((r) => r.items.some((i) => i.status === "overdue" || (i.status === "missing" && i.type === "background_study"))).length, due: rows.filter((r) => r.items.some((i) => i.status === "due_soon")).length };
  return (
    <div>
      <PageHeader title="Compliance" meta={<><Badge tone={totals.late ? "danger" : "ok"}>{totals.late} staff late</Badge><Badge tone={totals.due ? "warn" : "ok"}>{totals.due} due soon</Badge><span>245D.09 orientation and training, chapter 245C background studies, certifications. Click a cell to open the staff record.</span></>} />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-sidebar"><tr><th className="sticky left-0 z-10 bg-sidebar px-5 py-2 text-left text-xs font-medium text-muted">Staff</th>{columns.map((c) => <th key={c.type} className="px-3 py-2 text-left text-xs font-medium text-muted"><span className="block max-w-28 leading-4">{c.label}</span></th>)}</tr></thead>
            <tbody>
              {rows.map(({ s, items }) => (
                <tr key={s.id} className="border-t border-line-soft">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-5 py-2.5"><Link href={`/staff/${s.id}`} className="font-medium text-text-strong hover:underline">{s.lastName}, {s.firstName}</Link><div className="text-xs text-muted">{s.title}</div></td>
                  {columns.map((c) => {
                    const i = items.find((x) => x.type === c.type);
                    if (!i) return <td key={c.type} className="px-3 py-2.5 text-xs text-hint">—</td>;
                    return (
                      <td key={c.type} className="px-3 py-2.5">
                        <Link href={`/staff/${s.id}?tab=compliance`} title={i.detail} className={cx("inline-flex h-7 min-w-14 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium", TONE[i.status] === "ok" ? "bg-ok-soft text-ok" : TONE[i.status] === "warn" ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger")}>
                          {SHORT[i.status]}{i.due && i.status !== "ok" && <span className="font-normal opacity-80">· {fmtDate(i.due).replace(/, \d{4}$/, "")}</span>}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
