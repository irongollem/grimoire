-- Migration: repair_dangling_monster_references
-- Repairs pre-#553 monster ids stranded in jsonb/text referrers (#583).
--
-- Found while building the extended referential-integrity guard in the same
-- pass. The #553 identity transition (20260722000002) re-keyed the shared
-- monster table from `srd_<name>` to `srd_srd_<name>` / `srd_srd_2024_<name>`
-- and remapped the referrers it knew about. It did not know about these four,
-- because none of them is a plain FK-able column and none was covered by
-- supabase/checks/content_integrity.sql until now:
--
--   encounters.combatants[].monster_id                   16 refs
--   encounter_state.combatants_live[].monster_id         11 refs
--   encounters.events[].actions[].spawns[].monster_id     2 refs
--   entity_notes.entity_id                                4 refs
--
-- User-visible effect today: saved encounters list combatants that resolve to
-- nothing ("Unknown creature"), a `spawn_combatants` round trigger spawns a
-- monster that no longer exists, and notes attached to a shared monster are
-- orphaned from it.
--
-- Every stranded id was verified to resolve unambiguously before this was
-- written: all of them sit in `2014` campaigns and every one has exactly one
-- successor at that ruleset. Ids that cannot be resolved are deliberately left
-- alone — content_integrity.sql then fails the deploy and a human looks, which
-- is the whole point of the guard.
--
-- Ruleset selection: use the owning campaign's when there is one. `campaign_id`
-- is nullable on both `encounters` and `entity_notes` — and in fact 57 of 60
-- entity_notes rows have no campaign, including all four stranded ones — so the
-- join must be a LEFT join and needs a fallback. The fallback is the 2014-style
-- id, which is correct by construction rather than by convenience: these v1
-- `srd_<name>` ids predate #553, and before #553 the shared table held 2014
-- content only. An id of this shape can never have denoted a 2024 stat block.
--
-- On the `srd_srd_` literal below, which looks like a typo and is not. A shared
-- id is OUR prefix plus Open5e's own `source_record_key`, and Open5e calls its
-- WotC document `srd` / `srd-2024`, so SRD content lands a prefix on a prefix:
--
--   srd_srd_ghoul       = srd_ + srd_ghoul        (WotC SRD 5.1)
--   srd_srd_2024_ghoul  = srd_ + srd-2024_ghoul   (WotC SRD 5.2)
--   srd_ghoul_bf        = srd_ + ghoul_bf         (Kobold Press, ORC)
--
-- So `substr(v_old, 5)` strips our old prefix off the v1 id (`srd_ghoul` ->
-- `ghoul`) and the literal puts back the v2 pair. Note the last row: the
-- doubled ids are the *honest* ones, and a single-prefixed `srd_ghoul_bf` is a
-- Kobold Press creature wearing an "SRD" label. That is #583's whole complaint,
-- and why re-keying these ids was judged not worth the blast radius.
--
-- Rewriting is done on the JSON text with the value quoted on both sides
-- (`"srd_ghoul"`), which matches whole JSON string values only — never a
-- substring of a longer id such as `"srd_ghoulish_thing"`. That keeps one
-- implementation working across all three nesting depths involved
-- (combatants[], events[].actions[].spawns[]). A survey of both combatant
-- arrays confirmed `monster_id` is the only key holding these values.

do $$
declare
  r            record;
  v_old        text;
  v_new        text;
  v_txt        text;
  v_encounters integer := 0;
  v_states     integer := 0;
  v_notes      integer := 0;
begin
  ---------------------------------------------------------------------------
  -- encounters.combatants and encounters.events
  ---------------------------------------------------------------------------
  for r in
    select e.id, e.combatants, e.events, coalesce(c.ruleset, '2014') as ruleset
    from encounters e
    left join campaigns c on c.id = e.campaign_id
    where e.combatants::text like '%srd\_%' or e.events::text like '%srd\_%'
  loop
    v_txt := r.combatants::text;
    for v_old in
      select distinct m[1] from regexp_matches(v_txt, '"(srd_[a-z0-9_]+)"', 'g') m
    loop
      if not exists (select 1 from library_monsters lm where lm.id = v_old) then
        v_new := case when r.ruleset = '2024' then 'srd_srd_2024_' else 'srd_srd_' end
                 || substr(v_old, 5);
        if exists (select 1 from library_monsters lm
                   where lm.id = v_new and lm.ruleset = r.ruleset) then
          v_txt := replace(v_txt, '"' || v_old || '"', '"' || v_new || '"');
        end if;
      end if;
    end loop;
    if v_txt is distinct from r.combatants::text then
      update encounters set combatants = v_txt::jsonb where id = r.id;
      v_encounters := v_encounters + 1;
    end if;

    v_txt := r.events::text;
    for v_old in
      select distinct m[1] from regexp_matches(coalesce(v_txt, ''), '"(srd_[a-z0-9_]+)"', 'g') m
    loop
      if not exists (select 1 from library_monsters lm where lm.id = v_old) then
        v_new := case when r.ruleset = '2024' then 'srd_srd_2024_' else 'srd_srd_' end
                 || substr(v_old, 5);
        if exists (select 1 from library_monsters lm
                   where lm.id = v_new and lm.ruleset = r.ruleset) then
          v_txt := replace(v_txt, '"' || v_old || '"', '"' || v_new || '"');
        end if;
      end if;
    end loop;
    if v_txt is distinct from r.events::text then
      update encounters set events = v_txt::jsonb where id = r.id;
    end if;
  end loop;

  ---------------------------------------------------------------------------
  -- encounter_state.combatants_live
  ---------------------------------------------------------------------------
  for r in
    select es.id, es.combatants_live, coalesce(c.ruleset, '2014') as ruleset
    from encounter_state es
    join campaigns c on c.id = es.campaign_id
    where es.combatants_live::text like '%srd\_%'
  loop
    v_txt := r.combatants_live::text;
    for v_old in
      select distinct m[1] from regexp_matches(v_txt, '"(srd_[a-z0-9_]+)"', 'g') m
    loop
      if not exists (select 1 from library_monsters lm where lm.id = v_old) then
        v_new := case when r.ruleset = '2024' then 'srd_srd_2024_' else 'srd_srd_' end
                 || substr(v_old, 5);
        if exists (select 1 from library_monsters lm
                   where lm.id = v_new and lm.ruleset = r.ruleset) then
          v_txt := replace(v_txt, '"' || v_old || '"', '"' || v_new || '"');
        end if;
      end if;
    end loop;
    if v_txt is distinct from r.combatants_live::text then
      update encounter_state set combatants_live = v_txt::jsonb where id = r.id;
      v_states := v_states + 1;
    end if;
  end loop;

  ---------------------------------------------------------------------------
  -- entity_notes.entity_id (plain text column)
  ---------------------------------------------------------------------------
  for r in
    select en.id, en.entity_id, coalesce(c.ruleset, '2014') as ruleset
    from entity_notes en
    left join campaigns c on c.id = en.campaign_id
    where en.entity_id like 'srd\_%'
      and not exists (select 1 from library_monsters lm where lm.id = en.entity_id)
      and not exists (select 1 from library_spells ls where ls.id = en.entity_id)
  loop
    v_new := case when r.ruleset = '2024' then 'srd_srd_2024_' else 'srd_srd_' end
             || substr(r.entity_id, 5);
    if exists (select 1 from library_monsters lm
               where lm.id = v_new and lm.ruleset = r.ruleset) then
      update entity_notes set entity_id = v_new where id = r.id;
      v_notes := v_notes + 1;
    end if;
  end loop;

  raise notice 'Repaired % encounter(s), % encounter state(s), % note(s).',
    v_encounters, v_states, v_notes;
end $$;
