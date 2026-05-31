import { getTextProvider } from "@/ai/providers";
import type { TextUsage } from "@/ai/providers/types";

export type LyriaModel = "lyria-3-clip-preview" | "lyria-3-pro-preview";

export const LYRIA_MODELS: { id: LyriaModel; label: string; detail: string }[] = [
  { id: "lyria-3-clip-preview", label: "Clip (30 s)", detail: "$0.04 · loops well" },
  { id: "lyria-3-pro-preview",  label: "Full Song (~2 min)", detail: "$0.08 · verses + chorus" },
];

/** Maximum lyrics length in characters (keeps generated audio within ~3 min, ~400 words). */
export const LYRICS_MAX_CHARS = 2200;

const STRUCTURE_SYSTEM_FULL = `You are a music prompt engineer for Google Lyria, an AI music generation model. Convert the user's plain-language music description into a detailed structured Lyria prompt.

## Hard constraints
- Total duration MUST NOT exceed 3:00. Every segment's end time must be ≤ 3:00.
- Intro and Outro each appear at most once. Verse, Chorus, Build, Bridge, Interlude may repeat — number them when they do (Verse 1, Verse 2, Chorus, etc.).

## Available segment types
Intro · Build · Verse · Chorus · Bridge · Interlude · Outro
Not every song needs all types. Choose a sequence that fits the mood and energy arc.
ONLY use these labels — never invent custom names like "Birth Moment" or "Opening". Lyria only resets its arrangement at recognised structural labels; a custom name will be ignored and the previous section's texture will continue.

## Instrumental breathing room (critical)
Real songs breathe. Do NOT fill every second with singing. Always include at least one purely instrumental segment (no lyrics) — typically the Intro, an Interlude between sections, and/or the Outro. These give the mix space and make the vocal sections feel intentional.

## Time-budgeting lyrics
When lyrics are provided, size the time window by line count:
- Ornamental / folk / slow styles: ~10 s per sung line
- Normal pacing: ~6–8 s per sung line
- Fast / rap / chant: ~4–5 s per sung line
Add 2–4 s of breathing space after each vocal line for natural phrasing. A verse of 4 lines at folk pace needs ~44–48 s minimum, not 20 s.

## Per-segment format
[mm:ss – mm:ss] Segment name: Intensity: N/10. <description>

- Instrumental segments: 2–3 sentences — anchor instruments, rhythm, melodic character, atmosphere.
- Vocal segments with lyrics: 1 sentence of instrumentation/mood only (the lyrics carry the rest), then on the next line: "Lyrics:" followed by the lyric text.

If the user provides lyrics with [Verse], [Chorus], [Build], [Bridge] markers, align segments to those sections exactly.

## Cultural style vs. language
If the user requests a cultural vocal style (e.g. Arabic, Persian, Indian classical), apply that tradition fully — tuning, ornamentation, vocal timbre, phrasing. But if lyrics are provided in another language (e.g. English), the singer must deliver those lyrics as written. Make this explicit in the global instruction: e.g. "Full Arabic vocal tradition and maqam tuning throughout. Singer performs in this style but sings the English lyrics as written — do not substitute Arabic phonemes or language."

Return ONLY the structured prompt — no preamble, no commentary.`;

const STRUCTURE_SYSTEM_CLIP = `You are a music prompt engineer for Google Lyria, an AI music generation model. Convert the user's plain-language music description into a rich 30-second looping clip prompt.

Include: primary genre, key instruments, rhythm feel, tempo range (e.g. "60 bpm"), melodic character, mood, and atmosphere. Be specific — use professional music production vocabulary. Keep it to 3-5 sentences.

Return ONLY the prompt text — no preamble, no commentary.`;

/**
 * Converts a plain-language description into a structured Lyria prompt via
 * the campaign's configured text provider (OpenAI, Anthropic, Gemini, etc.).
 * Returns { structured, textUsage } so the caller can log credits.
 */
export async function structureMusicPrompt(
  description: string,
  model: LyriaModel,
  lyrics?: string,
): Promise<{ structured: string; textUsage: TextUsage }> {
  const system = model === "lyria-3-pro-preview" ? STRUCTURE_SYSTEM_FULL : STRUCTURE_SYSTEM_CLIP;
  const userMessage = lyrics?.trim()
    ? `Description: ${description}\n\nLyrics:\n${lyrics.trim()}`
    : description;
  const provider = getTextProvider();
  const { content, usage } = await provider.complete(system, userMessage);
  return { structured: content.trim(), textUsage: usage };
}

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
