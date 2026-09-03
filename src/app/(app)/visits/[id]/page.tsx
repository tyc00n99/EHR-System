import { notFound } from "next/navigation";
import { Badge, Card, Crumb, CrumbSep, Notice, PageHeader, PageIcon, Properties } from "@/components/kit";
import { Icon } from "@/components/icons";
import { getVisit } from "@/db/queries";
import { can, requireUser } from "@/lib/auth";
import { fmtDateTime, fullName, toLocalInput } from "@/lib/format";
import { minutesBetween } from "@/lib/units";
import { PLACES_OF_SERVICE } from "@/lib/validation";
import { VisitEditForm, VoidButton } from "./edit-form";
import { VisitRecord } from "../record/visit-record";

const evvTone = { pending: "neutral", exported: "accent", accepted: "ok", rejected: "danger" } as const;

function gps(lat: number | null, lng: number | null, acc: number | null) {
  if (lat == null || lng == null) return null;
  return (
    <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer" className="tabular-nums text-primary hover:underline">
      {lat.toFixed(5)}, {lng.toFixed(5)}{acc != null && <span className="text-muted-foreground"> · ±{Math.round(acc)} m</span>}
    </a>
  );
}

export default async function VisitPage({ params, searchParams }: PageProps<"/visits/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const row = await getVisit(id);
  if (!row) notFound();
  const { visit: v, person, staff: s, agreement, edits } = row;
  if (user.role === "dsp" && v.staffId !== user.staffId) notFound();
  const pos = PLACES_OF_SERVICE.find((p) => p.code === v.placeOfService);
  const editable = can(user, "edit_visits") && v.status !== "void";
  const duration = v.clockOutAt ? minutesBetween(v.clockInAt, v.clockOutAt) : null;
  const completedTasks = v.tasks.filter((t) => t.completed).length;

  return (
    <div>
      {sp.done && <Notice tone="ok"><span className="font-medium text-ok">Visit completed and saved.</span></Notice>}
      <PageHeader
        eyebrow={<><Crumb href="/visits">Visits</Crumb><CrumbSep /><Crumb href={`/clients/${person.id}`}>{fullName(person)}</Crumb><CrumbSep /><Crumb>{fmtDateTime(v.clockInAt)}</Crumb></>}
        icon={<PageIcon text={`${person.firstName[0]}${person.lastName[0]}`} tone={v.status === "completed" ? "ok" : v.status === "void" ? "neutral" : "accent"} />}
        title={`Visit with ${fullName(person)}`}
        meta={<>
          <Badge tone={v.status === "completed" ? "ok" : v.status === "void" ? "neutral" : "accent"}>{v.status.replace("_", " ")}</Badge>
          <Badge tone={evvTone[v.evvStatus]}>EVV {v.evvStatus}</Badge>
          {v.manualEntry && <Badge tone="warn">manual entry</Badge>}
          {edits.length > 0 && <Badge tone="warn">{edits.length} edit{edits.length === 1 ? "" : "s"}</Badge>}
          {v.status === "completed" && (v.clientSignedAt ? <Badge tone="ok">client signed</Badge> : <Badge tone="danger">unsigned</Badge>)}
          <span className="text-hint">·</span>
          <span>{fmtDateTime(v.clockInAt)}{duration != null && ` · ${duration} min`}</span>
        </>}
      />

      <div className="mb-4 overflow-hidden rounded-lg border border-line bg-card shadow-[var(--shadow-sm)]"><VisitRecord id={v.id} /></div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card title="Aggregator record" description="Exactly what the EVV aggregator and the 837P claim line receive" padded>
          <Properties items={[
            { icon: "hash", label: "Provider tax ID", value: <span className="tabular-nums">{v.providerTaxId}</span> },
            { icon: "id", label: "PMI #", value: <span className="tabular-nums">{v.pmi}</span> },
            { icon: "code", label: "Service code", value: <span className="tabular-nums">{v.serviceCode}{v.modifiers.length ? <span className="text-muted-foreground"> {v.modifiers.join(" ")}</span> : ""}</span> },
            { icon: "units", label: "Units", value: <span className="tabular-nums">{v.units} <span className="text-muted-foreground">× {agreement.unitMinutes >= 1440 ? "1 day" : `${agreement.unitMinutes} min`}</span></span> },
            { icon: "pin", label: "Place of service", value: <span><span className="tabular-nums">{v.placeOfService}</span>{pos && <span className="text-muted-foreground"> · {pos.label}</span>}</span> },
            { icon: "user", label: "Rendering staff", value: <span>{s.firstName} {s.lastName}<span className="text-muted-foreground tabular-nums"> · {v.renderingIdType.toUpperCase()} {v.renderingId}</span></span> },
            { icon: "doc", label: "Authorization", value: agreement.agreementNumber },
          ]} />
          <div className="my-2 border-t border-line-soft" />
          <Properties items={[
            { icon: "clock", label: "Clock in", value: fmtDateTime(v.clockInAt) },
            { icon: "clock", label: "Clock out", value: v.clockOutAt ? fmtDateTime(v.clockOutAt) : null },
            { icon: "pin", label: "GPS at clock in", value: gps(v.clockInLat, v.clockInLng, v.clockInAccuracyM) },
            { icon: "pin", label: "GPS at clock out", value: gps(v.clockOutLat, v.clockOutLng, v.clockOutAccuracyM) },
            { icon: "flag", label: "Manual entry", value: v.manualEntry ? <span><Badge tone="warn">yes</Badge> <span className="ml-1">{v.manualEntryReason}</span></span> : "No" },
            { icon: "check", label: "Client signature", value: v.clientSignedAt ? `Signed with code ${fmtDateTime(v.clientSignedAt)}` : v.clientUnsignedReason ? <span><Badge tone="danger">not signed</Badge> <span className="ml-1">{v.clientUnsignedReason}</span></span> : v.status === "completed" ? <Badge tone="danger">not signed</Badge> : null },
          ]} />
        </Card>

        <div className="grid content-start gap-4">
          <Card title="Tasks" description={v.tasks.length ? `${completedTasks} of ${v.tasks.length} completed` : undefined} padded>
            {v.tasks.length === 0 ? <p className="text-[13px] text-muted-foreground">No tasks were planned for this visit.</p> : (
              <ul className="space-y-1.5">
                {v.tasks.map((t) => (
                  <li key={t.code} className="flex items-center gap-2.5">
                    <span className={`flex h-[18px] w-[18px] items-center justify-center rounded border ${t.completed ? "border-ok bg-ok-soft text-ok" : "border-line text-transparent"}`}><Icon.check size={12} /></span>
                    <span className={t.completed ? "" : "text-muted-foreground"}>{t.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Shift note" padded>
            <p className="whitespace-pre-wrap leading-6">{v.shiftNote || <span className="text-hint">No shift note yet.</span>}</p>
          </Card>
          <Card title="Edit history" description="Kept with the visit and exported as EVV evidence">
            {edits.length === 0 ? <p className="px-5 py-4 text-[13px] text-muted-foreground">No edits since creation.</p> : (
              <ul className="divide-y divide-line-soft">
                {edits.map(({ edit, editorEmail }) => (
                  <li key={edit.id} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3 text-[13px] text-muted-foreground"><span>{editorEmail}</span><span className="tabular-nums">{fmtDateTime(edit.editedAt)}</span></div>
                    <div className="mt-0.5 font-medium text-text-strong">{edit.reason}</div>
                    <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                      {Object.entries(edit.changes).map(([k, c]) => (
                        <li key={k} className="tabular-nums"><span className="font-medium text-text">{k}</span> {fmtChange(c.from)} → {fmtChange(c.to)}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {editable && (
        <Card title="Edit this visit" description="A reason is required. The change is kept as history and the visit is marked manually adjusted for EVV." className="mt-4" padded>
          <VisitEditForm
            visitId={v.id}
            defaults={{ clockInAt: toLocalInput(v.clockInAt), clockOutAt: v.clockOutAt ? toLocalInput(v.clockOutAt) : toLocalInput(new Date()), placeOfService: v.placeOfService, shiftNote: v.shiftNote ?? "" }}
          />
          <div className="mt-6 border-t border-line-soft pt-5">
            <VoidButton visitId={v.id} />
          </div>
        </Card>
      )}
    </div>
  );
}

function fmtChange(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDateTime(v);
  return String(v);
}
