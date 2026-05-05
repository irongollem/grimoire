import type { TextProvider, TextUsage } from "./types";

const JSON_INSTRUCTION = "\n\nRespond with a valid JSON object only, no markdown fencing.";
const MODEL = "claude-sonnet-4-6";

export function createAnthropicTextProvider(apiKey: string, model = MODEL): TextProvider {
  return {
    async complete(systemPrompt: string, userPrompt: string) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: systemPrompt + JSON_INSTRUCTION,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Anthropic error ${res.status}`);
      }
      const data = await res.json();
      const usage: TextUsage = {
        input_tokens:  data.usage?.input_tokens  ?? 0,
        output_tokens: data.usage?.output_tokens ?? 0,
        model,
        provider: "anthropic",
      };
      return { content: data.content[0].text as string, usage };
    },
  };
}
