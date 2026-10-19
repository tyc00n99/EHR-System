/**
 * ASC X12 837P (005010X222A1) professional claim file, built from EVVora's claim lines. Pure: no
 * database, no clock, no network. The same file goes to Waystar, which forwards it to MN-ITS, or
 * is downloaded for a manual upload to Waystar's portal.
 *
 * Shape, per Minnesota MHCP practice for 245D (waiver) services:
 *  - 2010AA billing provider carries the agency's NPI when it has one; an atypical provider
 *    without an NPI sends the name only and its UMPI as REF*G2 in 2010BB.
 *  - 2010BA subscriber is the client, identified by PMI (NM1*IL…*MI).
 *  - 2300 one claim per client and service agreement, REF*G1 = the agreement number.
 *  - 2400 one service line per note: SV1 with HCPCS + modifiers, units (UN), date of service.
 *  - 2420A rendering provider per line, NPI or UMPI, because different caregivers render lines.
 */
import { centsToDecimal, sumCents } from "./money";

export interface BillingProvider {
  name: string;
  taxId: string;
  npi: string | null;
  umpi: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
}

export interface Payer { name: string; id: string }

export interface Envelope {
  /** ISA06/GS02: the submitter ID the clearinghouse assigned. */
  senderId: string;
  /** ISA08/GS03: the clearinghouse's receiver ID. */
  receiverId: string;
  receiverName: string;
  /** ISA13 and GS06, unique per sender. */
  controlNumber: number;
  usage: "T" | "P";
  now: Date;
}

export interface ClaimLineInput {
  ref: string;
  serviceCode: string;
  modifiers: string[];
  units: number;
  /** Integer cents. */
  amountCents: number;
  /** YYYY-MM-DD, Central date of service. */
  date: string;
  rendering: { type: "npi" | "umpi"; id: string; firstName: string; lastName: string };
}

export interface ClaimInput {
  /** CLM01, 1–20 characters; comes back on the 277CA and 835. */
  patientControlNumber: string;
  patient: { firstName: string; lastName: string; dob: string; sex: string | null; pmi: string; address1: string | null; address2: string | null; city: string | null; state: string | null; zip: string | null };
  priorAuth: string;
  /** ICD-10-CM, principal first. Dots are stripped. */
  diagnoses: string[];
  placeOfService: string;
  lines: ClaimLineInput[];
  /** CLM05-3: 1 original, 7 replacement, 8 void. Defaults to 1. */
  frequencyCode?: "1" | "7" | "8";
  /** REF*F8, the payer's claim number for the claim being replaced or voided. Required for 7 and 8. */
  originalClaimNumber?: string | null;
  /** SBR09, from the payer profile. Defaults to MC (Medicaid). */
  claimFilingIndicator?: string;
}

/** Why a claim cannot go out yet, in words the office can act on. Empty means it can. */
export function claimProblems(c: ClaimInput): string[] {
  const p: string[] = [];
  if (!/^\d{8}$/.test(c.patient.pmi)) p.push("PMI is not 8 digits");
  if (c.diagnoses.length === 0) p.push("No diagnosis on the client's profile");
  if (!c.patient.address1 || !c.patient.city || !c.patient.zip) p.push("Client's address is incomplete");
  if (!c.priorAuth) p.push("No authorization number");
  if (c.lines.length === 0) p.push("No service lines");
  if ((c.frequencyCode === "7" || c.frequencyCode === "8") && !c.originalClaimNumber) p.push("A replacement or void needs the payer's claim number for the original claim");
  for (const l of c.lines) {
    if (l.units <= 0) p.push(`A line on ${l.date} has no units`);
    if (!l.rendering.id) p.push(`No rendering NPI or UMPI on ${l.date}`);
  }
  return [...new Set(p)];
}

/** Problems with the agency, payer or envelope that stop the whole file. */
export function fileProblems(provider: BillingProvider, payer: Payer, env: Pick<Envelope, "senderId" | "receiverId">): string[] {
  const p: string[] = [];
  if (!/^\d{9}$/.test(provider.taxId.replace(/\D/g, ""))) p.push("Agency tax ID is not 9 digits (Settings → Organization)");
  if (!provider.npi && !provider.umpi) p.push("Agency has neither an NPI nor a UMPI (Settings → Organization)");
  if (!provider.address1 || !provider.city || !provider.zip) p.push("Agency address is incomplete (Settings → Organization)");
  if (!payer.id) p.push("Payer ID is not set (CLAIM_PAYER_ID)");
  if (!env.senderId) p.push("Waystar submitter ID is not set (WAYSTAR_SUBMITTER_ID)");
  if (!env.receiverId) p.push("Waystar receiver ID is not set (WAYSTAR_RECEIVER_ID)");
  return p;
}

const clean = (s: string | null | undefined, max = 60) => (s ?? "").toUpperCase().replace(/[~*:^\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const pad = (s: string, n: number) => s.slice(0, n).padEnd(n, " ");
const money = (c: number) => centsToDecimal(c);
const sexCode = (s: string | null) => (s === "female" ? "F" : s === "male" ? "M" : "U");

function stamp(d: Date) {
  // Central time, as every date in the product is.
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { ymd: `${parts.year}${parts.month}${parts.day}`, hm: `${parts.hour}${parts.minute}` };
}

/** Builds the whole interchange. Callers check `claimProblems` and `fileProblems` first. */
export function build837P(provider: BillingProvider, payer: Payer, env: Envelope, claims: ClaimInput[]): string {
  const { ymd, hm } = stamp(env.now);
  const ctl = String(env.controlNumber).padStart(9, "0");
  const out: string[] = [];
  const seg = (...els: (string | number)[]) => {
    let e = els.map(String);
    while (e.length > 1 && e[e.length - 1] === "") e = e.slice(0, -1);
    out.push(e.join("*"));
  };

  seg("ISA", "00", pad("", 10), "00", pad("", 10), "ZZ", pad(env.senderId, 15), "ZZ", pad(env.receiverId, 15), ymd.slice(2), hm, "^", "00501", ctl, "0", env.usage, ":");
  seg("GS", "HC", env.senderId, env.receiverId, ymd, hm, env.controlNumber, "X", "005010X222A1");
  const stStart = out.length;
  seg("ST", "837", "0001", "005010X222A1");
  seg("BHT", "0019", "00", ctl, ymd, hm, "CH");
  // 1000A submitter, 1000B receiver
  seg("NM1", "41", "2", clean(provider.name), "", "", "", "", "46", env.senderId);
  seg("PER", "IC", clean(provider.name, 60), "TE", digits(provider.phone) || "0000000000");
  seg("NM1", "40", "2", clean(env.receiverName), "", "", "", "", "46", env.receiverId);
  // 2000A billing provider
  seg("HL", "1", "", "20", "1");
  if (provider.npi) seg("NM1", "85", "2", clean(provider.name), "", "", "", "", "XX", digits(provider.npi));
  else seg("NM1", "85", "2", clean(provider.name));
  seg("N3", clean(provider.address1, 55));
  seg("N4", clean(provider.city, 30), clean(provider.state || "MN", 2), digits(provider.zip));
  seg("REF", "EI", digits(provider.taxId));

  let hl = 1;
  for (const c of claims) {
    hl += 1;
    // 2000B subscriber = the client (MA is primary for waiver services; the client is the subscriber).
    seg("HL", hl, "1", "22", "0");
    seg("SBR", "P", "18", "", "", "", "", "", "", c.claimFilingIndicator ?? "MC");
    seg("NM1", "IL", "1", clean(c.patient.lastName, 60), clean(c.patient.firstName, 35), "", "", "", "MI", c.patient.pmi);
    seg("N3", clean(c.patient.address1, 55), ...(c.patient.address2 ? [clean(c.patient.address2, 55)] : []));
    seg("N4", clean(c.patient.city, 30), clean(c.patient.state || "MN", 2), digits(c.patient.zip));
    seg("DMG", "D8", c.patient.dob.replace(/-/g, ""), sexCode(c.patient.sex));
    // 2010BB payer
    seg("NM1", "PR", "2", clean(payer.name), "", "", "", "", "PI", payer.id);
    if (provider.umpi) seg("REF", "G2", provider.umpi);
    // 2300 claim
    const total = sumCents(c.lines.map((l) => l.amountCents));
    seg("CLM", c.patientControlNumber, money(total), "", "", `${c.placeOfService}:B:${c.frequencyCode ?? "1"}`, "Y", "A", "Y", "Y");
    seg("REF", "G1", clean(c.priorAuth, 50));
    if (c.originalClaimNumber && c.frequencyCode && c.frequencyCode !== "1") seg("REF", "F8", clean(c.originalClaimNumber, 50));
    seg("HI", ...c.diagnoses.slice(0, 12).map((d, i) => `${i === 0 ? "ABK" : "ABF"}:${d.replace(/\./g, "").toUpperCase()}`));
    c.lines.forEach((l, i) => {
      seg("LX", i + 1);
      seg("SV1", ["HC", l.serviceCode, ...l.modifiers.slice(0, 4)].join(":"), money(l.amountCents), "UN", l.units, "", "", "1");
      seg("DTP", "472", "D8", l.date.replace(/-/g, ""));
      seg("REF", "6R", l.ref.slice(0, 50));
      if (l.rendering.type === "npi") seg("NM1", "82", "1", clean(l.rendering.lastName, 60), clean(l.rendering.firstName, 35), "", "", "", "XX", digits(l.rendering.id));
      else { seg("NM1", "82", "1", clean(l.rendering.lastName, 60), clean(l.rendering.firstName, 35)); seg("REF", "G2", l.rendering.id); }
    });
  }

  seg("SE", out.length - stStart + 1, "0001");
  seg("GE", "1", env.controlNumber);
  seg("IEA", "1", ctl);
  return out.join("~\n") + "~\n";
}
