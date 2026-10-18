import { z } from "zod";
import { aiConfigured } from "@/lib/ai/extract-agreement";
import { runAssistant } from "@/lib/ai/assistant/run";
import type { AssistantEvent } from "@/lib/ai/assistant/types";
import { getCurrentUser } from "@/lib/auth";

/**
 * The assistant's one endpoint. Streams newline-delimited JSON events (text, status, sources,
 * drafts) so the panel shows the answer as it forms. Signed-in only; what the assistant may read is
 * decided per lookup from the person's own abilities, never from anything in the request.
 */
export const maxDuration = 300;

const uuid = z.uuid().optional();
const Body = z.object({
  turns: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(20000) })).min(1).max(40),
  context: z.object({
    path: z.string().max(300).optional(),
    personId: uuid,
    staffId: uuid,
    visitId: uuid,
    noteDraft: z.object({
      interactionLevel: z.string().max(40).optional(),
      skills: z.array(z.string().max(200)).max(60),
      activities: z.array(z.string().max(400)).max(60),
      tasks: z.array(z.string().max(200)).max(60),
      outcomes: z.array(z.object({ title: z.string().max(300), line: z.string().max(1000) })).max(40),
      goalAnswers: z.array(z.object({ prompt: z.string().max(400), response: z.string().max(20), note: z.string().max(1000).optional() })).max(80),
      text: z.string().max(12000),
    }).optional(),
  }),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: "Sign in again." }, { status: 401 });
  if (!aiConfigured()) return Response.json({ message: "The assistant is off. An admin can turn it on by adding ANTHROPIC_API_KEY to the app's environment settings and redeploying." }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "That request could not be read." }, { status: 400 });
  const { turns, context } = parsed.data;
  if (turns[turns.length - 1].role !== "user" || turns[0].role !== "user") return Response.json({ message: "Ask a question first." }, { status: 400 });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: AssistantEvent) => { try { controller.enqueue(encoder.encode(JSON.stringify(e) + "\n")); } catch { /* the reader went away */ } };
      await runAssistant(user, turns, context, emit);
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
