-- "Reset demo" and deleting a demo both fail on the published template, and
-- have since its pre-made characters were given spells.
--
-- private.purge_demo_campaign() deletes table by table, in passes, and treats a
-- foreign-key violation as "not yet: something still points at this, try again
-- next pass". A foreign key is not the only way a delete can be refused.
--
-- character_spells.source_class_id is ON DELETE SET NULL. The purge reaches
-- character_classes before character_spells (tier 2, alphabetical), so deleting
-- a caster's class rewrites that character's class spells to have no class. That
-- UPDATE fires validate_character_spell_limits(), which reads the class with
-- SELECT ... INTO STRICT and raises no_data_found: "query returned no rows".
-- That is not a foreign_key_violation, so nothing caught it and the whole RPC
-- failed. The copy made the demo; nothing could then reset or remove it.
--
-- The trigger is right to object: a class spell with no class is not a state
-- the app allows. The purge is what has to cope, and it already has the means.
-- A table whose delete is refused this pass, for whatever reason, is blocked;
-- character_spells goes later in the same pass, and the next pass finds the
-- class with nothing left to rewrite. So the handler now catches any error. The
-- loop's own guard is unchanged: a pass that removes nothing while something is
-- still blocked raises, with the last refusal as the reason, so a delete that
-- can never succeed still fails loudly instead of spinning.
--
-- Found on 2 Oct 2026 by loading the production template into a local stack and
-- resetting it. supabase/tests/demo_campaign.test.sql missed it because its
-- pre-made character knew no spells; that fixture is now a caster.
--
-- Body from 20260925002215; only the exception clause changes.

create or replace function private.purge_demo_campaign(p_campaign uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  r          record;
  v_n        bigint;
  v_progress boolean;
  v_blocked  boolean;
  v_err      text;
begin
  loop
    v_progress := false;
    v_blocked  := false;
    for r in select * from private.demo_campaign_tables order by tier desc, table_name loop
      begin
        if r.tier = 1 then
          execute format('delete from public.%I where campaign_id = $1', r.table_name) using p_campaign;
        else
          execute format(
            'delete from public.%I where %I in (select id from public.%I where campaign_id = $1)',
            r.table_name, r.parent_column, r.parent_table
          ) using p_campaign;
        end if;
        get diagnostics v_n = row_count;
        if v_n > 0 then
          v_progress := true;
        end if;
      exception when others then
        -- Not only foreign_key_violation: a trigger fired by an ON DELETE SET
        -- NULL can refuse the delete just as well (see the header).
        v_blocked := true;
        v_err := sqlerrm;
      end;
    end loop;
    exit when not v_blocked;
    if not v_progress then
      raise exception 'The demo campaign could not be removed: %', v_err;
    end if;
  end loop;

  delete from public.campaigns where id = p_campaign;
end;
$$;

revoke execute on function private.purge_demo_campaign(uuid) from public, anon, authenticated;
