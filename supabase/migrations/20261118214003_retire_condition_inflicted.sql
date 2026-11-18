-- The old free-text "condition inflicted" is retired (#1021, row 5b).
--
-- A spell's condition now lives in `condition_effect` (20261118185124), which a fight reads and the spell editor
-- fills. The old column was one word of free text that nothing but a sheet ever showed. Three things happen here,
-- in this order, so no spell loses what its author wrote:
--
-- 1. A campaign's own spell that had a word there keeps it, as the start of a structured entry: the conditions
--    named in the text, and how they land when the spell's own columns say so (a save, a spell attack, no roll).
--    Whom it reaches and how long it lasts were never recorded, so they are left unsaid: the entry shows in the
--    editor and on the sheet, and a fight does not apply it until its author finishes it (a cast imposes nothing
--    from an entry with no targets). Text that names none of the fourteen conditions becomes "rule it at the
--    table". Production had seven such spells on 18 Nov 2026, each a single condition name. No library spell had
--    any.
-- 2. The column goes from both tables. No function, view or policy reads it.
-- 3. The spell generator's stored prompt no longer asks the model for it. What it asks instead about a spell's
--    condition is appended in code (`SPELL_CONDITION_EFFECT_PROMPT`), so the two cannot drift apart; the line is
--    removed only where it still reads as shipped, and a prompt an admin has since rewritten is left as it is.

with named as (
  select s.id,
         (select coalesce(jsonb_agg(c.name order by c.ord), '[]'::jsonb)
            from unnest(array['Blinded','Charmed','Deafened','Frightened','Grappled','Incapacitated','Invisible',
                              'Paralyzed','Petrified','Poisoned','Prone','Restrained','Stunned','Unconscious'])
                 with ordinality as c(name, ord)
           where lower(s.condition_inflicted) ~ ('\m' || lower(c.name) || '\M')) as conditions
    from public.spells s
   where coalesce(btrim(s.condition_inflicted), '') <> ''
     and s.condition_effect is null
)
update public.spells s
   set condition_effect = case
         when jsonb_array_length(n.conditions) = 0 then
           jsonb_build_object('verdict', 'not_simple', 'conditions', '[]'::jsonb, 'stops_casting', null,
                              'speed_zero', false, 'applies', null, 'save_ability', null, 'targets', null,
                              'only_kinds', '[]'::jsonb, 'duration', null, 'repeat_save', null)
         else
           jsonb_build_object('verdict', 'condition', 'conditions', n.conditions, 'stops_casting', null,
                              'speed_zero', false,
                              'applies', case s.attack_type
                                           when 'save' then 'failed_save'
                                           when 'ranged_spell' then 'hit'
                                           when 'melee_spell' then 'hit'
                                           when 'automatic' then 'automatic'
                                         end,
                              'save_ability', case when s.attack_type = 'save' then upper(s.save_attribute) end,
                              'targets', null, 'only_kinds', '[]'::jsonb, 'duration', null, 'repeat_save', null)
       end
  from named n
 where n.id = s.id;

alter table public.spells drop column condition_inflicted;
alter table public.library_spells drop column condition_inflicted;

update public.ai_system_prompts
   set content = replace(content, E'  "condition_inflicted": "Lowercase condition name or null",\n', '')
 where generator_type = 'spell'
   and position(E'  "condition_inflicted": "Lowercase condition name or null",\n' in content) > 0;
