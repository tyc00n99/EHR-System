import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Shape of a Minnesota DHS "Service Agreement" notice (the MMIS letter counties
 * send providers). Header block, then one or more numbered service lines.
 */
export const ExtractedLine = z.object({
  lineNumber: z.number().nullable().describe("LINE NBR"),
  status: z.string().nullable().describe("APPROVED, DENIED, PENDING, or CLOSED as printed"),
  procedureCode: z.string().nullable().describe("HCPCS procedure code, e.g. S5135"),
  modifiers: z.array(z.string()).describe("MOD1-4 values, e.g. ['UC']; empty if none"),
  description: z.string().nullable().describe("PROCEDURE DESCRIPTION as printed"),
  quantity: z.number().nullable().describe("Quantity of units authorized on this line"),
  ratePerUnit: z.number().nullable().describe("Rate/Unit in dollars"),
  totalAmount: z.number().nullable().describe("Total Amount in dollars"),
  startDate: z.string().nullable().describe("Line Start Date, YYYY-MM-DD"),
  endDate: z.string().nullable().describe("Line End Date, YYYY-MM-DD"),
});

export const ExtractedAgreement = z.object({
  agreementNumber: z.string().nullable().describe("SERVICE AGREEMENT# as printed, digits only"),
  pmi: z.string().nullable().describe("RECIPIENT ID, 8 digits"),
  recipientName: z.string().nullable().describe("RECIPIENT NAME exactly as printed, usually LAST, FIRST"),
  effectiveDate: z.string().nullable().describe("Agreement EFFECTIVE DATE, YYYY-MM-DD"),
  throughDate: z.string().nullable().describe("Agreement THROUGH DATE, YYYY-MM-DD"),
  icd10: z.string().nullable().describe("ICD-10 DIAGNOSIS CODE if printed"),
  caseManagerName: z.string().nullable(),
  caseManagerPhone: z.string().nullable(),
  providerId: z.string().nullable().describe("Provider ID (UMPI/NPI) the agreement is issued to"),
  providerName: z.string().nullable().describe("Provider organization the letter is addressed to"),
  letterDate: z.string().nullable().describe("Date printed at the top of the letter, YYYY-MM-DD"),
  lines: z.array(ExtractedLine).describe("Every service line on the agreement, in printed order"),
  notes: z.string().nullable().describe("Anything ambiguous or that a reviewer should double-check"),
});

export type ExtractedAgreement = z.infer<typeof ExtractedAgreement>;
export type ExtractedLine = z.infer<typeof ExtractedLine>;

const SYSTEM = `You extract billing details from Minnesota DHS Home and Community Based Services "Service Agreement" notices sent to 245D-licensed providers.
The letter has a header (SERVICE AGREEMENT#, RECIPIENT ID, RECIPIENT NAME, EFFECTIVE DATE, THROUGH DATE, an ICD-10 code, Case Manager Name and Number, Provider ID) and then service lines, each with LINE NBR, STATUS, PROCEDURE CODE, MOD1-4, PROCEDURE DESCRIPTION, Total Amount, Rate/Unit, Quantity, Start Date, and End Date.
Return every line. Convert dates like 07/01/26 to 2026-07-01. Quantity is an integer. Money is dollars without symbols. Never invent values: use null when something is not printed.`;

function client() {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic({ defaultHeaders: workspace ? { "anthropic-workspace-id": workspace } : undefined });
}

export async function extractAgreementFromPdf(pdf: Buffer): Promise<ExtractedAgreement> {
  const response = await client().messages.parse({
    model: "claude-opus-5",
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } }, { type: "text", text: "Extract the service agreement header and every service line from this notice." }] }],
    output_config: { format: zodOutputFormat(ExtractedAgreement) },
  });
  if (!response.parsed_output) throw new Error("The document could not be read as a service agreement.");
  return response.parsed_output;
}

/** Turns SDK errors into a sentence a supervisor can act on. */
export function explainAiError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.";
  if (e instanceof Anthropic.BadRequestError && /workspace/i.test(e.message)) return "This API key is tied to a workspace. Add ANTHROPIC_WORKSPACE_ID to .env.local (Console → Settings → Workspaces).";
  if (e instanceof Anthropic.RateLimitError) return "The AI service is busy. Try again in a minute.";
  if (e instanceof Anthropic.APIError) return `The AI service returned an error (${e.status}). Fill the fields in by hand or try again.`;
  return e instanceof Error ? e.message : "Extraction failed.";
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
