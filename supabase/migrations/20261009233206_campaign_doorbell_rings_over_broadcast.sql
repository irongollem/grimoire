-- The campaign doorbell rings over Realtime Broadcast, and nothing subscribes to
-- postgres_changes any more (#999 4.2).
--
-- The 9 Oct 2026 re-baseline found Realtime's postgres_changes poller at 91% of
-- all database execution time: about 1.3 calls a second to realtime.list_changes,
-- each decoding the whole WAL stream and checking every change against every
-- subscriber's RLS, whatever changed. It is a fixed loop, not driven by how much
-- is live (the 42 published tables saw ~1k writes in the same 46 h). Broadcast
-- from the database is read by a streaming replication connection instead
-- (supabase_realtime_messages_replication_slot), with no SQL polling; Supabase
-- calls it the recommended method for scalability and security.
--
-- So the doorbell is the only route. A change rings its campaign once per
-- transaction (private.ring_campaigns, unchanged in shape), and at commit
-- private.send_campaign_rings sends one Broadcast message per (campaign, signal)
-- on the private topic `doorbell:<campaign id>`: {"table": <signal>}.
-- It carries what changed, never a row (the "thin event" / notify-then-fetch
-- pattern): every client refetches through its own RLS, so a player is told
-- that something changed and only ever reads what they may see.
--
-- Every tab hears every ring, the one whose write caused it included, as it heard
-- its own changes under postgres_changes. A write's side effects (a craft that
-- also fills the party inventory, a purchase that moves a projection) reach the
-- writer the same way they reach everyone else, so no mutation has to know them.

-- ── 1. Who may hear a topic ─────────────────────────────────────────────────

-- Total: false for anything but `doorbell:<uuid>` of a campaign the caller is a
-- member of, never NULL (CLAUDE.md, authorization predicates).
create function private.can_hear_realtime_topic(p_topic text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    case
      when p_topic ~ '^doorbell:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then private.is_campaign_member(substring(p_topic from 10)::uuid)
    end,
    false);
$$;
revoke execute on function private.can_hear_realtime_topic(text) from public, anon;
grant execute on function private.can_hear_realtime_topic(text) to authenticated, service_role;

-- `doorbell:`, not `campaign:`: useCampaignPresence already joins the public
-- channel `campaign:<id>`, and realtime-js hands back the existing channel for a
-- topic asked for twice, so a doorbell on that name bound to the public presence
-- channel and never heard a private ring.
--
-- Join authorization for private Broadcast channels. Clients only listen: there
-- is no insert policy, so no client can ring a campaign. The row's own topic must
-- be the joined one as well as a topic the caller may hear: Realtime sets
-- realtime.topic to the topic being joined, so the second test is what a join
-- needs, and the first keeps a session that set the setting by hand from
-- reading any other campaign's messages.
create policy "realtime_messages_select" on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and topic = (select realtime.topic())
    and private.can_hear_realtime_topic((select realtime.topic()))
  );

-- ── 2. The commit-time flush sends Broadcast messages ───────────────────────

drop trigger campaign_sync_pending_flush on private.campaign_sync_pending;
drop function private.flush_campaign_sync();

create function private.send_campaign_rings()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ring record;
begin
  -- Fires once per queued row, at commit. The first firing drains the whole
  -- transaction's queue, so the rest find it empty.
  for ring in
    with drained as (
      delete from private.campaign_sync_pending
       where txid = pg_current_xact_id()
      returning id, campaign_id, changed_table
    )
    select d.campaign_id, d.changed_table, min(d.id) as first_rung
      from drained d
     -- A campaign deleted later in the same transaction has nobody listening.
     where exists (select 1 from public.campaigns p where p.id = d.campaign_id)
     group by d.campaign_id, d.changed_table
     -- Within one campaign, each distinct signal is sent in the order it first
     -- rang: every one is a separate change, and a client refreshes what each names.
     order by d.campaign_id, first_rung
  loop
    -- realtime.send swallows its own errors as a warning, so a ring can never
    -- fail the write that rang it.
    perform realtime.send(
      jsonb_build_object('table', ring.changed_table),
      'ring',
      'doorbell:' || ring.campaign_id,
      true);
  end loop;
  return null;
end;
$function$;
revoke execute on function private.send_campaign_rings() from public, anon, authenticated;

create constraint trigger campaign_sync_pending_send
  after insert on private.campaign_sync_pending
  deferrable initially deferred
  for each row execute procedure private.send_campaign_rings();

-- ── 3. The doorbell table goes ──────────────────────────────────────────────

delete from private.demo_campaign_tables where table_name = 'campaign_sync';
drop table public.campaign_sync;

-- ── 4. The players' encounter signal table goes too ────────────────────────

-- encounter_state_player_updates (20260730000003) existed only to be published:
-- players may not read encounter_state rows, so a row-free copy told them "the
-- encounter changed" and they re-read the projection. encounter_state now rings
-- its campaign itself (below), and a ring never carries a row, so the copy has
-- no job left. An NPC's identity change (unmasked, renamed, a new portrait)
-- reaches a running encounter's players the same way, as an encounter_state ring.
create or replace function private.signal_encounter_npc_identity_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform private.ring_campaigns(
    array(
      select distinct state.campaign_id
        from public.encounter_state state
       where state.is_running
         and exists (
           select 1
             from jsonb_array_elements(state.combatants_live) combatant
            where combatant ->> 'npc_id' = new.id::text)),
    'encounter_state');
  return new;
end;
$function$;

drop trigger encounter_state_player_update_sync on public.encounter_state;
drop function private.sync_encounter_state_player_update();
delete from private.demo_campaign_tables where table_name = 'encounter_state_player_updates';
drop table public.encounter_state_player_updates;

-- ── 5. Every live table rings on insert, update and delete ──────────────────

-- These reached clients as postgres_changes row payloads, so most rang only on
-- delete (a campaign-filtered DELETE never arrived). The signal is the table's
-- own name; the client's SIGNAL_KEYS maps it to every query that reads it.
do $$
declare
  t text;
  ev text;
begin
  foreach t in array array[
    'calendar_events', 'campaign_members', 'campaign_messages', 'campaign_rules',
    'character_content_reviews', 'character_memorials', 'class_option_texts',
    'companions', 'deities', 'discovered_monsters', 'dm_note_touches',
    'downtime_deck_backs', 'downtime_draws', 'downtime_grants', 'downtime_outcomes',
    'encounter_state', 'item_entries', 'items', 'loot_placements', 'memorial_mourners',
    'minis', 'npc_inventory', 'pantheons', 'party_inventory', 'party_members',
    'party_milestones', 'player_journal_entries', 'puzzle_rooms', 'session_availability',
    'session_proposals', 'soundboard_broadcast'
  ] loop
    foreach ev in array array['insert', 'update', 'delete'] loop
      -- Any ring already on this event counts, whatever its name
      -- (loot_placements rings on delete as quest_beat_loot_signal_delete).
      continue when exists (
        select 1 from pg_trigger g
         where g.tgrelid = format('public.%I', t)::regclass and not g.tgisinternal
           and pg_get_triggerdef(g.oid) ~* ('after ' || ev || ' on ')
           and g.tgfoid = 'public.signal_campaign_change()'::regprocedure);
      execute format(
        'create trigger %I after %s on public.%I referencing %s
           for each statement execute function public.signal_campaign_change()',
        t || '_signal_' || ev, ev, t,
        case ev when 'update' then 'old table as left_rows new table as changed'
                when 'insert' then 'new table as changed'
                else 'old table as changed' end);
    end loop;
  end loop;
end;
$$;

-- A campaign row is its own campaign: an edit (today's date, the party's place,
-- the theme) rings `campaigns` on itself.
create function private.signal_campaign_row_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform private.ring_campaigns(array(select c.id from changed c), 'campaigns');
  return null;
end;
$function$;
revoke execute on function private.signal_campaign_row_change() from public, anon, authenticated;

create trigger campaigns_signal_update
  after update on public.campaigns
  referencing new table as changed
  for each statement execute function private.signal_campaign_row_change();

-- ── 6. Nothing is published for postgres_changes ────────────────────────────

-- A client still on the previous build keeps its postgres_changes subscriptions
-- until it reloads; they simply hear nothing. Once none is left, Realtime stops
-- polling.
do $$
declare
  r record;
begin
  for r in select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime' loop
    execute format('alter publication supabase_realtime drop table %I.%I', r.schemaname, r.tablename);
  end loop;
end;
$$;
