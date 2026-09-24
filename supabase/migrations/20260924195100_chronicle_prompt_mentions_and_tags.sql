-- Chronicler: scene suggestions anchor on @mentions, and the chronicle proposes tags.
--
-- 1. The [[scene: …]] rule said "no character names — describe visually
--    instead". That threw away the one thing the image path can use: an
--    @Name in a scene prompt is resolved client-side (parseSceneEntities) to
--    that entity's portrait — or a faction's emblem — and sent as a reference
--    image, which anchors a likeness far better than any description. The
--    suggestion now names who is in the moment as @mentions, in the same
--    underscore form the prompt box's own @-picker inserts.
--
-- 2. A closing [[tags: …]] line, stripped by the client (parseChronicleTags)
--    and offered for the note's tag bar. {existingTags} is filled with the
--    campaign's current note tags so the model reuses them instead of
--    coining near-duplicates.
--
-- Targeted replace rather than a rewrite: production's prompt was edited in
-- the admin prompts tab after 20260613000003 (its closing lines differ), and a
-- wholesale update would silently revert that edit. The DO block fails loudly
-- if either anchor has drifted, instead of leaving a no-op behind.

update ai_system_prompts
set content = replace(
  replace(
    content,
    '- The prompt inside [[scene:...]] should be self-contained and suitable for direct use with an image generator (no character names — describe visually instead).',
    '- The prompt inside [[scene:...]] should be self-contained and suitable for direct use with an image generator.
- Name every party member, NPC, creature and faction present in the moment as an @mention: "@" followed by the name exactly as spelled in the Entities list or the campaign context, with spaces replaced by underscores (@Ambrose_Thistlefizz, @Council_of_Speakers). Use @Party for the whole adventuring party. Each @mention is turned into that entity''s portrait or emblem as a visual reference, so it anchors the image far better than a description — never replace a known name with a description.
- Only @mention names that appear in the Entities list or the campaign context; describe anyone else visually. After the @mentions, describe the action, setting, lighting and mood. A complete example:
  [[scene: @Nessa_Quill confronts @Ambrose_Thistlefizz before the @Council_of_Speakers in a torchlit hall, the sigil of @The_Frostbloom_Syndicate glinting inside his cloak, snow at the windows]]
- The narrative prose is different: there, write every name plainly (Ambrose Thistlefizz), even where the session notes use @mentions. The @ form is only for [[scene: ...]] lines.'
  ),
  '## Entities
{entities}',
  '## Tags
- End the chronicle with one final line of 3 to 6 tags for this note, on its own line:
  [[tags: first tag, second tag, third tag]]
- Tags describe THIS session. Always tag the main place(s) it happened in, then the factions and major NPCs involved and the story threads it advanced. Short lowercase labels a DM would filter notes by.
- Never add a tag just because it already exists. When the campaign already has a tag for the same place, faction or thread, use that exact spelling instead of coining a variant.
- Existing campaign tags: {existingTags}

## Entities
{entities}'
),
updated_at = now()
where generator_type = 'chronicle_text';

do $$
declare
  prompt text;
begin
  select content into prompt from ai_system_prompts where generator_type = 'chronicle_text';
  if prompt is not null and (
    position('@mention' in prompt) = 0 or position('{existingTags}' in prompt) = 0
  ) then
    raise exception 'chronicle_text prompt did not take the @mention/tags edit — an anchor sentence has drifted; update it by hand';
  end if;
end $$;
