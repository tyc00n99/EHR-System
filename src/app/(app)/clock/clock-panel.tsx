"use client";

import { startTransition, useActionState, useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, Checkbox, Field, FormError, Select, Textarea } from "@/components/ui";
import { clockIn, clockOut } from "../visits/actions";

interface AgreementOption { id: string; personId: string; personName: string; label: string; unitsLeft: number | null; oriented: boolean }
interface OpenVisit { id: string; personName: string; clockInAt: string; tasks: { code: string; label: string; completed: boolean }[]; serviceCode: string }

type Fix = { lat: number; lng: number; accuracy?: number };

function getPosition(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("This device does not support location."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? "Location permission was denied. Enable location for this site to clock in." : "Could not get your location. Move to an open area and try again.")),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

function useElapsed(since: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const mins = Math.max(0, Math.round((now - new Date(since).getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

/** Wraps a server action so the form submit first acquires a GPS fix and appends it. */
function useGpsSubmit(dispatch: (fd: FormData) => void) {
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string>();
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setGpsError(undefined);
    setLocating(true);
    try {
      const fix = await getPosition();
      fd.set("lat", String(fix.lat));
      fd.set("lng", String(fix.lng));
      if (fix.accuracy != null) fd.set("accuracy", String(fix.accuracy));
      startTransition(() => dispatch(fd));
    } catch (err) {
      setGpsError(err instanceof Error ? err.message : "Location failed.");
    } finally {
      setLocating(false);
    }
  };
  return { onSubmit, locating, gpsError };
}

function ClientSignature({ error, reasonError }: { error?: string; reasonError?: string }) {
  const [unable, setUnable] = useState(false);
  return (
    <div className="rounded-lg border border-line bg-sidebar p-4">
      <div className="font-medium text-text-strong">Client signature</div>
      <p className="mt-0.5 text-[13px] text-muted">Read the note to the person, then hand them the phone to enter their signing code.</p>
      {!unable && (
        <Field label="Client signing code" error={error} className="mt-3">
          <input name="clientCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" className="h-14 w-full rounded-md border border-line bg-page text-center text-[28px] font-bold tracking-[0.35em] tabular-nums focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300/50" />
        </Field>
      )}
      <label className="mt-3 flex items-center gap-3 text-[13px]">
        <input type="checkbox" name="unableToSign" value="true" checked={unable} onChange={(ev) => setUnable(ev.target.checked)} className="h-[18px] w-[18px] accent-[var(--accent)]" />
        <span>The person is unable to sign right now</span>
      </label>
      {unable && (
        <Field label="Why" error={reasonError} className="mt-3" hint="A supervisor reviews unsigned visits.">
          <Textarea name="unableReason" required className="min-h-20" placeholder="Asleep at end of shift; guardian not present" />
        </Field>
      )}
    </div>
  );
}

export function ClockPanel({ open, agreements, tasks, places, isDsp }: { open: OpenVisit | null; agreements: AgreementOption[]; tasks: { code: string; label: string }[]; places: { code: string; label: string }[]; isDsp: boolean }) {
  return open ? <ClockOutPanel open={open} /> : <ClockInPanel agreements={agreements} tasks={tasks} places={places} isDsp={isDsp} />;
}

function ClockInPanel({ agreements, tasks, places, isDsp }: { agreements: AgreementOption[]; tasks: { code: string; label: string }[]; places: { code: string; label: string }[]; isDsp: boolean }) {
  const [state, dispatch, pending] = useActionState(clockIn, {});
  const { onSubmit, locating, gpsError } = useGpsSubmit(dispatch);
  const people = useMemo(() => Array.from(new Map(agreements.map((a) => [a.personId, a.personName])).entries()), [agreements]);
  const [personId, setPersonId] = useState(people[0]?.[0] ?? "");
  const options = agreements.filter((a) => a.personId === personId);
  const oriented = options[0]?.oriented ?? true;
  const e = state.errors ?? {};

  if (agreements.length === 0) {
    return <div className="rounded-lg border border-line bg-card p-5"><div className="font-medium text-text-strong">Nothing to clock against</div><p className="mt-1 text-[13px] text-muted">{isDsp ? "You have no assigned clients with an active service agreement today. Ask your supervisor to assign you." : "No client has an active service agreement today. A supervisor needs to add one first."}</p></div>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <p className="text-muted">Clock in</p>
        <h1>Start a visit</h1>
      </div>
      <FormError message={gpsError ?? state.message} />
      <Field label="Client" error={e.personId}>
        <Select name="personId" value={personId} onChange={(ev) => setPersonId(ev.target.value)} className="h-11 text-base">
          {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </Select>
      </Field>
      <Field label="Service" error={e.serviceAgreementId}>
        <Select name="serviceAgreementId" key={personId} defaultValue={options[0]?.id ?? ""} className="h-11 text-base">
          {options.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </Select>
      </Field>
      <Field label="Where" error={e.placeOfService}>
        <Select name="placeOfService" defaultValue="12" className="h-11 text-base">
          {places.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
        </Select>
      </Field>
      <fieldset>
        <legend className="mb-1 block text-xs font-medium text-muted">Planned tasks</legend>
        <div className="divide-y divide-line-soft rounded-md border border-line">
          {tasks.map((t) => (
            <Checkbox key={t.code} name="tasks[]" value={t.code} label={t.label} className="py-3" />
          ))}
        </div>
      </fieldset>
      {!oriented && (
        <div className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-warn">
          <div className="font-medium">Orientation needed first</div>
          Your supervisor has not recorded your orientation to this person&apos;s support plan and needs. 245D requires it before unsupervised contact.
        </div>
      )}
      <Button type="submit" className="h-12 w-full text-base" disabled={pending || locating || !oriented}>
        {locating ? "Getting your location…" : pending ? "Clocking in…" : "Clock in"}
      </Button>
      <p className="text-center text-xs text-muted">Your location is recorded at clock-in and clock-out for electronic visit verification.</p>
    </form>
  );
}

function ClockOutPanel({ open }: { open: OpenVisit }) {
  const [state, dispatch, pending] = useActionState(clockOut, {});
  const { onSubmit, locating, gpsError } = useGpsSubmit(dispatch);
  const elapsed = useElapsed(open.clockInAt);
  const e = state.errors ?? {};
  const since = new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(open.clockInAt));

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <input type="hidden" name="visitId" value={open.id} />
      <div className="rounded-lg border border-blue-300 bg-blue-100 px-4 py-3.5">
        <p className="text-[13px] font-medium text-accent">Visit in progress</p>
        <h2 className="mt-0.5">{open.personName}</h2>
        <p className="mt-1 text-[13px] text-muted">{open.serviceCode} · since {since}</p>
        <p className="mt-2 text-[28px] font-bold leading-none tracking-[-0.02em] text-text-strong tabular-nums">{elapsed}</p>
      </div>
      <FormError message={gpsError ?? state.message} />
      {open.tasks.length > 0 && (
        <fieldset>
          <legend className="mb-1 block text-xs font-medium text-muted">Tasks completed</legend>
          <div className="divide-y divide-line-soft rounded-md border border-line">
            {open.tasks.map((t) => (
              <Checkbox key={t.code} name="completedTasks[]" value={t.code} defaultChecked={t.completed} label={t.label} className="py-3" />
            ))}
          </div>
        </fieldset>
      )}
      <Field label="Shift note" error={e.shiftNote} hint="What happened, how the person did, anything the next shift needs to know.">
        <Textarea name="shiftNote" required className="min-h-36 text-base" />
      </Field>
      <ClientSignature error={e.clientCode} reasonError={e.unableReason} />
      <Button type="submit" className="h-12 w-full text-base" disabled={pending || locating}>
        {locating ? "Getting your location…" : pending ? "Clocking out…" : "Clock out"}
      </Button>
    </form>
  );
}
