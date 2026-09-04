import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Organization, Person, VisitTask } from "@/db/schema";
import { labelForCode } from "@/lib/hcpcs";
import { INTERACTION_LEVELS } from "@/lib/templates";
import { timesheetPages, type TimesheetGroup } from "./timesheet-pdf";

/**
 * Daily service note, one per page. One type family throughout (Public Sans); Great Vibes is used only for the signatures.
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
  activities: string[];
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

const INK = "#1b1818", MUTED = "#1b1818", HINT = "#1b1818", GHOST = "#8f897f", LINE = "#d6d1c7", NAVY = "#0b2672", OK = "#1f6b4a", DANGER = "#b3261e";
const SANS = "EB Garamond", SCRIPT = "Great Vibes";

const s = StyleSheet.create({
  page: { paddingTop: 42, paddingHorizontal: 48, paddingBottom: 54, fontSize: 10.5, fontFamily: SANS, color: INK, lineHeight: 1.4 },
  eyebrowRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `1.2 solid ${INK}`, paddingBottom: 7 },
  eyebrow: { fontSize: 16, fontWeight: 600, color: INK, letterSpacing: -0.1 },
  eyebrowRight: { fontSize: 7.5, letterSpacing: 1.2, textTransform: "uppercase", color: HINT, fontWeight: 600 },
  band: { backgroundColor: "#f5f4f0", borderRadius: 5, paddingHorizontal: 11, marginTop: 10, marginBottom: 15 },
  brow: { flexDirection: "row", paddingTop: 5.5, paddingBottom: 6, borderBottom: `0.75 solid #e4e0d6` },
  browLast: { flexDirection: "row", paddingTop: 5.5, paddingBottom: 6 },
  blast: { borderRight: 0, paddingRight: 0, marginRight: 0 },
  tvName: { fontSize: 10.5, color: INK, lineHeight: 1.15, fontWeight: 600 },
  tsCode: { fontSize: 10, color: INK, fontWeight: 600, letterSpacing: 0.3 },
  bcell: { paddingRight: 8, marginRight: 8, borderRight: `0.75 solid #e4e0d6` },
  tk: { fontSize: 6, letterSpacing: 1, textTransform: "uppercase", color: HINT, marginBottom: 1.5, fontWeight: 600 },
  tv: { fontSize: 10, color: INK, lineHeight: 1.15, fontWeight: 500 },
  tvNum: { fontSize: 10.5, color: INK, lineHeight: 1.15, fontWeight: 600 },
  ts: { fontSize: 8, color: MUTED, marginTop: 1.5 },
  columns: { flexDirection: "row", gap: 24 },
  main: { flex: 1.9 },
  side: { flex: 1, borderLeft: `0.75 solid ${LINE}`, paddingLeft: 16 },
  label: { fontSize: 6.8, letterSpacing: 1.2, textTransform: "uppercase", color: NAVY, marginBottom: 5, fontWeight: 700 },
  narrative: { fontSize: 11.5, lineHeight: 1.55, marginBottom: 14 },
  support: { fontSize: 9.5, color: MUTED, marginBottom: 14 },
  outcomeRow: { flexDirection: "row", marginBottom: 6 },
  mark: { width: 30, fontSize: 7, fontWeight: 700, letterSpacing: 0.8, paddingTop: 2 },
  prompt: { fontSize: 10.5, lineHeight: 1.3 },
  goal: { fontSize: 8.2, color: HINT, lineHeight: 1.3 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  tag: { fontSize: 8, color: "#6b4a0c", backgroundColor: "#f4e8cd", border: "0.6 solid #e3cf9f", paddingVertical: 2.5, paddingHorizontal: 7, borderRadius: 10, fontWeight: 600 },
  fact: { marginBottom: 10 },
  factK: { fontSize: 6.8, letterSpacing: 1.2, textTransform: "uppercase", color: HINT, marginBottom: 2, fontWeight: 700 },
  factV: { fontSize: 10.5, fontWeight: 500 },
  factS: { fontSize: 9.5, color: MUTED, lineHeight: 1.35 },
  activity: { fontSize: 9, color: INK, lineHeight: 1.35, marginBottom: 3 },
  ok: { color: OK }, danger: { color: DANGER },
  ack: { marginTop: 10, borderTop: `1.2 solid ${INK}`, paddingTop: 8 },
  ackTitle: { fontSize: 6.8, letterSpacing: 1.2, textTransform: "uppercase", color: NAVY, marginBottom: 6, fontWeight: 700 },
  sigs: { flexDirection: "row", gap: 24 },
  sig: { flex: 1 },
  ackText: { fontSize: 8, color: MUTED, lineHeight: 1.4, marginTop: 6 },
  ackLead: { fontWeight: 700, color: INK },
  evv: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#f5f4f0", borderRadius: 5, paddingHorizontal: 11, paddingVertical: 6, marginTop: 12 },
  evvLabel: { fontSize: 6, letterSpacing: 1, textTransform: "uppercase", color: HINT, fontWeight: 600 },
  evvValue: { fontSize: 9.5, fontWeight: 600, color: INK },
  sigBox: { borderLeft: `2 solid ${NAVY}`, paddingLeft: 8, paddingTop: 2, paddingBottom: 2 },
  sigBoxEmpty: { borderLeft: `2 solid ${LINE}`, paddingLeft: 8, paddingTop: 2, paddingBottom: 2 },
  sigBy: { fontSize: 6.5, color: NAVY, letterSpacing: 0.6, fontWeight: 600 },
  sigByEmpty: { fontSize: 6.5, color: GHOST, letterSpacing: 0.6, fontWeight: 600 },
  sigName: { fontFamily: SCRIPT, fontSize: 22, color: INK, lineHeight: 1.2, marginTop: 1 },
  sigNameEmpty: { fontFamily: SCRIPT, fontSize: 22, color: LINE, lineHeight: 1.2, marginTop: 1 },
  sigId: { fontSize: 8, color: HINT, marginTop: 3, letterSpacing: 0.2 },
  sigK: { fontSize: 6.8, letterSpacing: 1.2, textTransform: "uppercase", color: HINT, fontWeight: 700, marginTop: 4 },
  sigV: { fontSize: 8, color: MUTED, marginTop: 1, lineHeight: 1.3 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 7, color: GHOST, textAlign: "center" },
});

const dNum = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "America/Chicago" });
const dDow = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "America/Chicago" });
const dAbbr = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Chicago" });
const tm = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const dt = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const hours = (min: number) => { const h = min / 60; return Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0$/, ""); };
const PLACE: Record<string, string> = { "12": "Home", "99": "Community", "11": "Office", "14": "Residence", "04": "Shelter" };
const MED_STATUS: Record<string, string> = { given: "given", refused: "refused", held: "held", missed: "missed" };
/** Short service names for the header band; the full name still appears in the app and on billing exports. */
const shortTitle = (t: string) => t.replace(/^Direct support professional$/i, "DSP").replace(/^Designated (coordinator|manager)$/i, (m) => m);
const shortService = (label: string) => label.replace(/,\s*1:\d$/, "").replace(/^Individualized home supports/i, "IHS").replace(/^Individual community living support \(ICLS\)$/i, "ICLS").replace(/^Independent living skills/i, "ILS");

function Fact({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: "ok" | "danger" }) {
  return (
    <View style={s.fact}>
      <Text style={s.factK}>{k}</Text>
      <Text style={[s.factV, tone === "ok" ? s.ok : tone === "danger" ? s.danger : {}]}>{v}</Text>
      {sub ? <Text style={s.factS}>{sub}</Text> : null}
    </View>
  );
}

export function NotesPdf({ org, person, rows, range, summary }: { org: Organization; person: Person; rows: PdfNote[]; range: { from: string | null; to: string | null; code: string }; summary?: { groups: TimesheetGroup[]; from: Date; to: Date } }) {
  const personName = `${person.firstName} ${person.lastName}`;
  const first = person.preferredName || person.firstName;
  const subject = `${rows.length} note${rows.length === 1 ? "" : "s"}${range.code ? ` · ${labelForCode(range.code, [])}` : ""}${range.from ? ` · from ${range.from}` : ""}${range.to ? ` to ${range.to}` : ""}`;

  return (
    <Document title={`Service notes · ${personName}`} author={org.name} subject={subject}>
      {summary && summary.groups.length > 0 ? timesheetPages(org, person, summary.groups, summary.from, summary.to) : null}
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

            <View style={s.band}>
              <View style={s.brow}>
                <View style={[s.bcell, { flex: 2 }]}><Text style={s.tk}>Client</Text><Text style={s.tvName}>{personName}</Text></View>
                <View style={[s.bcell, { flex: 1.15 }]}><Text style={s.tk}>PMI #</Text><Text style={s.tvNum}>{person.pmi}</Text></View>
                <View style={[s.bcell, { flex: 1.15 }]}><Text style={s.tk}>Date of birth</Text><Text style={s.tvNum}>{person.dob ? dNum.format(new Date(person.dob + "T12:00:00-05:00")) : "—"}</Text></View>
                <View style={[s.bcell, { flex: 1.3 }]}><Text style={s.tk}>Date of service</Text><Text style={s.tvNum}>{dNum.format(v.clockInAt)}</Text></View>
                <View style={[s.bcell, s.blast, { flex: 1.6 }]}><Text style={s.tk}>Setting</Text><Text style={s.tv}>{PLACE[v.placeOfService] ?? "On site"}  ·  POS {v.placeOfService}</Text></View>
              </View>
              <View style={s.browLast}>
                <View style={[s.bcell, { flex: 2.8 }]}><Text style={s.tk}>Service</Text><Text style={s.tv}>{shortService(labelForCode(v.serviceCode, v.modifiers))}, <Text style={s.tsCode}>{code}</Text></Text></View>
                <View style={[s.bcell, { flex: 0.8 }]}><Text style={s.tk}>Hours</Text><Text style={s.tvNum}>{hours(minutes)}</Text></View>
                <View style={[s.bcell, { flex: 0.8 }]}><Text style={s.tk}>Units</Text><Text style={s.tvNum}>{v.units}</Text></View>
                <View style={[s.bcell, { flex: 1.5 }]}><Text style={s.tk}>Time</Text><Text style={s.tvNum}>{tm.format(v.clockInAt)} – {v.clockOutAt ? tm.format(v.clockOutAt) : "open"}</Text></View>
                <View style={[s.bcell, s.blast, { flex: 1.3 }]}><Text style={s.tk}>Caregiver</Text><Text style={s.tv}>{v.staff}{v.staffTitle ? `, ${shortTitle(v.staffTitle)}` : ""}</Text></View>
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
                    <Text style={[s.mark, o.response === "yes" ? s.ok : o.response === "no" ? s.danger : { color: GHOST }]}>{o.response === "yes" ? "YES" : o.response === "no" ? "NO" : "N/A"}</Text>
                    <Text style={{ flex: 1 }}><Text style={s.prompt}>{o.prompt}</Text>{"\n"}<Text style={s.goal}>{o.goal}</Text></Text>
                  </View>
                ))}
              </View>

              <View style={s.side}>
                <Fact k="Level of assistance" v={level ? level[1] : "Not documented"} sub={level ? level[2] : undefined} />
                <View style={s.fact}>
                  <Text style={s.factK}>Daily activities</Text>
                  {v.activities.length === 0 ? <Text style={s.factS}>None selected</Text> : v.activities.map((a, j) => <Text key={j} style={s.activity}>•  {a}</Text>)}
                </View>
                <Fact k="Medication administration" v={v.meds.length === 0 ? "None scheduled" : medsIssues.length === 0 ? `${medsGiven.length} administered as scheduled` : `${medsIssues.length} not administered`} sub={v.meds.length ? v.meds.map((m) => `${m.name} ${m.dose}, ${m.time}${m.status !== "given" ? ` · ${MED_STATUS[m.status] ?? m.status}` : ""}`).join("\n") : undefined} tone={medsIssues.length ? "danger" : undefined} />
                <Fact k="Incidents" v="None reported" />
                {v.edits > 0 && <Fact k="Corrections" v={`${v.edits} after signing`} sub="Detail in the audit log" />}
              </View>
            </View>

            <View style={s.ack} wrap={false}>
              <Text style={s.ackTitle}>Acknowledgement and required signatures</Text>
              <View style={s.sigs}>
                <View style={s.sig}>
                  <View style={v.staffSignedAt ? s.sigBox : s.sigBoxEmpty}>
                    <Text style={v.staffSignedAt ? s.sigBy : s.sigByEmpty}>{v.staffSignedAt ? "Electronically signed by:" : "Awaiting signature"}</Text>
                    <Text style={v.staffSignedAt ? s.sigName : s.sigNameEmpty}>{v.staff}</Text>
                    <Text style={s.sigId}>{v.staffSignedAt ? `${dt.format(v.staffSignedAt)} CT · ${v.renderingIdType.toUpperCase()} ${v.renderingId}` : " "}</Text>
                  </View>
                  <Text style={s.sigK}>Caregiver signature</Text>
                </View>
                <View style={s.sig}>
                  <View style={v.clientSignedAt ? s.sigBox : s.sigBoxEmpty}>
                    <Text style={v.clientSignedAt ? s.sigBy : s.sigByEmpty}>{v.clientSignedAt ? "Electronically signed by:" : v.clientUnsignedReason ? `Not signed · ${v.clientUnsignedReason}` : "Awaiting signature"}</Text>
                    <Text style={v.clientSignedAt ? s.sigName : s.sigNameEmpty}>{v.clientSignedAt ? personName : " "}</Text>
                    <Text style={s.sigId}>{v.clientSignedAt ? `${dt.format(v.clientSignedAt)} CT · verified with private client code` : " "}</Text>
                  </View>
                  <Text style={s.sigK}>Client signature</Text>
                </View>
              </View>
              <View style={s.sigs}>
                <Text style={[s.ackText, { flex: 1 }]}><Text style={s.ackLead}>Caregiver.</Text>  I certify under penalty of law that I personally provided the services described here, and that the date, times, hours, and units on this note are true and complete. I understand that falsifying a service record is fraud and may lead to criminal prosecution, civil penalties, and loss of my employment.</Text>
                <Text style={[s.ackText, { flex: 1 }]}><Text style={s.ackLead}>Person served.</Text>  I have reviewed this note. I certify that I received this service on the date and during the times shown, from the caregiver named here, as authorized in my support plan. If anything above is wrong I will not sign, and I will tell the provider so it can be corrected. I understand that knowingly giving false information for Medical Assistance payment is a crime.</Text>
              </View>

              <View style={s.evv}>
                <Text style={s.evvLabel}>Visit verification</Text>
                <Text style={[s.evvValue, v.manualEntry ? {} : s.ok]}>{v.manualEntry ? `Manual entry · ${v.manualEntryReason ?? "reason not recorded"}` : "Electronic visit verification, GPS captured at clock-in and clock-out"}</Text>
              </View>
            </View>

            <Text style={s.footer} fixed>{personName} · PMI {person.pmi} · {dNum.format(v.clockInAt)} · Confidential · {org.name} · Note {i + 1} of {rows.length}</Text>
          </Page>
        );
      })}
    </Document>
  );
}
