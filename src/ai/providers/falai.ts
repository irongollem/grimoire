import type { ImageProvider } from "./types";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function createFalAiImageProvider(apiKey: string, model = "fal-ai/flux-2/flex"): ImageProvider {
  return {
    async generate(prompt: string, _size: string): Promise<string> {
      const res = await fetch(`https://fal.run/${model}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${apiKey}`,
        },
        body: JSON.stringify({ prompt, image_size: { width: 768, height: 1152 } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `fal.ai error ${res.status}`);
      }
      const { images } = await res.json();
      const imgRes = await fetch(images[0].url);
      if (!imgRes.ok) throw new Error(`fal.ai image fetch error ${imgRes.status}`);
      return arrayBufferToBase64(await imgRes.arrayBuffer());
    },
    // No edit() — alter-ego disguise is skipped when this provider is active
  };
}
