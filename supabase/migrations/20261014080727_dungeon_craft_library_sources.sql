-- The Dungeon Craft library is opt-in, per source (#1060, reversing 20261014070034's
-- "always on").
--
-- 20261014070034 made `grimoire-dungeon-craft` always on, on the reasoning that it
-- was the only source of these kinds. The maintainer's correction, the same day:
-- every other library is something a DM chooses to add through the book icon, and
-- forcing it on is not proper; and once a second source holds traps or puzzles, a DM
-- must be able to take one book and not another. So these kinds now follow the
-- Bestiary's rule exactly: a campaign reads the library rows of the sources in
-- `campaign_enabled_sources` (a table-less user, their `user_enabled_sources`), and
-- a source starts off.
--
-- This function is what the Dungeon Craft book icon lists: every source holding any
-- trap, dungeon feature, puzzle or roll table, with how many entries it holds across
-- the four, the shape of get_library_background_sources. A source is enabled as a
-- book, all four kinds at once, as a monster book is. No ruleset parameter: the
-- library tables have no edition (see 20261014070034). The title comes from
-- content_sources, since these tables keep only the key.
--
-- Enablement governs what the lists and pickers OFFER, never whether something
-- already placed resolves (the #954 rule): a room, encounter, door or map cell that
-- cites a library row keeps it after the book is switched off.

create function public.get_library_dungeon_craft_sources()
 returns table(source text, source_title text, count bigint)
 language sql
 stable
 set search_path to 'public'
as $function$
  select r.source, cs.title as source_title, count(*)
    from (
      select source from library_traps
      union all select source from library_dungeon_features
      union all select source from library_puzzles
      union all select source from library_roll_tables
    ) r
    left join content_sources cs on cs.key = r.source
   group by r.source, cs.title
   order by coalesce(cs.title, r.source);
$function$;
