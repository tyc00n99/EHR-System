import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Organization, Person, VisitTask } from "@/db/schema";
import { labelForCode } from "@/lib/hcpcs";
import { INTERACTION_LEVELS } from "@/lib/templates";

/**
 * Daily service note, one per page. Reads like a page from a well-kept journal rather than a form:
 * the person's name as the headline, one line of facts, the narrative as the centerpiece, a quiet
 * sidebar of what an auditor needs, and three real signature lines at the bottom. Hubble palette:
 * paper, ink, navy, with the mono face reserved for numbers.
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

const INK = "#1b1818", MUTED = "#5e5952", HINT = "#9a948a", LINE = "#d6d1c7", NAVY = "#0b2672", OK = "#1f6b4a", DANGER = "#b3261e", PAPER = "#f4f3ef";

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingHorizontal: 50, paddingBottom: 56, fontSize: 9.5, fontFamily: "Helvetica", color: INK, lineHeight: 1.35 },
  eyebrowRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  eyebrow: { fontSize: 7.5, letterSpacing: 1.4, textTransform: "uppercase", color: NAVY, fontFamily: "Helvetica-Bold" },
  eyebrowRight: { fontSize: 7.5, letterSpacing: 1.4, textTransform: "uppercase", color: HINT },
  name: { fontSize: 26, fontFamily: "Times-Roman", lineHeight: 1.1, marginBottom: 4 },
  facts: { fontSize: 10, color: MUTED, marginBottom: 2 },
  factsMono: { fontFamily: "Courier", fontSize: 9.5, color: INK },
  service: { fontSize: 10, color: MUTED },
  rule: { borderTop: `1.2 solid ${INK}`, marginTop: 12, marginBottom: 16 },
  columns: { flexDirection: "row", gap: 26 },
  main: { flex: 1.9 },
  side: { flex: 1, borderLeft: `0.75 solid ${LINE}`, paddingLeft: 16 },
  label: { fontSize: 7, letterSpacing: 1.2, textTransform: "uppercase", color: HINT, marginBottom: 5, fontFamily: "Helvetica-Bold" },
  narrative: { fontSize: 10.5, lineHeight: 1.5, marginBottom: 14 },
  support: { fontSize: 9.5, color: MUTED, marginBottom: 14 },
  outcomeRow: { flexDirection: "row", marginBottom: 6 },
  mark: { width: 30, fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, paddingTop: 1.5 },
  prompt: { fontSize: 9.5, lineHeight: 1.3 },
  goal: { fontSize: 7.5, color: HINT, lineHeight: 1.3 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  tag: { fontSize: 8, color: INK, backgroundColor: PAPER, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3 },
  fact: { marginBottom: 10 },
  factK: { fontSize: 7, letterSpacing: 1.2, textTransform: "uppercase", color: HINT, marginBottom: 2, fontFamily: "Helvetica-Bold" },
  factV: { fontSize: 9.5 },
  factS: { fontSize: 8, color: MUTED, lineHeight: 1.3 },
  ok: { color: OK }, danger: { color: DANGER }, mono: { fontFamily: "Courier" },
  sigs: { flexDirection: "row", gap: 18, marginTop: 8 },
  sig: { flex: 1 },
  sigName: { fontFamily: "Times-Italic", fontSize: 15, color: INK, paddingBottom: 3, borderBottom: `0.75 solid ${INK}`, marginBottom: 4, lineHeight: 1.1 },
  sigNameEmpty: { fontFamily: "Times-Italic", fontSize: 15, color: HINT, paddingBottom: 3, borderBottom: `0.75 solid ${LINE}`, marginBottom: 4, lineHeight: 1.1 },
  sigK: { fontSize: 7, letterSpacing: 1.2, textTransform: "uppercase", color: HINT, fontFamily: "Helvetica-Bold" },
  sigV: { fontSize: 8, color: MUTED, marginTop: 1, lineHeight: 1.3 },
  footer: { position: "absolute", bottom: 26, left: 50, right: 50, fontSize: 7, color: HINT, textAlign: "center" },
});

const dLong = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
const dShort = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
const tm = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const dt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const hours = (min: number) => { const h = min / 60; return `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, "")} hour${h === 1 ? "" : "s"}`; };
const PLACE: Record<string, string> = { "12": "at home", "99": "in the community", "11": "at the office", "14": "at the residence", "04": "at the shelter" };
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
        <Page size="LETTER" style={s.page}><Text style={s.eyebrow}>Daily service note</Text><Text style={s.name}>{personName}</Text><Text style={s.facts}>No notes match this filter.</Text></Page>
      )}
      {rows.map((v, i) => {
        const minutes = v.clockOutAt ? Math.round((v.clockOutAt.getTime() - v.clockInAt.getTime()) / 60000) : 0;
        const level = INTERACTION_LEVELS.find((l) => l[0] === v.interactionLevel);
        const supports = [...v.tasks.filter((t) => t.completed).map((t) => t.label), ...v.skills].filter((x, j, a) => a.indexOf(x) === j);
        const medsGiven = v.meds.filter((m) => m.status === "given");
        const medsIssues = v.meds.filter((m) => m.status !== "given");
        const yes = v.outcomes.filter((o) => o.response === "yes").length;
        return (
          <Page key={v.id} size="LETTER" style={s.page} wrap>
            <View style={s.eyebrowRow}>
              <Text style={s.eyebrow}>Daily service note</Text>
              <Text style={s.eyebrowRight}>{org.name}{org.licenseNumber ? ` · 245D ${org.licenseNumber}` : ""}</Text>
            </View>
            <Text style={s.name}>{personName}</Text>
            <Text style={s.facts}>{dLong.format(v.clockInAt)}  ·  <Text style={s.factsMono}>{tm.format(v.clockInAt)} – {v.clockOutAt ? tm.format(v.clockOutAt) : "open"}</Text>  ·  <Text style={s.factsMono}>{hours(minutes)}</Text>  ·  <Text style={s.factsMono}>{v.units} units</Text></Text>
            <Text style={s.service}>{labelForCode(v.serviceCode, v.modifiers)} with {v.staff}, {PLACE[v.placeOfService] ?? "on site"}</Text>
            <View style={s.rule} />

            <View style={s.columns}>
              <View style={s.main}>
                <Text style={s.label}>What happened today</Text>
                <Text style={s.narrative}>{v.shiftNote?.trim() || "No narrative was written for this service."}</Text>

                {supports.length > 0 && (
                  <>
                    <Text style={s.label}>Supports provided</Text>
                    <View style={[s.tags, { marginBottom: 14 }]}>{supports.map((x) => <Text key={x} style={s.tag}>{x}</Text>)}</View>
                  </>
                )}

                <Text style={s.label}>Support plan outcomes{v.outcomes.length ? `  ·  ${yes} of ${v.outcomes.length} today` : ""}</Text>
                {v.outcomes.length === 0 ? <Text style={s.support}>No outcome questions were active for {first} on this date.</Text> : v.outcomes.map((o, j) => (
                  <View key={j} style={s.outcomeRow} wrap={false}>
                    <Text style={[s.mark, o.response === "yes" ? s.ok : o.response === "no" ? s.danger : { color: HINT }]}>{o.response === "yes" ? "YES" : o.response === "no" ? "NO" : "N/A"}</Text>
                    <Text style={{ flex: 1 }}><Text style={s.prompt}>{o.prompt}</Text>{"\n"}<Text style={s.goal}>{o.goal}</Text></Text>
                  </View>
                ))}
              </View>

              <View style={s.side}>
                <Fact k="Staff support" v={level ? level[1] : "Not recorded"} sub={level ? level[2] : undefined} />
                <Fact k="Medications" v={v.meds.length === 0 ? "None due" : medsIssues.length === 0 ? `${medsGiven.length} given on time` : `${medsIssues.length} not given`} sub={v.meds.length ? v.meds.map((m) => `${m.name} ${m.dose}, ${m.time}${m.status !== "given" ? ` · ${MED_STATUS[m.status] ?? m.status}` : ""}`).join("\n") : undefined} tone={medsIssues.length ? "danger" : undefined} />
                <Fact k="Incidents" v="None reported" />
                <Fact k="Visit verified" v={v.manualEntry ? "Entered manually" : "GPS, clock-in and clock-out"} sub={v.manualEntry ? v.manualEntryReason ?? undefined : v.clockInLat != null ? `${v.clockInLat.toFixed(4)}, ${v.clockInLng?.toFixed(4)}` : undefined} tone={v.manualEntry ? undefined : "ok"} />
                {v.edits > 0 && <Fact k="Corrections" v={`${v.edits} after signing`} sub="Details in the audit log" />}
                <Fact k="Person served" v={`PMI ${person.pmi}`} sub={person.dob ? `Born ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/Chicago" }).format(new Date(person.dob + "T12:00:00-05:00"))}` : undefined} />
              </View>
            </View>

            <View style={s.sigs} wrap={false}>
              <View style={s.sig}>
                <Text style={s.sigName}>{v.staff}</Text>
                <Text style={s.sigK}>Caregiver</Text>
                <Text style={s.sigV}>{v.staffSignedAt ? `Signed electronically ${dt.format(v.staffSignedAt)}` : "Not yet signed"} · {v.renderingIdType.toUpperCase()} {v.renderingId}</Text>
              </View>
              <View style={s.sig}>
                <Text style={v.clientSignedAt ? s.sigName : s.sigNameEmpty}>{v.clientSignedAt ? personName : " "}</Text>
                <Text style={s.sigK}>Person served</Text>
                <Text style={s.sigV}>{v.clientSignedAt ? `Signed with private code ${dt.format(v.clientSignedAt)}` : v.clientUnsignedReason ? `Not signed · ${v.clientUnsignedReason}` : "Not signed"}</Text>
              </View>
              <View style={s.sig}>
                <Text style={v.approvedAt ? s.sigName : s.sigNameEmpty}>{v.approvedByName ?? " "}</Text>
                <Text style={s.sigK}>Supervisor</Text>
                <Text style={s.sigV}>{v.approvedAt ? `Reviewed ${dt.format(v.approvedAt)}` : "Awaiting review"}</Text>
              </View>
            </View>

            <Text style={s.footer} fixed>{personName} · {dShort.format(v.clockInAt)} · Confidential · {org.name} · Note {i + 1} of {rows.length}</Text>
          </Page>
        );
      })}
    </Document>
  );
}
