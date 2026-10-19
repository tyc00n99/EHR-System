/**
 * The clearinghouse boundary. EVVora builds the 837P; an adapter hands it to the clearinghouse and
 * reads claim status back. Waystar is the agency's clearinghouse and forwards claims to MN-ITS.
 *
 * Like the HHAX adapter, the Waystar adapter fails closed: until the account's file-transfer
 * details and Waystar's 837P companion guide are configured, `submit` returns `blocked` and nothing
 * is recorded as sent. No endpoint, host or response code is invented here.
 *
 * The mock adapter accepts every file and reports every claim accepted. It is the default only
 * outside production, so a hosted deploy can never show a fake "accepted" claim.
 */

export interface ClearinghouseConfig {
  submitterId: string;
  receiverId: string;
  receiverName: string;
  usage: "T" | "P";
  payerId: string;
  payerName: string;
}

export type SubmitOutcome =
  | { status: "sent"; externalId: string; message?: string }
  | { status: "blocked"; problems: string[] }
  | { status: "failed"; message: string };

export interface ClaimStatusUpdate {
  patientControlNumber: string;
  status: "accepted" | "rejected" | "paid" | "denied";
  message?: string;
  payerClaimNumber?: string;
  paidAmount?: number;
}

export interface Health { ok: boolean; problems: string[] }

export interface ClearinghouseAdapter {
  key: "mock" | "waystar";
  label: string;
  config: ClearinghouseConfig;
  health(): Health;
  submit(file: string, meta: { controlNumber: number; claimCount: number }): Promise<SubmitOutcome>;
  /** Claim acknowledgments (999 / 277CA) and remittances (835) since the last poll, as status changes. */
  statusUpdates(open: { patientControlNumber: string }[]): Promise<ClaimStatusUpdate[]>;
}

export class MockClearinghouse implements ClearinghouseAdapter {
  key = "mock" as const;
  label = "Test clearinghouse";
  constructor(public config: ClearinghouseConfig) {}
  health(): Health { return { ok: true, problems: [] }; }
  async submit(_file: string, meta: { controlNumber: number }): Promise<SubmitOutcome> {
    return { status: "sent", externalId: `MOCK-${meta.controlNumber}`, message: "Accepted by the test clearinghouse." };
  }
  async statusUpdates(open: { patientControlNumber: string }[]): Promise<ClaimStatusUpdate[]> {
    return open.map((c) => ({ patientControlNumber: c.patientControlNumber, status: "accepted", message: "Accepted by the test clearinghouse." }));
  }
}

export interface WaystarConfig extends ClearinghouseConfig {
  environment: "test" | "production" | "off";
  host: string | null;
  username: string | null;
  secret: string | null;
  submissionEnabled: boolean;
}

export function waystarProblems(c: WaystarConfig): string[] {
  const p: string[] = [];
  if (c.environment === "off") p.push("WAYSTAR_ENVIRONMENT is off");
  if (!c.submitterId) p.push("WAYSTAR_SUBMITTER_ID missing");
  if (!c.receiverId) p.push("WAYSTAR_RECEIVER_ID missing");
  if (!c.payerId) p.push("CLAIM_PAYER_ID missing (Minnesota DHS's payer ID on Waystar's payer list)");
  if (!c.host) p.push("WAYSTAR_HOST missing");
  if (!c.username) p.push("WAYSTAR_USERNAME missing");
  if (!c.secret) p.push("WAYSTAR_SECRET missing");
  if (!c.submissionEnabled) p.push("CLAIMS_SUBMISSION_ENABLED is not 1");
  return p;
}

export class WaystarClearinghouse implements ClearinghouseAdapter {
  key = "waystar" as const;
  label = "Waystar";
  constructor(public config: WaystarConfig) {}
  health(): Health {
    const problems = waystarProblems(this.config);
    // The transfer itself is wired once the account exists and Waystar's companion guide says how
    // files are delivered and acknowledgments returned. Until then it stays closed.
    problems.push("File transfer to Waystar is not connected yet (needs the account's delivery details)");
    return { ok: false, problems };
  }
  async submit(): Promise<SubmitOutcome> {
    return { status: "blocked", problems: this.health().problems };
  }
  async statusUpdates(): Promise<ClaimStatusUpdate[]> { return []; }
}

const env = (e: NodeJS.ProcessEnv, k: string) => e[k]?.trim() || "";

export function clearinghouseFromEnv(e: NodeJS.ProcessEnv = process.env): ClearinghouseAdapter {
  const fallback = e.NODE_ENV === "production" ? "waystar" : "mock";
  const which = (e.CLEARINGHOUSE_ADAPTER ?? fallback).toLowerCase();
  const environment = env(e, "WAYSTAR_ENVIRONMENT").toLowerCase();
  const base: ClearinghouseConfig = {
    submitterId: env(e, "WAYSTAR_SUBMITTER_ID"),
    receiverId: env(e, "WAYSTAR_RECEIVER_ID"),
    receiverName: "WAYSTAR",
    usage: environment === "production" ? "P" : "T",
    payerId: env(e, "CLAIM_PAYER_ID"),
    payerName: env(e, "CLAIM_PAYER_NAME") || "MINNESOTA DEPARTMENT OF HUMAN SERVICES",
  };
  if (which === "mock") return new MockClearinghouse({ ...base, submitterId: base.submitterId || "EVVORATEST", receiverId: base.receiverId || "MOCKCH", payerId: base.payerId || "MOCKPAYER" });
  return new WaystarClearinghouse({
    ...base,
    environment: environment === "test" || environment === "production" ? environment : "off",
    host: env(e, "WAYSTAR_HOST") || null,
    username: env(e, "WAYSTAR_USERNAME") || null,
    secret: env(e, "WAYSTAR_SECRET") || null,
    submissionEnabled: e.CLAIMS_SUBMISSION_ENABLED === "1",
  });
}
