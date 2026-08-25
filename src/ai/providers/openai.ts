import type { TextProvider, ImageProvider, TextUsage, ImageUsage } from "./types";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const IMAGE_URL = "https://api.openai.com/v1/images/generations";
const EDIT_URL = "https://api.openai.com/v1/images/edits";

const MODEL = "gpt-5.6-luna";

export function createOpenAiTextProvider(apiKey: string): TextProvider {
  return {
    async complete(systemPrompt: string, userPrompt: string) {
      const res = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          reasoning_effort: "low",
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
      const usage: TextUsage = {
        input_tokens:  data.usage?.prompt_tokens     ?? 0,
        output_tokens: data.usage?.completion_tokens  ?? 0,
        model: MODEL,
        provider: "openai",
      };
      return { content: data.choices[0].message.content as string, usage };
    },
  };
}

export function createOpenAiImageProvider(
  apiKey: string,
  model: "gpt-image-2" | "gpt-image-1.5" | "gpt-image-1-mini" = "gpt-image-2",
): ImageProvider {
  const baseUsage: Omit<ImageUsage, "image_count"> = { model, provider: "openai" };

  /** Pull token usage out of an OpenAI image-API response for token-based costing. */
  function imageTokens(data: {
    usage?: {
      input_tokens?: number;
      input_tokens_details?: { text_tokens?: number; image_tokens?: number };
      output_tokens?: number;
    };
  }): Pick<ImageUsage, "input_tokens" | "input_image_tokens" | "output_tokens"> {
    const u = data.usage;
    return {
      input_tokens:       u?.input_tokens_details?.text_tokens  ?? u?.input_tokens ?? 0,
      input_image_tokens: u?.input_tokens_details?.image_tokens ?? 0,
      output_tokens:      u?.output_tokens ?? 0,
    };
  }

  return {
    async generate(prompt: string, size: string) {
      const res = await fetch(IMAGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, prompt, size, output_format: "webp" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Image generation error ${res.status}`);
      }
      const data = await res.json();
      return {
        b64: data.data?.[0]?.b64_json as string,
        usage: { ...baseUsage, image_count: 1, ...imageTokens(data) },
      };
    },

    async edit(sources: Blob[], prompt: string, size: string) {
      const form = new FormData();
      form.append("model", model);
      sources.forEach((source, i) =>
        form.append("image[]", new File([source], `ref_${i}.webp`, { type: "image/webp" })),
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
        throw new Error(body?.error?.message ?? `Image edit error ${res.status}`);
      }
      const data = await res.json();
      return {
        b64: data.data?.[0]?.b64_json as string,
        usage: { ...baseUsage, image_count: 1, ...imageTokens(data) },
      };
    },
  };
}
