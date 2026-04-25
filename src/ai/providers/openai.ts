import type { TextProvider, ImageProvider } from "./types";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const IMAGE_URL = "https://api.openai.com/v1/images/generations";
const EDIT_URL = "https://api.openai.com/v1/images/edits";

export function createOpenAiTextProvider(apiKey: string): TextProvider {
  return {
    async complete(systemPrompt: string, userPrompt: string): Promise<string> {
      const res = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `OpenAI error ${res.status}`);
      }
      const data = await res.json();
      return data.choices[0].message.content as string;
    },
  };
}

export function createOpenAiImageProvider(
  apiKey: string,
  model: "gpt-image-2" | "gpt-image-1-mini" = "gpt-image-2",
): ImageProvider {
  return {
    async generate(prompt: string, size: string): Promise<string> {
      const res = await fetch(IMAGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          size,
          output_format: "webp",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error?.message ?? `Image generation error ${res.status}`,
        );
      }
      const data = await res.json();
      return data.data?.[0]?.b64_json as string;
    },

    async edit(source: Blob, prompt: string, size: string): Promise<string> {
      const form = new FormData();
      form.append("model", model);
      form.append(
        "image[]",
        new File([source], "portrait.webp", { type: "image/webp" }),
      );
      form.append("prompt", prompt);
      form.append("size", size);
      form.append("output_format", "webp");
      form.append("n", "1");
      const res = await fetch(EDIT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error?.message ?? `Image edit error ${res.status}`,
        );
      }
      const data = await res.json();
      return data.data?.[0]?.b64_json as string;
    },
  };
}
