-- Migration: upgrade_music_generation_to_lyria_3_5
-- Soundboard music moves to one model, Google's stable `lyria-3.5`, and the
-- 30-second clip model is retired outright.
--
-- Lyria 3.5 is priced flat per song ($0.08) whatever its length, and its length
-- is steered by the prompt rather than by picking a model. So the two-model
-- split (clip vs full song) and its two credit rows collapse into one track
-- type, and the length/vocals choice moves into the prompt the DM's request is
-- expanded into.
--
-- The model is read by generate-music from provider_config.audio_model, which
-- is what makes the admin Audio field mean something: before this, the client
-- picked the model id and the admin field only chose which pricing rows showed.

-- ── Model ────────────────────────────────────────────────────────────────────
update provider_config set audio_model = 'lyria-3.5' where provider = 'gemini';

-- ── API cost ─────────────────────────────────────────────────────────────────
-- Flat per-generation rate, stored in cost_per_image_usd like the Lyria 3 rows
-- (see 20260508000002). The Lyria 3 rows stay: ai_generation_costs joins the
-- ledger to this table by model, so deleting them would zero the recorded
-- spend of every generation already made with them.
insert into ai_model_pricing (model, provider, model_type, cost_per_image_usd, notes)
values ('lyria-3.5', 'google', 'audio', 0.08, 'Lyria 3.5 — $0.08 per song, flat regardless of length or image input')
on conflict (model) do update
  set provider = excluded.provider,
      model_type = excluded.model_type,
      cost_per_image_usd = excluded.cost_per_image_usd,
      notes = excluded.notes;

-- `lyria-3` was a placeholder seeded before the real model ids were known
-- (20260506000001): no price, the wrong model_type, and no generation ever
-- logged against it.
delete from ai_model_pricing p
where p.model = 'lyria-3'
  and not exists (select 1 from ai_credit_ledger l where l.model = p.model);

-- ── Credits ──────────────────────────────────────────────────────────────────
-- One type for one model. 20 credits is what a full song cost on Lyria 3 Pro,
-- which had the same $0.08 provider price. Past ledger rows keep their
-- music_clip / music_full_song reasons as history.
insert into ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
values ('music_track', 'Music Track', 20, 14)
on conflict (generation_type) do nothing;

delete from ai_generation_credit_costs where generation_type in ('music_clip', 'music_full_song');

-- ── Pre-prompt ───────────────────────────────────────────────────────────────
-- One structuring prompt, written to Google's Lyria prompt guide: musical
-- direction first (genre, instruments, BPM, key, mood, singer), then a
-- timestamped timeline whose end is the requested length, then verbatim lyrics
-- under a `Lyrics:` header. The code carries the same text as its fallback
-- (src/lib/audio/aiMusic.ts, MUSIC_STRUCTURE_SYSTEM) — keep the two identical.
delete from ai_system_prompts where generator_type in ('music_structure_clip', 'music_structure_full');

insert into ai_system_prompts (generator_type, label, content)
values ('music_structure', 'Music Structure', $prompt$You are a music prompt writer for Google Lyria 3.5. A Dungeon Master is scoring a tabletop roleplaying session and has described a track for their soundboard. Turn the request into one complete Lyria prompt.

You receive a description, a target length, whether the track is instrumental or has vocals, and sometimes lyrics.

## Musical direction
Open with one paragraph:
- Lead with the primary genre or style. Hybrids and eras are welcome ("Celtic folk over a dark orchestral drone").
- Name the key instruments and how they sound together.
- Give a tempo in BPM, a key and scale, and two or three mood words.
- State the length in words, e.g. "A 2-minute track."
- Instrumental: end the paragraph with "Instrumental only, no vocals."
- Vocals: describe the singer — gender, range, timbre and delivery (e.g. "Male baritone, deep and weathered, a tavern storyteller's delivery").
- Never name a real artist, band, composer, song, film or game. Lyria blocks prompts that ask for a specific artist's voice or for copyrighted material. Translate any such reference into the instruments, era and mood it stands for.

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

Return only the prompt — no preamble, no commentary, no markdown fences.$prompt$)
on conflict (generator_type) do update set label = excluded.label, content = excluded.content;
