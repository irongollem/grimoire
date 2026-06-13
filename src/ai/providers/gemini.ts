import type { TextProvider, TextUsage, ImageProvider, ImageUsage } from "./types";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-3.1-flash";
const IMAGE_MODEL = "gemini-3.1-flash-image";

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  });
}

function sizeToAspect(size: string): { aspectRatio: string; imageSize: string } {
  const m = /^(\d+)\s*x\s*(\d+)$/i.exec(size.trim());
  const [w, h] = m ? [Number(m[1]), Number(m[2])] : [1024, 1024];
  const r = w / h;
  return { aspectRatio: r > 1.2 ? "3:2" : r < 0.83 ? "2:3" : "1:1", imageSize: "1K" };
}

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

/** Gemini "Nano Banana" image generation — supports reference images via inline_data. */
export function createGeminiImageProvider(apiKey: string, model = IMAGE_MODEL): ImageProvider {
  async function call(prompt: string, size: string, sources?: Blob[]) {
    const parts: unknown[] = [{ text: prompt }];
    for (const source of sources ?? []) {
      parts.push({ inline_data: { mime_type: source.type || "image/webp", data: await blobToBase64(source) } });
    }
    const { aspectRatio, imageSize } = sizeToAspect(size);
    const res = await fetch(`${BASE_URL}/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio, imageSize } },
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? `Gemini image error ${res.status}`);
    }
    const data = await res.json();
    const outParts = (data?.candidates?.[0]?.content?.parts ?? []) as Array<{ inlineData?: { data?: string }; inline_data?: { data?: string } }>;
    const imgPart = outParts.find((p) => p?.inlineData?.data ?? p?.inline_data?.data);
    const b64 = imgPart?.inlineData?.data ?? imgPart?.inline_data?.data;
    if (!b64) throw new Error("Gemini returned no image");
    const meta = data.usageMetadata ?? {};
    const usage: ImageUsage = {
      model, provider: "gemini", image_count: 1,
      input_tokens:  meta.promptTokenCount     ?? 0,
      output_tokens: meta.candidatesTokenCount ?? 0,
    };
    return { b64, usage };
  }
  return {
    generate: (prompt, size) => call(prompt, size),
    edit:     (sources, prompt, size) => call(prompt, size, sources),
  };
}
