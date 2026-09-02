"use client";

import { useActionState, useState, useTransition } from "react";
import { Badge, Button, Field, FormError, Input, Select, Textarea } from "@/components/ui";
import { addAssignment, addCredential, createLogin, deleteCredential, endAssignment, markOriented, updateLogin } from "../actions";

/* ---------- credentials ---------- */

export function CredentialForm({ staffId, types }: { staffId: string; types: { type: string; label: string }[] }) {
  const [state, submit, pending] = useActionState(addCredential.bind(null, staffId), {});
  const e = state.errors ?? {};
  return (
    <form action={submit} key={pending ? "p" : "i"}>
      <FormError message={state.message} />
      <div className="grid gap-3 md:grid-cols-6">
        <Field label="Type" error={e.type} className="md:col-span-2"><Select name="type" defaultValue="annual_training">{types.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}</Select></Field>
        <Field label="Title" error={e.title} className="md:col-span-4"><Input name="title" placeholder="Person-centered practices, Red Cross First Aid, Background study clearance…" required /></Field>
        <Field label="Completed on" error={e.completedOn} className="md:col-span-2"><Input name="completedOn" type="date" required /></Field>
        <Field label="Expires on" error={e.expiresOn} hint="Certificates and licenses" className="md:col-span-2"><Input name="expiresOn" type="date" /></Field>
        <Field label="Hours" error={e.hours} hint="Training time" className="md:col-span-1"><Input name="hours" type="number" step="0.5" min={0} /></Field>
        <div className="flex items-end md:col-span-1"><Button type="submit" variant="secondary" disabled={pending} className="h-9 w-full">{pending ? "Saving…" : "Add"}</Button></div>
        <Field label="Note" error={e.note} className="md:col-span-6"><Textarea name="note" className="min-h-14" placeholder="Provider, certificate number, or what was covered" /></Field>
      </div>
    </form>
  );
}

export function DeleteCredential({ id, staffId }: { id: string; staffId: string }) {
  const [pending, start] = useTransition();
  return <button disabled={pending} onClick={() => { if (confirm("Remove this credential record?")) start(() => deleteCredential(id, staffId)); }} className="text-xs font-medium text-danger hover:underline disabled:opacity-50">Remove</button>;
}

/* ---------- assignments ---------- */

interface AssignmentRow { id: string; active: boolean; orientedOn: string | null; personId: string; name: string; pmi: string; status: string }

export function AssignmentPanel({ staffId, assignments, candidates }: { staffId: string; assignments: AssignmentRow[]; candidates: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [personId, setPersonId] = useState(candidates[0]?.id ?? "");
  const [msg, setMsg] = useState<string>();
  const active = assignments.filter((a) => a.active);
  return (
    <div>
      {active.length === 0 ? <p className="px-5 py-4 text-[13px] text-muted">No clients assigned. This caregiver cannot clock in until someone is assigned.</p> : (
        <ul className="divide-y divide-line-soft">
          {active.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-text-strong">{a.name} <span className="text-xs font-normal text-muted tabular-nums">PMI {a.pmi}</span></div>
                <div className="text-[13px] text-muted">{a.orientedOn ? `Oriented to this person ${a.orientedOn}` : "Not yet oriented to this person's plan and needs"}</div>
              </div>
              {a.orientedOn ? <Badge tone="ok">oriented</Badge> : (
                <button disabled={pending} onClick={() => start(() => markOriented(a.id, staffId))} className="inline-flex h-7 items-center rounded-md bg-accent-soft px-2.5 text-xs font-medium text-accent hover:bg-blue-300/40 disabled:opacity-50">Mark oriented today</button>
              )}
              <button disabled={pending} onClick={() => { if (confirm(`End ${a.name}'s assignment?`)) start(() => endAssignment(a.id, staffId)); }} className="text-xs font-medium text-danger hover:underline disabled:opacity-50">End</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-3 border-t border-line-soft bg-sidebar px-5 py-4">
        <Field label="Assign a client" className="min-w-64 flex-1" error={msg}>
          <Select value={personId} onChange={(e) => setPersonId(e.target.value)} disabled={candidates.length === 0}>
            {candidates.length === 0 ? <option value="">Everyone is already assigned</option> : candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Button variant="secondary" className="h-9" disabled={pending || !personId} onClick={() => start(async () => { const r = await addAssignment(staffId, personId); setMsg(r.message); })}>{pending ? "Saving…" : "Assign"}</Button>
      </div>
    </div>
  );
}

/* ---------- login ---------- */

interface LoginInfo { id: string; email: string; role: "admin" | "supervisor" | "dsp"; active: boolean }

export function LoginPanel({ staffId, login, defaultEmail, isSelf }: { staffId: string; login: LoginInfo | null; defaultEmail: string; isSelf: boolean }) {
  const [createState, create, creating] = useActionState(createLogin.bind(null, staffId), {});
  const [updateState, update, updating] = useActionState(login ? updateLogin.bind(null, login.id, staffId) : createLogin.bind(null, staffId), {});
  if (!login) {
    const e = createState.errors ?? {};
    return (
      <form action={create} className="space-y-3">
        <p className="text-[13px] text-muted">No login yet. Create one so this person can clock in.</p>
        <FormError message={createState.message} />
        <Field label="Email" error={e.email}><Input name="email" type="email" defaultValue={defaultEmail} required /></Field>
        <Field label="Role" error={e.role}><Select name="role" defaultValue="dsp"><option value="dsp">Direct support</option><option value="supervisor">Supervisor</option><option value="admin">Administrator</option></Select></Field>
        <Field label="Temporary password" error={e.password} hint="At least 10 characters. They can change it under My profile."><Input name="password" type="text" autoComplete="off" required /></Field>
        <Button type="submit" disabled={creating} className="w-full">{creating ? "Creating…" : "Create login"}</Button>
      </form>
    );
  }
  const e = updateState.errors ?? {};
  return (
    <form action={update} className="space-y-3">
      <div className="flex items-center justify-between"><span className="truncate text-[13px] font-medium text-text-strong">{login.email}</span><Badge tone={login.active ? "ok" : "neutral"}>{login.active ? "active" : "disabled"}</Badge></div>
      <FormError message={updateState.message} />
      <Field label="Role" error={e.role}><Select name="role" defaultValue={login.role} disabled={isSelf}><option value="dsp">Direct support</option><option value="supervisor">Supervisor</option><option value="admin">Administrator</option></Select></Field>
      <Field label="Reset password" error={e.password} hint="Leave blank to keep the current one"><Input name="password" type="text" autoComplete="off" /></Field>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="active" defaultChecked={login.active} disabled={isSelf} className="h-4 w-4 accent-[var(--accent)]" /> Login enabled</label>
      <Button type="submit" variant="outline" disabled={updating} className="w-full">{updating ? "Saving…" : "Save login"}</Button>
    </form>
  );
}
