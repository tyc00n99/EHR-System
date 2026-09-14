/** Labels and tones for EVV statuses. Client-safe: no database imports. */
import { REASON_LABEL, type ReasonCode } from "./types";

type Tone = "ok" | "warn" | "danger" | "accent" | "neutral";

export const COMPLIANCE: Record<string, { label: string; tone: Tone }> = {
  COMPLIANT: { label: "Compliant", tone: "ok" },
  NONCOMPLIANT: { label: "Noncompliant", tone: "danger" },
  INCOMPLETE: { label: "Incomplete", tone: "warn" },
  EXEMPT_LIVE_IN: { label: "Exempt · live-in", tone: "accent" },
  PENDING_REVIEW: { label: "Needs review", tone: "warn" },
};

export const SUBMISSION: Record<string, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "neutral" },
  transmitting: { label: "Transmitting", tone: "accent" },
  submitted: { label: "Submitted · awaiting ack", tone: "accent" },
  accepted: { label: "Accepted", tone: "ok" },
  accepted_with_warning: { label: "Accepted with warning", tone: "ok" },
  rejected: { label: "Rejected", tone: "danger" },
  retry_scheduled: { label: "Retry scheduled", tone: "warn" },
  correction_required: { label: "Correction required", tone: "danger" },
  resubmitted: { label: "Superseded", tone: "neutral" },
  permanently_failed: { label: "Failed · needs attention", tone: "danger" },
  blocked: { label: "Blocked · not configured", tone: "warn" },
};

export const BILLING: Record<string, { label: string; tone: Tone }> = {
  not_ready: { label: "Not ready", tone: "neutral" },
  ready: { label: "Ready to bill", tone: "ok" },
  ready_with_warnings: { label: "Ready with warnings", tone: "warn" },
  hold: { label: "On hold", tone: "danger" },
};

export const LIFECYCLE: Record<string, { label: string; tone: Tone }> = {
  planned: { label: "Planned", tone: "neutral" },
  in_progress: { label: "In progress", tone: "accent" },
  awaiting_clock_in: { label: "Awaiting clock-in", tone: "warn" },
  completed: { label: "Completed", tone: "ok" },
  voided: { label: "Voided", tone: "neutral" },
};

export const LOCATION_STATE: Record<string, string> = {
  captured: "Location captured", inside_geofence: "At the client's home", outside_geofence: "Outside the home geofence", community: "Community location",
  unavailable: "No location", permission_denied: "Location permission denied", accuracy_insufficient: "GPS accuracy too poor", protected_address: "Protected address",
  registered_location: "Registered line / device", not_applicable: "—",
};

export const METHOD: Record<string, string> = { mobile: "Mobile GPS", ivr: "Telephone (IVR)", fob: "Fixed device (FOB)", live_in: "Live-in daily entry", manual: "Manual entry", imported: "Imported", other: "Other" };

export const EXCEPTION_LABEL: Record<string, string> = {
  ...REASON_LABEL,
  CLIENT_NOT_ACTIVE: "Client is not active",
  SERVICE_RULE_INACTIVE: "The service rule that classified this visit is inactive",
  SUBMISSION_BLOCKED: "Submission blocked: aggregator not configured",
  SUBMISSION_DEAD_LETTER: "Submission gave up after repeated failures",
  ACK_TIMEOUT: "No acknowledgment from the aggregator",
  DEADLINE_APPROACHING: "Monthly submission deadline approaching",
};

export const reasonLabel = (code: string) => EXCEPTION_LABEL[code as ReasonCode] ?? code.replaceAll("_", " ").toLowerCase();
