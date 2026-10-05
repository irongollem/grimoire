-- A DM sharing a place, sharing a quest, achieving an objective or revealing a
-- beat now reaches a player who already has the screen open.
--
-- ── What was wrong (two-browser DM -> player audit, 5 Oct 2026) ─────────────
--
-- Players read all four through SECURITY DEFINER projections or owner-only
-- policies, so a row event never reaches them, and nothing rang the doorbell:
--   locations        published, but the only SELECT policy is the owner's. Only
--                    the delete trigger rang. Sharing a place never reached a
--                    mounted /play/atlas.
--   quests           the same: published, owner-only, delete rings only.
--   quest_objectives not published, no triggers; players read it through
--                    quest_objectives_player_select. An achieved objective
--                    stayed at 0/4 on /play/quests/:id until reload.
--   quest_beats      not published, DM-only; players read revealed beats
--                    through get_player_visible_quest_beats. A revealed beat
--                    never arrived.
--
-- ── The fix: the doorbell, by name, exactly as 20260928233302 did for npcs ──
--
-- Insert and update ring `<table>_player` and the client maps that to the
-- players' query roots only, skipping the DM (who already has the row events
-- for locations and quests, and whose beat editor must not refetch on every
-- autosave). Nothing is published: 20260810000012 keeps quest topology out of
-- realtime payloads on purpose and a doorbell carries a name, never a row.
--
-- * locations, quests (campaign_id, already subscribed): delete keeps ringing
--   the table name via the existing *_signal_delete trigger.
-- * quest_beats (campaign_id, not subscribed): rings on insert, update AND
--   delete, all as `quest_beats_player`, because no table-name signal for it
--   is mapped on the client and a DM-only table has no other listener.
-- * quest_objectives has NO campaign_id, so signal_campaign_change() cannot
--   serve it. A dedicated statement-level trigger function resolves the
--   campaign through the parent quest, as signal_handout_change() does for
--   documents. The `exists (select 1 from campaigns ...)` guard skips the
--   cascade from deleting a quest or campaign.

-- ── 1. locations and quests: insert and update ──────────────────────────────

drop trigger if exists locations_signal_insert on public.locations;
create trigger locations_signal_insert after insert on public.locations
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change('locations_player');

drop trigger if exists locations_signal_update on public.locations;
create trigger locations_signal_update after update on public.locations
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change('locations_player');

drop trigger if exists quests_signal_insert on public.quests;
create trigger quests_signal_insert after insert on public.quests
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change('quests_player');

drop trigger if exists quests_signal_update on public.quests;
create trigger quests_signal_update after update on public.quests
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change('quests_player');

-- ── 2. quest_beats: all three events, one player-only signal ────────────────

drop trigger if exists quest_beats_signal_insert on public.quest_beats;
create trigger quest_beats_signal_insert after insert on public.quest_beats
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change('quest_beats_player');

drop trigger if exists quest_beats_signal_update on public.quest_beats;
create trigger quest_beats_signal_update after update on public.quest_beats
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change('quest_beats_player');

drop trigger if exists quest_beats_signal_delete on public.quest_beats;
create trigger quest_beats_signal_delete after delete on public.quest_beats
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change('quest_beats_player');

-- ── 3. quest_objectives: no campaign_id, so ring through the parent quest ───

create or replace function public.signal_quest_child_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into campaign_sync (campaign_id, changed_table, updated_at)
  select distinct q.campaign_id, coalesce(tg_argv[0], tg_table_name), now()
    from changed c
    join quests q on q.id = c.quest_id
   where q.campaign_id is not null
     -- Skip the cascade from deleting a campaign (see signal_campaign_change).
     and exists (select 1 from campaigns p where p.id = q.campaign_id)
   order by 1
  on conflict (campaign_id) do update
     set changed_table = excluded.changed_table,
         updated_at    = excluded.updated_at;
  return null;
end;
$function$;

-- A trigger function never needs EXECUTE; keep it off the RPC surface.
revoke execute on function public.signal_quest_child_change() from public, anon, authenticated;

drop trigger if exists quest_objectives_signal_insert on public.quest_objectives;
create trigger quest_objectives_signal_insert after insert on public.quest_objectives
  referencing new table as changed
  for each statement execute procedure public.signal_quest_child_change('quest_objectives_player');

drop trigger if exists quest_objectives_signal_update on public.quest_objectives;
create trigger quest_objectives_signal_update after update on public.quest_objectives
  referencing new table as changed
  for each statement execute procedure public.signal_quest_child_change('quest_objectives_player');

drop trigger if exists quest_objectives_signal_delete on public.quest_objectives;
create trigger quest_objectives_signal_delete after delete on public.quest_objectives
  referencing old table as changed
  for each statement execute procedure public.signal_quest_child_change('quest_objectives_player');
