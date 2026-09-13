"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Td } from "@/components/kit";

export interface NoteRow { id: string; when: string; client: string; personId: string; code: string; units: number; status: string; unsigned: boolean }

/**
 * The staff record's note list. The whole row opens the printed note (`?note=`), as rows do on
 * every other note list, and the link keeps `tab=visits` so closing the preview lands back here
 * rather than on Overview. The client name is its own link to the client, so it stops the row click.
 */
export function NoteRows({ staffId, rows }: { staffId: string; rows: NoteRow[] }) {
  const router = useRouter();
  const open = (id: string) => router.push(`/staff/${staffId}?tab=visits&note=${id}`, { scroll: false });
  return (
    <tbody>
      {rows.map((v) => (
        <tr
          key={v.id}
          onClick={() => open(v.id)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(v.id); } }}
          tabIndex={0}
          role="link"
          aria-label={`Open the note from ${v.when} with ${v.client}`}
          className="cursor-pointer border-t border-line-soft transition-colors hover:bg-hover focus-visible:bg-hover"
        >
          <Td strong>{v.when}</Td>
          <Td><Link href={`/clients/${v.personId}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{v.client}</Link></Td>
          <Td className="tabular-nums">{v.code}</Td>
          <Td align="right">{v.units}</Td>
          <Td><span className="flex gap-1"><Badge tone={v.status === "completed" ? "ok" : v.status === "void" ? "neutral" : "accent"}>{v.status.replace("_", " ")}</Badge>{v.unsigned && <Badge tone="danger">unsigned</Badge>}</span></Td>
        </tr>
      ))}
    </tbody>
  );
}
