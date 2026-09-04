import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Organization, Person, VisitTask } from "@/db/schema";
import { labelForCode } from "@/lib/hcpcs";
import { INTERACTION_LEVELS } from "@/lib/templates";

/**
 * Daily service note, one per page, laid out as the record a 245D licensor or county auditor reads:
 * who, what, when, where, and how long (MHCP billing + EVV); what was done and how the person responded
 * (person-centered documentation); outcomes from the support plan (245D.071 subd. 5); health, safety and
 * incidents (245D.06 subd. 1); medications (245D.11); then the staff attestation and the person's own
 * signature made with their private signing code. Retained under 245D.095 subd. 3.
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

const INK = "#1b1818", MUTED = "#5e5952", HINT = "#857f76", LINE = "#d6d1c7", SOFT = "#f0efeb", OK = "#1f6b4a", WARN = "#9a5f06", DANGER = "#b3261e";

const s = StyleSheet.create({
  page: { padding: 30, paddingBottom: 62, fontSize: 9, fontFamily: "Helvetica", color: INK, lineHeight: 1.25 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `1.5 solid ${INK}`, paddingBottom: 5, marginBottom: 7 },
  org: { fontSize: 12, fontFamily: "Helvetica-Bold", lineHeight: 1.15 },
  orgMeta: { fontSize: 7.5, color: MUTED, marginTop: 1, lineHeight: 1.2 },
  title: { fontSize: 17, fontFamily: "Times-Roman", textAlign: "right", lineHeight: 1.1 },
  titleMeta: { fontSize: 7, color: MUTED, textAlign: "right", marginTop: 3, letterSpacing: 0.4, lineHeight: 1.2 },
  grid: { flexDirection: "row", borderTop: `0.75 solid ${LINE}`, borderLeft: `0.75 solid ${LINE}` },
  cell: { flex: 1, padding: 4, borderRight: `0.75 solid ${LINE}`, borderBottom: `0.75 solid ${LINE}` },
  k: { fontSize: 6.5, color: HINT, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 1, fontFamily: "Courier" },
  v: { fontSize: 9 },
  vs: { fontSize: 7.8, color: MUTED },
  section: { marginTop: 5 },
  h: { fontSize: 7.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.6, backgroundColor: SOFT, paddingVertical: 3, paddingHorizontal: 6, borderTop: `0.75 solid ${LINE}`, borderBottom: `0.75 solid ${LINE}` },
  hint: { fontSize: 7, color: HINT, paddingHorizontal: 6, paddingTop: 2 },
  body: { padding: 6, borderLeft: `0.75 solid ${LINE}`, borderRight: `0.75 solid ${LINE}`, borderBottom: `0.75 solid ${LINE}`, fontSize: 9, lineHeight: 1.35 },
  checks: { flexDirection: "row", flexWrap: "wrap", borderLeft: `0.75 solid ${LINE}` },
  check: { width: "33.33%", padding: 3, paddingLeft: 6, borderRight: `0.75 solid ${LINE}`, borderBottom: `0.75 solid ${LINE}`, fontSize: 8.5 },
  row: { flexDirection: "row", borderLeft: `0.75 solid ${LINE}` },
  mono: { fontFamily: "Courier" },
  ok: { color: OK, fontFamily: "Helvetica-Bold" },
  warn: { color: WARN, fontFamily: "Helvetica-Bold" },
  danger: { color: DANGER, fontFamily: "Helvetica-Bold" },
  attest: { flexDirection: "row", borderLeft: `0.75 solid ${LINE}` },
  attestCell: { flex: 1, padding: 5, borderRight: `0.75 solid ${LINE}`, borderBottom: `0.75 solid ${LINE}` },
  sigName: { fontSize: 9.5, fontFamily: "Helvetica-Bold", lineHeight: 1.2 },
  sigLine: { fontSize: 7.5, color: MUTED, marginTop: 1.5, lineHeight: 1.25 },
  footer: { position: "absolute", bottom: 34, left: 30, right: 30, fontSize: 7, color: HINT },
  rule: { position: "absolute", bottom: 46, left: 30, right: 30, borderTop: `0.75 solid ${LINE}` },
  footerNote: { position: "absolute", bottom: 12, left: 30, right: 30, fontSize: 6.3, color: HINT, lineHeight: 1.2 },
});

const dt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" });
const dLong = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
const dShort = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/Chicago" });
const tm = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const dateOnly = (iso: string) => new Date(iso + "T12:00:00-05:00");
const POS: Record<string, string> = { "12": "Home", "99": "Community / other", "11": "Office", "04": "Homeless shelter", "14": "Group home", "31": "Skilled nursing facility", "32": "Nursing facility", "99*": "Other" };
const MED_STATUS: Record<string, string> = { given: "Given", refused: "Refused", held: "Held", missed: "Missed" };

function Cell({ k, v, sub, flex = 1 }: { k: string; v: string; sub?: string; flex?: number }) {
  return (
    <View style={[s.cell, { flex }]}>
      <Text style={s.k}>{k}</Text>
      <Text style={s.v}>{v}</Text>
      {sub ? <Text style={s.vs}>{sub}</Text> : null}
    </View>
  );
}

function Section({ title, hint, children, wrap = false }: { title: string; hint?: string; children: React.ReactNode; wrap?: boolean }) {
  return (
    <View style={s.section} wrap={wrap}>
      <Text style={s.h}>{title}</Text>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

export function NotesPdf({ org, person, rows, range }: { org: Organization; person: Person; rows: PdfNote[]; range: { from: string | null; to: string | null; code: string } }) {
  const personName = `${person.firstName} ${person.lastName}`;
  const orgMeta = [org.licenseNumber && `245D license ${org.licenseNumber}`, org.umpi && `UMPI ${org.umpi}`, org.npi && `NPI ${org.npi}`].filter(Boolean).join(" · ");
  const orgAddr = [org.address1, org.city && `${org.city}, ${org.state ?? "MN"} ${org.zip ?? ""}`.trim(), org.phone].filter(Boolean).join(" · ");
  const units = rows.reduce((n, r) => n + r.units, 0);
  const cover = `${rows.length} note${rows.length === 1 ? "" : "s"} · ${units} units · ${range.code ? `${labelForCode(range.code, [])} (${range.code})` : "all services"} · ${range.from ? dShort.format(dateOnly(range.from)) : "start of service"} to ${range.to ? dShort.format(dateOnly(range.to)) : "today"}`;

  return (
    <Document title={`Service notes · ${personName}`} author={org.name} subject={cover}>
      {rows.length === 0 && (
        <Page size="LETTER" style={s.page}><Text style={s.title}>Daily Service Notes</Text><Text style={{ marginTop: 12 }}>No notes match this filter for {personName}.</Text></Page>
      )}
      {rows.map((v, i) => {
        const minutes = v.clockOutAt ? Math.round((v.clockOutAt.getTime() - v.clockInAt.getTime()) / 60000) : null;
        const level = INTERACTION_LEVELS.find((l) => l[0] === v.interactionLevel);
        const supports = [...v.tasks.map((t) => ({ label: t.label, done: t.completed })), ...v.skills.map((k) => ({ label: k, done: true }))];
        const gps = v.manualEntry ? null : v.clockInLat != null && v.clockOutLat != null ? `GPS verified at clock-in (±${Math.round(v.clockInAccuracyM ?? 0)} m) and clock-out (±${Math.round(v.clockOutAccuracyM ?? 0)} m)` : v.clockInLat != null ? "GPS verified at clock-in" : "No device location captured";
        const medsGiven = v.meds.filter((m) => m.status === "given").length;
        const medsIssues = v.meds.filter((m) => m.status !== "given");
        return (
          <Page key={v.id} size="LETTER" style={s.page} wrap>
            <View style={s.head} fixed>
              <View>
                <Text style={s.org}>{org.name}</Text>
                <Text style={s.orgMeta}>{orgMeta || "Minnesota 245D licensed provider"}</Text>
                {orgAddr ? <Text style={s.orgMeta}>{orgAddr}</Text> : null}
              </View>
              <View style={{ width: 300 }}>
                <Text style={s.title}>Daily Service Note</Text>
                <Text style={s.titleMeta}>MINNESOTA 245D · SERVICE DELIVERY RECORD · {i + 1} OF {rows.length}</Text>
              </View>
            </View>

            <View style={s.grid}>
              <Cell k="Person served" v={personName} sub={`PMI ${person.pmi} · DOB ${person.dob ? dShort.format(dateOnly(person.dob)) : "—"} · ${person.waiverProgram} waiver · ${person.county} County`} />
              <Cell k="Service date" v={dLong.format(v.clockInAt)} sub={`Agreement ${v.agreementNumber} · ${dShort.format(dateOnly(v.agreementStart))} – ${dShort.format(dateOnly(v.agreementEnd))}`} />
              <Cell k="Service" v={labelForCode(v.serviceCode, v.modifiers)} sub={`HCPCS ${v.serviceCode}${v.modifiers.length ? " " + v.modifiers.join(" ") : ""} · ${v.authorizedUnits.toLocaleString()} units authorized`} />
            </View>
            <View style={s.grid}>
              <Cell k="Start / end" v={`${tm.format(v.clockInAt)} – ${v.clockOutAt ? tm.format(v.clockOutAt) : "in progress"}`} sub={minutes != null ? `${minutes} minutes · ${v.units} units of 15 minutes` : undefined} />
              <Cell k="Setting" v={POS[v.placeOfService] ?? `Place of service ${v.placeOfService}`} sub={`POS ${v.placeOfService} · ${v.clockInLat != null && !v.manualEntry ? `${v.clockInLat.toFixed(4)}, ${v.clockInLng?.toFixed(4)}` : "location not recorded"}`} />
              <Cell k="Staff" v={`${v.staff}${v.staffTitle ? `, ${v.staffTitle}` : ""}`} sub={`${v.renderingIdType.toUpperCase()} ${v.renderingId}`} />
            </View>
            <View style={s.grid}>
              <Cell k="Visit verification (EVV)" v={v.manualEntry ? "Manual entry" : "Electronic clock-in and clock-out"} sub={v.manualEntry ? `Reason: ${v.manualEntryReason ?? "not stated"}` : gps ?? undefined} flex={2} />
              <Cell k="EVV export" v={v.evvStatus === "pending" ? "Not yet exported" : v.evvStatus.charAt(0).toUpperCase() + v.evvStatus.slice(1)} sub={v.edits ? `${v.edits} correction${v.edits === 1 ? "" : "s"} on record (audit log)` : "No corrections after signing"} />
            </View>

            <Section title="Daily service summary">
              <View style={s.body}>
                <Text>{v.shiftNote?.trim() || "No narrative was recorded for this service."}</Text>
                <Text style={{ marginTop: 4, color: MUTED, fontSize: 8.5 }}>
                  {level ? `Level of staff support: ${level[1]} (${level[2].toLowerCase()}). ` : "Level of staff support was not recorded. "}
                  {v.outcomes.length ? `${personName.split(" ")[0]} worked on ${v.outcomes.filter((o) => o.response === "yes").length} of ${v.outcomes.length} support plan outcomes. ` : ""}
                  {v.clientSignedAt ? `${personName.split(" ")[0]} reviewed this note at the end of the service and confirmed it with their signing code.` : v.clientUnsignedReason ? `${personName.split(" ")[0]} did not sign at the end of the service: ${v.clientUnsignedReason}.` : ""}
                </Text>
              </View>
            </Section>

            <Section title="Supports provided">
              {supports.length === 0 ? <Text style={s.body}>No supports were marked.</Text> : (
                <View style={s.checks}>
                  {supports.map((x, j) => <Text key={j} style={s.check}>{x.done ? "✓" : "—"}  {x.label}</Text>)}
                </View>
              )}
            </Section>

            <Section title="Support plan outcomes" hint="Progress toward the outcomes in the coordinated service and support plan (CSSP), answered at the end of the service.">
              {v.outcomes.length === 0 ? <Text style={s.body}>No outcome questions were active for this person on this date.</Text> : (
                <View style={{ borderLeft: `0.75 solid ${LINE}` }}>
                  {v.outcomes.map((o, j) => (
                    <View key={j} style={{ flexDirection: "row", borderRight: `0.75 solid ${LINE}`, borderBottom: `0.75 solid ${LINE}` }}>
                      <View style={{ flex: 1, padding: 3.5, paddingLeft: 6 }}><Text style={{ fontSize: 8.5 }}>{o.prompt}</Text><Text style={{ fontSize: 7, color: HINT }}>{o.goal}</Text></View>
                      <View style={{ width: 56, padding: 3.5, borderLeft: `0.75 solid ${LINE}`, justifyContent: "center" }}><Text style={o.response === "yes" ? s.ok : o.response === "no" ? s.danger : { color: MUTED }}>{o.response === "na" ? "N/A" : o.response === "yes" ? "Yes" : "No"}</Text></View>
                    </View>
                  ))}
                </View>
              )}
            </Section>

            <Section title="Health, safety and significant events" hint="Incidents are reported under Minn. Stat. § 245D.06, subd. 1. Medications come from the MAR for this date.">
              <View style={s.row}>
                <Cell k="Incident" v="None documented" sub="No incident report attached to this service" />
                <Cell k="Medications" v={v.meds.length === 0 ? "N/A" : medsIssues.length === 0 ? `${medsGiven} given as scheduled` : `${medsGiven} given · ${medsIssues.length} not given`} sub={v.meds.length === 0 ? "No medication support on this date" : medsIssues.map((m) => `${m.name} ${m.dose} at ${m.time}: ${MED_STATUS[m.status] ?? m.status}`).join("; ") || v.meds.map((m) => `${m.name} ${m.time}`).join(", ")} />
                <Cell k="Restrictive procedures" v="None used" sub="No emergency use of manual restraint" />
                <Cell k="Follow-up" v={v.clientUnsignedReason ? "Obtain signature" : medsIssues.length ? "Review MAR" : "None required"} sub={v.clientUnsignedReason ? "Person served did not sign this note" : medsIssues.length ? "Missed or refused doses noted above" : undefined} />
              </View>
            </Section>

            <Section title="Attestation and signatures" wrap>
              <View style={s.attest} wrap={false}>
                <View style={s.attestCell}>
                  <Text style={s.k}>Staff attestation</Text>
                  <Text style={s.sigName}>{v.staff}{v.staffTitle ? `, ${v.staffTitle}` : ""}</Text>
                  <Text style={s.sigLine}>I delivered this service as documented. Times and units are accurate.</Text>
                  <Text style={[s.sigLine, v.staffSignedAt ? s.ok : s.warn]}>{v.staffSignedAt ? `✓ Electronically signed ${dt.format(v.staffSignedAt)}` : "Not yet signed"}</Text>
                  <Text style={s.sigLine}>{v.renderingIdType.toUpperCase()} {v.renderingId}{v.noteSavedAt ? ` · Saved ${dt.format(v.noteSavedAt)}${v.noteSavedLat != null ? ` from ${v.noteSavedLat.toFixed(4)}, ${v.noteSavedLng?.toFixed(4)}` : ""}` : ""}</Text>
                </View>
                <View style={s.attestCell}>
                  <Text style={s.k}>Person served</Text>
                  <Text style={s.sigName}>{personName}</Text>
                  <Text style={s.sigLine}>I reviewed this note. The service was provided as described.</Text>
                  {v.clientSignedAt ? (
                    <>
                      <Text style={[s.sigLine, s.ok]}>✓ Signed {dt.format(v.clientSignedAt)}</Text>
                      <Text style={s.sigLine}>Signed on the caregiver's device with the person's private six-digit signing code, known only to the person served.</Text>
                    </>
                  ) : (
                    <>
                      <Text style={[s.sigLine, s.danger]}>Not signed</Text>
                      <Text style={s.sigLine}>{v.clientUnsignedReason ? `Reason recorded by staff: ${v.clientUnsignedReason}.` : "No reason recorded."} Written signature: ____________________________</Text>
                    </>
                  )}
                </View>
                <View style={s.attestCell}>
                  <Text style={s.k}>Supervisor review</Text>
                  <Text style={s.sigName}>{v.approvedByName ?? "Pending"}</Text>
                  <Text style={s.sigLine}>Reviewed for completeness against the support plan and service agreement.</Text>
                  <Text style={[s.sigLine, v.approvedAt ? s.ok : s.warn]}>{v.approvedAt ? `✓ Approved ${dt.format(v.approvedAt)}` : "Awaiting supervisor review"}</Text>
                  <Text style={s.sigLine}>Record ID {v.id.slice(0, 8).toUpperCase()}</Text>
                </View>
              </View>
            </Section>

            <View style={s.rule} fixed />
            <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `${personName} · PMI ${person.pmi} · ${dShort.format(v.clockInAt)} · Confidential service recipient record · ${org.name} · Page ${pageNumber} of ${totalPages}`} />
            <Text style={s.footerNote} fixed>Retained in the service recipient record under Minn. Stat. § 245D.095, subd. 3. Service delivery, units, and staff identification support the MHCP claim for this date. Outcome responses feed the progress review under § 245D.071, subd. 5. Any change after signing is recorded in the audit log with the editor, time, and reason.</Text>
          </Page>
        );
      })}
    </Document>
  );
}
