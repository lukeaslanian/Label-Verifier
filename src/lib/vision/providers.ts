import Anthropic from "@anthropic-ai/sdk";
import type { ProcessedUpload } from "../imagePrep";
import { withTimeout } from "./withTimeout";

/**
 * One call to a vision model: images/PDFs plus a text prompt in, text out.
 * Every model gets the same inputs and prompt, so they're interchangeable.
 */
type Ask = (prompt: string, uploads: ProcessedUpload[], maxTokens: number) => Promise<string>;

export interface VisionModel {
  name: string;
  ask: Ask;
}

// Flash-Lite, because the newer Gemini Flash tiers can't fully turn off
// "thinking" and took 7.5-16s per call. Flash-Lite answers in ~2s.
const askGemini: Ask = async (prompt, uploads, maxTokens) => {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              ...uploads.map((u) => ({ inline_data: { mime_type: u.mimeType, data: u.buffer.toString("base64") } })),
            ],
          },
        ],
        // Temperature 0: this is reading, and the default sampling made the
        // same label read differently from one run to the next.
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini API call failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const finishReason: string | undefined = data.candidates?.[0]?.finishReason;
  if (finishReason === "MAX_TOKENS") console.error("Gemini response was cut off at maxOutputTokens");
  // A refusal still comes back as HTTP 200 with empty content, like
  // "RECITATION" (its copyright filter), which refused a real Coors Light
  // label. Thrown so the next model takes over instead of "nothing found".
  if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
    throw new Error(`Gemini declined to read this (${finishReason})`);
  }
  return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
};

// Reasoning is off since this is just reading, and it keeps calls fast.
const askOpenAI =
  (model: string): Ask =>
  async (prompt, uploads, maxTokens) => {
    const files = uploads.map((u, i) =>
      u.mimeType === "application/pdf"
        ? { type: "input_file", filename: `document-${i}.pdf`, file_data: `data:application/pdf;base64,${u.buffer.toString("base64")}` }
        : { type: "input_image", image_url: `data:image/png;base64,${u.buffer.toString("base64")}`, detail: "high" }
    );
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model,
        reasoning: { effort: "none" },
        max_output_tokens: maxTokens,
        input: [{ role: "user", content: [...files, { type: "input_text", text: prompt }] }],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`OpenAI API call failed: ${res.status} ${JSON.stringify(data.error ?? data).slice(0, 300)}`);
    return (data.output ?? [])
      .flatMap((o: { content?: { type: string; text?: string }[] }) => o.content ?? [])
      .filter((c: { type: string }) => c.type === "output_text")
      .map((c: { text?: string }) => c.text ?? "")
      .join("");
  };

let anthropic: Anthropic | null = null;
// No temperature setting: Claude Sonnet 5 rejects it.
const askClaude: Ask = async (prompt, uploads, maxTokens) => {
  anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const media: Anthropic.Messages.ContentBlockParam[] = uploads.map((u) => {
    const data = u.buffer.toString("base64");
    return u.mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: "image/png", data } };
  });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: [...media, { type: "text", text: prompt }] }],
  });
  if (message.stop_reason === "max_tokens") console.error("Claude response was cut off at max_tokens");
  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text : "";
};

const timed = (name: string, ask: Ask, ms: number): VisionModel => ({
  name,
  ask: (prompt, uploads, maxTokens) => withTimeout(ask(prompt, uploads, maxTokens), ms, name),
});

/**
 * The models, in the order they're asked. Measured alone on the 19 real
 * samples (two runs each): Gemini Flash-Lite 98% of label fields right at
 * ~2s median, GPT-6 Luna 96% at ~4s, GPT-6 Sol 96% at ~5s, Claude Sonnet
 * 91% at ~7s (mostly strict "not bold" calls). Claude Haiku scored 84% and
 * missed whole government warnings, so it isn't used. The first model
 * does the work; the rest take over when one errors or refuses, and give
 * second opinions on label fields that aren't settled. Models without an
 * API key are skipped.
 */
export function visionModels(): VisionModel[] {
  return [
    // A full-page scan can take Flash-Lite ~12s, though most take ~2s.
    process.env.GEMINI_API_KEY ? timed("Gemini Flash-Lite", askGemini, 15000) : null,
    process.env.OPENAI_API_KEY ? timed("GPT-6 Luna", askOpenAI("gpt-6-luna"), 15000) : null,
    process.env.OPENAI_API_KEY ? timed("GPT-6 Sol", askOpenAI("gpt-6-sol"), 20000) : null,
    process.env.ANTHROPIC_API_KEY ? timed("Claude Sonnet", askClaude, 25000) : null,
  ].filter((m): m is VisionModel => m !== null);
}

/** Asks each model in order until one answers. */
export async function askFirstAvailable(
  prompt: string,
  uploads: ProcessedUpload[],
  maxTokens: number
): Promise<{ text: string; model: string }> {
  const models = visionModels();
  if (models.length === 0) throw new Error("No vision API key is configured (see README).");
  let lastError: unknown;
  for (const model of models) {
    try {
      return { text: await model.ask(prompt, uploads, maxTokens), model: model.name };
    } catch (err) {
      console.error(`${model.name} failed, trying the next model`, err);
      lastError = err;
    }
  }
  throw lastError;
}
