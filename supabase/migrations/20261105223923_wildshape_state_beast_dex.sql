-- A Wild Shape form carries the beast's DEX score (#1149).
--
-- The beast's DEX replaces the character's for initiative (PHB 2014 / SRD 5.2
-- Wild Shape). The encounter runner rolls a character's initiative from their
-- combatant alone, and the turn reducer re-rolls it each round with no monster
-- list to hand, so the form remembers the beast's DEX the way it remembers its
-- AC and size. `wildshapeStateFor` (src/rules/wildshape.ts) writes it on every
-- form taken from now on; this fills it on the forms characters wear today,
-- from their beast (a DM's monster or a library one).
--
-- A form whose beast no longer exists takes the character's own DEX: there is
-- no other number to read, and it is what such a form rolled before. (When
-- this was written, production held one form, of a library beast.)

update public.party_members pm
   set wildshape_state = pm.wildshape_state || jsonb_build_object(
         'beast_dex',
         coalesce(
           (select (m.stat_block ->> 'dex')::int
              from public.monsters m
             where m.id::text = pm.wildshape_state ->> 'monster_id'),
           (select (lm.stat_block ->> 'dex')::int
              from public.library_monsters lm
             where lm.id = pm.wildshape_state ->> 'monster_id'),
           pm.dex
         )
       )
 where pm.wildshape_state is not null
   and not (pm.wildshape_state ? 'beast_dex');

do $$
declare
  v_missing int;
begin
  select count(*) into v_missing
    from public.party_members
   where wildshape_state is not null
     and jsonb_typeof(wildshape_state -> 'beast_dex') is distinct from 'number';
  if v_missing > 0 then
    raise exception '% Wild Shape forms have no beast_dex', v_missing;
  end if;
end;
$$;
