import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const ExtractedAgreement = z.object({
  agreementNumber: z.string().nullable().describe("Service agreement or authorization number as printed"),
  pmi: z.string().nullable().describe("Recipient PMI / PMI #, 8 digits"),
  clientName: z.string().nullable(),
  serviceCode: z.string().nullable().describe("HCPCS procedure code, e.g. H2014"),
  modifiers: z.array(z.string()).describe("Modifiers printed with the procedure code, e.g. ['UC','U3']; empty if none"),
  serviceDescription: z.string().nullable(),
  authorizedUnits: z.number().nullable().describe("Total units authorized for the line"),
  unitRate: z.number().nullable().describe("Rate per unit in dollars"),
  startDate: z.string().nullable().describe("YYYY-MM-DD"),
  endDate: z.string().nullable().describe("YYYY-MM-DD"),
  authorizingCounty: z.string().nullable(),
  providerName: z.string().nullable(),
  notes: z.string().nullable().describe("Anything ambiguous or that a reviewer should double-check"),
});

export type ExtractedAgreement = z.infer<typeof ExtractedAgreement>;

const SYSTEM = `You extract billing details from Minnesota DHS home and community-based services service agreement (SA) letters and authorization notices for a 245D-licensed provider.
Read the document carefully. If the letter authorizes several service lines, return the line most likely delivered by a 245D provider (individualized home supports, respite, day support, employment services, and similar) and describe the others in notes.
Dates must be YYYY-MM-DD. Units are integers. Rate is dollars per unit. Never invent values: use null when a field is not printed.`;

export async function extractAgreementFromPdf(pdf: Buffer): Promise<ExtractedAgreement> {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 4096,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
          { type: "text", text: "Extract the service agreement details from this document." },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ExtractedAgreement) },
  });
  if (!response.parsed_output) throw new Error("The document could not be read as a service agreement.");
  return response.parsed_output;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
