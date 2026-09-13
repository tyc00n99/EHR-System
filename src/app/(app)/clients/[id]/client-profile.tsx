"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Icon, type IconName } from "@/components/icons";
import { Badge, cx } from "@/components/kit";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { deleteProfileRow, saveProfileRow, type SectionKey } from "./profile-actions";
import { AvailabilityEditor, type Schedule } from "./availability-editor";
import type { ActionState } from "@/lib/validation";

/**
 * The client profile: a checklist of everything a person's file is made of, one section open at a
 * time. The point of the counts and the ticks is that "is this file complete" becomes a glance
 * instead of eight clicks — which is the question a licensor actually asks.
 */

export interface Row { id: string; [k: string]: unknown }
export interface Section {
  key: string;
  label: string;
  /** Rows this section holds. Read-only sections pass their own count. */
  count: number;
  /** Complete enough to tick. */
  done: boolean;
  /** Something is wrong here, not just missing. */
  alert?: boolean;
  /** Only sections backed by a profile table can be edited in a drawer. */
  editable?: SectionKey;
  addLabel?: string;
}

export interface Field { icon?: IconName; label: string; value: ReactNode; /** Render the person's avatar in place of the row icon, as the reference does on Full name. */ avatar?: boolean }
export interface Entity { id: string; fields: Field[]; chips?: ReactNode; raw?: Record<string, unknown> }

export interface ProfileProps {
  personId: string;
  manage: boolean;
  general: Field[];
  sections: Section[];
  /** Entity cards per section key. */
  entities: Record<string, Entity[]>;
  /** Shown instead of cards when a section has nothing in it. */
  blanks: Record<string, string>;
  /** Extra content under the cards, for sections that link out. */
  extras: Record<string, ReactNode>;
  editHref: string;
  /** Drawn on whichever general row sets `avatar`. */
  avatarNode?: ReactNode;
  /** The availability section edits the whole week at once, not one row at a time. */
  schedule: Schedule;
  /** Section to open on arrival, so a link can point at one. */
  initialSection?: string;
}

export function ClientProfile({ personId, manage, general, sections, entities, blanks, extras, editHref, avatarNode, schedule, initialSection }: ProfileProps) {
  const [openKey, setOpenKey] = useState(
    initialSection && sections.some((s) => s.key === initialSection) ? initialSection : sections[0]?.key ?? "contacts",
  );
  const [wide, setWide] = useState(false);
  const [drawer, setDrawer] = useState<{ section: SectionKey; row: Record<string, unknown> | null } | null>(null);
  const [editingWeek, setEditingWeek] = useState(false);
  const current = sections.find((s) => s.key === openKey) ?? sections[0];
  const rows = entities[openKey] ?? [];

  return (
    <div className={cx("relative grid min-h-0 flex-1 gap-0", wide ? "lg:grid-cols-1" : "lg:grid-cols-[420px_minmax(0,1fr)]")}>
      {/* The section list scrolls on its own, so picking a section never moves the whole page. */}
      <div className={cx("border-line py-4 lg:min-h-0 lg:overflow-y-auto lg:pr-4", wide && "hidden")}>
        <div className="rounded-2xl bg-card-soft p-6">
          <div className="mb-4 flex items-center">
            <div className="text-[17px] font-semibold text-text-strong">General information</div>
            {manage && (
              <Link href={editHref} className="ml-auto text-muted-foreground hover:text-text-strong" aria-label="Edit general information">
                <Icon.edit size={15} />
              </Link>
            )}
          </div>
          {general.map((f) => (
            <div key={f.label} className="flex items-center gap-3.5 py-3">
              {f.avatar
                ? <span className="shrink-0">{avatarNode}</span>
                : f.icon && <span className="shrink-0 self-start pt-[2px] text-text-strong">{(() => { const I = Icon[f.icon]; return <I size={20} />; })()}</span>}
              <div className="min-w-0">
                <div className="text-[15px] leading-snug text-muted-foreground">{f.label}</div>
                <div className="min-w-0 break-words text-[15px] font-medium leading-snug text-text-strong">{f.value}</div>
              </div>
            </div>
          ))}
        </div>

        <nav aria-label="Profile sections" className="mt-4">
          {sections.map((s) => {
            const on = s.key === openKey;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setOpenKey(s.key)}
                aria-current={on ? "true" : undefined}
                className={cx(
                  "flex w-full items-center gap-2.5 border-b border-line-soft px-4 py-4 text-left text-[15px] transition-colors",
                  on ? "rounded-r-md bg-primary-soft font-medium text-primary shadow-[inset_4px_0_0_var(--primary)]" : "text-text hover:bg-hover",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                {s.alert ? (
                  <span className="flex h-[17px] min-w-[18px] items-center justify-center rounded-full bg-danger-soft px-1.5 text-[10.5px] font-medium text-danger">!</span>
                ) : s.count > 0 ? (
                  <span className={cx("flex h-[20px] min-w-[21px] items-center justify-center rounded-full px-1.5 text-[12px] tabular-nums", on ? "bg-card text-primary" : "bg-panel text-muted-foreground")}>{s.count}</span>
                ) : null}
                {s.done && <Icon.checkCircle size={16} className={cx("shrink-0", on ? "text-primary" : "text-ok")} />}
                <Icon.chevronRight size={15} className="shrink-0 text-hint" />
              </button>
            );
          })}
        </nav>
      </div>

      {/* The divider is the control: the whole line lights up, not just the small circle. */}
      <button
        type="button"
        onClick={() => setWide((v) => !v)}
        aria-label={wide ? "Show general information" : "Hide general information"}
        aria-expanded={!wide}
        className={cx("group absolute inset-y-0 z-10 hidden w-5 -translate-x-1/2 justify-center lg:flex", wide ? "left-0" : "left-[420px]")}
      >
        <span className="h-full w-px bg-line transition-colors group-hover:bg-primary" />
        <span className="absolute top-5 flex size-6 items-center justify-center rounded-full border border-line bg-card text-muted-foreground shadow-sm transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon.chevronRight size={13} className={wide ? "" : "rotate-180"} />
        </span>
      </button>

      <div className={cx("min-w-0 py-5 lg:min-h-0 lg:overflow-y-auto", wide ? "lg:pl-5" : "lg:pl-8")}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="text-[16.5px] font-semibold text-text-strong">{current?.label}</div>
          <div className="ml-auto flex items-center gap-2">
            {manage && current?.key === "availability" && (
              <button
                type="button"
                onClick={() => setEditingWeek(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-card px-3.5 text-[16.5px] font-medium text-text-strong hover:bg-hover"
              >
                <Icon.edit size={15} />Edit availability
              </button>
            )}
            {manage && current?.editable && current.key !== "availability" && (
              <button
                type="button"
                onClick={() => setDrawer({ section: current.editable!, row: null })}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-card px-3.5 text-[16.5px] font-medium text-text-strong hover:bg-hover"
              >
                <Icon.plus size={14} />{current.addLabel ?? "Add"}
              </button>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          blanks[openKey] === "" ? null : <p className="text-[14.5px] italic text-hint">{blanks[openKey] ?? "Nothing recorded yet."}</p>
        ) : (
          rows.map((e) => (
            <article key={e.id} className="mb-3 flex max-w-[680px] items-start gap-4 rounded-xl border border-line px-5 py-4 transition-colors last:mb-0 hover:border-primary hover:bg-primary-soft">
              <div className="grid min-w-0 flex-1 gap-3">
                {e.fields.map((f, i) => (
                  <div key={i} className="flex min-w-0 gap-2.5">
                    {f.icon && <span className="mt-[2px] shrink-0 text-muted-foreground">{(() => { const I = Icon[f.icon]; return <I size={17} />; })()}</span>}
                    <div className="min-w-0">
                      <div className="text-[13.5px] text-muted-foreground">{f.label}</div>
                      <div className="min-w-0 break-words text-[15px] font-semibold text-text-strong">{f.value}</div>
                    </div>
                  </div>
                ))}
              </div>
              {e.chips && <div className="flex shrink-0 flex-wrap gap-1.5">{e.chips}</div>}
              {manage && current?.editable && current.key !== "availability" && e.raw && (
                <div className="flex shrink-0 gap-1.5">
                  <button type="button" onClick={() => setDrawer({ section: current.editable!, row: e.raw! })} aria-label="Edit" className="flex size-10 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-hover hover:text-text-strong"><Icon.edit size={20} /></button>
                  <DeleteButton personId={personId} section={current.editable} id={e.id} />
                </div>
              )}
            </article>
          ))
        )}

        {extras[openKey] && <div className="mt-4">{extras[openKey]}</div>}
      </div>

      {editingWeek && <AvailabilityEditor personId={personId} initial={schedule} onDone={() => setEditingWeek(false)} />}

      {drawer && (
        <ProfileDrawer
          personId={personId}
          section={drawer.section}
          row={drawer.row}
          onDone={() => setDrawer(null)}
        />
      )}
    </div>
  );
}

function DeleteButton({ personId, section, id }: { personId: string; section: SectionKey; id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [, submit, pending] = useActionState(async (p: ActionState, fd: FormData) => {
    const r = await deleteProfileRow(p, fd);
    if (r.ok) toast.success("Removed.");
    else if (r.error) toast.error(r.error);
    return r;
  }, {});
  if (!confirming) {
    return <button type="button" onClick={() => setConfirming(true)} aria-label="Remove" className="flex size-10 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-danger-soft hover:text-danger"><Icon.trash size={20} /></button>;
  }
  return (
    <form action={submit} className="flex items-center gap-1.5">
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="h-7 rounded-md bg-danger px-2 text-[11.5px] font-medium text-white disabled:opacity-60">{pending ? "Removing…" : "Remove"}</button>
      <button type="button" onClick={() => setConfirming(false)} className="h-7 px-1.5 text-[11.5px] text-muted-foreground hover:text-text-strong">Cancel</button>
    </form>
  );
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const FORMS: Record<SectionKey, { title: string; fields: FieldSpec[] }> = {
  contacts: {
    title: "contact",
    fields: [
      { name: "name", label: "Contact name", required: true },
      { name: "relationship", label: "Relationship", required: true, placeholder: "Mother, sister, guardian…" },
      { name: "phone", label: "Phone number", half: true },
      { name: "email", label: "Email", half: true, type: "email" },
      { name: "isPrimary", label: "Call this person first", type: "checkbox" },
      { name: "isLegalRepresentative", label: "Legal representative", type: "checkbox" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  funding: {
    title: "funding source",
    fields: [
      { name: "payer", label: "Payer", required: true, placeholder: "Minnesota Health Care Programs (MA)" },
      { name: "waiver", label: "Waiver program", type: "select", options: [["", "Not a waiver"], ["CADI", "CADI"], ["BI", "BI"], ["DD", "DD"], ["EW", "EW"], ["CFSS", "CFSS"], ["CAC", "CAC"]] },
      { name: "memberId", label: "Member ID", half: true },
      { name: "priority", label: "Priority", half: true, type: "select", options: [["primary", "Primary"], ["secondary", "Secondary"], ["tertiary", "Tertiary"]] },
      { name: "startDate", label: "Effective from", required: true, half: true, type: "date" },
      { name: "endDate", label: "Through", half: true, type: "date" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  locations: {
    title: "care location",
    fields: [
      { name: "type", label: "Location type", required: true, type: "select", options: [["home", "Home"], ["community", "Community"], ["day_program", "Day program"], ["residential", "Residential site"], ["school", "School"], ["telehealth", "Telehealth"], ["other", "Other"]] },
      { name: "posCode", label: "Place of service", required: true, half: true, placeholder: "12" },
      { name: "label", label: "Name", half: true, placeholder: "Grandma's house" },
      { name: "address1", label: "Street address" },
      { name: "address2", label: "Street address 2" },
      { name: "city", label: "City", half: true },
      { name: "zip", label: "ZIP code", half: true },
      { name: "state", label: "State", half: true, placeholder: "MN" },
      { name: "isDefault", label: "Use this by default", type: "checkbox" },
    ],
  },
  availability: {
    title: "availability",
    fields: [
      { name: "weekday", label: "Day", required: true, type: "select", options: DAYS.map((d, i) => [String(i), d]) },
      { name: "startTime", label: "From", required: true, half: true, type: "time" },
      { name: "endTime", label: "Until", required: true, half: true, type: "time" },
      { name: "notes", label: "Notes", type: "textarea", placeholder: "Prefers mornings, day program until 2pm…" },
    ],
  },
  diagnoses: {
    title: "diagnosis",
    fields: [
      { name: "icdCode", label: "ICD-10 code", required: true, half: true, placeholder: "F84.0" },
      { name: "diagnosedOn", label: "Diagnosed on", half: true, type: "date" },
      { name: "description", label: "Description", required: true },
      { name: "isPrimary", label: "Primary diagnosis", type: "checkbox" },
    ],
  },
};

interface FieldSpec {
  name: string;
  label: string;
  required?: boolean;
  half?: boolean;
  placeholder?: string;
  type?: "text" | "email" | "date" | "time" | "select" | "checkbox" | "textarea";
  options?: [string, string][];
}

function ProfileDrawer({ personId, section, row, onDone }: { personId: string; section: SectionKey; row: Record<string, unknown> | null; onDone: () => void }) {
  const spec = FORMS[section];
  const editing = Boolean(row?.id);
  const [state, submit, pending] = useActionState(async (p: ActionState, fd: FormData) => {
    const r = await saveProfileRow(p, fd);
    if (r.ok) { toast.success(editing ? "Saved." : `Added the ${spec.title}.`); onDone(); }
    else if (r.error) toast.error(r.error);
    return r;
  }, {});

  useEffect(() => { if (state.errors) toast.error("Check the highlighted fields."); }, [state.errors]);

  const value = (n: string) => {
    const v = row?.[n];
    if (v == null) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v);
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onDone(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[380px]">
        <SheetTitle className="sr-only">{editing ? `Edit ${spec.title}` : `Add ${spec.title}`}</SheetTitle>
        <form action={submit} className="flex min-h-full flex-col">
          <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
            <div className="text-[15px] font-medium text-text-strong">{editing ? `Edit ${spec.title}` : `Add ${spec.title}`}</div>
            <button type="button" onClick={onDone} aria-label="Close" className="ml-auto text-muted-foreground hover:text-text-strong"><Icon.plus size={16} className="rotate-45" /></button>
          </div>

          <input type="hidden" name="personId" value={personId} />
          <input type="hidden" name="section" value={section} />
          {editing && <input type="hidden" name="id" value={String(row!.id)} />}

          <div className="grid grid-cols-2 gap-x-3 gap-y-3 px-5 py-4">
            {spec.fields.map((f) => (
              <div key={f.name} className={f.half ? "col-span-1" : "col-span-2"}>
                {f.type === "checkbox" ? (
                  <label className="flex items-center gap-2 text-[12.5px] text-text">
                    <input type="checkbox" name={f.name} value="true" defaultChecked={value(f.name) === "true"} className="size-4 rounded border-line accent-[var(--primary)]" />
                    {f.label}
                  </label>
                ) : (
                  <>
                    <label htmlFor={`f-${f.name}`} className="mb-1 block text-[11.5px] text-text">
                      {f.label}{f.required && <span className="text-danger"> *</span>}
                    </label>
                    {f.type === "select" ? (
                      <select id={`f-${f.name}`} name={f.name} defaultValue={value(f.name)} className="h-8 w-full rounded-md border border-line bg-card px-2 text-[12.5px] text-text">
                        {(f.options ?? []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    ) : f.type === "textarea" ? (
                      <textarea id={`f-${f.name}`} name={f.name} rows={3} defaultValue={value(f.name)} placeholder={f.placeholder} className="w-full rounded-md border border-line bg-card px-2 py-1.5 text-[12.5px] text-text placeholder:text-hint" />
                    ) : (
                      <input id={`f-${f.name}`} name={f.name} type={f.type ?? "text"} defaultValue={value(f.name)} placeholder={f.placeholder} className="h-8 w-full rounded-md border border-line bg-card px-2 text-[12.5px] text-text placeholder:text-hint" />
                    )}
                    {state.errors?.[f.name] && <p className="mt-1 text-[11.5px] text-danger">{state.errors[f.name]}</p>}
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="mt-auto flex items-center gap-4 border-t border-line px-5 py-3.5">
            <button type="submit" disabled={pending} className="inline-flex h-8 items-center rounded-md bg-primary px-3.5 text-[12.5px] font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60">{pending ? "Saving…" : "Save"}</button>
            <button type="button" onClick={onDone} className="text-[12.5px] text-muted-foreground hover:text-text-strong">Cancel</button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Small helper so pages can build chips without importing Badge everywhere. */
export function Chip({ tone, children }: { tone: "ok" | "warn" | "danger" | "neutral" | "accent"; children: ReactNode }) {
  return <Badge tone={tone}>{children}</Badge>;
}
