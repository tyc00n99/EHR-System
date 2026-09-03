import Link from "next/link";
import { CheckCircle2, ExternalLink, MapPin, X } from "lucide-react";
import { Badge } from "@/components/kit";
import { getVisitRecord } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { fmtDateTime, fullName } from "@/lib/format";
import { labelForCode } from "@/lib/hcpcs";
import { minutesBetween } from "@/lib/units";
import { skillsFor } from "@/lib/templates";
import { RecordForm, SignaturePanel, MedsDue } from "./record-form";
import { CloseSheetButton } from "./close-button";

const time = new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "America/Chicago" });
const day = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/Chicago" });

/** Server-rendered body of the service record. Used inside the slide-over and on /visits/[id]. */
export async function VisitRecord({ id, inSheet }: { id: string; inSheet?: boolean }) {
  const user = await requireUser();
  const r = await getVisitRecord(id);
  if (!r) return <div className="p-6 text-muted-foreground">Visit not found.</div>;
  if (user.role === "dsp" && r.visit.staffId !== user.staffId) return <div className="p-6 text-muted-foreground">This visit belongs to another caregiver.</div>;
  const { visit: v, person, staff: s, agreement, edits } = r;
  const minutes = v.clockOutAt ? minutesBetween(v.clockInAt, v.clockOutAt) : null;
  const serviceTypeId = r.program?.serviceTypeId ?? null;
  const office = user.role !== "dsp";
  const locked = Boolean(v.approvedAt) && !office;
  const docState = v.approvedAt ? "approved" : v.staffSignedAt ? "signed" : v.shiftNote ? "draft" : "empty";

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-nav px-5 py-3 text-white">
        <div className="min-w-0 flex-1"><div className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/60">Service record</div><div className="truncate text-[15px] font-semibold">{fullName(person)} <span className="font-normal text-white/70">· {labelForCode(v.serviceCode, v.modifiers)}</span></div></div>
        {!inSheet ? null : <Link href={`/visits/${v.id}`} className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-white/80 hover:bg-white/10"><ExternalLink className="size-3.5" /> Full page</Link>}
        {inSheet && <CloseSheetButton><X className="size-4" /></CloseSheetButton>}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-soft bg-sidebar px-5 py-3 text-[13px]">
        <span className="font-medium text-text-strong">{day.format(v.clockInAt)}</span>
        <span className="tabular-nums text-muted-foreground">{time.format(v.clockInAt)}{v.clockOutAt ? ` – ${time.format(v.clockOutAt)}` : " – in progress"}{minutes != null && ` · ${minutes} min · ${v.units} units`}</span>
        <span className="text-muted-foreground">{s.firstName} {s.lastName}</span>
        <span className="ml-auto flex gap-1">
          <Badge tone={v.status === "completed" ? "ok" : v.status === "void" ? "neutral" : "accent"}>{v.status.replace("_", " ")}</Badge>
          <Badge tone={docState === "approved" ? "ok" : docState === "signed" ? "accent" : docState === "draft" ? "warn" : "neutral"}>{docState === "approved" ? "approved" : docState === "signed" ? "staff signed" : docState === "draft" ? "draft" : "no note"}</Badge>
          {v.status === "completed" && (v.clientSignedAt ? <Badge tone="ok">client signed</Badge> : <Badge tone="danger">unsigned</Badge>)}
          {v.manualEntry && <Badge tone="warn">manual</Badge>}
        </span>
      </div>

      <div className="grid gap-5 px-5 py-5">
        <section className="grid gap-2 text-[13px] sm:grid-cols-2">
          <div className="rounded-md border border-line bg-card px-3 py-2"><div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Clock in</div><div className="mt-0.5 font-medium text-text-strong">{fmtDateTime(v.clockInAt)}</div>{v.clockInLat != null && <a href={`https://www.google.com/maps?q=${v.clockInLat},${v.clockInLng}`} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 text-[12px] text-primary hover:underline"><MapPin className="size-3" />{v.clockInLat.toFixed(4)}, {v.clockInLng.toFixed(4)}</a>}</div>
          <div className="rounded-md border border-line bg-card px-3 py-2"><div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Clock out</div><div className="mt-0.5 font-medium text-text-strong">{v.clockOutAt ? fmtDateTime(v.clockOutAt) : "Still in progress"}</div>{v.clockOutLat != null && v.clockOutLng != null && <a href={`https://www.google.com/maps?q=${v.clockOutLat},${v.clockOutLng}`} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 text-[12px] text-primary hover:underline"><MapPin className="size-3" />{v.clockOutLat.toFixed(4)}, {v.clockOutLng.toFixed(4)}</a>}</div>
        </section>

        {r.meds.length > 0 && <MedsDue visitId={v.id} personId={person.id} date={v.clockInAt.toISOString().slice(0, 10)} meds={r.meds.map((m) => ({ id: m.id, name: m.name, dose: m.dose, times: m.times }))} admins={r.admins.map((a) => ({ medicationId: a.medicationId, time: a.scheduledTime, status: a.status }))} readOnly={locked} />}

        <RecordForm
          visitId={v.id}
          personFirst={person.firstName}
          locked={locked}
          skillsOptions={skillsFor(serviceTypeId)}
          defaults={{ interactionLevel: v.interactionLevel ?? "", skills: v.skills, shiftNote: v.shiftNote ?? "", staffSigned: Boolean(v.staffSignedAt) }}
          tasks={v.tasks}
          questions={r.questions.map(({ q, goal }) => ({ id: q.id, prompt: q.prompt, goal: goal.title, response: r.responses.find((x) => x.questionId === q.id)?.response ?? "", note: r.responses.find((x) => x.questionId === q.id)?.note ?? "" }))}
        />

        <SignaturePanel visitId={v.id} status={v.status} clientSignedAt={v.clientSignedAt ? fmtDateTime(v.clientSignedAt) : null} unsignedReason={v.clientUnsignedReason} staffSignedAt={v.staffSignedAt ? fmtDateTime(v.staffSignedAt) : null} approvedAt={v.approvedAt ? fmtDateTime(v.approvedAt) : null} approverEmail={r.approverEmail} canApprove={office} hasNote={Boolean(v.shiftNote)} />

        <section className="text-[12.5px] text-muted-foreground">
          <div className="flex flex-wrap gap-x-4 gap-y-1"><span>Authorization {agreement.agreementNumber}</span><span>PMI {v.pmi}</span><span>{v.renderingIdType.toUpperCase()} {v.renderingId}</span><span>POS {v.placeOfService}</span>{edits.length > 0 && <span>{edits.length} edit{edits.length === 1 ? "" : "s"}</span>}</div>
          {v.manualEntry && <div className="mt-1">Manual entry: {v.manualEntryReason}</div>}
          {v.approvedAt && <div className="mt-1 flex items-center gap-1 text-ok"><CheckCircle2 className="size-3.5" /> Approved {fmtDateTime(v.approvedAt)}{r.approverEmail ? ` by ${r.approverEmail}` : ""}</div>}
        </section>
      </div>
    </div>
  );
}
