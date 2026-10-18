/**
 * Shapes shared by the assistant's server loop and its client UI (Oct 18, 2026). Client-safe: no
 * database, no SDK. The wire format is newline-delimited JSON, one `AssistantEvent` per line.
 */

/** Where the person is when they ask. The server re-checks every id against their permissions. */
export interface AssistantContext {
  /** The page path, for wording only ("you are on Kevin's record"). */
  path?: string;
  personId?: string;
  staffId?: string;
  /** A note (visit) open in the service record. */
  visitId?: string;
  /** What the person has marked on the open note but not saved yet, so a draft can use it. */
  noteDraft?: NoteDraftFacts;
}

export interface NoteDraftFacts {
  interactionLevel?: string;
  skills: string[];
  activities: string[];
  tasks: string[];
  outcomes: { title: string; line: string }[];
  goalAnswers: { prompt: string; response: string; note?: string }[];
  /** The progress review as it stands in the form. */
  text: string;
}

/** One record the assistant read. `ref` is what the model cites, e.g. [note:3f2a91bc]. */
export interface AssistantSource {
  ref: string;
  kind: "client" | "note" | "goal" | "auth" | "mar" | "doc" | "staff" | "queue" | "schedule";
  label: string;
  detail?: string;
  href: string;
}

export type DraftKind = "progress_review" | "progress_summary" | "incident_report" | "message" | "other";

export interface AssistantDraft {
  id: string;
  kind: DraftKind;
  title: string;
  body: string;
  personId?: string;
  visitId?: string;
  /** Details the assistant could not find and did not invent. */
  missing: string[];
  /** Refs of the records the draft rests on. */
  sources: string[];
}

export type AssistantEvent =
  | { type: "text"; delta: string }
  | { type: "status"; label: string }
  | { type: "sources"; sources: AssistantSource[] }
  | { type: "draft"; draft: AssistantDraft }
  | { type: "error"; message: string }
  | { type: "done" };

/** What the client keeps between turns. Only text goes back to the server. */
export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export const REF_PATTERN = /\[((?:client|note|goal|auth|mar|doc|staff|queue|schedule):[a-z0-9-]+)\]/g;

export const DRAFT_LABEL: Record<DraftKind, string> = {
  progress_review: "Progress review",
  progress_summary: "Progress summary",
  incident_report: "Incident report",
  message: "Message",
  other: "Draft",
};
