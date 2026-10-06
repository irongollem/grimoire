-- #983: an always-open, autosaving DM scratchpad on every entity.
--
-- A DM note is the DM writing to their future self, and only that: it never
-- reaches a player in any form (the maintainer, 5 Oct 2026). Each entity keeps
-- one, either as a notes column on its own table, where that table is DM-only
-- by RLS, or as the DM's own private `entity_notes` row, where players can
-- select the entity's row. The client half of that map is
-- src/lib/dmNotes/registry.ts.
--
-- 1. deities.dm_notes and species.notes were columns on rows players can read.
--    `deities_player_select` hands a player every column of a deity revealed to
--    their character (and `deities` is published, so realtime carried it too),
--    and `species_select` lets anyone in a campaign read every species its DM
--    owns, through private.is_dm_of_my_campaigns. No player screen showed
--    either column, but both were one REST call away. They move into
--    entity_notes as the owner's private note and the columns go.
-- 2. The DM's "party" notes on companions fold into their private note.
--    EntityNotesPanel let a DM write a note the party could read; the
--    scratchpad has no sharing, so those notes join the DM's own (the
--    maintainer's call, 6 Oct 2026).
-- 3. entity_notes rings the campaign doorbell, so a note written on one device
--    reaches the DM's other one. It rings rather than subscribes: its rows are
--    per-user and mostly private, and a name is all the client needs.
--    Its insert and update policies now also require that a note naming a
--    campaign is written by a member of it.
-- 4. dm_note_touches: which entities' DM notes were written to, and when, so
--    the scratchpad can list what was jotted during the running session.
-- 5. transfer_campaign_ownership hands the outgoing DM's private notes in the
--    campaign to the new owner, as the notes columns already travel with their
--    rows.

-- ── 1. deities.dm_notes and species.notes move to entity_notes ──────────────

-- True when a stored note has something in it: plain text with a non-space
-- character, or a Tiptap document holding a text node with one.
create function pg_temp.has_note_text(p text) returns boolean
language sql immutable as $$
  select case
    when p is null then false
    when p ~ '^\s*\{' then p ~ '"text"\s*:\s*"[^"]*\S'
    else p ~ '\S'
  end
$$;

insert into public.entity_notes (user_id, campaign_id, entity_type, entity_id, content, is_private, shared_with_dm)
select d.user_id, d.campaign_id, 'deity', d.id::text, d.dm_notes, true, false
  from public.deities d
 where pg_temp.has_note_text(d.dm_notes);

insert into public.entity_notes (user_id, campaign_id, entity_type, entity_id, content, is_private, shared_with_dm)
select s.user_id, s.campaign_id, 'species', s.id::text, s.notes, true, false
  from public.species s
 where pg_temp.has_note_text(s.notes);

alter table public.deities drop column dm_notes;
alter table public.species drop column notes;

-- ── 2. A DM's party notes on companions join their private note ──────────────

-- Every note here is a Tiptap document (checked in production, 6 Oct 2026), so
-- joining two is appending one's blocks to the other's.
do $$
declare
  r record;
  v_private uuid;
begin
  for r in
    select n.id, n.user_id, n.entity_id, n.content, c.campaign_id
      from public.entity_notes n
      join public.companions c on c.id::text = n.entity_id
     where n.entity_type = 'companion'
       and not n.is_private
       -- The DM seat, not the companion's creator: a player can create a
       -- companion for their own character, and their party note stays theirs.
       and exists (select 1 from public.campaign_members cm
                    where cm.campaign_id = c.campaign_id
                      and cm.user_id = n.user_id
                      and cm.role = 'dm')
  loop
    select p.id into v_private
      from public.entity_notes p
     where p.user_id = r.user_id
       and p.entity_type = 'companion'
       and p.entity_id = r.entity_id
       and p.is_private
     order by p.created_at
     limit 1;

    if v_private is null then
      update public.entity_notes
         set is_private = true, shared_with_dm = false,
             campaign_id = coalesce(campaign_id, r.campaign_id)
       where id = r.id;
    else
      -- jsonb_set is strict: an empty private note would come back null and
      -- take the party note's text with it.
      update public.entity_notes p
         set content = case
               when p.content is null then r.content
               else jsonb_set(
                 p.content::jsonb, '{content}',
                 coalesce(p.content::jsonb -> 'content', '[]'::jsonb)
                   || coalesce(r.content::jsonb -> 'content', '[]'::jsonb))::text
             end,
             campaign_id = coalesce(p.campaign_id, r.campaign_id)
       where p.id = v_private;
      delete from public.entity_notes where id = r.id;
    end if;
  end loop;
end;
$$;

-- ── 3. entity_notes rings the doorbell ──────────────────────────────────────

create trigger entity_notes_signal_insert
  after insert on public.entity_notes
  referencing new table as changed
  for each statement execute function public.signal_campaign_change();

create trigger entity_notes_signal_update
  after update on public.entity_notes
  referencing new table as changed
  for each statement execute function public.signal_campaign_change();

create trigger entity_notes_signal_delete
  after delete on public.entity_notes
  referencing old table as changed
  for each statement execute function public.signal_campaign_change();

-- A note may only name a campaign its author belongs to. The FK alone let
-- anyone file a note under any campaign, which with the doorbell above would
-- let a stranger ring that campaign's members into refetching, and hand the
-- note to its next owner on a transfer.
alter policy "entity_notes_insert" on public.entity_notes
  with check ((select auth.uid()) = user_id
              and (campaign_id is null or private.is_campaign_member(campaign_id)));
alter policy "entity_notes_update" on public.entity_notes
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id
              and (campaign_id is null or private.is_campaign_member(campaign_id)));

-- ── 4. dm_note_touches ──────────────────────────────────────────────────────

-- One row per (DM, campaign, entity), restamped by every save of that entity's
-- DM note. The label is the entity's name when it was last written, so the
-- session list needs no read per entity type; a rename since is harmless in a
-- list of what was jotted tonight.
create table public.dm_note_touches (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  entity_type  text not null,
  entity_id    text not null,
  entity_label text not null,
  touched_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, campaign_id, entity_type, entity_id)
);

create trigger dm_note_touches_updated_at
  before update on public.dm_note_touches
  for each row execute procedure update_updated_at();

alter table public.dm_note_touches enable row level security;

-- Writes also require the DM seat: a touch names an entity of the campaign.
create policy "dm_note_touches_select" on public.dm_note_touches
  for select using ((select auth.uid()) = user_id);
create policy "dm_note_touches_insert" on public.dm_note_touches
  for insert with check ((select auth.uid()) = user_id and private.is_campaign_dm(campaign_id));
create policy "dm_note_touches_update" on public.dm_note_touches
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and private.is_campaign_dm(campaign_id));
create policy "dm_note_touches_delete" on public.dm_note_touches
  for delete using ((select auth.uid()) = user_id);

-- Subscribed on the campaign channel; RLS hands each row to its owner only.
alter publication supabase_realtime add table public.dm_note_touches;

create trigger dm_note_touches_signal_delete
  after delete on public.dm_note_touches
  referencing old table as changed
  for each statement execute function public.signal_campaign_change();

insert into private.demo_campaign_tables (table_name, tier, parent_column, parent_table, copy, reason)
values ('dm_note_touches', 1, null, null, false, 'a log of the author''s own sessions; a copy has had none');

-- ── 5. Campaign transfer hands over the DM's private notes ───────────────────
-- The worker is a 37 KB function, so as in 20261005181021 the live definition
-- is patched rather than restated: two updates go in after the one moving
-- `spells`, and the migration stops if they did not land.
do $do$
declare
  v_def    text;
  v_anchor text := E'\n  update public.spells                  set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;\n';
begin
  v_def := pg_get_functiondef('public.transfer_campaign_ownership(uuid, uuid, boolean)'::regprocedure);
  if position(v_anchor in v_def) = 0 then
    raise exception 'transfer_campaign_ownership no longer moves spells where this migration expects';
  end if;
  v_def := replace(v_def, v_anchor, v_anchor || $add$
  -- (#983) The outgoing DM's private notes in this campaign are their DM notes,
  -- which a notes column would have carried along with its row.
  update public.entity_notes
     set user_id = p_new_owner_id
   where campaign_id = p_campaign_id and user_id = v_owner
     and is_private and not shared_with_dm;
  -- A co-DM taking over may have touched the same entity; theirs is kept.
  delete from public.dm_note_touches o
   where o.campaign_id = p_campaign_id and o.user_id = v_owner
     and exists (select 1 from public.dm_note_touches n
                  where n.user_id = p_new_owner_id and n.campaign_id = o.campaign_id
                    and n.entity_type = o.entity_type and n.entity_id = o.entity_id);
  update public.dm_note_touches         set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
$add$);
  if v_def !~ 'update public\.entity_notes' or v_def !~ 'update public\.dm_note_touches' then
    raise exception 'transfer_campaign_ownership did not take the DM-note updates';
  end if;
  execute v_def;
end $do$;

