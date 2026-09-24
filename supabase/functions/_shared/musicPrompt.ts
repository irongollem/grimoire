/**
 * Music-prompt structuring for generate-music — the text-model step that
 * expands a DM's soundboard request into a complete Lyria 3.5 prompt.
 *
 * Moved here from the browser (src/lib/audio/aiMusic.ts) on 25 Sep 2026.
 * `structureMusicPrompt` used to run client-side through the BYOK-only text
 * provider (`getTextProvider()`), which throws when a campaign has no local
 * key — true for every DM on platform credits, so structuring silently fell
 * back to `composeFallbackPrompt` for all of them since the feature shipped
 * (ada26322, 1 Jun 2026). Structuring now runs here, inside generate-music's
 * worker, using the same shared `_shared/textGen.ts` dispatcher every other
 * text generator uses.
 *
 * Pure: no Deno/network/DB imports, so this is unit-tested exactly like
 * lyria.ts (see musicPrompt.test.ts). Deno cannot import browser TS, so
 * `composeFallbackPrompt` and its `MusicVocals`/`MusicLengthSeconds` types
 * still exist as a second, client-only copy in src/lib/audio/aiMusic.ts for
 * the local-BYOK generation path — keep the two in sync (same convention as
 * freesound.ts). aiMusic.test.ts imports both copies and asserts identical
 * output across a table of inputs so they cannot drift unnoticed.
 */

export type MusicLengthSeconds = 60 | 120 | 180;

/** `choir` is a wordless choir — the voice epic fantasy scoring reaches for
 * most, and one neither "instrumental" (no voices) nor "vocals" (a singer
 * with lyrics) can ask for. */
export type MusicVocals = "instrumental" | "choir" | "vocals";

/**
 * One @-mentioned character, creature or place from the DM's description.
 * The client resolves and flattens these before sending them here — this
 * module has no dependency on the mention resolver itself.
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
  /** How many images will reach Lyria. The bytes travel separately (fetched
   * by generate-music, or by generateMusicLocally for the BYOK path) — this
   * is only what the structuring model needs to know to write around them. */
  imageCount?: number;
}

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
 *
 * Server-side (generate-music) deliberately does NOT call this — a silent
 * downgrade to a hand-composed prompt is exactly what hid the structuring
 * bug for four months (see this file's top comment), so a failed structuring
 * step fails the job instead. This stays exported only for the client-side
 * local-BYOK path (src/lib/audio/aiMusic.ts), which keeps its own copy —
 * Deno can't import that browser module — kept identical by the cross-copy
 * test in aiMusic.test.ts.
 */
export function composeFallbackPrompt(req: MusicRequest): string {
  // A description ending in ./!/? used to produce a doubled "..": strip one
  // trailing sentence punctuation mark before appending our own sentence.
  const description = req.description.replace(/[.!?]$/, "");
  let prompt = `${description}. A ${req.lengthSeconds / 60}-minute track.`;
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
