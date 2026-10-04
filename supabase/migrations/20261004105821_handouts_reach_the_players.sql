-- Migration: handouts_reach_the_players (#970)
--
-- A Scriptorium document becomes something a DM can hand to the table. Until
-- now `scriptorium_documents` was owner-only and nothing under /play read it,
-- so a handout drafted for the players (#910's `audience: players`) could not
-- reach them at all.
--
-- 1. `player_visible_to uuid[]`, party member ids, the same shape as the eight
--    other shared tables (20260817224804), with a player select policy written
--    the way `notes_select` is. Only a campaign's document can be shared: party
--    member ids mean nothing outside the campaign they belong to, so moving a
--    document to another campaign, or out of every campaign (including the
--    `on delete set null` when its campaign is deleted), withdraws the share.
--
-- 2. Sharing REVEALS. A handout's linked entries (`entityEmbed` nodes) each say
--    what sharing the handout makes known (the node's `reveal` attr, see
--    src/lib/scriptorium/embedReveal.ts for the same contract on the client).
--    The reveal is written into the entity's OWN visibility, not held by the
--    handout, so "what does the party know about Ashen Warden" keeps one
--    answer. A player renders a linked entry only through the player
--    projections, so an entry nobody revealed is simply absent.
--
--    `private.apply_handout_reveals` is the one place that does this. The DM's
--    `share_handout` calls it, and #970's `give_handout` consequence arm will
--    call it too, so a handout given by a quest reveals exactly what a handout
--    shared by hand does.
--
--    Withdrawing a handout does not un-reveal anything. Knowledge is not
--    forgotten because a piece of paper was taken back, and an unreveal would
--    have to know whether something else (an NPC sheet, another handout)
--    revealed the same field first.
--
-- 3. Live sync through the campaign_sync doorbell, never the row: a document is
--    large, most are DM-only drafts, and the DM's editor autosaves. So the
--    doorbell rings only when a SHARED document changes (or stops being
--    shared), not on every keystroke save of a private draft.

-- ── 1. The column, its scope rule, and who may read ─────────────────────────

alter table public.scriptorium_documents
  add column player_visible_to uuid[] not null default '{}'::uuid[];

alter table public.scriptorium_documents
  add constraint scriptorium_documents_share_needs_campaign
  check (campaign_id is not null or player_visible_to = '{}'::uuid[]);

create or replace function private.scriptorium_documents_unshare_on_rescope()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Party member ids belong to one campaign. A document leaving that campaign
  -- (rescoped by the DM, or set null by the campaign's deletion) would
  -- otherwise carry ids that either mean nothing or, worse, fail the CHECK
  -- above and block deleting the campaign.
  if new.campaign_id is distinct from old.campaign_id then
    new.player_visible_to := '{}'::uuid[];
  end if;
  return new;
end;
$$;

revoke execute on function private.scriptorium_documents_unshare_on_rescope() from public, anon, authenticated;

create trigger scriptorium_documents_unshare_on_rescope
  before update of campaign_id on public.scriptorium_documents
  for each row execute procedure private.scriptorium_documents_unshare_on_rescope();

-- RLS is a ceiling: the client's player read still filters on the campaign and
-- its own party member (CLAUDE.md, Client Reads). Owner policies are unchanged,
-- so a player can read a shared handout and never write it.
create policy "scriptorium_documents_player_select" on public.scriptorium_documents
  for select using (
    campaign_id is not null
    and exists (
      select 1 from public.campaign_members cm
       where cm.user_id = (select auth.uid())
         and cm.campaign_id = scriptorium_documents.campaign_id
         and cm.party_member_id = any (scriptorium_documents.player_visible_to)
    )
  );

create index scriptorium_documents_shared_idx
  on public.scriptorium_documents (campaign_id)
  where player_visible_to <> '{}'::uuid[];

-- ── 2. Reveals ──────────────────────────────────────────────────────────────

-- Applies (or, with p_dry_run, only reports) what every linked entry in
-- p_content reveals to p_members. Idempotent: every write is a set union, so
-- re-sharing to the same table reveals only what a newly added entry asks for.
--
-- SECURITY INVOKER on purpose. Called by the DM's share_handout it runs under
-- the DM's RLS; called from the consequence engine it runs as that engine's
-- definer. Either way it does not lean on RLS for scope: every entity is
-- matched on `campaign_id = p_campaign_id` (or, for a monster, on belonging to
-- the campaign's owner), so a crafted entityId naming another campaign's row,
-- or another user's monster, reveals nothing.
--
-- Returns { revealed: [{type, id, name, ...what}], withheld: [{type, id, name, reason}] }.
-- `withheld` is what the DM should know players will NOT see: an entry set not
-- to reveal, an item (players see items once the party has them), or a linked
-- row outside this campaign. The share dialog reads both from a dry run.
create or replace function private.apply_handout_reveals(
  p_campaign_id uuid,
  p_content text,
  p_members uuid[],
  p_dry_run boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_doc jsonb;
  v_attrs jsonb;
  v_reveal jsonb;
  v_type text;
  v_uuid uuid;
  v_off boolean;
  v_fields text[];
  v_new_fields text[];
  v_new_to uuid[];
  v_owner uuid;
  v_name text;
  v_flag boolean;
  v_revealed jsonb := '[]'::jsonb;
  v_withheld jsonb := '[]'::jsonb;
  r_npc record;
  r_loc record;
  r_quest record;
  r_disc record;
begin
  if p_members is null or cardinality(p_members) = 0 then
    return jsonb_build_object('revealed', v_revealed, 'withheld', v_withheld);
  end if;

  v_doc := coalesce(nullif(p_content, '')::jsonb, '{}'::jsonb);
  select c.user_id into v_owner from public.campaigns c where c.id = p_campaign_id;

  -- Document order, each entity once: the share dialog lists what it reveals
  -- in the order the DM reads it on the page.
  for v_attrs in
    select t.attrs
      from (select e -> 'attrs' as attrs, min(ord) as first_at
              from jsonb_path_query(v_doc, 'strict $.**') with ordinality as q(e, ord)
             where jsonb_typeof(e) = 'object' and e ->> 'type' = 'entityEmbed'
             group by e -> 'attrs') t
     order by t.first_at
  loop
    v_type := v_attrs ->> 'entityType';
    v_reveal := case when jsonb_typeof(v_attrs -> 'reveal') = 'object' then v_attrs -> 'reveal' end;
    -- jsonb comparisons, never ::boolean casts: a malformed value in the
    -- document must reveal less, not abort a quest's Advance mid-transition.
    v_off := v_reveal -> 'off' = 'true'::jsonb;
    v_off := coalesce(v_off, false);
    -- A library monster's id is text; anything else is a uuid or nothing.
    -- (private.try_uuid exists but is closed to clients, and this runs as one.)
    begin
      v_uuid := (v_attrs ->> 'entityId')::uuid;
    exception when invalid_text_representation then
      v_uuid := null;
    end;

    -- ── npc: who (player_visible_to) and what (player_visible_fields) ──
    if v_type = 'npc' then
      select n.id, n.name, n.player_visible_to, n.player_visible_fields, n.disguise_name, n.is_revealed
        into r_npc
        from public.npcs n
       where n.id = v_uuid and n.campaign_id = p_campaign_id;
      if not found then
        v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', v_attrs ->> 'entityId', 'reason', 'outside_campaign');
        continue;
      end if;
      if v_reveal ? 'fields' and jsonb_typeof(v_reveal -> 'fields') = 'array' then
        select coalesce(array_agg(f), '{}') into v_fields
          from jsonb_array_elements_text(v_reveal -> 'fields') f
         where f in ('name', 'portrait', 'race', 'occupation', 'location');
      else
        v_fields := array['name']
          || case when v_attrs -> 'showArt' is distinct from 'false'::jsonb then array['portrait'] else '{}'::text[] end;
      end if;

      -- No fields is no reveal (effectiveEmbedReveal says the same): sharing
      -- an NPC with nothing of it visible would only add an invisible entry.
      if v_off or cardinality(v_fields) = 0 then
        if not (r_npc.player_visible_to @> p_members) then
          v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', r_npc.id, 'name', r_npc.name, 'reason', 'not_revealed');
        end if;
        continue;
      end if;

      v_new_fields := array(select distinct x from unnest(r_npc.player_visible_fields || v_fields) x order by 1);
      v_new_to := array(select distinct x from unnest(r_npc.player_visible_to || p_members) x);

      if not (r_npc.player_visible_fields @> v_fields and r_npc.player_visible_to @> p_members) then
        v_revealed := v_revealed || jsonb_build_object(
          'type', v_type, 'id', r_npc.id, 'name', r_npc.name, 'fields', to_jsonb(v_fields),
          -- A disguised NPC is revealed as its cover: the projection shows the
          -- disguise until the DM unmasks it, so say so before the DM confirms.
          'seen_as', case when r_npc.disguise_name is not null and not r_npc.is_revealed then r_npc.disguise_name end);
        if not p_dry_run then
          update public.npcs
             set player_visible_to = v_new_to, player_visible_fields = v_new_fields
           where id = r_npc.id;
        end if;
      end if;

    -- ── location: shared, and optionally its description ──
    elsif v_type = 'location' then
      select l.id, l.name, l.player_visible_to, l.is_description_shared
        into r_loc
        from public.locations l
       where l.id = v_uuid and l.campaign_id = p_campaign_id;
      if not found then
        v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', v_attrs ->> 'entityId', 'reason', 'outside_campaign');
        continue;
      end if;
      if v_off then
        if not (r_loc.player_visible_to @> p_members) then
          v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', r_loc.id, 'name', r_loc.name, 'reason', 'not_revealed');
        end if;
        continue;
      end if;
      v_flag := coalesce(v_reveal -> 'description' = 'true'::jsonb, false);
      if not (r_loc.player_visible_to @> p_members) or (v_flag and not r_loc.is_description_shared) then
        v_revealed := v_revealed || jsonb_build_object(
          'type', v_type, 'id', r_loc.id, 'name', r_loc.name, 'description', v_flag);
        if not p_dry_run then
          update public.locations
             set player_visible_to = array(select distinct x from unnest(player_visible_to || p_members) x),
                 is_description_shared = is_description_shared or v_flag
           where id = r_loc.id;
        end if;
      end if;

    -- ── quest: a handout can start one ──
    -- What unlock_quest does (undiscovered -> active, a hidden entry beat
    -- becomes its rumour), plus the recipients, which unlock_quest alone never
    -- adds: a quest nobody may see is not one the party has heard of.
    elsif v_type = 'quest' then
      select q.id, q.title, q.status, q.player_visible_to, q.entry_beat_id
        into r_quest
        from public.quests q
       where q.id = v_uuid and q.campaign_id = p_campaign_id;
      if not found then
        v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', v_attrs ->> 'entityId', 'reason', 'outside_campaign');
        continue;
      end if;
      if v_off then
        if not (r_quest.player_visible_to @> p_members) then
          v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', r_quest.id, 'name', r_quest.title, 'reason', 'not_revealed');
        end if;
        continue;
      end if;
      if not (r_quest.player_visible_to @> p_members) or r_quest.status = 'undiscovered' then
        v_revealed := v_revealed || jsonb_build_object(
          'type', v_type, 'id', r_quest.id, 'name', r_quest.title,
          'starts', r_quest.status = 'undiscovered');
        if not p_dry_run then
          update public.quests
             set player_visible_to = array(select distinct x from unnest(player_visible_to || p_members) x),
                 status = case when status = 'undiscovered' then 'active'::quest_status_enum else status end
           where id = r_quest.id;
          if r_quest.status = 'undiscovered' then
            update public.quest_beats b
               set visibility = 'rumored'
             where b.id = r_quest.entry_beat_id and b.visibility = 'hidden';
          end if;
        end if;
      end if;

    -- ── monster: discovered, optionally with its stats ──
    elsif v_type = 'monster' then
      if v_uuid is not null then
        select m.name into v_name
          from public.monsters m
         where m.id = v_uuid
           and (m.campaign_id = p_campaign_id or (m.campaign_id is null and m.user_id = v_owner));
      else
        select lm.name into v_name from public.library_monsters lm where lm.id = v_attrs ->> 'entityId';
      end if;
      if v_name is null then
        v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', v_attrs ->> 'entityId', 'reason', 'outside_campaign');
        continue;
      end if;

      select d.id, d.visible_to, d.reveal_stats into r_disc
        from public.discovered_monsters d
       where d.campaign_id = p_campaign_id
         and (case when v_uuid is not null then d.monster_id = v_uuid
                   else d.library_monster_id = v_attrs ->> 'entityId' end);

      if v_off then
        if r_disc.id is null or not (r_disc.visible_to is null or r_disc.visible_to @> p_members) then
          v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', v_attrs ->> 'entityId', 'name', v_name, 'reason', 'not_revealed');
        end if;
        continue;
      end if;

      v_flag := coalesce(v_reveal -> 'stats' = 'true'::jsonb, false);
      -- visible_to null means the whole table already knows it.
      if r_disc.id is null
         or not (r_disc.visible_to is null or r_disc.visible_to @> p_members)
         or (v_flag and not r_disc.reveal_stats) then
        v_revealed := v_revealed || jsonb_build_object(
          'type', v_type, 'id', v_attrs ->> 'entityId', 'name', v_name, 'stats', v_flag);
        if not p_dry_run then
          if r_disc.id is null then
            insert into public.discovered_monsters (campaign_id, monster_id, library_monster_id, visible_to, reveal_stats)
            values (p_campaign_id, v_uuid,
                    case when v_uuid is null then v_attrs ->> 'entityId' end,
                    p_members, v_flag);
          else
            update public.discovered_monsters
               set visible_to = case when visible_to is null then null
                                     else array(select distinct x from unnest(visible_to || p_members) x) end,
                   reveal_stats = reveal_stats or v_flag
             where id = r_disc.id;
          end if;
        end if;
      end if;

    -- ── item: never revealed by paper; the party sees it once it has it ──
    elsif v_type = 'item' then
      select i.name into v_name from public.items i where i.id = v_uuid;
      v_withheld := v_withheld || jsonb_build_object(
        'type', v_type, 'id', v_attrs ->> 'entityId', 'name', v_name, 'reason', 'found_only');
    end if;
    -- spell: rules text, readable by players already; nothing to reveal.
  end loop;

  return jsonb_build_object('revealed', v_revealed, 'withheld', v_withheld);
end;
$$;

-- `private` hides these from PostgREST; the DM's share_handout (invoker) still
-- has to be allowed to call them.
revoke execute on function private.apply_handout_reveals(uuid, text, uuid[], boolean) from public, anon;
grant execute on function private.apply_handout_reveals(uuid, text, uuid[], boolean) to authenticated, service_role;

-- Sets who holds the handout (the full set, as the audience control emits it)
-- and applies its reveals to everyone holding it. With p_dry_run nothing is
-- written and the result is the share dialog's summary.
--
-- SECURITY INVOKER: the caller is the DM, who may already write the document
-- and every row a reveal touches, so a definer would only widen what one bug
-- could do. The checks below are for clear errors and for scope, not to stand
-- in for RLS.
create or replace function public.share_handout(
  p_document_id uuid,
  p_party_member_ids uuid[],
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_doc record;
  v_members uuid[];
  v_reveals jsonb;
begin
  select d.id, d.user_id, d.campaign_id, d.content, d.player_visible_to
    into v_doc
    from public.scriptorium_documents d
   where d.id = p_document_id;

  if not found or v_doc.user_id is distinct from (select auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_doc.campaign_id is null then
    raise exception 'Only a campaign''s document can be shared with its players' using errcode = '22023';
  end if;
  if not coalesce(private.is_campaign_dm(v_doc.campaign_id), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct pm.id), '{}') into v_members
    from public.party_members pm
   where pm.campaign_id = v_doc.campaign_id
     and pm.id = any (coalesce(p_party_member_ids, '{}'));

  if cardinality(v_members) <> (select count(distinct x) from unnest(coalesce(p_party_member_ids, '{}')) x) then
    raise exception 'Every recipient must be a party member of this campaign' using errcode = '22023';
  end if;

  v_reveals := private.apply_handout_reveals(v_doc.campaign_id, v_doc.content, v_members, p_dry_run);

  if not p_dry_run then
    update public.scriptorium_documents
       set player_visible_to = v_members
     where id = v_doc.id;
  end if;

  return v_reveals || jsonb_build_object(
    'added', to_jsonb(array(select x from unnest(v_members) x except select y from unnest(v_doc.player_visible_to) y)),
    'removed', to_jsonb(array(select y from unnest(v_doc.player_visible_to) y except select x from unnest(v_members) x)));
end;
$$;

revoke execute on function public.share_handout(uuid, uuid[], boolean) from public, anon;
grant execute on function public.share_handout(uuid, uuid[], boolean) to authenticated, service_role;

-- ── 3. Live sync: ring only for shared documents ────────────────────────────

create or replace function public.signal_handout_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Same doorbell as signal_campaign_change, filtered to documents a player
  -- holds before or after the statement: a private draft's autosave rings
  -- nothing, while unsharing still rings the campaign it left. Each branch
  -- names only the transition tables its event has; PL/pgSQL resolves a
  -- relation when the statement first runs, so the others are never looked up.
  if tg_op = 'UPDATE' then
    insert into campaign_sync (campaign_id, changed_table, updated_at)
    select distinct s.campaign_id, 'scriptorium_documents', now()
      from (select n.campaign_id from new_rows n where n.player_visible_to <> '{}'::uuid[]
            union
            select o.campaign_id from old_rows o where o.player_visible_to <> '{}'::uuid[]) s
     where s.campaign_id is not null
       and exists (select 1 from campaigns p where p.id = s.campaign_id)
     order by 1
    on conflict (campaign_id) do update
       set changed_table = excluded.changed_table, updated_at = excluded.updated_at;
  elsif tg_op = 'INSERT' then
    insert into campaign_sync (campaign_id, changed_table, updated_at)
    select distinct n.campaign_id, 'scriptorium_documents', now()
      from new_rows n
     where n.player_visible_to <> '{}'::uuid[] and n.campaign_id is not null
       and exists (select 1 from campaigns p where p.id = n.campaign_id)
     order by 1
    on conflict (campaign_id) do update
       set changed_table = excluded.changed_table, updated_at = excluded.updated_at;
  else
    -- A shared document deleted with its campaign cascades after the campaign
    -- row is gone; the exists() skips it, as signal_campaign_change does.
    insert into campaign_sync (campaign_id, changed_table, updated_at)
    select distinct o.campaign_id, 'scriptorium_documents', now()
      from old_rows o
     where o.player_visible_to <> '{}'::uuid[] and o.campaign_id is not null
       and exists (select 1 from campaigns p where p.id = o.campaign_id)
     order by 1
    on conflict (campaign_id) do update
       set changed_table = excluded.changed_table, updated_at = excluded.updated_at;
  end if;
  return null;
end;
$$;

revoke execute on function public.signal_handout_change() from public, anon, authenticated;

create trigger scriptorium_documents_signal_insert
  after insert on public.scriptorium_documents
  referencing new table as new_rows
  for each statement execute procedure public.signal_handout_change();

create trigger scriptorium_documents_signal_update
  after update on public.scriptorium_documents
  referencing old table as old_rows new table as new_rows
  for each statement execute procedure public.signal_handout_change();

create trigger scriptorium_documents_signal_delete
  after delete on public.scriptorium_documents
  referencing old table as old_rows
  for each statement execute procedure public.signal_handout_change();
