import type { TextProvider } from "./types";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export function createGeminiTextProvider(apiKey: string, model = "gemini-3.1-flash"): TextProvider {
  return {
    async complete(systemPrompt: string, userPrompt: string): Promise<string> {
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
      return (await res.json()).candidates[0].content.parts[0].text as string;
    },
  };
}
