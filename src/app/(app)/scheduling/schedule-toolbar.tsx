"use client";

import { FilterMenu } from "@/components/filter-menu";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";

/**
 * The two control rows above the schedule, in the reference's order: title and date/view/mode on
 * the first, filters and the two actions on the second. Everything writes to the query string, so
 * a schedule someone is looking at can be linked to.
 */

export interface ToolbarState {
  mode: "clients" | "team";
  view: "daily" | "weekly" | "monthly";
  date: string;
  rangeLabel: string;
  prev: string;
  next: string;
  today: string;
  dept: string;
  q: string;
  code: string;
  status: string;
  staff: string;
}

export interface Participant { id: string; name: string }

const VIEWS = [
  ["daily", "Daily"],
  ["weekly", "Weekly"],
  ["monthly", "Monthly"],
] as const;

const STATUSES = [
  ["scheduled", "Booked"],
  ["in_progress", "In progress"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
  ["missed", "Missed"],
] as const;

/** The reference's focus treatment: the border turns teal and a soft blue ring sits outside it. */
const FOCUS = "focus-within:border-primary focus-within:ring-4 focus-within:ring-primary-soft focus:border-primary focus:ring-4 focus:ring-primary-soft";
const CONTROL = cx("own-focus rounded-lg border border-line bg-card text-[14.5px] text-text transition-[box-shadow,border-color]", FOCUS);

/** A chosen value sits inside the field as a grey chip with its own ✕, as the reference draws it. */
function Chip({ label, onClear, clearLabel }: { label: string; onClear: () => void; clearLabel: string }) {
  return (
    <span className="flex h-7 max-w-full items-center gap-2 rounded-md bg-card-soft px-2.5 text-[14.5px] text-text-strong">
      <span className="truncate">{label}</span>
      <button type="button" onClick={onClear} aria-label={clearLabel} className="text-[13px] text-muted-foreground hover:text-text-strong">✕</button>
    </span>
  );
}

/** The departments field: placeholder, or the chosen department as a chip, with a list underneath. */
function ChipSelect({ value, options, placeholder, onChange }: { value: string; options: Participant[]; placeholder: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const chosen = options.find((o) => o.id === value);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={placeholder}
        className={cx(CONTROL, "flex h-10 w-[320px] items-center gap-2 px-2 text-left", open && "border-primary ring-4 ring-primary-soft")}
      >
        {chosen ? (
          <Chip label={chosen.name} clearLabel={`Clear ${chosen.name}`} onClear={() => { setOpen(false); onChange(""); }} />
        ) : (
          <span className="px-1 text-hint">{placeholder}</span>
        )}
        <Icon.sort size={13} className="ml-auto shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div role="listbox" className="absolute left-0 top-full z-30 mt-1.5 w-full rounded-lg border border-line bg-card py-1.5 shadow-lg">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === value}
              onClick={() => { setOpen(false); onChange(o.id); }}
              className={cx("block w-full px-3 py-1.5 text-left text-[14.5px] hover:bg-hover", o.id === value ? "text-primary" : "text-text-strong")}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScheduleToolbar({
  state, departments, participants, services, careTeam, canManage, alerts,
}: {
  state: ToolbarState;
  departments: Participant[];
  participants: { clients: Participant[]; team: Participant[] };
  services: { code: string; label: string }[];
  careTeam: Participant[];
  canManage: boolean;
  alerts: number;
}) {
  const router = useRouter();
  const [showAlerts, setShowAlerts] = useState(true);

  const go = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ mode: state.mode, view: state.view, date: state.date, dept: state.dept, q: state.q, code: state.code, status: state.status, staff: state.staff, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    router.push(`/scheduling?${p}`);
  };

  return (
    <div className="shrink-0 px-6 pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-[32px] leading-none">{state.mode === "team" ? "Team schedule" : "Client schedule"}</h1>

        <div className="flex items-center rounded-lg border border-line">
          <Link href={state.prev} aria-label="Previous" className="flex h-9 w-10 items-center justify-center rounded-l-lg text-muted-foreground hover:bg-hover hover:text-text-strong">
            <Icon.chevronLeft size={16} />
          </Link>
          <Link href={state.today} className="flex h-9 items-center border-x border-line px-4 text-[14.5px] font-medium text-primary hover:bg-hover">Today</Link>
          <span className="flex h-9 items-center px-4 text-[14.5px] text-text-strong">{state.rangeLabel}</span>
          <Link href={state.next} aria-label="Next" className="flex h-9 w-10 items-center justify-center rounded-r-lg border-l border-line text-muted-foreground hover:bg-hover hover:text-text-strong">
            <Icon.chevronRight size={16} />
          </Link>
        </div>

        <FilterMenu aria-label="Calendar view" value={state.view} onChange={(v) => go({ view: v })} className="font-medium" options={VIEWS.map(([v, label]) => ({ value: v, label }))} />

        <div className="flex items-center rounded-lg border border-line bg-panel p-0.5">
          {(["team", "clients"] as const).map((m) => (
            <Link
              key={m}
              href={`/scheduling?${new URLSearchParams({ mode: m, view: state.view, date: state.date })}`}
              className={cx("flex h-8 items-center rounded-md px-4 text-[14.5px] font-medium", state.mode === m ? "bg-card text-text-strong shadow-sm" : "text-muted-foreground hover:text-text-strong")}
            >
              {m === "team" ? "Team" : "Clients"}
            </Link>
          ))}
        </div>

        <Link href="/scheduling/settings" aria-label="Schedule settings" className="flex size-9 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-hover hover:text-text-strong">
          <Icon.settings size={16} />
        </Link>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5 border-b border-line pb-3.5">
        <ChipSelect value={state.dept} options={departments} placeholder="Select departments" onChange={(dept) => go({ dept })} />

        <ParticipantSearch value={state.q} participants={participants} onPick={(q) => go({ q })} />

        <FilterPopover state={state} services={services} careTeam={careTeam} onApply={(patch) => go(patch)} />

        <div className="ml-auto flex items-center gap-2.5">
          <span className="relative text-muted-foreground">
            <Icon.bell size={18} />
            {alerts > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[13px] font-semibold leading-none text-white">{alerts}</span>
            )}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={showAlerts}
            aria-label="Show action items"
            onClick={() => setShowAlerts((v) => !v)}
            className={cx("relative h-6 w-11 rounded-full transition-colors", showAlerts ? "bg-primary" : "bg-gray-300")}
          >
            <span className={cx("absolute top-0.5 size-5 rounded-full bg-white transition-all", showAlerts ? "left-[22px]" : "left-0.5")} />
          </button>

          {canManage && (
            <>
              <Link href="/scheduling/bulk" className="flex h-10 items-center gap-2 rounded-lg bg-primary-soft px-4 text-[14.5px] font-medium text-primary hover:bg-primary-soft/70">
                <Icon.edit size={15} />Bulk action
              </Link>
              <Link href={`/scheduling/new?date=${state.date}`} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[14.5px] font-medium text-primary-foreground hover:bg-primary-hover">
                <Icon.plus size={15} />New event
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The participant search, as the reference does it: type-ahead over both groups at once, with the
 * results listed under "Clients" and "Team Members" headings and the field ringed in blue while it
 * has focus. Picking a name filters the grid to that person.
 */
function ParticipantSearch({ value, participants, onPick }: { value: string; participants: { clients: Participant[]; team: Participant[] }; onPick: (q: string) => void }) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  // Once a name has been picked it sits in the field as a chip; typing starts again from empty.
  const picked = [...participants.clients, ...participants.team].find((p) => p.name === value);
  const needle = text.trim().toLowerCase();
  const hit = (p: Participant) => !needle || p.name.toLowerCase().includes(needle);
  const groups = [
    { label: "Clients", rows: participants.clients.filter(hit) },
    { label: "Team Members", rows: participants.team.filter(hit) },
  ];
  const any = groups.some((g) => g.rows.length);

  return (
    <div ref={box} className="relative">
      <form
        onSubmit={(e) => { e.preventDefault(); setOpen(false); onPick(text.trim()); }}
        className={cx(CONTROL, "flex h-10 w-[330px] items-center gap-2 px-2")}
      >
        {picked ? (
          <>
            <Chip label={picked.name} clearLabel={`Clear ${picked.name}`} onClear={() => { setText(""); setOpen(false); onPick(""); }} />
            <input aria-label="Search for event participants" readOnly value="" className="sr-only" />
          </>
        ) : (
          <input
            value={text}
            onChange={(e) => { setText(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search for event participants"
            aria-label="Search for event participants"
            role="combobox"
            aria-expanded={open}
            aria-controls="participant-results"
            className="min-w-0 flex-1 bg-transparent text-[14.5px] text-text outline-none placeholder:text-hint"
          />
        )}
        {!picked && text ? (
          <button type="button" onClick={() => { setText(""); setOpen(false); onPick(""); }} aria-label="Clear search" className="text-muted-foreground hover:text-text-strong">✕</button>
        ) : (
          <Icon.sort size={13} className="ml-auto shrink-0 text-muted-foreground" />
        )}
      </form>

      {open && !picked && (
        <div id="participant-results" role="listbox" className="absolute left-0 top-full z-30 mt-1.5 max-h-80 w-full overflow-y-auto rounded-lg border border-line bg-card py-2 shadow-lg">
          {!any && <p className="px-4 py-2 text-[14px] text-muted-foreground">No one matches.</p>}
          {groups.map((g) => g.rows.length > 0 && (
            <div key={g.label} className="px-2 pb-1">
              <div className="flex items-center gap-3 px-2 pb-1 pt-1.5">
                <span className="shrink-0 text-[13.5px] text-hint">{g.label}</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              {g.rows.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setText(p.name); setOpen(false); onPick(p.name); }}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-[14.5px] text-text-strong hover:bg-hover"
                >
                  {p.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5">
      <div className="mb-1.5 text-[14.5px] text-text-strong">{label}</div>
      {children}
    </div>
  );
}

/** The filter button opens the reference's Filters panel: event type, event status, care team. */
function FilterPopover({ state, services, careTeam, onApply }: { state: ToolbarState; services: { code: string; label: string }[]; careTeam: Participant[]; onApply: (patch: Record<string, string>) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(state.code);
  const [status, setStatus] = useState(state.status);
  const [staff, setStaff] = useState(state.staff);
  const box = useRef<HTMLDivElement>(null);
  const active = [state.code, state.status, state.staff].filter(Boolean).length;

  useEffect(() => {
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Filters"
        aria-expanded={open}
        className={cx("own-focus relative flex size-10 items-center justify-center rounded-lg border text-muted-foreground hover:bg-hover hover:text-text-strong focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary-soft", open ? "border-primary ring-4 ring-primary-soft" : "border-line")}
      >
        <Icon.filter size={16} />
        {active > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[13px] font-semibold leading-none text-white">{active}</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-[300px] rounded-lg border border-line bg-card p-4 shadow-lg">
          <Field label="Event types">
            <FilterMenu aria-label="Event types" value={code} onChange={setCode} className="h-10 w-full" options={[{ value: "", label: "Select a session type" }, ...services.map((s) => ({ value: s.code, label: s.label }))]} />
          </Field>
          <Field label="Event status">
            <FilterMenu aria-label="Event status" value={status} onChange={setStatus} className="h-10 w-full" options={[{ value: "", label: "Select an event status" }, ...STATUSES.map(([v, l]) => ({ value: v, label: l }))]} />
          </Field>
          <Field label="Client's care team">
            <FilterMenu aria-label="Client's care team" value={staff} onChange={setStaff} className="h-10 w-full" options={[{ value: "", label: "Select a team member" }, ...careTeam.map((s) => ({ value: s.id, label: s.name }))]} />
          </Field>
          <div className="mt-4 flex items-center justify-between">
            <button type="button" onClick={() => { setCode(""); setStatus(""); setStaff(""); setOpen(false); onApply({ code: "", status: "", staff: "" }); }} className="h-10 rounded-lg border border-line px-4 text-[14.5px] font-medium text-text-strong hover:bg-hover">
              Reset filters
            </button>
            <button type="button" onClick={() => { setOpen(false); onApply({ code, status, staff }); }} className="h-10 rounded-lg bg-primary px-5 text-[14.5px] font-medium text-primary-foreground hover:bg-primary-hover">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
