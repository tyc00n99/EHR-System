"use client";

import { useActionState, useEffect, useTransition } from "react";
import { Icon } from "@/components/icons";
import { Button, Field, FormError, Input, Select } from "@/components/kit";
import type { DocumentType } from "@/db/schema";
import { deleteClientDocument, setClientDocumentArchived, uploadClientDocument } from "../document-actions";
import { DateInput } from "@/components/date-input";

export function DocumentUpload({ personId, types, defaultTypeId, onDone }: { personId: string; types: DocumentType[]; defaultTypeId?: string; onDone?: () => void }) {
  const choices = [...types.filter((t) => t.active && t.required), ...types.filter((t) => t.active && !t.required)];
  const [state, submit, pending] = useActionState(uploadClientDocument.bind(null, personId), {});
  const e = state.errors ?? {};
  useEffect(() => { if (state.ok) onDone?.(); }, [state, onDone]);
  return (
    <form action={submit} key={pending ? "p" : "i"}>
      <FormError message={state.message} />
      <div className="grid gap-3 md:grid-cols-6">
        <Field label="Type" error={e.documentTypeId} className="md:col-span-2"><Select name="documentTypeId" defaultValue={defaultTypeId ?? choices[0]?.id}>{choices.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
        <Field label="Title" error={e.title} className="md:col-span-4"><Input name="title" placeholder="CSSP 2026–2027, IAPP signed 7/1/26, Q3 goals…" required /></Field>
        <Field label="File" error={e.file} hint="PDF, image, Word, or text · up to 25 MB" className="col-span-2 md:col-span-4">
          <input type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.heic,.doc,.docx,.txt,application/pdf,image/*" className="block h-9 w-full text-[13px] file:mr-3 file:h-9 file:rounded-md file:border file:border-line file:bg-page file:px-3 file:text-[13px] file:font-medium hover:file:bg-hover" />
        </Field>
        <Field label="Effective date" error={e.effectiveOn} className="md:col-span-2"><DateInput name="effectiveOn" /></Field>
        <div className="flex items-end md:col-span-1"><Button type="submit" variant="secondary" disabled={pending} className="h-9 w-full">{pending ? "Uploading…" : "Upload"}</Button></div>
      </div>
    </form>
  );
}

export function DeleteDocument({ id, personId, icon }: { id: string; personId: string; icon?: boolean }) {
  const [pending, start] = useTransition();
  const onClick = () => { if (confirm("Delete this file? Staff will no longer be able to open it.")) start(() => deleteClientDocument(id, personId)); };
  if (icon) return <button disabled={pending} onClick={onClick} aria-label="Delete" title="Delete" className={ICON_BTN + " text-danger"}><Icon.trash size={15} /></button>;
  return <button disabled={pending} onClick={onClick} className="text-[13px] font-medium text-danger hover:underline disabled:opacity-50">Delete</button>;
}

export function ArchiveDocument({ id, personId, archived, icon }: { id: string; personId: string; archived: boolean; icon?: boolean }) {
  const [pending, start] = useTransition();
  const onClick = () => start(() => setClientDocumentArchived(id, personId, !archived));
  const label = archived ? "Restore" : "Archive";
  if (icon) return <button disabled={pending} onClick={onClick} aria-label={label} title={label} className={ICON_BTN + " text-muted-foreground"}>{archived ? <Icon.history size={15} /> : <Icon.archive size={15} />}</button>;
  return <button disabled={pending} onClick={onClick} className="text-[13px] font-medium text-muted-foreground hover:underline disabled:opacity-50">{label}</button>;
}

const ICON_BTN = "flex size-[30px] items-center justify-center rounded-lg border border-line bg-card hover:bg-hover disabled:opacity-50";
