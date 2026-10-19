/** Client-safe labels for billing facts shown on screen. */
import type { EvvFacts } from "./readiness";

export type LabelTone = "ok" | "warn" | "danger" | "neutral";

/** One word or two for the EVV column: what the aggregator knows about this note. */
export function evvLabel(e: EvvFacts): { label: string; tone: LabelTone } {
  if (!e.required && !e.recorded) return { label: "Not required", tone: "neutral" };
  if (!e.recorded) return { label: "No record", tone: "warn" };
  if (e.submission === "accepted" || e.submission === "accepted_with_warning") return { label: e.compliance === "NONCOMPLIANT" ? "Accepted · noncompliant" : "Accepted", tone: e.compliance === "NONCOMPLIANT" ? "warn" : "ok" };
  if (e.submission === "rejected" || e.submission === "correction_required" || e.submission === "permanently_failed") return { label: "Rejected", tone: "danger" };
  if (!e.required) return { label: "Not required", tone: "neutral" };
  return { label: e.submission ? e.submission.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Not sent", tone: "warn" };
}
