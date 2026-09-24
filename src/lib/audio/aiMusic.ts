import { getTextProvider } from "@/ai/providers";
import type { TextUsage } from "@/ai/providers/types";
import { supabase } from "@/lib/supabase";

/** Selectable target lengths for a generated track. Lyria 3.5 is one model —
 * length is steered by the prompt (a target duration plus a timestamped
 * timeline), not by picking a different model. */
export const MUSIC_LENGTHS = [
  { seconds: 60, label: "1 min" },
  { seconds: 120, label: "2 min" },
  { seconds: 180, label: "3 min" },
] as const;

export type MusicLengthSeconds = (typeof MUSIC_LENGTHS)[number]["seconds"];

/** `choir` is a wordless choir — the voice epic fantasy scoring reaches for
 * most, and one neither "instrumental" (no voices) nor "vocals" (a singer
 * with lyrics) can ask for. */
export type MusicVocals = "instrumental" | "choir" | "vocals";

/** The single credit-cost / pricing-category generation type for music, now
 * that one model (Lyria 3.5) serves every length. */
export const MUSIC_GENERATION_TYPE = "music_track";

/** Maximum lyrics length in characters (keeps generated audio within ~3 min, ~400 words). */
export const LYRICS_MAX_CHARS = 2200;

/** Lyria's Interactions API accepts at most 10 images per request. */
export const MUSIC_MAX_IMAGES = 10;

/**
 * Mirrors the `music_structure` row seeded by
 * supabase/migrations/20260924201957_upgrade_music_generation_to_lyria_3_5.sql
 * (the text between its `$prompt$` markers). Used only as a fallback when that
 * row can't be read — keep the two identical.
 */
export const MUSIC_STRUCTURE_SYSTEM = `You are a music prompt writer for Google Lyria 3.5. A Dungeon Master is scoring a tabletop roleplaying session and has described a track for their soundboard. Turn the request into one complete Lyria prompt.

You receive a description, a target length, a vocals setting — instrumental, choir or vocals — and sometimes lyrics.

## Musical direction
Open with one paragraph:
- Lead with the primary genre or style. Hybrids and eras are welcome ("Celtic folk over a dark orchestral drone").
- Name the key instruments and how they sound together.
- Give a tempo in BPM, a key and scale, and two or three mood words.
- State the length in words, e.g. "A 2-minute track."
- Instrumental: end the paragraph with "Instrumental only, no vocals."
- Choir: describe the choir — its size, its voices and how it is used (e.g. "A large mixed choir, deep male basses under soaring sopranos, sustained chords that swell with the brass"). End the paragraph with "Wordless choir only: sung vowels such as ooh and aah, no lyrics, no solo singer." Mark in the timeline where the choir enters and rests.
- Vocals: describe the singer — gender, range, timbre and delivery (e.g. "Male baritone, deep and weathered, a tavern storyteller's delivery").
- Describe the production and the recording — it decides whether the track sounds performed or programmed. For orchestral, folk and other acoustic styles, ask for a live recording: players in a real room (a scoring stage, a stone hall, a crowded tavern), natural reverb, expressive human timing and dynamics, bow noise and breath audible. Ask for synths, drum machines or quantised precision only when the style is electronic.
- Never name a real artist, band, composer, song, film or game. Lyria blocks prompts that ask for a specific artist's voice or for copyrighted material. Translate any such reference into the instruments, era and mood it stands for.

## Mentioned characters and places
The message may list characters, creatures and places the DM mentioned, each with a short description from their campaign notes. Use them for what the scene is about and what it means — who is there, what they feel, what is at stake. Do not copy their descriptions into the prompt, and leave their names out unless they belong in lyrics the DM asked for.

## Attached images
The message may say that images are attached. You cannot see them; Lyria can, and it reads a picture well. So when images are attached, this overrides the instrument, tempo and key lines above: do not choose instruments, key, tempo or timbre, and do not describe the images. Write the direction as what the scene means, the foreground or underscore shape and its dynamics, the vocals line, the length, and the sentence "Take the instrumentation, colour and atmosphere from the attached images." Keep the timeline to sections and energy, without naming instruments.

## Foreground or underscore
Most soundboard music plays under a table of people talking. Read the description and choose one shape:
- Foreground — battles, chases, reveals, finales, anything the DM wants to be the moment. Build and release, drops and climaxes are welcome.
- Underscore — conversation, towns, travel, exploration, rest, laments, and anything described as background or scene-setting. Keep the dynamics level from start to finish: no section more than a step louder than the others, no climax, no sudden swells. Keep the melody soft and in the low and middle registers, and avoid piercing highs — high sopranos, piccolo, violins played loud up high. Say "soft, restrained background underscore with even dynamics" in the direction, and use only Intro, Verse, Interlude and Outro in the timeline.
When the description does not say, choose underscore.

## Timeline
Then lay the track out as timestamped sections, one per line:
[m:ss - m:ss] Section: what happens

- The last section ends exactly at the target length. Never exceed 3:00.
- Use only these section names: Intro, Verse, Pre-Chorus, Chorus, Bridge, Build, Drop, Interlude, Breakdown, Outro. Number repeats (Verse 1, Verse 2). Lyria resets the arrangement only at section names it recognises; an invented name is ignored and the previous texture carries on.
- Describe what changes in each section — instruments entering or dropping out, energy rising or falling, a sudden silence — rather than restating the whole mix.
- A track with vocals still needs room to breathe: include at least one purely instrumental section, usually the Intro, an Interlude or the Outro.

## Lyrics
Only for a track with vocals.
- If lyrics were provided, reproduce them verbatim — do not rewrite, translate, trim or add a word. Put them after the timeline under a line reading "Lyrics:", tagged by section ([Verse 1], [Chorus], …) to match the timeline. Keep the DM's own tags when they gave them. Parentheses mark backing vocals or echoes, e.g. (rise again).
- Size vocal sections to the lines they carry: about 10 s per sung line for slow or folk styles, 6–8 s at a normal pace, 4–5 s for fast or chanted styles, plus a breath between lines.
- If no lyrics were provided, write none. Add one sentence to the direction saying what the song should be about instead, and Lyria writes them.
- Lyria sings in the language of the prompt. When the lyrics are not in English, write the whole prompt in the lyrics' language.

## Cultural style vs. language
If the DM asks for a cultural vocal tradition (Arabic, Persian, Indian classical…), apply it fully — tuning, ornamentation, timbre, phrasing. If their lyrics are in another language, the singer must still sing those lyrics as written. Say so explicitly, e.g. "Full Arabic vocal tradition and maqam tuning throughout. The singer performs in this style but sings the English lyrics as written."

Return only the prompt — no preamble, no commentary, no markdown fences.`;

/**
 * One @-mentioned character, creature or place from the DM's description.
 * Modeled on the shape the Chronicler's mention resolver yields, but this
 * module has no dependency on it — the caller flattens and caps the
 * description before handing it here.
 */
export interface MusicMention {
  label: string;
  description: string | null;
}

export interface MusicRequest {
  description: string;
  lengthSeconds: MusicLengthSeconds;
  vocals: MusicVocals;
  lyrics?: string;
  /** Entities the DM @-mentioned in their description, for the structuring
   * model to read for context — never copied verbatim into the prompt. */
  mentions?: MusicMention[];
  /** How many images will reach Lyria. The bytes travel separately (to the
   * server, or to generateMusicLocally for the BYOK path) — this is only
   * what the structuring model needs to know to write around them. */
  imageCount?: number;
}

function formatLength(seconds: MusicLengthSeconds): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")} (${seconds} seconds)`;
}

/**
 * The user message sent to the structuring model. Pure so it can be tested
 * without a network call.
 */
export function buildStructureMessage(req: MusicRequest): string {
  const lines = [
    `Description: ${req.description}`,
    `Target length: ${formatLength(req.lengthSeconds)}`,
    `Vocals: ${req.vocals}`,
  ];

  if (req.mentions && req.mentions.length > 0) {
    lines.push("", "Mentioned:");
    for (const mention of req.mentions) {
      lines.push(mention.description ? `- ${mention.label}: ${mention.description}` : `- ${mention.label}`);
    }
  }

  if (req.imageCount && req.imageCount > 0) {
    lines.push("", `Images attached for Lyria: ${req.imageCount}`);
  }

  const lyrics = req.lyrics?.trim();
  if (lyrics && req.vocals === "vocals") {
    lines.push("", "Lyrics:", lyrics);
  }
  return lines.join("\n");
}

/**
 * Built when structuring fails and there is no expanded prompt to fall back
 * to. Pure so it can be tested without a network call.
 */
export function composeFallbackPrompt(req: MusicRequest): string {
  let prompt = `${req.description}. A ${req.lengthSeconds / 60}-minute track.`;
  if (req.vocals === "instrumental") prompt += " Instrumental only, no vocals.";
  if (req.vocals === "choir") prompt += " Wordless choir only: sung vowels such as ooh and aah, no lyrics, no solo singer.";
  // Mentions are ignored here on purpose: a fallback stays minimal.
  if (req.imageCount && req.imageCount > 0) {
    prompt += " Take the instrumentation, colour and atmosphere from the attached images.";
  }
  const lyrics = req.lyrics?.trim();
  if (lyrics && req.vocals === "vocals") {
    prompt += `\n\nLyrics:\n${lyrics}`;
  }
  return prompt;
}

async function fetchStructurePrompt(): Promise<string> {
  const { data } = await supabase
    .from("ai_system_prompts")
    .select("content")
    .eq("generator_type", "music_structure")
    .maybeSingle();
  return data?.content ?? MUSIC_STRUCTURE_SYSTEM;
}

export async function structureMusicPrompt(
  req: MusicRequest,
): Promise<{ structured: string; textUsage: TextUsage }> {
  const system = await fetchStructurePrompt();
  const userMessage = buildStructureMessage(req);
  const provider = getTextProvider();
  const { content, usage } = await provider.complete(system, userMessage);
  return { structured: content.trim(), textUsage: usage };
}

/**
 * Defensive parse of Google's Interactions API response. Audio lives in
 * `steps[]` where `type === "model_output"`, in `content[]` blocks where
 * `type === "audio"`, base64 in `data`. When more than one audio block is
 * present (across steps or within one), the last one wins.
 */
export function extractInteractionAudio(json: unknown): { data: string; mimeType: string } | null {
  if (typeof json !== "object" || json === null) return null;
  const steps = (json as Record<string, unknown>).steps;
  if (!Array.isArray(steps)) return null;

  let found: { data: string; mimeType: string } | null = null;
  for (const step of steps) {
    if (typeof step !== "object" || step === null) continue;
    if ((step as Record<string, unknown>).type !== "model_output") continue;
    const content = (step as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const b = block as Record<string, unknown>;
      if (b.type !== "audio") continue;
      if (typeof b.data !== "string" || !b.data) continue;
      const mimeType = typeof b.mime_type === "string" && b.mime_type ? b.mime_type : "audio/mpeg";
      found = { data: b.data, mimeType };
    }
  }
  return found;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
};

function extensionFor(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? "mp3";
}

const LYRIA_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const LYRIA_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
// Chunked so a large image never spreads its whole byte array into
// String.fromCharCode at once (that blows the call-stack argument limit).
const BASE64_CHUNK_SIZE = 8192;

async function blobToBase64Chunked(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}

interface LyriaImageInput {
  mimeType: string;
  data: string;
}

/** Fetches and base64-encodes one image for Lyria. Any failure throws — an
 * attached image is never silently dropped from the request. */
async function fetchImageForLyria(url: string): Promise<LyriaImageInput> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error("Could not read an attached image.");
  }
  if (!response.ok) throw new Error("Could not read an attached image.");

  const mimeType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!mimeType || !LYRIA_IMAGE_MIME_TYPES.has(mimeType)) throw new Error("Could not read an attached image.");

  const blob = await response.blob();
  if (blob.size > LYRIA_IMAGE_MAX_BYTES) throw new Error("Could not read an attached image.");

  return { mimeType, data: await blobToBase64Chunked(blob) };
}

/** Over the cap throws rather than trimming — same rule as a failed fetch:
 * an attached image is never dropped without the DM hearing about it. */
function dedupeImageUrls(urls: string[]): string[] {
  const unique = Array.from(new Set(urls));
  if (unique.length > MUSIC_MAX_IMAGES) throw new Error(`Lyria reads at most ${MUSIC_MAX_IMAGES} images.`);
  return unique;
}

/**
 * The body Google's Interactions API expects: a plain string when there are
 * no images, or the list form — text first, then one block per image — when
 * there are. Pure so it can be tested without a network call.
 */
export function buildInteractionInput(
  prompt: string,
  images: LyriaImageInput[],
): string | Array<{ type: "text"; text: string } | { type: "image"; mime_type: string; data: string }> {
  if (images.length === 0) return prompt;
  return [
    { type: "text" as const, text: prompt },
    ...images.map((image) => ({ type: "image" as const, mime_type: image.mimeType, data: image.data })),
  ];
}

/**
 * The local-BYOK path: reads the configured Lyria model from provider_config,
 * calls Google's Interactions API directly from the browser, and returns the
 * generated audio plus the model that produced it (needed by the caller to
 * log usage, since the model is no longer chosen client-side). `imageUrls`
 * are fetched and base64-encoded in the browser — Lyria reads the bytes, the
 * server never sees this path's images.
 */
export async function generateMusicLocally(
  prompt: string,
  apiKey: string,
  imageUrls: string[] = [],
): Promise<{ file: File; model: string }> {
  const { data } = await supabase
    .from("provider_config")
    .select("audio_model")
    .eq("provider", "gemini")
    .maybeSingle();
  const model = (data as { audio_model: string | null } | null)?.audio_model;
  if (!model) throw new Error("No music model is configured.");

  const images = await Promise.all(dedupeImageUrls(imageUrls).map(fetchImageForLyria));

  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({ model, input: buildInteractionInput(prompt, images), store: false }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body?.error?.message ?? `Lyria API error ${res.status}`);
  }

  const json: unknown = await res.json();
  const audio = extractInteractionAudio(json);
  if (!audio) throw new Error("No audio data in Lyria response.");

  const binary = atob(audio.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: audio.mimeType });
  const file = new File([blob], `ai-generated-${Date.now()}.${extensionFor(audio.mimeType)}`, { type: audio.mimeType });
  return { file, model };
}
