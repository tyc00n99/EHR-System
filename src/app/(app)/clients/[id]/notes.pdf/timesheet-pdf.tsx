import { Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Organization, Person } from "@/db/schema";
import { labelForCode } from "@/lib/hcpcs";
import type { PdfNote } from "./notes-pdf";

/**
 * Biweekly service summary that rides in front of a week or pay period of notes.
 * One landscape page per caregiver and service: a day-by-day grid of times, activities, units and
 * hours, week and period totals, the authorization it bills against, and the two attestations with
 * signature lines. Modeled on the timesheet counties and MHCP reviewers already read.
 */

const INK = "#1b1818", GHOST = "#8f897f", LINE = "#d6d1c7", SOFT = "#efece5", NAVY = "#0b2672", OK = "#1f6b4a";
const SANS = "EB Garamond", SCRIPT = "Great Vibes";
const DAYS_PER_PAGE = 14;

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingHorizontal: 34, paddingBottom: 34, fontSize: 9, fontFamily: SANS, color: INK, lineHeight: 1.3 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottom: `1.2 solid ${INK}`, paddingBottom: 7, marginBottom: 10 },
  h1: { fontSize: 15, fontWeight: 700, lineHeight: 1.2 },
  hline: { fontSize: 10, marginTop: 2 },
  hRight: { fontSize: 12, fontWeight: 700, textAlign: "right", lineHeight: 1.2 },
  hRightSub: { fontSize: 9.5, textAlign: "right", marginTop: 2 },
  strong: { fontWeight: 700 },

  grid: { borderTop: `0.75 solid ${LINE}`, borderLeft: `0.75 solid ${LINE}` },
  row: { flexDirection: "row" },
  rowShade: { flexDirection: "row", backgroundColor: SOFT },
  lab: { width: 74, paddingVertical: 4, paddingHorizontal: 5, borderRight: `0.75 solid ${LINE}`, borderBottom: `0.75 solid ${LINE}`, fontSize: 7.5, fontWeight: 700 },
  cell: { flex: 1, paddingVertical: 4, paddingHorizontal: 3, borderRight: `0.75 solid ${LINE}`, borderBottom: `0.75 solid ${LINE}`, alignItems: "center", justifyContent: "center" },
  dateTop: { fontSize: 7.5, fontWeight: 700 },
  dateDow: { fontSize: 6.5, color: GHOST, letterSpacing: 0.4 },
  val: { fontSize: 8 },
  valStrong: { fontSize: 8.5, fontWeight: 700 },
  act: { fontSize: 7, textAlign: "center", lineHeight: 1.25, marginBottom: 1.5 },
  none: { fontSize: 8, color: GHOST },

  totals: { flexDirection: "row", marginTop: 8, borderTop: `0.75 solid ${LINE}`, borderLeft: `0.75 solid ${LINE}` },
  tcell: { flex: 1, paddingVertical: 5, paddingHorizontal: 8, borderRight: `0.75 solid ${LINE}`, borderBottom: `0.75 solid ${LINE}`, backgroundColor: SOFT },
  tk: { fontSize: 6.5, letterSpacing: 1, textTransform: "uppercase", color: INK, fontWeight: 700 },
  tv: { fontSize: 10, fontWeight: 700, marginTop: 1 },
  sa: { flexDirection: "row", gap: 18, paddingVertical: 5, paddingHorizontal: 8, borderLeft: `0.75 solid ${LINE}`, borderRight: `0.75 solid ${LINE}`, borderBottom: `0.75 solid ${LINE}` },
  saItem: { fontSize: 8.5 },

  ackTitle: { fontSize: 8, fontWeight: 700, marginTop: 12, marginBottom: 3 },
  ackText: { fontSize: 7.6, lineHeight: 1.4, marginBottom: 5 },
  sigGrid: { borderTop: `0.75 solid ${LINE}`, borderLeft: `0.75 solid ${LINE}` },
  sigHead: { flexDirection: "row", backgroundColor: SOFT },
  sigHeadCell: { paddingVertical: 3.5, paddingHorizontal: 6, borderRight: `0.75 solid ${LINE}`, borderBottom: `0.75 solid ${LINE}`, fontSize: 6.5, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 700 },
  sigCell: { paddingVertical: 6, paddingHorizontal: 6, borderRight: `0.75 solid ${LINE}`, borderBottom: `0.75 solid ${LINE}`, justifyContent: "center", minHeight: 30 },
  sigVal: { fontSize: 9 },
  sigScript: { fontFamily: SCRIPT, fontSize: 17, lineHeight: 1.1 },
  sigNote: { fontSize: 6.5, color: GHOST },
  footer: { position: "absolute", bottom: 16, left: 34, right: 34, fontSize: 7, color: GHOST, textAlign: "center" },
});

const key = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const dShort = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "2-digit", timeZone: "America/Chicago" });
const dLong = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
const dNum = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "America/Chicago" });
const dow = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Chicago" });
const tm = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const dt = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const hm = (min: number) => (min <= 0 ? "—" : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} m`);
const noon = (iso: string) => new Date(iso + "T12:00:00-05:00");

interface Day { iso: string; date: Date; notes: PdfNote[] }
export interface TimesheetGroup { staff: string; renderingIdType: string; renderingId: string; serviceCode: string; modifiers: string[]; agreementNumber: string; agreementStart: string; agreementEnd: string; authorizedUnits: number; notes: PdfNote[] }

/** One page per caregiver and service, split into 14-day blocks. */
export function timesheetPages(org: Organization, person: Person, groups: TimesheetGroup[], from: Date, to: Date) {
  const allDays: string[] = [];
  for (let t = noon(key(from)).getTime(); t <= noon(key(to)).getTime(); t += 86_400_000) allDays.push(key(new Date(t)));
  const blocks: string[][] = [];
  for (let i = 0; i < allDays.length; i += DAYS_PER_PAGE) blocks.push(allDays.slice(i, i + DAYS_PER_PAGE));

  const pages: React.ReactElement[] = [];
  groups.forEach((g, gi) => {
    blocks.forEach((block, bi) => {
      const days: Day[] = block.map((iso) => ({ iso, date: noon(iso), notes: g.notes.filter((n) => key(n.clockInAt) === iso) }));
      if (!days.some((d) => d.notes.length)) return;
      pages.push(<TimesheetPage key={`${gi}-${bi}`} org={org} person={person} g={g} days={days} />);
    });
  });
  return pages;
}

function minutesOf(n: PdfNote) {
  return n.clockOutAt ? Math.round((n.clockOutAt.getTime() - n.clockInAt.getTime()) / 60000) : 0;
}

function TimesheetPage({ org, person, g, days }: { org: Organization; person: Person; g: TimesheetGroup; days: Day[] }) {
  const dayMinutes = days.map((d) => d.notes.reduce((m, n) => m + minutesOf(n), 0));
  const dayUnits = days.map((d) => d.notes.reduce((m, n) => m + n.units, 0));
  const half = Math.min(7, days.length);
  const wk1 = dayMinutes.slice(0, half).reduce((a, b) => a + b, 0);
  const wk2 = dayMinutes.slice(half).reduce((a, b) => a + b, 0);
  const total = wk1 + wk2;
  const units = dayUnits.reduce((a, b) => a + b, 0);
  const ratio = g.modifiers.includes("UN") ? "1:2" : "1:1";
  const clientSigned = g.notes.length > 0 && g.notes.every((n) => n.clientSignedAt);
  const staffSigned = g.notes.length > 0 && g.notes.every((n) => n.staffSignedAt);
  const lastClient = g.notes.map((n) => n.clientSignedAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];
  const lastStaff = g.notes.map((n) => n.staffSignedAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];
  const trim = (a: string) => {
    const short = a
      .replace(new RegExp(`^(Assisted|Accompanied|Supported|Provided|Modeled and practiced)\\s+${person.firstName}?\\s*(with|on|in|to)?\\s*`, "i"), "")
      .replace(/,.*$/, "")
      .trim();
    const words = short.split(/\s+/);
    return (words.length > 6 ? words.slice(0, 6).join(" ") + "…" : short).replace(/^./, (c) => c.toUpperCase());
  };
  const activitiesFor = (d: Day) => [...new Set(d.notes.flatMap((n) => (n.activities.length ? n.activities : n.skills)))].slice(0, 2).map(trim);


  return (
    <Page size="LETTER" orientation="landscape" style={s.page} wrap={false}>
      <View style={s.head}>
        <View>
          <Text style={s.h1}><Text style={s.strong}>Recipient</Text>  {person.firstName} {person.lastName}  ({person.pmi})</Text>
          <Text style={s.hline}><Text style={s.strong}>Caregiver</Text>  {g.staff}  ·  {g.renderingIdType.toUpperCase()} {g.renderingId}</Text>
        </View>
        <View>
          <Text style={s.hRight}>{labelForCode(g.serviceCode, g.modifiers)}</Text>
          <Text style={s.hRightSub}><Text style={s.strong}>Period</Text>  {dLong.format(days[0].date)} to {dLong.format(days[days.length - 1].date)}</Text>
        </View>
      </View>

      <View style={s.grid}>
        <View style={s.rowShade}>
          <Text style={s.lab}>Dates</Text>
          {days.map((d) => (
            <View key={d.iso} style={s.cell}>
              <Text style={s.dateTop}>{dShort.format(d.date)}</Text>
              <Text style={s.dateDow}>{dow.format(d.date).toUpperCase()}</Text>
            </View>
          ))}
        </View>
        <View style={s.row}>
          <Text style={s.lab}>Time in</Text>
          {days.map((d) => <View key={d.iso} style={s.cell}><Text style={d.notes.length ? s.val : s.none}>{d.notes.length ? tm.format(d.notes[0].clockInAt) : "—"}</Text></View>)}
        </View>
        <View style={s.row}>
          <Text style={s.lab}>Time out</Text>
          {days.map((d) => { const last = d.notes[d.notes.length - 1]; return <View key={d.iso} style={s.cell}><Text style={d.notes.length ? s.val : s.none}>{last?.clockOutAt ? tm.format(last.clockOutAt) : "—"}</Text></View>; })}
        </View>
        <View style={s.row}>
          <Text style={s.lab}>Ratio</Text>
          {days.map((d) => <View key={d.iso} style={s.cell}><Text style={d.notes.length ? s.val : s.none}>{d.notes.length ? ratio : "—"}</Text></View>)}
        </View>
        <View style={s.row}>
          <Text style={s.lab}>Activities</Text>
          {days.map((d) => {
            const acts = activitiesFor(d);
            return <View key={d.iso} style={[s.cell, { minHeight: 34 }]}>{acts.length ? acts.map((a, i) => <Text key={i} style={s.act}>{a}</Text>) : <Text style={s.none}>—</Text>}</View>;
          })}
        </View>
        <View style={s.row}>
          <Text style={s.lab}>Units</Text>
          {days.map((d, i) => <View key={d.iso} style={s.cell}><Text style={dayUnits[i] ? s.val : s.none}>{dayUnits[i] || "—"}</Text></View>)}
        </View>
        <View style={s.rowShade}>
          <Text style={s.lab}>Daily total</Text>
          {days.map((d, i) => <View key={d.iso} style={s.cell}><Text style={dayMinutes[i] ? s.valStrong : s.none}>{hm(dayMinutes[i])}</Text></View>)}
        </View>
      </View>

      <View style={s.totals}>
        <View style={s.tcell}><Text style={s.tk}>Week one</Text><Text style={s.tv}>{hm(wk1)}</Text></View>
        <View style={s.tcell}><Text style={s.tk}>Week two</Text><Text style={s.tv}>{days.length > 7 ? hm(wk2) : "—"}</Text></View>
        <View style={s.tcell}><Text style={s.tk}>Total hours</Text><Text style={s.tv}>{hm(total)}</Text></View>
        <View style={s.tcell}><Text style={s.tk}>Total units</Text><Text style={s.tv}>{units}</Text></View>
        <View style={s.tcell}><Text style={s.tk}>Ratio</Text><Text style={s.tv}>{ratio}</Text></View>
      </View>
      <View style={s.sa}>
        <Text style={s.saItem}><Text style={s.strong}>Authorization</Text>  {g.agreementNumber}</Text>
        <Text style={s.saItem}><Text style={s.strong}>SA dates</Text>  {dNum.format(noon(g.agreementStart))} – {dNum.format(noon(g.agreementEnd))}</Text>
        <Text style={s.saItem}><Text style={s.strong}>Service code</Text>  {g.serviceCode}{g.modifiers.length ? ` ${g.modifiers.join(" ")}` : ""}</Text>
        <Text style={s.saItem}><Text style={s.strong}>Authorized units</Text>  {g.authorizedUnits.toLocaleString()}</Text>
        <Text style={s.saItem}><Text style={s.strong}>Notes in period</Text>  {g.notes.length}</Text>
      </View>

      <Text style={s.ackTitle} minPresenceAhead={60}>Acknowledgement and required signatures for the person served</Text>
      <Text style={s.ackText}>I have reviewed this summary and the daily notes attached to it. I certify that I received these services on the dates and during the times shown, from the caregiver named here, as authorized in my support plan. If any date or time above is wrong I will draw a line through it and will not sign until it is corrected. I understand that knowingly giving false information for Medical Assistance payment is a crime.</Text>
      <View style={s.sigGrid}>
        <View style={s.sigHead}>
          <Text style={[s.sigHeadCell, { flex: 2 }]}>Recipient name</Text>
          <Text style={[s.sigHeadCell, { flex: 1.2 }]}>PMI number</Text>
          <Text style={[s.sigHeadCell, { flex: 2.4 }]}>Recipient or responsible party signature</Text>
          <Text style={[s.sigHeadCell, { flex: 1.6 }]}>Date</Text>
        </View>
        <View style={s.row}>
          <View style={[s.sigCell, { flex: 2 }]}><Text style={s.sigVal}>{person.firstName} {person.lastName}</Text></View>
          <View style={[s.sigCell, { flex: 1.2 }]}><Text style={s.sigVal}>{person.pmi}</Text></View>
          <View style={[s.sigCell, { flex: 2.4 }]}>{clientSigned ? <><Text style={s.sigScript}>{person.firstName} {person.lastName}</Text><Text style={s.sigNote}>Signed with private client code on each note</Text></> : <Text style={s.sigNote}> </Text>}</View>
          <View style={[s.sigCell, { flex: 1.6 }]}><Text style={s.sigVal}>{clientSigned && lastClient ? dt.format(lastClient) : " "}</Text></View>
        </View>
      </View>

      <Text style={s.ackTitle} minPresenceAhead={60}>Acknowledgement and required signatures for the caregiver</Text>
      <Text style={s.ackText}>I certify and swear under penalty of law that I have accurately reported on this summary the hours I actually worked, the services I provided, and the dates and times worked. I understand that misreporting my hours is fraud for which I could face criminal prosecution and civil proceedings.</Text>
      <View style={s.sigGrid}>
        <View style={s.sigHead}>
          <Text style={[s.sigHeadCell, { flex: 2 }]}>Caregiver name</Text>
          <Text style={[s.sigHeadCell, { flex: 1.2 }]}>Caregiver NPI or UMPI</Text>
          <Text style={[s.sigHeadCell, { flex: 2.4 }]}>Caregiver signature</Text>
          <Text style={[s.sigHeadCell, { flex: 1.6 }]}>Date</Text>
        </View>
        <View style={s.row}>
          <View style={[s.sigCell, { flex: 2 }]}><Text style={s.sigVal}>{g.staff}</Text></View>
          <View style={[s.sigCell, { flex: 1.2 }]}><Text style={s.sigVal}>{g.renderingId}</Text></View>
          <View style={[s.sigCell, { flex: 2.4 }]}>{staffSigned ? <><Text style={s.sigScript}>{g.staff}</Text><Text style={s.sigNote}>Signed electronically on each note</Text></> : <Text style={s.sigNote}> </Text>}</View>
          <View style={[s.sigCell, { flex: 1.6 }]}><Text style={s.sigVal}>{staffSigned && lastStaff ? dt.format(lastStaff) : " "}</Text></View>
        </View>
      </View>

      <Text style={s.footer} fixed>{person.firstName} {person.lastName} · PMI {person.pmi} · Service summary · Confidential · {org.name}</Text>
      <Text style={{ position: "absolute", bottom: 16, right: 34, fontSize: 7, color: clientSigned && staffSigned ? OK : NAVY }} fixed>{clientSigned && staffSigned ? "All notes signed" : "Signatures pending"}</Text>
    </Page>
  );
}
