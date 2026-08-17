-- Migration: constrain_player_visible_to
-- Backfill NULL player_visible_to to an empty array and constrain the column,
-- matching deities/pantheons which were already NOT NULL DEFAULT '{}'.

--
-- Six of the eight tables carrying `player_visible_to` allowed NULL with no
-- default; only `deities` and `pantheons` were constrained. NULL and '{}' mean
-- the same thing here — nobody has been given this row — so the nullable
-- version bought nothing and cost a crash: any client that treated the column
-- as the array its TypeScript type claimed threw on a third of rows, which is
-- how a reveal control took the whole Atlas down on the first location nobody
-- had ever shared.
--
-- Constraining it removes the case rather than asking every reader to remember
-- it, and brings the eight tables into agreement so the next feature that
-- touches sharing cannot meet two different shapes depending on the entity.
--

do $$
declare
  target text;
begin
  foreach target in array array[
    'crafting_recipes', 'factions', 'locations', 'notes', 'npcs', 'quests'
  ]
  loop
    execute format(
      'update public.%I set player_visible_to = ''{}''::uuid[] where player_visible_to is null',
      target
    );
    execute format(
      'alter table public.%I alter column player_visible_to set default ''{}''::uuid[]',
      target
    );
    execute format(
      'alter table public.%I alter column player_visible_to set not null',
      target
    );
  end loop;
end
$$;
