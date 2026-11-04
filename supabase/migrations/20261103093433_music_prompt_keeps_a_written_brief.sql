-- The music structuring step keeps a brief the DM has already written.
--
-- A description that already names its instruments and lays out its own
-- timeline was being composed again: the model chose its own sections, and the
-- underscore rule framed every background track with an Intro and an Outro, so
-- a request for a track "already playing at 0:00, no ending" came back with a
-- harp introduction and a final chord, and with instruments swapped (2 Nov
-- 2026, the YouTube background tunes). Now such a brief is formatted, not
-- rewritten, and the Intro and Outro of an underscore are optional.
--
-- replace() touches each passage only while it still reads as seeded, so an
-- admin's own edit of the prompt is kept. The code copy in
-- supabase/functions/_shared/musicPrompt.ts applies the same replacements, and
-- its test holds it equal to the seed plus this migration.
update public.ai_system_prompts
   set content = replace(content,
     $o$use only Intro, Verse, Interlude and Outro in the timeline.$o$,
     $n$use only Intro, Verse, Interlude and Outro in the timeline. The Intro and the Outro are optional.$n$)
 where generator_type = 'music_structure';

update public.ai_system_prompts
   set content = replace(content,
     $o$## Foreground or underscore$o$,
     $n$## When the DM has already written the music
Some descriptions are already a complete brief: they name the instruments, give a key or a tempo, or lay out their own timeline with timestamps. Then your job is to put that brief into the shape below, not to compose it again.
- Keep every instrument they name, and add none. Whoever they say carries a passage carries it; never swap one instrument for another.
- Keep their key, tempo and mood words.
- Keep their timeline: the same timestamps, and what happens in each stretch. Only give each stretch one of the section names below.
- Keep what they say about the start and the end. When they want the track already playing at 0:00, there is no Intro: the first section opens with the full texture. When they want no ending, the last section is a Verse or an Interlude that carries on to the target length, never an Outro, and nothing resolves, slows or fades.

## Foreground or underscore$n$)
 where generator_type = 'music_structure';
