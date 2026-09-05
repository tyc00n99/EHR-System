import Link from "next/link";
import { DownloadButton } from "@/components/download-button";
import { Badge, cx } from "@/components/kit";
import { labelForCode } from "@/lib/hcpcs";
import { fmtDate } from "@/lib/format";

const time = new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "America/Chicago" });
const day = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });

export interface NoteRow { id: string; clockInAt: Date; clockOutAt: Date | null; serviceCode: string; modifiers: string[]; units: number; status: string; returned: boolean; note: string | null; interaction: string | null; skills: string[]; staff: string; staffSigned: boolean; clientSigned: boolean; approved: boolean; manual: boolean; edits: number; goalYes: number; goalNo: number }

export function NotesTab({ personId, rows, codes, filters, base }: { personId: string; rows: NoteRow[]; codes: { code: string; label: string }[]; filters: { code: string; from: string; to: string }; base: string }) {
  const q = new URLSearchParams({ ...(filters.code ? { code: filters.code } : {}), ...(filters.from ? { from: filters.from } : {}), ...(filters.to ? { to: filters.to } : {}) });
  const units = rows.filter((r) => r.status === "completed").reduce((n, r) => n + r.units, 0);
  return (
    <div className="mx-auto max-w-4xl">
      <form action={base} className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-sidebar px-4 py-3">
        <input type="hidden" name="tab" value="notes" />
        <label className="block"><span className="mb-1 block font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Service</span><select name="code" defaultValue={filters.code} className="h-9 rounded-lg border border-line bg-page px-2.5 text-[13px]"><option value="">All services</option>{codes.map((c) => <option key={c.code} value={c.code}>{c.label} · {c.code}</option>)}</select></label>
        <label className="block"><span className="mb-1 block font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">From</span><input name="from" type="date" defaultValue={filters.from} className="h-9 rounded-lg border border-line bg-page px-2.5 text-[13px]" /></label>
        <label className="block"><span className="mb-1 block font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">To</span><input name="to" type="date" defaultValue={filters.to} className="h-9 rounded-lg border border-line bg-page px-2.5 text-[13px]" /></label>
        <button className="h-9 rounded-full border border-line bg-page px-4 text-[13px] font-medium hover:bg-hover">Apply</button>
        {(filters.code || filters.from || filters.to) && <Link href={`${base}?tab=notes`} className="text-[13px] text-muted-foreground hover:text-text">Clear</Link>}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[12.5px] tabular-nums text-muted-foreground">{rows.length} notes · {units} units</span>
          <DownloadButton href={`/clients/${personId}/notes.pdf?${q}`}>Download PDF</DownloadButton>
        </div>
      </form>

      {rows.length === 0 && <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center text-[13px] text-muted-foreground">No notes match. Widen the dates or clear the service filter.</div>}
      <div className="space-y-3">
        {rows.map((r) => (
          <Link key={r.id} href={`${base}?tab=notes&${q}&visit=${r.id}`} scroll={false} className="block overflow-hidden rounded-xl border border-line bg-card shadow-[var(--shadow-sm)] transition-colors hover:bg-hover">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-soft bg-sidebar px-4 py-2 text-[12.5px]">
              <span className="font-medium text-text-strong">{day.format(r.clockInAt)}</span>
              <span className="tabular-nums text-muted-foreground">{time.format(r.clockInAt)}{r.clockOutAt ? ` – ${time.format(r.clockOutAt)}` : ""}</span>
              <span className="tabular-nums text-muted-foreground">{r.serviceCode} {r.modifiers.join(" ")} · {r.units} units</span>
              <span className="text-muted-foreground">· {r.staff}</span>
              <span className="ml-auto flex gap-1"><Badge tone={r.returned ? "warn" : r.approved ? "ok" : r.staffSigned ? "accent" : r.note ? "warn" : "neutral"}>{r.returned ? "returned" : r.approved ? "accepted" : r.note ? "draft" : "no note"}</Badge>{r.status === "completed" && !r.clientSigned && <Badge tone="danger">unsigned</Badge>}{r.manual && <Badge tone="warn">manual</Badge>}{r.edits > 0 && <Badge tone="warn">edited</Badge>}</span>
            </div>
            <div className="grid gap-4 px-4 py-3 md:grid-cols-[1fr_200px]">
              <div>
                <div className="font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Progress review</div>
                <p className={cx("mt-1 leading-6", r.note ? "text-text" : "text-hint")}>{r.note ?? "No note yet."}</p>
              </div>
              <dl className="space-y-1.5 text-[12.5px]">
                <div><dt className="font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Service</dt><dd>{labelForCode(r.serviceCode, r.modifiers)}</dd></div>
                {r.interaction && <div><dt className="font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Interaction</dt><dd className="capitalize">{r.interaction}</dd></div>}
                {r.skills.length > 0 && <div><dt className="font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Skills</dt><dd>{r.skills.join(", ")}</dd></div>}
                {r.goalYes + r.goalNo > 0 && <div><dt className="font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Goals</dt><dd>{r.goalYes} yes · {r.goalNo} no</dd></div>}
              </dl>
            </div>
          </Link>
        ))}
      </div>
      {rows.length > 0 && <p className="mt-3 text-[12px] text-muted-foreground">Showing {fmtDate(rows[rows.length - 1].clockInAt)} to {fmtDate(rows[0].clockInAt)}. Click a note to open the full record.</p>}
    </div>
  );
}
