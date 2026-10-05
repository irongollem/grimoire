-- party_members.saving_throw_proficiencies holds ability keys ('str', 'dex',
-- 'con', 'int', 'wis', 'cha'), and every reader in the app compares against
-- those keys. The player character-creation wizard copied a class's
-- system_classes.saving_throws instead, which spells them out ('Wisdom',
-- 'Charisma'), so every character made through it rolled its saving throws,
-- concentration saves included, without proficiency. On 5 Oct 2026 that was
-- 18 of 29 characters in production, the oldest from May.
--
-- The wizard now writes keys. This rewrites the rows it already wrote: names
-- become keys, a key already present is kept once, and the order follows the
-- sheet (str, dex, con, int, wis, cha). Anything that is neither a name nor a
-- key is left as it was rather than guessed at.

update public.party_members pm
   set saving_throw_proficiencies = fixed.keys
  from (
    select p.id,
           array_agg(k.key order by k.ord) as keys
      from public.party_members p
     cross join lateral (
       select distinct
              coalesce(m.key, s.value) as key,
              coalesce(m.ord, 100) as ord
         from unnest(p.saving_throw_proficiencies) as s(value)
         left join (values
           ('strength', 'str', 1), ('str', 'str', 1),
           ('dexterity', 'dex', 2), ('dex', 'dex', 2),
           ('constitution', 'con', 3), ('con', 'con', 3),
           ('intelligence', 'int', 4), ('int', 'int', 4),
           ('wisdom', 'wis', 5), ('wis', 'wis', 5),
           ('charisma', 'cha', 6), ('cha', 'cha', 6)
         ) as m(name, key, ord) on m.name = lower(s.value)
     ) k
     where p.saving_throw_proficiencies && array['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']::text[]
     group by p.id
  ) fixed
 where pm.id = fixed.id;
