export type LyriaModel = "lyria-3-clip-preview" | "lyria-3-pro-preview";

export const LYRIA_MODELS: { id: LyriaModel; label: string; detail: string }[] = [
  { id: "lyria-3-clip-preview", label: "Clip (30 s)", detail: "$0.04 · loops well" },
  { id: "lyria-3-pro-preview",  label: "Full Song (~2 min)", detail: "$0.08 · verses + chorus" },
];

/** Maximum lyrics length in characters (keeps generated audio within ~3 min, ~400 words). */
export const LYRICS_MAX_CHARS = 2200;

export async function generateMusicWithLyria(
  style: string,
  model: LyriaModel,
  apiKey: string,
  lyrics?: string,
): Promise<File> {
  const prompt = lyrics?.trim()
    ? `${lyrics.trim()}\n\nMusical style: ${style}`
    : style;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["AUDIO", "TEXT"] },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body?.error?.message ?? `Lyria API error ${res.status}`);
  }

  const json = await res.json() as {
    candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[]
  };

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const audioPart = parts.find((p) => p.inlineData?.data);
  if (!audioPart?.inlineData?.data) throw new Error("No audio data in Lyria response.");

  const binary = atob(audioPart.inlineData.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: "audio/mpeg" });
  return new File([blob], `ai-generated-${Date.now()}.mp3`, { type: "audio/mpeg" });
}
