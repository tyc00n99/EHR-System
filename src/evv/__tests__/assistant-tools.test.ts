/**
 * The assistant's lookups keep each person's permissions (Oct 18, 2026). Lives beside the EVV tests
 * because `npm test` runs this folder and the harness gives a migrated in-memory database.
 */
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createWorld, type World } from "./harness";
import * as schema from "@/db/schema";
import { ABILITY_KEYS } from "@/lib/abilities";
import type { CurrentUser } from "@/lib/auth";
import type { ToolScope } from "@/lib/ai/assistant/tools";

let w: World;
let tools: typeof import("@/lib/ai/assistant/tools");
let admin: CurrentUser;
let dsp: CurrentUser;
let visitId: string;

const scope = (user: CurrentUser, context: ToolScope["context"] = {}): ToolScope => ({ user, context, sources: new Map(), drafts: [], people: new Set(), ids: new Map() });
const call = async (s: ToolScope, name: string, input: unknown) => {
  const t = tools.toolsFor(s.user).byName.get(name);
  if (!t) return { ok: false, content: "not offered", status: "" };
  return tools.runTool(s, t, input);
};

before(async () => {
  w = await createWorld();
  (globalThis as unknown as { __ehrDb?: Promise<unknown> }).__ehrDb = Promise.resolve(w.db);
  tools = await import("@/lib/ai/assistant/tools");
  admin = { id: w.a.adminUserId, email: "admin@example.test", role: "admin", staffId: null, staffName: "Admin", abilities: [...ABILITY_KEYS] };
  dsp = { id: w.a.staffUserId, email: "dsp@example.test", role: "dsp", staffId: w.a.staffId, staffName: "Care GiverA", abilities: [] };
  const [v] = await w.db.insert(schema.visits).values({
    personId: w.a.personId, staffId: w.a.staffId, serviceAgreementId: w.a.agreementId, providerTaxId: "41-0000001", pmi: "10000000", serviceCode: "H2014", modifiers: ["UC", "U3"],
    renderingIdType: "npi", renderingId: "1111111111", placeOfService: "12", units: 8, status: "completed",
    clockInAt: new Date(Date.now() - 3 * 86_400_000), clockOutAt: new Date(Date.now() - 3 * 86_400_000 + 2 * 3_600_000), clockInLat: 44.97, clockInLng: -93.26,
    createdBy: w.a.staffUserId, updatedBy: w.a.staffUserId,
    shiftNote: "Client walked to the park with one verbal prompt and prepared lunch with hand-over-hand support.", incidentNote: null,
  }).returning();
  visitId = v.id;
});

test("a caregiver is not offered agency-wide lookups", () => {
  const names = [...tools.toolsFor(dsp).byName.keys()];
  for (const n of ["list_notes", "get_documentation_gaps", "get_review_queue", "get_staff_overview"]) assert.ok(!names.includes(n), n);
  assert.ok(names.includes("propose_draft"));
  assert.ok([...tools.toolsFor(admin).byName.keys()].includes("list_notes"));
});

test("a caregiver finds only assigned clients", async () => {
  const r = await call(scope(dsp), "find_clients", {});
  const names = (JSON.parse(r.content) as { clients: { name: string }[] }).clients.map((c) => c.name).sort();
  assert.deepEqual(names, ["Client A", "Second A"]);
});

test("a caregiver cannot open a client outside their caseload", async () => {
  const r = await call(scope(dsp), "get_client_overview", { client_id: w.b.personId });
  assert.equal(r.ok, false);
  assert.match(r.content, /not on your caseload/);
});

test("a caregiver can open only the note that is open, never a past one", async () => {
  const past = await call(scope(dsp), "get_note", { note_id: visitId });
  assert.equal(past.ok, false);
  const open = await call(scope(dsp, { visitId }), "get_note", { note_id: visitId });
  assert.equal(open.ok, true);
});

test("a disallowed tool refuses even when called directly", async () => {
  const s = scope(dsp);
  const t = tools.toolsFor(admin).byName.get("list_notes")!;
  const r = await tools.runTool(s, t, {});
  assert.equal(r.ok, false);
  assert.match(r.content, /Not permitted/);
});

test("notes come back with refs that resolve to a link", async () => {
  const s = scope(admin);
  const r = await call(s, "list_notes", { client_id: w.a.personId });
  const body = JSON.parse(r.content) as { notes: { ref: string; progressReview: string }[] };
  assert.equal(body.notes.length, 1);
  const src = s.sources.get(body.notes[0].ref);
  assert.equal(src?.kind, "note");
  assert.equal(src?.href, `?note=${visitId}`);
  assert.ok(s.people.has(w.a.personId));
  // A short ref the model saw resolves back to the full id.
  const again = await call(s, "get_note", { note_id: body.notes[0].ref });
  assert.equal(again.ok, true);
});

test("documentation gaps flag a note with no signatures and no outcome", async () => {
  const r = await call(scope(admin), "get_documentation_gaps", { client_id: w.a.personId });
  const problems = (JSON.parse(r.content) as { noteGaps: { problem: string }[] }).noteGaps.map((g) => g.problem);
  assert.ok(problems.includes("Caregiver has not signed"));
  assert.ok(problems.includes("No client signature and no reason recorded"));
  assert.ok(problems.includes("Addresses no support-plan outcome"));
});

test("a draft is shown, not saved, and keeps what is missing", async () => {
  const s = scope(admin, { personId: w.a.personId });
  const r = await call(s, "propose_draft", { kind: "incident_report", title: "Incident report", body: "On [date], Client A fell.", missing: ["Time of the fall"] });
  assert.equal(r.ok, true);
  assert.equal(s.drafts.length, 1);
  assert.equal(s.drafts[0].personId, w.a.personId);
  assert.deepEqual(s.drafts[0].missing, ["Time of the fall"]);
});

test("bad input is rejected before any lookup", async () => {
  const r = await call(scope(admin), "get_medication_record", { client_id: w.a.personId, from: "last week" });
  assert.equal(r.ok, false);
  assert.match(r.content, /Invalid input/);
});
