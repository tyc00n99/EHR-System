import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Organization, Person, VisitTask } from "@/db/schema";
import { labelForCode } from "@/lib/hcpcs";
import { INTERACTION_LEVELS } from "@/lib/templates";

/**
 * Daily service note, one per page, in the app's own faces (Public Sans, Fraunces, Inconsolata).
 * A header table carries the identifying facts a county or auditor scans first; the narrative,
 * supports, and support-plan outcomes fill the wide column; a quiet sidebar holds the clinical
 * facts; the caregiver and the person served sign at the bottom.
 */

export interface NoteMed { name: string; dose: string; time: string; status: string }
export interface NoteOutcome { goal: string; prompt: string; response: string }

export interface PdfNote {
  id: string;
  clockInAt: Date;
  clockOutAt: Date | null;
  serviceCode: string;
  modifiers: string[];
  units: number;
  placeOfService: string;
  shiftNote: string | null;
  interactionLevel: string | null;
  skills: string[];
  tasks: VisitTask[];
  manualEntry: boolean;
  manualEntryReason: string | null;
  clockInLat: number | null;
  clockInLng: number | null;
  clockInAccuracyM: number | null;
  clockOutLat: number | null;
  clockOutLng: number | null;
  clockOutAccuracyM: number | null;
  evvStatus: string;
  staff: string;
  staffTitle: string | null;
  renderingIdType: string;
  renderingId: string;
  staffSignedAt: Date | null;
  clientSignedAt: Date | null;
  clientUnsignedReason: string | null;
  noteSavedAt: Date | null;
  noteSavedLat: number | null;
  noteSavedLng: number | null;
  approvedAt: Date | null;
  approvedByName: string | null;
  agreementNumber: string;
  agreementStart: string;
  agreementEnd: string;
  authorizedUnits: number;
  outcomes: NoteOutcome[];
  meds: NoteMed[];
  edits: number;
}

const INK = "#1b1818", MUTED = "#5e5952", HINT = "#8f897f", LINE = "#d6d1c7", NAVY = "#0b2672", OK = "#1f6b4a", DANGER = "#b3261e", PAPER = "#f4f3ef";
const SANS = "Public Sans", SERIF = "Fraunces", MONO = "Inconsolata";

const s = StyleSheet.create({
  page: { paddingTop: 42, paddingHorizontal: 48, paddingBottom: 54, fontSize: 9.5, fontFamily: SANS, color: INK, lineHeight: 1.4 },
  eyebrowRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 },
  eyebrow: { fontSize: 15, fontFamily: SERIF, fontWeight: 600, color: INK, letterSpacing: -0.2 },
  eyebrowRight: { fontSize: 7.5, letterSpacing: 1.2, textTransform: "uppercase", color: HINT, fontWeight: 600 },
  table: { borderTop: `1.2 solid ${INK}`, borderLeft: `0.75 solid ${LINE}`, borderRight: `0.75 solid ${LINE}`, marginBottom: 18 },
  trow: { flexDirection: "row", borderBottom: `0.75 solid ${LINE}` },
  tcell: { flex: 1, paddingVertical: 6, paddingHorizontal: 9, borderRight: `0.75 solid ${LINE}` },
  tcellLast: { flex: 1, paddingVertical: 6, paddingHorizontal: 9 },
  tk: { fontSize: 6.5, letterSpacing: 1.1, textTransform: "uppercase", color: HINT, marginBottom: 2, fontWeight: 600 },
  tv: { fontSize: 10, color: INK, lineHeight: 1.25, fontWeight: 500 },
  tvBig: { fontSize: 12.5, color: INK, lineHeight: 1.2, fontFamily: SERIF, fontWeight: 600 },
  tvMono: { fontSize: 10, color: INK, fontFamily: MONO, fontWeight: 600, lineHeight: 1.25 },
  ts: { fontSize: 7.5, color: MUTED, marginTop: 1 },
  tsMono: { fontSize: 7.5, color: MUTED, marginTop: 1, fontFamily: MONO },
  columns: { flexDirection: "row", gap: 24 },
  main: { flex: 1.9 },
  side: { flex: 1, borderLeft: `0.75 solid ${LINE}`, paddingLeft: 16 },
  label: { fontSize: 6.8, letterSpacing: 1.2, textTransform: "uppercase", color: NAVY, marginBottom: 5, fontWeight: 700 },
  narrative: { fontSize: 10.5, lineHeight: 1.55, marginBottom: 14 },
  support: { fontSize: 9.5, color: MUTED, marginBottom: 14 },
  outcomeRow: { flexDirection: "row", marginBottom: 6 },
  mark: { width: 30, fontSize: 7, fontWeight: 700, letterSpacing: 0.8, paddingTop: 2 },
  prompt: { fontSize: 9.5, lineHeight: 1.3 },
  goal: { fontSize: 7.5, color: HINT, lineHeight: 1.3 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  tag: { fontSize: 8, color: INK, backgroundColor: PAPER, paddingVertical: 2.5, paddingHorizontal: 6, borderRadius: 3, fontWeight: 500 },
  fact: { marginBottom: 10 },
  factK: { fontSize: 6.8, letterSpacing: 1.2, textTransform: "uppercase", color: HINT, marginBottom: 2, fontWeight: 700 },
  factV: { fontSize: 9.5, fontWeight: 500 },
  factS: { fontSize: 8, color: MUTED, lineHeight: 1.3 },
  ok: { color: OK }, danger: { color: DANGER },
  sigs: { flexDirection: "row", gap: 28, marginTop: 10 },
  sig: { flex: 1 },
  sigName: { fontFamily: SERIF, fontStyle: "italic", fontSize: 16, color: INK, paddingBottom: 3, borderBottom: `0.75 solid ${INK}`, marginBottom: 4, lineHeight: 1.15 },
  sigNameEmpty: { fontFamily: SERIF, fontStyle: "italic", fontSize: 16, color: HINT, paddingBottom: 3, borderBottom: `0.75 solid ${LINE}`, marginBottom: 4, lineHeight: 1.15 },
  sigK: { fontSize: 6.8, letterSpacing: 1.2, textTransform: "uppercase", color: HINT, fontWeight: 700 },
  sigV: { fontSize: 8, color: MUTED, marginTop: 1, lineHeight: 1.3 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 7, color: HINT, textAlign: "center" },
});

const dNum = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "America/Chicago" });
const dDow = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "America/Chicago" });
const tm = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const dt = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const hours = (min: number) => { const h = min / 60; return Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0$/, ""); };
const PLACE: Record<string, string> = { "12": "Home", "99": "Community", "11": "Office", "14": "Residence", "04": "Shelter" };
const MED_STATUS: Record<string, string> = { given: "given", refused: "refused", held: "held", missed: "missed" };

function Fact({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: "ok" | "danger" }) {
  return (
    <View style={s.fact}>
      <Text style={s.factK}>{k}</Text>
      <Text style={[s.factV, tone === "ok" ? s.ok : tone === "danger" ? s.danger : {}]}>{v}</Text>
      {sub ? <Text style={s.factS}>{sub}</Text> : null}
    </View>
  );
}

export function NotesPdf({ org, person, rows, range }: { org: Organization; person: Person; rows: PdfNote[]; range: { from: string | null; to: string | null; code: string } }) {
  const personName = `${person.firstName} ${person.lastName}`;
  const first = person.preferredName || person.firstName;
  const subject = `${rows.length} note${rows.length === 1 ? "" : "s"}${range.code ? ` · ${labelForCode(range.code, [])}` : ""}${range.from ? ` · from ${range.from}` : ""}${range.to ? ` to ${range.to}` : ""}`;

  return (
    <Document title={`Service notes · ${personName}`} author={org.name} subject={subject}>
      {rows.length === 0 && (
        <Page size="LETTER" style={s.page}><Text style={s.eyebrow}>Daily Service Note</Text><Text style={{ marginTop: 10, color: MUTED }}>No notes match this filter for {personName}.</Text></Page>
      )}
      {rows.map((v, i) => {
        const minutes = v.clockOutAt ? Math.round((v.clockOutAt.getTime() - v.clockInAt.getTime()) / 60000) : 0;
        const level = INTERACTION_LEVELS.find((l) => l[0] === v.interactionLevel);
        const supports = [...v.tasks.filter((t) => t.completed).map((t) => t.label), ...v.skills].filter((x, j, a) => a.indexOf(x) === j);
        const medsGiven = v.meds.filter((m) => m.status === "given");
        const medsIssues = v.meds.filter((m) => m.status !== "given");
        const yes = v.outcomes.filter((o) => o.response === "yes").length;
        const code = `${v.serviceCode}${v.modifiers.length ? " " + v.modifiers.join(" ") : ""}`;
        return (
          <Page key={v.id} size="LETTER" style={s.page} wrap>
            <View style={s.eyebrowRow}>
              <Text style={s.eyebrow}>Daily Service Note</Text>
              <Text style={s.eyebrowRight}>{org.name}{org.licenseNumber ? ` · 245D license ${org.licenseNumber}` : ""}</Text>
            </View>

            <View style={s.table}>
              <View style={s.trow}>
                <View style={[s.tcell, { flex: 2.2 }]}><Text style={s.tk}>Client</Text><Text style={s.tvBig}>{personName}</Text><Text style={s.tsMono}>PMI {person.pmi}{person.dob ? `  ·  DOB ${dNum.format(new Date(person.dob + "T12:00:00-05:00"))}` : ""}</Text></View>
                <View style={[s.tcell, { flex: 1.2 }]}><Text style={s.tk}>Date of service</Text><Text style={s.tvMono}>{dNum.format(v.clockInAt)}</Text><Text style={s.ts}>{dDow.format(v.clockInAt)}</Text></View>
                <View style={[s.tcell, { flex: 1.3 }]}><Text style={s.tk}>Time</Text><Text style={s.tvMono}>{tm.format(v.clockInAt)} – {v.clockOutAt ? tm.format(v.clockOutAt) : "open"}</Text></View>
                <View style={[s.tcell, { flex: 0.7 }]}><Text style={s.tk}>Hours</Text><Text style={s.tvMono}>{hours(minutes)}</Text></View>
                <View style={[s.tcellLast, { flex: 0.7 }]}><Text style={s.tk}>Units</Text><Text style={s.tvMono}>{v.units}</Text></View>
              </View>
              <View style={s.trow}>
                <View style={[s.tcell, { flex: 2.2 }]}><Text style={s.tk}>Service</Text><Text style={s.tv}>{labelForCode(v.serviceCode, v.modifiers)}</Text></View>
                <View style={[s.tcell, { flex: 1.2 }]}><Text style={s.tk}>Service code</Text><Text style={s.tvMono}>{code}</Text></View>
                <View style={[s.tcell, { flex: 1.3 }]}><Text style={s.tk}>Caregiver</Text><Text style={s.tv}>{v.staff}</Text>{v.staffTitle ? <Text style={s.ts}>{v.staffTitle}</Text> : null}</View>
                <View style={[s.tcellLast, { flex: 1.4 }]}><Text style={s.tk}>Setting</Text><Text style={s.tv}>{PLACE[v.placeOfService] ?? "On site"}</Text><Text style={s.ts}>POS {v.placeOfService}</Text></View>
              </View>
            </View>

            <View style={s.columns}>
              <View style={s.main}>
                <Text style={s.label}>Service narrative</Text>
                <Text style={s.narrative}>{v.shiftNote?.trim() || "No narrative was documented for this service."}</Text>

                {supports.length > 0 && (
                  <>
                    <Text style={s.label}>Supports provided</Text>
                    <View style={[s.tags, { marginBottom: 14 }]}>{supports.map((x) => <Text key={x} style={s.tag}>{x}</Text>)}</View>
                  </>
                )}

                <Text style={s.label}>Support plan outcomes{v.outcomes.length ? `  ·  ${yes} of ${v.outcomes.length} addressed` : ""}</Text>
                {v.outcomes.length === 0 ? <Text style={s.support}>No outcome measures were active for {first} on this date.</Text> : v.outcomes.map((o, j) => (
                  <View key={j} style={s.outcomeRow} wrap={false}>
                    <Text style={[s.mark, o.response === "yes" ? s.ok : o.response === "no" ? s.danger : { color: HINT }]}>{o.response === "yes" ? "YES" : o.response === "no" ? "NO" : "N/A"}</Text>
                    <Text style={{ flex: 1 }}><Text style={s.prompt}>{o.prompt}</Text>{"\n"}<Text style={s.goal}>{o.goal}</Text></Text>
                  </View>
                ))}
              </View>

              <View style={s.side}>
                <Fact k="Level of assistance" v={level ? level[1] : "Not documented"} sub={level ? level[2] : undefined} />
                <Fact k="Medication administration" v={v.meds.length === 0 ? "None scheduled" : medsIssues.length === 0 ? `${medsGiven.length} administered as scheduled` : `${medsIssues.length} not administered`} sub={v.meds.length ? v.meds.map((m) => `${m.name} ${m.dose}, ${m.time}${m.status !== "given" ? ` · ${MED_STATUS[m.status] ?? m.status}` : ""}`).join("\n") : undefined} tone={medsIssues.length ? "danger" : undefined} />
                <Fact k="Incidents" v="None reported" />
                <Fact k="Visit verification" v={v.manualEntry ? "Manual entry" : "EVV, GPS at clock-in and clock-out"} sub={v.manualEntry ? v.manualEntryReason ?? undefined : v.clockInLat != null ? `${v.clockInLat.toFixed(4)}, ${v.clockInLng?.toFixed(4)}` : undefined} tone={v.manualEntry ? undefined : "ok"} />
                {v.edits > 0 && <Fact k="Corrections" v={`${v.edits} after signing`} sub="Detail in the audit log" />}
              </View>
            </View>

            <View style={s.sigs} wrap={false}>
              <View style={s.sig}>
                <Text style={s.sigName}>{v.staff}</Text>
                <Text style={s.sigK}>Caregiver signature</Text>
                <Text style={s.sigV}>{v.staffSignedAt ? `Signed electronically ${dt.format(v.staffSignedAt)}` : "Not yet signed"} · {v.renderingIdType.toUpperCase()} {v.renderingId}</Text>
              </View>
              <View style={s.sig}>
                <Text style={v.clientSignedAt ? s.sigName : s.sigNameEmpty}>{v.clientSignedAt ? personName : " "}</Text>
                <Text style={s.sigK}>Client signature</Text>
                <Text style={s.sigV}>{v.clientSignedAt ? `Signed with private client code ${dt.format(v.clientSignedAt)}` : v.clientUnsignedReason ? `Not signed · ${v.clientUnsignedReason}` : "Not signed"}</Text>
              </View>
            </View>

            <Text style={s.footer} fixed>{personName} · PMI {person.pmi} · {dNum.format(v.clockInAt)} · Confidential · {org.name} · Note {i + 1} of {rows.length}</Text>
          </Page>
        );
      })}
    </Document>
  );
}
