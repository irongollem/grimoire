/**
 * Shared text-provider helpers for AI generation Edge Functions.
 *
 * This is the single home for edge-function text-provider calls (OpenAI,
 * Anthropic, Gemini). New AI Edge Functions must import from here rather
 * than copy-pasting their own `openaiText` / `anthropicText` / `geminiText`.
 *
 *   import { callText, MissingTextKeyError } from "../_shared/textGen.ts";
 *
 * or, for direct provider access:
 *
 *   import { openaiText, anthropicText, geminiText } from "../_shared/textGen.ts";
 */

// ── Text providers ────────────────────────────────────────────────────────────

export interface TextUsage { input_tokens: number; output_tokens: number; model: string; provider: string }
export interface TextResult { content: string; usage: TextUsage }

export async function openaiText(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  maxTokens?: number,
): Promise<TextResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      ...(maxTokens !== undefined ? { max_completion_tokens: maxTokens } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `OpenAI text error ${res.status}`);
  }
  const data = await res.json();
  return {
    content: data.choices[0].message.content as string,
    usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0, model, provider: "openai" },
  };
}

export async function anthropicText(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  maxTokens = 4096,
): Promise<TextResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      system: system + "\n\nRespond with a valid JSON object only, no markdown fencing.",
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Anthropic error ${res.status}`);
  }
  const data = await res.json();
  return {
    content: data.content[0].text as string,
    usage: { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0, model, provider: "anthropic" },
  };
}

export async function geminiText(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  maxTokens?: number,
): Promise<TextResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          ...(maxTokens !== undefined ? { maxOutputTokens: maxTokens } : {}),
        },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Gemini error ${res.status}`);
  }
  const data = await res.json();
  const meta = data.usageMetadata ?? {};
  return {
    content: data.candidates[0].content.parts[0].text as string,
    usage: { input_tokens: meta.promptTokenCount ?? 0, output_tokens: meta.candidatesTokenCount ?? 0, model, provider: "google" },
  };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export class MissingTextKeyError extends Error {}

// Defaults mirror provider_config.text_model in the DB. The anthropic id
// (claude-haiku-3-20240307) looks malformed but is what production actually
// holds and what the pre-extraction code fell back to — copied verbatim.
export const DEFAULT_TEXT_MODELS = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-3-20240307",
  gemini: "gemini-2.5-flash",
} as const;

/**
 * Select and call the campaign's configured text provider, mirroring the
 * selection logic previously duplicated across the AI generation Edge
 * Functions: anthropic (if keyed) → gemini (if keyed) → openai (default,
 * throws MissingTextKeyError if unkeyed).
 */
export async function callText(opts: {
  provider: string;
  keys: { openai: string | null; anthropic: string | null; gemini: string | null };
  model?: string | null;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<TextResult> {
  const { provider, keys, model, system, user, maxTokens } = opts;

  if (provider === "anthropic" && keys.anthropic) {
    return anthropicText(keys.anthropic, model ?? DEFAULT_TEXT_MODELS.anthropic, system, user, maxTokens);
  }
  if (provider === "gemini" && keys.gemini) {
    return geminiText(keys.gemini, model ?? DEFAULT_TEXT_MODELS.gemini, system, user, maxTokens);
  }
  if (!keys.openai) {
    throw new MissingTextKeyError("No OpenAI API key configured");
  }
  return openaiText(keys.openai, model ?? DEFAULT_TEXT_MODELS.openai, system, user, maxTokens);
}
