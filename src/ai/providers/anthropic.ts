import type { TextProvider } from "./types";

const JSON_INSTRUCTION = "\n\nRespond with a valid JSON object only, no markdown fencing.";

export function createAnthropicTextProvider(apiKey: string, model = "claude-sonnet-4-6"): TextProvider {
  return {
    async complete(systemPrompt: string, userPrompt: string): Promise<string> {
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
      return (await res.json()).content[0].text as string;
    },
  };
}
