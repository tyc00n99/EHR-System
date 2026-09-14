"use client";

import { startTransition, useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";
import { credentialLabel } from "@/lib/credentials";
import { fmtDate } from "@/lib/format";
import type { PersonnelItem, PersonnelStatus } from "@/lib/personnel-file";
import { addCredential, deleteCredential } from "../actions";
import { attachToCredential, readCredentialFile } from "../document-actions";

/**
 * The personnel file as two panes: the licensor's list down the left, ticked as it is satisfied,
 * and the evidence for the chosen item on the right — dates, hours, the trainer, the documents,
 * the history of earlier years. The shape is the client Profile tab's, so it reads as one app.
 *
 * Nothing here is satisfied without paper: "Record" always asks for the document, and a row that
 * was recorded before that rule shows as undocumented until one is attached.
 */

const TONE: Record<PersonnelStatus, { mark: string; ring: string; pill: string; label: string }> = {
  ok: { mark: "✓", ring: "bg-ok-soft text-ok", pill: "bg-ok-soft text-ok", label: "Satisfied" },
  due_soon: { mark: "✓", ring: "bg-ok-soft text-ok", pill: "bg-warn-soft text-warn", label: "Due soon" },
  overdue: { mark: "!", ring: "bg-danger-soft text-danger", pill: "bg-danger-soft text-danger", label: "Overdue" },
  missing: { mark: "!", ring: "bg-danger-soft text-danger", pill: "bg-danger-soft text-danger", label: "Missing" },
  undocumented: { mark: "!", ring: "bg-danger-soft text-danger", pill: "bg-danger-soft text-danger", label: "No document" },
  pending: { mark: "…", ring: "bg-warn-soft text-warn", pill: "bg-warn-soft text-warn", label: "Pending" },
  optional: { mark: "–", ring: "bg-panel text-hint", pill: "bg-panel text-muted-foreground", label: "Not recorded" },
};

const field = "h-10 w-full rounded-lg border border-line bg-card px-3 text-[14.5px] text-text outline-none focus:border-primary focus:ring-4 focus:ring-primary-soft";
const fileField = "h-10 w-full rounded-lg border border-line bg-card px-2 pt-1.5 text-[13px] file:mr-2 file:rounded file:border-0 file:bg-panel file:px-2 file:py-0.5 file:text-[13px]";

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return <div className="mb-1.5 text-[14.5px] text-text-strong">{children}{required && <span className="text-danger"> *</span>}</div>;
}

export function PersonnelFile({ staffId, items, aiReady, staffName }: { staffId: string; items: PersonnelItem[]; aiReady: boolean; staffName: string; documents: { id: string; title: string; fileName: string; credentialId: string | null; createdAt: string }[] }) {
  const [key, setKey] = useState(items.find((i) => i.status !== "ok")?.key ?? items[0].key);
  const current = items.find((i) => i.key === key) ?? items[0];
  const groups = useMemo(() => {
    const out: { label: string; items: PersonnelItem[] }[] = [];
    for (const it of items) {
      const g = out.find((x) => x.label === it.group);
      if (g) g.items.push(it); else out.push({ label: it.group, items: [it] });
    }
    return out;
  }, [items]);
  const required = items.filter((i) => i.required);
  const satisfied = required.filter((i) => i.status === "ok" || i.status === "due_soon").length;

  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <div className="text-[17px] font-semibold text-text-strong">Personnel file</div>
        <span className={cx("rounded-full px-2 py-0.5 text-[13px] font-semibold", satisfied === required.length ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>{satisfied} / {required.length}</span>
        <span className="text-[14px] text-muted-foreground">of the licensor&apos;s items satisfied, each with its document attached</span>
      </div>

      <div className="grid lg:grid-cols-[400px_minmax(0,1fr)]">
        <nav aria-label="Personnel file items" className="border-r border-line">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="border-b border-line bg-panel px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{g.label}</div>
              {g.items.map((it) => {
                const t = TONE[it.status];
                const on = it.key === current.key;
                return (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => setKey(it.key)}
                    aria-current={on ? "true" : undefined}
                    className={cx("flex w-full items-center gap-2.5 border-b border-line px-4 py-3 text-left text-[15px] transition-colors", on ? "bg-primary-soft font-semibold text-primary shadow-[inset_4px_0_0_var(--primary)]" : "text-text-strong hover:bg-hover")}
                  >
                    <span className={cx("flex size-[22px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold", t.ring)}>{t.mark}</span>
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    {it.due && (it.status === "due_soon" || it.status === "overdue" || it.renews === "annual") && <span className={cx("shrink-0 text-[13px]", it.status === "overdue" ? "text-danger" : "text-hint")}>due {fmtDate(it.due)}</span>}
                    {it.status === "pending" && <span className="shrink-0 text-[13px] text-hint">pending</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <Detail key={current.key} staffId={staffId} item={current} aiReady={aiReady} staffName={staffName} />
      </div>
    </div>
  );
}

function Detail({ staffId, item, aiReady, staffName }: { staffId: string; item: PersonnelItem; aiReady: boolean; staffName: string }) {
  const t = TONE[item.status];
  const [recording, setRecording] = useState(false);
  const latest = item.records[0];

  return (
    <div className="p-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[21px] leading-tight">{item.label}</h2>
          <div className="mt-1 text-[13.5px] text-hint">{item.cite}{item.renews === "annual" ? " · renews annually" : item.renews === "expiry" ? " · tracked by expiry" : ""}</div>
        </div>
        {item.type && !recording && (
          <button type="button" onClick={() => setRecording(true)} className="flex h-9 shrink-0 items-center rounded-lg bg-primary px-4 text-[14.5px] font-medium text-primary-foreground hover:bg-primary-hover">
            {item.records.length ? (item.renews === "never" ? "Record again" : "Record this year's") : "Record"}
          </button>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-[190px_minmax(0,1fr)] gap-y-3 text-[15px]">
        <dt className="text-muted-foreground">Status</dt>
        <dd className="m-0 flex flex-wrap items-center gap-2"><span className={cx("rounded-full px-2.5 py-0.5 text-[13px] font-semibold", t.pill)}>{t.label}</span><span className="text-[14px] text-muted-foreground">{item.detail}</span></dd>
        {latest && (<>
          <dt className="text-muted-foreground">{item.type === "background_study" ? "Date submitted" : item.type === "background_study_results" ? "Results received" : "Date"}</dt>
          <dd className="ident m-0 font-medium text-text-strong">{fmtDate(latest.completedOn)}{latest.expiresOn && <span className="text-muted-foreground"> · expires {fmtDate(latest.expiresOn)}</span>}</dd>
          {latest.hours && (<><dt className="text-muted-foreground">Hours</dt><dd className="ident m-0 font-medium text-text-strong">{latest.hours}</dd></>)}
          {(item.needsInstructor || latest.instructor) && (<>
            <dt className="text-muted-foreground">Trainer or instructor</dt>
            <dd className={cx("m-0 font-medium", latest.instructor ? "text-text-strong" : "text-danger")}>{latest.instructor ?? "Not named — the licensor requires it"}</dd>
          </>)}
          <dt className="text-muted-foreground">Documents</dt>
          <dd className="m-0">
            {latest.documents.length === 0 ? (
              <AttachForm staffId={staffId} credentialId={latest.id} compact={item.status === "ok" || item.status === "due_soon"} />
            ) : (
              <div className="flex flex-wrap gap-2">
                {latest.documents.map((d) => (
                  <a key={d.id} href={`/staff/${staffId}/documents/${d.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[14px] font-medium text-text-strong hover:border-primary hover:bg-primary-soft">
                    <Icon.doc size={14} className="text-muted-foreground" />{d.fileName}
                  </a>
                ))}
                <AttachForm staffId={staffId} credentialId={latest.id} compact />
              </div>
            )}
          </dd>
          {latest.renewMonths && (<><dt className="text-muted-foreground">Frequency</dt><dd className="m-0 text-text">{latest.renewMonths === 3 ? "Quarterly" : "Annually"}</dd></>)}
          {latest.note && (<><dt className="text-muted-foreground">{item.type === "position_requirements" ? "Source" : "Note"}</dt><dd className="m-0 text-text">{latest.note}</dd></>)}
          <dt className="text-muted-foreground">Recorded</dt>
          <dd className="m-0 text-muted-foreground">{fmtDate(latest.createdAt)} <RemoveRecord id={latest.id} staffId={staffId} /></dd>
        </>)}
        {!item.type && (<><dt className="text-muted-foreground">Source</dt><dd className="m-0 text-text">The staff record. Change it under Edit.</dd></>)}
      </dl>

      {recording && item.type && <RecordForm staffId={staffId} item={item} aiReady={aiReady} staffName={staffName} onDone={() => setRecording(false)} />}

      {item.records.length > 1 && (
        <div className="mt-7">
          <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">History</div>
          <ul className="mt-2 border-t border-line">
            {item.records.slice(1).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2.5 text-[14px] text-muted-foreground">
                <span className="ident text-text-strong">{fmtDate(r.completedOn)}</span>
                {r.hours && <span>{r.hours} h</span>}
                {r.instructor && <span>{r.instructor}</span>}
                {r.documents.map((d) => <a key={d.id} href={`/staff/${staffId}/documents/${d.id}`} target="_blank" rel="noopener" className="font-medium text-primary hover:underline">{d.fileName}</a>)}
                {r.documents.length === 0 && <span className="text-danger">no document</span>}
                <RemoveRecord id={r.id} staffId={staffId} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A small mark beside a field the document filled in, so the reviewer knows which values to check. */
function FromDoc({ on }: { on: boolean }) {
  return on ? <span className="ml-1.5 rounded bg-primary-soft px-1.5 py-px text-[13px] font-medium text-primary">from document</span> : null;
}

function RecordForm({ staffId, item, aiReady, staffName, onDone }: { staffId: string; item: PersonnelItem; aiReady: boolean; staffName: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(addCredential.bind(null, staffId), {});
  // Reading the document is its own action: choosing a file sends it to the reader, and the
  // fields below fill in from what it returns. The file is uploaded again with the form; the text
  // read here rides along in hidden inputs so the page is read once.
  const [rs, runRead, reading] = useActionState(readCredentialFile.bind(null, staffId, item.type ?? ""), {});
  const e = state.errors ?? {};
  useEffect(() => {
    if (state.ok) { toast.success("Recorded."); onDone(); }
    else if (state.message) toast.error(state.message);
  }, [state, onDone]);
  const dated = item.renews === "expiry";
  const sourceOk = item.type === "position_requirements";
  const dateLabel = item.type === "background_study" ? "Date submitted" : item.type === "background_study_results" ? "Date results received from DHS" : item.type?.startsWith("first_") ? "Date of first contact" : "Date completed";

  const r = rs.read;
  const noteFromDoc = r ? [
    r.backgroundResult && item.type === "background_study_results" ? `DHS determination: ${r.backgroundResult.replace("_", " ")}` : null,
    r.issuer, r.certificateNumber ? `Cert. ${r.certificateNumber}` : null,
  ].filter(Boolean).join(" · ") : "";
  const has = (v: unknown) => v != null && v !== "";

  return (
    <form action={action} className="mt-6 rounded-xl border border-primary bg-primary-soft/30 p-5">
      <input type="hidden" name="type" value={item.type ?? ""} />
      <input type="hidden" name="extractedText" value={r?.text ?? ""} />
      <input type="hidden" name="extractionSummary" value={r?.summary ?? ""} />
      <div className="mb-4 text-[15px] font-semibold text-text-strong">Record — {item.label}</div>

      <div className="mb-4">
        <Label required={!sourceOk}>Document</Label>
        <input
          name="file" type="file" required={!sourceOk} accept=".pdf,image/*,.doc,.docx" className={fileField}
          onChange={(ev) => { const f = ev.currentTarget.files?.[0]; if (f && aiReady) { const fd = new FormData(); fd.append("file", f); startTransition(() => runRead(fd)); } }}
        />
        <p className="mt-1 text-[13px] text-muted-foreground">
          {sourceOk ? "Optional here: attach the diploma, licence or resume if there is one, or describe the source below." : "The signed form, certificate, DHS letter or observation note that shows it. Required — the licensor reads the paper."}
          {aiReady ? " Choose it first and the fields fill in from the page." : ""}
        </p>
        {e.file && <p className="mt-1 text-[13px] text-danger">{e.file}</p>}
        {reading && <p className="mt-2 flex items-center gap-2 text-[13.5px] text-primary"><span className="inline-block size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" /> Reading {rs.fileName ?? "the document"}…</p>}
        {!reading && rs.readId && (
          <div className={cx("mt-2 rounded-lg px-3 py-2.5 text-[13.5px]", r ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
            {r ? (
              <>
                <div className="font-medium">Read {rs.fileName}. Check the fields before saving.</div>
                {r.summary && <div className="mt-0.5">{r.summary}</div>}
                {rs.nameOk === false && <div className="mt-1 font-medium text-danger">The name on the document ({r.personName}) is not {staffName}. Make sure this is the right file and the right person.</div>}
                {rs.looksLike && <div className="mt-1 font-medium text-danger">This looks like “{credentialLabel(rs.looksLike as never)}” rather than “{item.label}”.</div>}
                {r.notes && <div className="mt-1">Reviewer note: {r.notes}</div>}
              </>
            ) : <div>{rs.message}</div>}
          </div>
        )}
      </div>

      <div key={rs.readId ?? 0} className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label required>Title<FromDoc on={has(r?.title)} /></Label>
          <input name="title" required defaultValue={r?.title ?? item.label} className={field} />
          {e.title && <p className="mt-1 text-[13px] text-danger">{e.title}</p>}
        </div>
        <div>
          <Label required>{dateLabel}<FromDoc on={has(r?.completedOn)} /></Label>
          <input name="completedOn" type="date" required defaultValue={r?.completedOn ?? ""} className={field} />
          {e.completedOn && <p className="mt-1 text-[13px] text-danger">{e.completedOn}</p>}
        </div>
        {dated && (
          <div>
            <Label>Expires on<FromDoc on={has(r?.expiresOn)} /></Label>
            <input name="expiresOn" type="date" defaultValue={r?.expiresOn ?? ""} className={field} />
            {e.expiresOn && <p className="mt-1 text-[13px] text-danger">{e.expiresOn}</p>}
          </div>
        )}
        {item.needsInstructor && (<>
          <div>
            <Label required>Trainer or instructor<FromDoc on={has(r?.instructor)} /></Label>
            <input name="instructor" required placeholder="Who delivered it" defaultValue={r?.instructor ?? ""} className={field} />
            {e.instructor && <p className="mt-1 text-[13px] text-danger">{e.instructor}</p>}
          </div>
          <div>
            <Label>Hours<FromDoc on={has(r?.hours)} /></Label>
            <input name="hours" type="number" step="0.5" min={0} defaultValue={r?.hours ?? ""} className={field} />
            {e.hours && <p className="mt-1 text-[13px] text-danger">{e.hours}</p>}
          </div>
        </>)}
        {item.type?.startsWith("first_") && (
          <div className="md:col-span-2">
            <Label required>Person served and, for supervised contact, who supervised</Label>
            <input name="note" required placeholder="Jordan Abelard · supervised by Maria Peters" className={field} />
          </div>
        )}
        {item.type === "evaluation" && (
          <div>
            <Label required>Frequency</Label>
            <select name="renewMonths" defaultValue="12" className={field}>
              <option value="12">Annually</option>
              <option value="3">Quarterly</option>
            </select>
            <p className="mt-1 text-[13px] text-muted-foreground">Sets when the next one is due.</p>
          </div>
        )}
        {sourceOk && (
          <div className="md:col-span-2">
            <Label required>Source<FromDoc on={has(noteFromDoc)} /></Label>
            <input name="note" defaultValue={noteFromDoc} placeholder="How they meet the requirements — e.g. HS diploma on file; 2 years' experience per the application" className={field} />
            {e.note && <p className="mt-1 text-[13px] text-danger">{e.note}</p>}
          </div>
        )}
        {!sourceOk && !item.type?.startsWith("first_") && (
          <div className="md:col-span-2">
            <Label>Note<FromDoc on={has(noteFromDoc)} /></Label>
            <input name="note" defaultValue={noteFromDoc} placeholder="Provider, certificate number, or what was covered" className={field} />
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button disabled={pending || reading} className="h-10 rounded-lg bg-primary px-4 text-[14.5px] font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60">{pending ? "Saving…" : "Save"}</button>
        <button type="button" onClick={onDone} className="h-10 px-3 text-[14.5px] text-muted-foreground hover:text-text-strong">Cancel</button>
      </div>
    </form>
  );
}

function AttachForm({ staffId, credentialId, compact }: { staffId: string; credentialId: string; compact?: boolean }) {
  const [state, action, pending] = useActionState(attachToCredential.bind(null, staffId, credentialId), {});
  useEffect(() => {
    if (state.ok) toast.success(state.message ?? "Attached.");
    else if (state.message) toast.error(state.message);
  }, [state]);
  return (
    <form action={action} className={cx("flex items-center gap-2", !compact && "rounded-lg border border-danger/40 bg-danger-soft/40 p-2")}>
      <input name="file" type="file" required accept=".pdf,image/*,.doc,.docx" aria-label="Attach a document" className={cx(fileField, "h-9 max-w-[320px]")} />
      <button disabled={pending} className="h-9 shrink-0 rounded-lg border border-line bg-card px-3 text-[14px] font-medium text-text-strong hover:bg-hover disabled:opacity-60">{pending ? "Attaching…" : "Attach"}</button>
      {state.errors?.file && <span className="text-[13px] text-danger">{state.errors.file}</span>}
    </form>
  );
}

function RemoveRecord({ id, staffId }: { id: string; staffId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => { if (confirm("Remove this record? Its documents stay in the file.")) start(() => deleteCredential(id, staffId)); }}
      className="ml-2 text-[13px] font-medium text-danger hover:underline disabled:opacity-50"
    >
      Remove
    </button>
  );
}
