import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/**
 * An approved assistant draft as it is filed in a client's Documents (Oct 18, 2026). Plain and
 * printable: the agency and client at the top, the text as the reviewer approved it, and a footer
 * line saying it was drafted with AI and who reviewed and approved it, and when. Built-in
 * Helvetica, so no font files have to be traced into the server bundle.
 */
const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 54, fontFamily: "Helvetica", fontSize: 10.5, lineHeight: 1.45, color: "#000" },
  org: { fontSize: 9, color: "#555", marginBottom: 6 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 16, marginBottom: 10 },
  meta: { flexDirection: "row", gap: 18, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: "#999", paddingVertical: 6, marginBottom: 16 },
  label: { fontSize: 8, color: "#555", textTransform: "uppercase", letterSpacing: 0.6 },
  value: { fontSize: 10 },
  heading: { fontFamily: "Helvetica-Bold", fontSize: 11.5, marginTop: 8, marginBottom: 3 },
  para: { marginBottom: 7 },
  bullet: { flexDirection: "row", marginBottom: 3 },
  footer: { position: "absolute", bottom: 26, left: 54, right: 54, fontSize: 8, color: "#555", borderTopWidth: 0.5, borderColor: "#bbb", paddingTop: 5 },
});

export interface ApprovedReport {
  org: string;
  title: string;
  kindLabel: string;
  client: { name: string; pmi: string };
  body: string;
  approvedBy: string;
  approvedAt: string;
}

/** Blank lines split paragraphs; a short line with no full stop reads as a heading; "- " lines are bullets. */
function blocks(body: string) {
  return body.replace(/\r/g, "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
}

export function ReportPdf({ r }: { r: ApprovedReport }) {
  return (
    <Document title={r.title} author={r.org}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.org}>{r.org}</Text>
        <Text style={s.title}>{r.title}</Text>
        <View style={s.meta}>
          <View><Text style={s.label}>Client</Text><Text style={s.value}>{r.client.name}</Text></View>
          <View><Text style={s.label}>PMI</Text><Text style={s.value}>{r.client.pmi}</Text></View>
          <View><Text style={s.label}>Document</Text><Text style={s.value}>{r.kindLabel}</Text></View>
          <View><Text style={s.label}>Approved</Text><Text style={s.value}>{r.approvedAt}</Text></View>
        </View>
        {blocks(r.body).map((b, i) => {
          const lines = b.split("\n");
          if (lines.length === 1 && b.length < 70 && !/[.:;?!]$/.test(b)) return <Text key={i} style={s.heading} minPresenceAhead={40}>{b.replace(/^#+\s*/, "")}</Text>;
          return (
            <View key={i} style={s.para}>
              {lines.map((l, j) => /^\s*[-•*]\s+/.test(l)
                ? <View key={j} style={s.bullet} wrap={false}><Text style={{ width: 12 }}>•</Text><Text style={{ flex: 1 }}>{l.replace(/^\s*[-•*]\s+/, "")}</Text></View>
                : <Text key={j}>{l.replace(/^#+\s*/, "")}</Text>)}
            </View>
          );
        })}
        <Text style={s.footer} fixed>Drafted with the EVVora assistant from the records cited in the app. Reviewed, edited as needed, and approved by {r.approvedBy} on {r.approvedAt}.</Text>
      </Page>
    </Document>
  );
}
