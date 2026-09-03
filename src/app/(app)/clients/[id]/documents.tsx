"use client";

import { useActionState, useTransition } from "react";
import { Button, Field, FormError, Input, Select, Textarea } from "@/components/kit";
import { DOCUMENT_CATEGORIES } from "@/lib/validation";
import { deleteClientDocument, uploadClientDocument } from "../document-actions";

export function DocumentUpload({ personId }: { personId: string }) {
  const [state, submit, pending] = useActionState(uploadClientDocument.bind(null, personId), {});
  const e = state.errors ?? {};
  return (
    <form action={submit} key={pending ? "p" : "i"}>
      <FormError message={state.message} />
      <div className="grid gap-3 md:grid-cols-6">
        <Field label="Type" error={e.category} className="md:col-span-2"><Select name="category" defaultValue="support_plan">{DOCUMENT_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Title" error={e.title} className="md:col-span-4"><Input name="title" placeholder="CSSP 2026–2027, IAPP signed 7/1/26, Q3 goals…" required /></Field>
        <Field label="File" error={e.file} hint="PDF, image, Word, or text · up to 25 MB" className="col-span-2 md:col-span-4">
          <input type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.heic,.doc,.docx,.txt,application/pdf,image/*" className="block h-9 w-full text-[13px] file:mr-3 file:h-9 file:rounded-md file:border file:border-line file:bg-page file:px-3 file:text-[13px] file:font-medium hover:file:bg-hover" />
        </Field>
        <Field label="Effective date" error={e.effectiveOn} className="md:col-span-2"><Input name="effectiveOn" type="date" /></Field>
        <Field label="Note for staff" error={e.note} className="col-span-2 md:col-span-5"><Textarea name="note" className="min-h-14" placeholder="What staff should know before opening this" /></Field>
        <div className="flex items-end md:col-span-1"><Button type="submit" variant="secondary" disabled={pending} className="h-9 w-full">{pending ? "Uploading…" : "Upload"}</Button></div>
      </div>
    </form>
  );
}

export function DeleteDocument({ id, personId }: { id: string; personId: string }) {
  const [pending, start] = useTransition();
  return <button disabled={pending} onClick={() => { if (confirm("Delete this file? Staff will no longer be able to open it.")) start(() => deleteClientDocument(id, personId)); }} className="text-xs font-medium text-danger hover:underline disabled:opacity-50">Delete</button>;
}
