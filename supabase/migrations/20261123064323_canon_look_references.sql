-- The look, shown rather than described (#1252). A look is often easier to show than to put into words, so the DM may
-- give the campaign's Look entry up to four pictures. `describe-look` reads them and drafts the look's words, and every
-- generator that paints from the look also hands the pictures to the image model as style references.
--
-- The pictures sit on the look entry itself: they are part of the look, read wherever the look is read (the world
-- block, both loaders), and nobody but the DM reads a look entry (players never get the voice or the look, see
-- `get_player_canon`). Public storage URLs, as every other image column holds; the server fetches them only through
-- the SSRF guard (`_shared/storage-url.ts`).

alter table public.canon_entries
  add column reference_images text[] not null default '{}',
  -- Four is the most the DM may show. Each one is sent with every picture the campaign paints, as input tokens.
  add constraint canon_entries_reference_images_max check (cardinality(reference_images) <= 4),
  -- Only the look is painted from pictures; on any other entry the column stays empty.
  add constraint canon_entries_reference_images_on_look
    check (cardinality(reference_images) = 0 or (part = 'premise' and premise_kind = 'look'));

comment on column public.canon_entries.reference_images is
  'Up to four style reference pictures, on the Look premise entry only (#1252). Sent with every AI picture the campaign paints from its look.';

insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
select 'canon_look_description', 'Look from pictures', 1, (select coalesce(max(sort_order), 0) + 1 from public.ai_generation_credit_costs)
on conflict (generation_type) do nothing;

insert into public.ai_system_prompts (generator_type, label, content) values
  ('canon_look', 'Look from Pictures', $prompt$You help a Dungeon Master put the look of their campaign into words. They show you up to four pictures whose look they want every AI picture of the campaign painted in. Write the look those pictures share.

Describe how the pictures are made, not what they show:
- the medium and technique (gouache, oils, ink and wash, woodcut, digital painting, photograph), and the brushwork or line;
- the palette and how colour is used;
- the light and the shadow;
- the mood;
- the level of detail and finish.

Rules:
- One short paragraph, at most four sentences, that an image model can paint from.
- Never name a person, an artist, a studio, a brand, a franchise or a title, even when you recognise one.
- Never describe the subjects, the people or the places in the pictures: only how they are painted.
- Where the pictures disagree, describe what most of them share.
- If the DM's current look is given, keep what the pictures confirm and change what they contradict.
- Plain, concrete words. No em-dashes. No marketing voice.$prompt$)
on conflict (generator_type) do nothing;
