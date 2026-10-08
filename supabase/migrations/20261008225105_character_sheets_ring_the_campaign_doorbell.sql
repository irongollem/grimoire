-- Character sheets update live (#1026).
--
-- A character is three tables, and none of them reached another client:
--
--   party_members      subscribed on its own channel (usePartyLive), so inserts
--                      and updates arrive, but a campaign-filtered DELETE never
--                      does (context/features/collaboration.md), and a
--                      character detached from a campaign arrives only at the
--                      campaign it moved to, never at the one it left.
--   character_classes  no campaign_id, so no filtered subscription can carry
--   character_spells   them at all. A level, a subclass, a Circle of the Land
--                      terrain, or the spells private.sync_subclass_spells
--                      regrants server-side stayed stale on every other open
--                      sheet until something else refetched it.
--
-- The two child tables ring the campaign_sync doorbell on every write, finding
-- the campaign through the character, the way ruleset_reviews already did. They
-- are not published: character_spells is readable only by the character's
-- owner and the campaign's DM, and a doorbell carries a table name, never a row.

-- ── 1. One doorbell for every table that hangs off a character ──────────────

-- signal_campaign_change() reads campaign_id off the changed rows; these rows
-- have only party_member_id. The campaign to ring is wherever the character
-- sits now, and nobody when it sits nowhere (its owner's own client
-- invalidates). The signal is the table name unless the trigger names one.
create function public.signal_party_member_child_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into campaign_sync (campaign_id, changed_table, updated_at)
  select distinct pm.campaign_id, coalesce(tg_argv[0], tg_table_name), now()
    from changed c
    join party_members pm on pm.id = c.party_member_id
   where pm.campaign_id is not null
     -- Skip the cascade from deleting a campaign (see signal_campaign_change).
     -- A character's own delete cascades here too, after its row is gone, so
     -- the join finds nothing and party_members' own trigger rings instead.
     and exists (select 1 from campaigns p where p.id = pm.campaign_id)
   -- Fixed lock order across campaigns (see signal_campaign_change): a
   -- subclass edit can regrant spells in characters at several tables at once.
   order by 1
  on conflict (campaign_id) do update
     set changed_table = excluded.changed_table,
         updated_at    = excluded.updated_at;
  return null;
end;
$function$;

-- A trigger function never needs EXECUTE; keep it off the RPC surface.
revoke execute on function public.signal_party_member_child_change() from public, anon, authenticated;

-- ruleset_reviews had a copy of this body that could only ever ring its own
-- name (20261003105146). It moves onto the shared function; the copy goes.
drop trigger ruleset_reviews_signal_insert on public.ruleset_reviews;
drop trigger ruleset_reviews_signal_update on public.ruleset_reviews;
drop trigger ruleset_reviews_signal_delete on public.ruleset_reviews;
drop function public.signal_ruleset_review_change();

create trigger ruleset_reviews_signal_insert after insert on public.ruleset_reviews
  referencing new table as changed
  for each statement execute procedure public.signal_party_member_child_change();

create trigger ruleset_reviews_signal_update after update on public.ruleset_reviews
  referencing new table as changed
  for each statement execute procedure public.signal_party_member_child_change();

create trigger ruleset_reviews_signal_delete after delete on public.ruleset_reviews
  referencing old table as changed
  for each statement execute procedure public.signal_party_member_child_change();

-- ── 2. Classes and spells ring on every write ───────────────────────────────

create trigger character_classes_signal_insert after insert on public.character_classes
  referencing new table as changed
  for each statement execute procedure public.signal_party_member_child_change();

create trigger character_classes_signal_update after update on public.character_classes
  referencing new table as changed
  for each statement execute procedure public.signal_party_member_child_change();

create trigger character_classes_signal_delete after delete on public.character_classes
  referencing old table as changed
  for each statement execute procedure public.signal_party_member_child_change();

create trigger character_spells_signal_insert after insert on public.character_spells
  referencing new table as changed
  for each statement execute procedure public.signal_party_member_child_change();

create trigger character_spells_signal_update after update on public.character_spells
  referencing new table as changed
  for each statement execute procedure public.signal_party_member_child_change();

create trigger character_spells_signal_delete after delete on public.character_spells
  referencing old table as changed
  for each statement execute procedure public.signal_party_member_child_change();

-- ── 3. party_members rings for the two events its channel cannot carry ──────

-- A deleted character: the filtered DELETE never arrives.
create trigger party_members_signal_delete after delete on public.party_members
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

-- A character leaving a campaign: the UPDATE matches the channel filter on its
-- new campaign_id, so the campaign it left hears nothing and keeps listing it.
-- Row-level with a WHEN so the far commoner updates (hit points in combat, a
-- spent slot) never reach the function.
create function public.signal_party_member_left_campaign()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into campaign_sync (campaign_id, changed_table, updated_at)
  select old.campaign_id, tg_table_name, now()
   -- The campaign itself being deleted sets this null; nobody is listening.
   where exists (select 1 from campaigns p where p.id = old.campaign_id)
  on conflict (campaign_id) do update
     set changed_table = excluded.changed_table,
         updated_at    = excluded.updated_at;
  return null;
end;
$function$;

revoke execute on function public.signal_party_member_left_campaign() from public, anon, authenticated;

create trigger party_members_signal_leave after update of campaign_id on public.party_members
  for each row
  when (old.campaign_id is not null and old.campaign_id is distinct from new.campaign_id)
  execute procedure public.signal_party_member_left_campaign();
