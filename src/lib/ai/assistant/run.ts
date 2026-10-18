import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "@/db";
import { audited } from "@/db/audited";
import { getOrganization } from "@/db/queries";
import type { CurrentUser } from "@/lib/auth";
import { explainAiError } from "@/lib/ai/extract-agreement";
import { describeContext, runTool, toolsFor, type ToolScope } from "./tools";
import type { AssistantContext, AssistantEvent, ChatTurn } from "./types";

/**
 * The assistant's loop (Oct 18, 2026): Claude reads the record only through the lookups in
 * tools.ts, every lookup runs under the asking person's abilities, and drafts come back as cards
 * the person reviews — nothing here writes to the record. One audit entry per question names the
 * lookups used and the clients whose records were read.
 */

export const ASSISTANT_MODEL = "claude-opus-5-5";
const MAX_STEPS = 10;

const SYSTEM = `You are the EVVora assistant, built into an electronic health record for Minnesota 245D home and community-based services providers. You help caregivers (direct support professionals) write service notes, and help supervisors and managers prepare reports, review documentation and understand how the people they support are doing.

How you work:
- Everything you say about a client, a note, a medication, an authorization or a staff member must come from a lookup you ran in this conversation. Use the tools; never rely on memory or guess. If the record does not hold something, say so plainly.
- Cite the records behind each claim by writing their ref in square brackets right after the claim, exactly as the tool returned it, e.g. "Kevin refused his evening dose twice [mar:1a2b3c4d]". Only cite refs a tool gave you.
- Never invent facts: no made-up times, quotes, events, vitals, diagnoses or clinical judgements. When a draft needs a detail you cannot find (the time of an incident, who was notified, what the person said), ask for it, or write the draft with a clear [bracketed placeholder] and list the detail in the draft's missing field.
- Drafts go through propose_draft so the user can read, edit and approve them; never paste a long draft into chat. After proposing one, say in one or two sentences what it covers and what is still missing. You cannot save anything to the record yourself; the user approves and saves.
- A lookup refused for permissions is final. Tell the user it is outside what their role can see; do not try to reach the same data another way.
- Dates and times are Central time. Units are 15 minutes. The client identifier is the PMI number.

Writing standards for 245D documentation:
- Progress reviews (the narrative on a service note): one paragraph, 3 to 7 sentences, past tense, objective and specific, from the caregiver's point of view. Describe what the person did, the support provided and its level, and progress toward the outcomes worked on. Refer to the person by first name. No diagnoses or opinions; observable behaviour only.
- When improving wording, keep every fact and change only clarity, grammar and professional tone. When organising, keep the facts and order them: activities and supports, outcomes, health and safety, anything to follow up.
- When checking a note for missing details, compare it with what was marked on the note and what a reviewer expects: level of support, activities, outcomes addressed, medications, anything unusual, and whether the client signed.
- Progress summaries: period covered, services delivered, progress on each outcome with the evidence (answer tallies, reviews, examples from notes), medication adherence when the person has medication support, concerns and recommendations. Plain headings, short paragraphs.
- Incident report drafts: what happened, when and where, who was involved, the immediate response, who was notified and when, and follow-up. Facts only; leave every unknown as a placeholder and list it as missing.

Style: be brief and direct. Lead with the answer. Use short paragraphs or a few bullets; no tables unless asked. Use plain words a caregiver would use.`;

function client() {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic({ defaultHeaders: workspace ? { "anthropic-workspace-id": workspace } : undefined });
}

export async function runAssistant(user: CurrentUser, history: ChatTurn[], context: AssistantContext, emit: (e: AssistantEvent) => void): Promise<void> {
  const scope: ToolScope = { user, context, sources: new Map(), drafts: [], people: new Set(), ids: new Map() };
  const { defs, byName } = toolsFor(user);
  const org = await getOrganization();
  const role = user.abilities.includes("edit_visits") ? "a supervisor or manager who reviews notes" : "a caregiver (direct support professional)";
  const where = await describeContext(scope);
  const situation = [
    `The user is ${user.staffName ?? user.email}, ${role}, at ${org.name}. Today is ${new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`,
    user.abilities.includes("edit_visits") ? null : "Caregivers cannot open past notes through you; help them with the note they have open and with what they need to know about the people they support.",
    where,
  ].filter(Boolean).join("\n");

  // Only text crosses turns: earlier answers come back as plain assistant text, so nothing the
  // client sends can pose as a tool result. The page context rides as a system message after the
  // newest question, which keeps the stable prefix (instructions, tools, history) cacheable.
  const messages: Anthropic.Beta.BetaMessageParam[] = history.slice(-20).map((t) => ({ role: t.role, content: t.text.slice(0, 20000) }));
  messages.push({ role: "system", content: situation });

  const sent = new Set<string>();
  const flushSources = () => {
    const fresh = [...scope.sources.values()].filter((s) => !sent.has(s.ref));
    if (!fresh.length) return;
    fresh.forEach((s) => sent.add(s.ref));
    emit({ type: "sources", sources: fresh });
  };
  const used = new Set<string>();
  const ai = client();
  let wroteText = false;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const stream = ai.beta.messages.stream({
        model: ASSISTANT_MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: defs,
        messages,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      let first = true;
      stream.on("text", (delta) => {
        if (first && wroteText) emit({ type: "text", delta: "\n\n" });
        first = false;
        wroteText = true;
        emit({ type: "text", delta });
      });
      const message = await stream.finalMessage();

      if (message.stop_reason === "refusal") {
        emit({ type: "error", message: "The assistant declined this request. Try rephrasing it, or write this part by hand." });
        break;
      }
      const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (message.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: message.content }); continue; }
      if (!calls.length) {
        if (message.stop_reason === "max_tokens") emit({ type: "error", message: "The answer was cut off. Ask for a shorter version or one part at a time." });
        break;
      }
      if (message.stop_reason === "max_tokens") { emit({ type: "error", message: "The request was too large to finish. Try a shorter date range." }); break; }

      messages.push({ role: "assistant", content: message.content });
      const results = await Promise.all(calls.map(async (call) => {
        const t = byName.get(call.name);
        if (!t) return { type: "tool_result" as const, tool_use_id: call.id, is_error: true, content: "Unknown tool." };
        const pendingStatus = (() => { try { return t.status(t.schema.parse(call.input ?? {})); } catch { return null; } })();
        if (pendingStatus) emit({ type: "status", label: pendingStatus });
        used.add(call.name);
        const r = await runTool(scope, t, call.input);
        return { type: "tool_result" as const, tool_use_id: call.id, is_error: !r.ok, content: r.content };
      }));
      flushSources();
      for (const d of scope.drafts.splice(0)) emit({ type: "draft", draft: d });
      messages.push({ role: "user", content: results });
      if (step === MAX_STEPS - 1) emit({ type: "error", message: "That took too many lookups. Narrow the question (one client, a shorter date range) and ask again." });
    }
  } catch (e) {
    console.error("assistant failed", e instanceof Anthropic.APIError ? e.status : e instanceof Error ? e.message : "error");
    emit({ type: "error", message: explainAiError(e) });
  } finally {
    flushSources();
    if (used.size) {
      // Reads are logged the way a reveal is: who asked, which lookups ran, whose records they touched.
      const db = await getDb();
      await audited(db, { userId: user.id }).event("reveal", null, "ai_assistant", { tools: [...used], people: [...scope.people], context: { personId: context.personId ?? null, staffId: context.staffId ?? null, visitId: context.visitId ?? null } }).catch(() => undefined);
    }
    emit({ type: "done" });
  }
}
