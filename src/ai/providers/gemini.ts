import type { TextProvider, TextUsage } from "./types";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-3.1-flash";

export function createGeminiTextProvider(apiKey: string, model = MODEL): TextProvider {
  return {
    async complete(systemPrompt: string, userPrompt: string) {
      const res = await fetch(
        `${BASE_URL}/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Gemini error ${res.status}`);
      }
      const data = await res.json();
      const meta = data.usageMetadata ?? {};
      const usage: TextUsage = {
        input_tokens:  meta.promptTokenCount     ?? 0,
        output_tokens: meta.candidatesTokenCount ?? 0,
        model,
        provider: "google",
      };
      return { content: data.candidates[0].content.parts[0].text as string, usage };
    },
  };
}
