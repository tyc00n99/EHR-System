import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Person } from "@/db/schema";
import { labelForCode } from "@/lib/hcpcs";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1b1818" },
  h1: { fontSize: 18, fontFamily: "Times-Roman", marginBottom: 2 },
  meta: { fontSize: 9, color: "#5e5952", marginBottom: 14 },
  note: { borderTop: "1 solid #d6d1c7", paddingTop: 10, marginBottom: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  label: { fontSize: 8, color: "#857f76", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6, marginBottom: 2 },
  mono: { fontFamily: "Courier", fontSize: 9 },
  body: { lineHeight: 1.35 },
  sig: { fontSize: 8.5, color: "#5e5952", marginTop: 6 },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 8, color: "#857f76", flexDirection: "row", justifyContent: "space-between" },
});

const dt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" });

export interface PdfVisit { id: string; clockInAt: Date; clockOutAt: Date | null; serviceCode: string; modifiers: string[]; units: number; placeOfService: string; shiftNote: string | null; interactionLevel: string | null; skills: string[]; staff: string; staffSignedAt: Date | null; clientSignedAt: Date | null; approvedAt: Date | null; manualEntry: boolean; renderingIdType: string; renderingId: string }

export function NotesPdf({ org, person, rows, range }: { org: string; person: Person; rows: PdfVisit[]; range: { from: string | null; to: string | null; code: string } }) {
  const units = rows.reduce((n, r) => n + r.units, 0);
  return (
    <Document title={`Progress notes · ${person.firstName} ${person.lastName}`} author={org}>
      <Page size="LETTER" style={s.page} wrap>
        <Text style={s.h1}>Progress notes · {person.firstName} {person.lastName}</Text>
        <Text style={s.meta}>{org} · PMI {person.pmi} · {person.waiverProgram} waiver · {range.code ? `${labelForCode(range.code, [])} (${range.code}) · ` : ""}{range.from ?? "start"} to {range.to ?? "today"} · {rows.length} notes · {units} units</Text>
        {rows.map((v) => (
          <View key={v.id} style={s.note} wrap={false}>
            <View style={s.row}>
              <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold" }}>{dt.format(v.clockInAt)}{v.clockOutAt ? ` – ${new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "America/Chicago" }).format(v.clockOutAt)}` : ""}</Text>
              <Text style={s.mono}>{v.serviceCode} {v.modifiers.join(" ")} · {v.units} units · POS {v.placeOfService}</Text>
            </View>
            <Text style={{ color: "#5e5952" }}>{labelForCode(v.serviceCode, v.modifiers)} · {v.staff} ({v.renderingIdType.toUpperCase()} {v.renderingId}){v.manualEntry ? " · manual entry" : ""}</Text>
            {(v.interactionLevel || v.skills.length > 0) && <><Text style={s.label}>Documentation</Text><Text>{v.interactionLevel ? `Level of interaction: ${v.interactionLevel}. ` : ""}{v.skills.length ? `Skills worked on: ${v.skills.join(", ")}.` : ""}</Text></>}
            <Text style={s.label}>Progress review</Text>
            <Text style={s.body}>{v.shiftNote ?? "No note recorded."}</Text>
            <Text style={s.sig}>Caregiver signed {v.staffSignedAt ? dt.format(v.staffSignedAt) : "—"} · Client signed {v.clientSignedAt ? dt.format(v.clientSignedAt) : "not signed"} · Supervisor approved {v.approvedAt ? dt.format(v.approvedAt) : "—"}</Text>
          </View>
        ))}
        {rows.length === 0 && <Text>No notes match this filter.</Text>}
        <View style={s.footer} fixed><Text>Confidential · {org}</Text><Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} /></View>
      </Page>
    </Document>
  );
}
