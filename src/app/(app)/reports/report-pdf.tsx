import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * Generic tabular report, letter size, matching the notes PDF styling (Helvetica body, Times title, Courier numbers).
 * Columns can be right-aligned for numbers; a totals row is rendered when provided.
 */
export interface PdfColumn { key: string; label: string; width: number; align?: "left" | "right"; mono?: boolean }
export type PdfRow = Record<string, string | number>;

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Public Sans", color: "#1b1818" },
  h1: { fontSize: 18, fontFamily: "Fraunces", fontWeight: 600, marginBottom: 2 },
  meta: { fontSize: 9, color: "#5e5952", marginBottom: 12 },
  head: { flexDirection: "row", borderBottom: "1 solid #1b1818", paddingBottom: 4, marginBottom: 2 },
  headCell: { fontSize: 7.5, color: "#857f76", textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "Inconsolata" },
  row: { flexDirection: "row", borderBottom: "0.5 solid #e3dfd6", paddingVertical: 4 },
  total: { flexDirection: "row", borderTop: "1 solid #1b1818", paddingTop: 5, marginTop: 2 },
  mono: { fontFamily: "Inconsolata" },
  bold: { fontWeight: 700 },
  footer: { position: "absolute", bottom: 18, left: 36, right: 36, fontSize: 8, color: "#857f76", flexDirection: "row", justifyContent: "space-between" },
  summary: { flexDirection: "row", gap: 24, marginBottom: 14 },
  sumLabel: { fontSize: 7.5, color: "#857f76", textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "Inconsolata" },
  sumValue: { fontSize: 14, fontFamily: "Fraunces", fontWeight: 600, marginTop: 1 },
});

type Style = (typeof s)[keyof typeof s];

export function ReportPdf({ title, org, subtitle, columns, rows, totals, summary, landscape }: {
  title: string; org: string; subtitle: string; columns: PdfColumn[]; rows: PdfRow[]; totals?: PdfRow; summary?: { label: string; value: string }[]; landscape?: boolean;
}) {
  const cell = (c: PdfColumn, r: PdfRow, extra?: Style) => (
    <Text key={c.key} style={[{ width: c.width, textAlign: c.align ?? "left", paddingRight: 6 }, c.mono ? s.mono : {}, extra ?? {}]}>{r[c.key] ?? ""}</Text>
  );
  const generated = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date());
  return (
    <Document title={title} author={org}>
      <Page size="LETTER" orientation={landscape ? "landscape" : "portrait"} style={s.page} wrap>
        <Text style={s.h1}>{title}</Text>
        <Text style={s.meta}>{org} · {subtitle} · Generated {generated}</Text>
        {summary && summary.length > 0 && (
          <View style={s.summary}>
            {summary.map((x) => <View key={x.label}><Text style={s.sumLabel}>{x.label}</Text><Text style={s.sumValue}>{x.value}</Text></View>)}
          </View>
        )}
        <View style={s.head} fixed>{columns.map((c) => <Text key={c.key} style={[s.headCell, { width: c.width, textAlign: c.align ?? "left", paddingRight: 6 }]}>{c.label}</Text>)}</View>
        {rows.map((r, i) => <View key={i} style={s.row} wrap={false}>{columns.map((c) => cell(c, r))}</View>)}
        {rows.length === 0 && <Text style={{ marginTop: 8, color: "#5e5952" }}>Nothing to report for this period.</Text>}
        {totals && <View style={s.total}>{columns.map((c) => cell(c, totals, s.bold))}</View>}
        <View style={s.footer} fixed><Text>Confidential · {org}</Text><Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} /></View>
      </Page>
    </Document>
  );
}
