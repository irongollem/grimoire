-- Lore told in passages (#1226 story 5, frames 04 and 04b).
--
-- A lore entry (`part = 'lore'`) has a kind (history, legend, culture, magic, place, faith, other) and, when it
-- happened, a date in the world for the almanac. Its text is told in passages, so a slow reveal over the campaign is
-- natural: sharing the entry tells its first passage; every later passage is told on its own (`player_visible_to`),
-- and may say where it comes out (a place, a person or a beat, where the Run screen offers "Tell the party"). A
-- passage can also be a secret's clue (`canon_clues.passage_id`), so a clue is written once: telling the passage
-- ticks the clue found.

-- ── 1. A lore entry's kind and its date in the world ─────────────────────────
alter table public.canon_entries
  add column lore_kind text
    constraint canon_entries_lore_kind_known check (lore_kind in ('history', 'legend', 'culture', 'magic', 'place', 'faith', 'other')),
  add column world_year integer,
  add column world_month integer,
  add column world_day integer,
  add constraint canon_entries_only_lore_has_a_kind check (lore_kind is null or part = 'lore'),
  add constraint canon_entries_world_date check (
    (world_month is null or world_year is not null) and (world_day is null or world_month is not null));

-- ── 2. canon_lore_passages ────────────────────────────────────────────────────
create table public.canon_lore_passages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  entry_id uuid not null references public.canon_entries (id) on delete cascade,
  -- The passage's heading ("What Bell-Note believes"), and its text (Tiptap JSON, secret blocks withheld from players).
  title text not null default '',
  body text,
  sort_order integer not null default 0,
  -- Told to these party members. The first passage is told with the entry itself and ignores this.
  player_visible_to uuid[] not null default '{}',
  told_at timestamptz,
  told_session_id uuid references public.campaign_sessions (id) on delete set null,
  -- Where it comes out: one place, one person or one beat, or nowhere in particular.
  location_id uuid references public.locations (id) on delete set null,
  npc_id uuid references public.npcs (id) on delete set null,
  quest_beat_id uuid references public.quest_beats (id) on delete set null,
  ai_provenance jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canon_lore_passages_one_place check (num_nonnulls(location_id, npc_id, quest_beat_id) <= 1),
  constraint canon_lore_passages_session_when_told check (told_session_id is null or told_at is not null)
);

create index canon_lore_passages_entry_idx on public.canon_lore_passages (entry_id, sort_order);
create index canon_lore_passages_campaign_idx on public.canon_lore_passages (campaign_id);
create index canon_lore_passages_user_idx on public.canon_lore_passages (user_id);
create index canon_lore_passages_location_idx on public.canon_lore_passages (location_id) where location_id is not null;
create index canon_lore_passages_npc_idx on public.canon_lore_passages (npc_id) where npc_id is not null;
create index canon_lore_passages_beat_idx on public.canon_lore_passages (quest_beat_id) where quest_beat_id is not null;
create index canon_lore_passages_session_idx on public.canon_lore_passages (told_session_id) where told_session_id is not null;

create trigger canon_lore_passages_updated_at
  before update on public.canon_lore_passages
  for each row execute procedure update_updated_at();

create trigger canon_lore_passages_guard_content_author
  before update on public.canon_lore_passages
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

create trigger canon_lore_passages_belong_to_lore
  before insert or update of entry_id on public.canon_lore_passages
  for each row execute procedure private.canon_child_belongs_to('lore', 'entry_id');

create trigger zz_same_campaign_refs
  before insert or update of entry_id, location_id, npc_id, quest_beat_id, told_session_id, campaign_id
  on public.canon_lore_passages
  for each row execute procedure private.enforce_same_campaign_refs(
    'entry_id', 'canon_entries', 'owned',
    'location_id', 'locations', 'owned',
    'npc_id', 'npcs', 'owned',
    'quest_beat_id', 'quest_beats', 'unowned',
    'told_session_id', 'campaign_sessions', 'owned');

alter table public.canon_lore_passages enable row level security;
create policy "canon_lore_passages_select" on public.canon_lore_passages for select using (private.is_campaign_dm(campaign_id));
create policy "canon_lore_passages_insert" on public.canon_lore_passages for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "canon_lore_passages_update" on public.canon_lore_passages for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "canon_lore_passages_delete" on public.canon_lore_passages for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.canon_lore_passages to authenticated, service_role;

create trigger canon_lore_passages_signal_insert after insert on public.canon_lore_passages
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_lore_passages_signal_update after update on public.canon_lore_passages
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_lore_passages_signal_delete after delete on public.canon_lore_passages
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

insert into private.demo_campaign_tables (table_name, tier, copy, reason) values ('canon_lore_passages', 1, true, null);

create function private.canon_lore_passages_mark_edited()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.ai_provenance is not null
     and new.ai_provenance is not distinct from old.ai_provenance
     and coalesce((old.ai_provenance ->> 'edited')::boolean, false) = false
     and (new.title is distinct from old.title or new.body is distinct from old.body) then
    new.ai_provenance := jsonb_set(old.ai_provenance, '{edited}', 'true'::jsonb);
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_lore_passages_mark_edited() from public, anon, authenticated;

create trigger canon_lore_passages_mark_edited
  before update on public.canon_lore_passages
  for each row execute procedure private.canon_lore_passages_mark_edited();

-- ── 3. A passage can be a clue ────────────────────────────────────────────────
alter table public.canon_clues
  add column passage_id uuid references public.canon_lore_passages (id) on delete set null;
create index canon_clues_passage_idx on public.canon_clues (passage_id) where passage_id is not null;

drop trigger zz_same_campaign_refs on public.canon_clues;
create trigger zz_same_campaign_refs
  before insert or update of secret_id, location_id, npc_id, quest_beat_id, found_session_id, passage_id, campaign_id
  on public.canon_clues
  for each row execute procedure private.enforce_same_campaign_refs(
    'secret_id', 'canon_entries', 'owned',
    'location_id', 'locations', 'owned',
    'npc_id', 'npcs', 'owned',
    'quest_beat_id', 'quest_beats', 'unowned',
    'found_session_id', 'campaign_sessions', 'owned',
    'passage_id', 'canon_lore_passages', 'owned');

-- Telling a passage ticks the clues it is: the first time it is told to anyone, each clue that points at it and is not
-- yet found is found, in the same session. Invoker: the DM who tells the passage may write the clue.
create function private.canon_told_passage_finds_its_clues()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.told_at is not null and old.told_at is null then
    update public.canon_clues c
       set found_at = new.told_at, found_session_id = new.told_session_id
     where c.passage_id = new.id and c.found_at is null;
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_told_passage_finds_its_clues() from public, anon, authenticated;

create trigger canon_told_passage_finds_its_clues
  after update of told_at on public.canon_lore_passages
  for each row execute procedure private.canon_told_passage_finds_its_clues();

-- ── 4. Who may read an entry: unchanged rules, restated with every part ───────
create or replace function private.canon_entry_seen(p_entry_id uuid, p_member uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select case e.part
      when 'truth' then
        e.knowledge = 'all'
        or (e.knowledge = 'some' and exists (
              select 1 from public.world_links l
               where l.from_canon_entry_id = e.id and l.type = 'known_to'
                 and (l.to_party_member_id = p_member
                      or exists (select 1 from public.faction_party_members m
                                  where m.faction_id = l.to_faction_id and m.party_member_id = p_member))))
      when 'premise' then e.premise_kind not in ('voice', 'look') and p_member = any (e.player_visible_to)
      when 'lore' then p_member = any (e.player_visible_to)
      when 'chronicle' then p_member = any (e.player_visible_to)
      when 'secret' then e.revealed_at is not null and p_member = any (e.player_visible_to)
      else false
    end
      from public.canon_entries e
     where e.id = p_entry_id and p_member is not null), false)
$$;

-- ── 5. The players' read of lore passages ─────────────────────────────────────
-- A passage reaches a member when its entry does (shared with them) and it is the entry's first passage, or it has
-- been told to them. Its own columns only; secret blocks withheld; the reveal list never handed out.
create function public.get_player_lore_passages(p_campaign_id uuid, p_preview_member_id uuid default null)
returns table (
  id uuid,
  entry_id uuid,
  sort_order integer,
  title text,
  body text,
  told_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with me (member) as (
    select cm.party_member_id from public.campaign_members cm
     where cm.campaign_id = p_campaign_id and cm.user_id = (select auth.uid()) and cm.party_member_id is not null
       and p_preview_member_id is null
    union
    select p_preview_member_id
     where p_preview_member_id is not null and private.is_campaign_dm(p_campaign_id)
       and exists (select 1 from public.party_members pm
                    where pm.id = p_preview_member_id and pm.campaign_id = p_campaign_id)
  ),
  firsts as (
    select distinct on (p.entry_id) p.id from public.canon_lore_passages p
     where p.campaign_id = p_campaign_id
     order by p.entry_id, p.sort_order, p.created_at
  )
  select p.id, p.entry_id, p.sort_order, p.title, private.withhold_secret_blocks(p.body), p.told_at
    from public.canon_lore_passages p
    join me on true
   where p.campaign_id = p_campaign_id
     and private.canon_entry_seen(p.entry_id, me.member)
     and (p.id in (select f.id from firsts f) or me.member = any (p.player_visible_to))
   order by p.entry_id, p.sort_order, p.created_at
$$;
revoke execute on function public.get_player_lore_passages(uuid, uuid) from public, anon;
grant execute on function public.get_player_lore_passages(uuid, uuid) to authenticated, service_role;

-- The players' read of entries gains the lore kind and the date in the world.
drop function public.get_player_canon(uuid, uuid);
create function public.get_player_canon(p_campaign_id uuid, p_preview_member_id uuid default null)
returns table (
  id uuid,
  part text,
  premise_kind text,
  knowledge text,
  title text,
  body text,
  sort_order integer,
  image_url text,
  ai_provenance jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  lore_kind text,
  world_year integer,
  world_month integer,
  world_day integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me (member) as (
    select cm.party_member_id from public.campaign_members cm
     where cm.campaign_id = p_campaign_id and cm.user_id = (select auth.uid()) and cm.party_member_id is not null
       and p_preview_member_id is null
    union
    select p_preview_member_id
     where p_preview_member_id is not null and private.is_campaign_dm(p_campaign_id)
       and exists (select 1 from public.party_members pm
                    where pm.id = p_preview_member_id and pm.campaign_id = p_campaign_id)
  )
  select e.id, e.part, e.premise_kind, e.knowledge, e.title, private.withhold_secret_blocks(e.body), e.sort_order,
         e.image_url, e.ai_provenance, e.created_at, e.updated_at, e.lore_kind, e.world_year, e.world_month, e.world_day
    from public.canon_entries e
   where e.campaign_id = p_campaign_id
     and exists (select 1 from me where private.canon_entry_seen(e.id, me.member))
   order by e.part, e.sort_order, e.created_at
$$;
revoke execute on function public.get_player_canon(uuid, uuid) from public, anon;
grant execute on function public.get_player_canon(uuid, uuid) to authenticated, service_role;

-- ── 6. Passages change hands with their campaign ──────────────────────────────
-- Restated whole from 20261119231831 with the one line added.
CREATE OR REPLACE FUNCTION private.move_campaign_content(p_campaign_id uuid, p_from uuid, p_to uuid, p_scoped_homebrew boolean, p_player_rows boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_prev_move  text := current_setting('grimoire.content_move', true);
  v_prev_quota text := current_setting('grimoire.bypass_quota', true);
begin
  -- The author guard (private.guard_content_author) lets this through, and
  -- re-stamped rows are not new rows to count against anyone's quota.
  perform set_config('grimoire.content_move', 'on', true);
  perform set_config('grimoire.bypass_quota', 'on', true);

  update public.calendar_events       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.class_features        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.crafting_recipes      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.custom_classes        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.custom_subclasses     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.deities               set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.encounter_state       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.encounters            set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.factions              set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.items                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.kin_links             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.world_links           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.location_roads        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.story_facts           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_entries         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_clues           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_force_steps     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_force_ticks     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_force_quests    set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_lore_passages   set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notice_board_pins     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notice_boards         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.locations             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.loot_tables           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notes                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_inventory         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_sets              set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npcs                  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.pantheons             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.puzzle_rooms          set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.quests                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.roll_tables           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.rules                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.scriptorium_documents set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.session_proposals     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_broadcast  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_pages      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_playlists  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_pads       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.sounds                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.species               set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.spells                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_sessions     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;

  -- What a member writes as a player (their own character, its inventory and
  -- companions, journal entries on items, class option texts). A seat that
  -- rotates has written these before it took the chair, so handing the chair
  -- back leaves them where they are; a transfer and a deleted account move
  -- them, the first because the outgoing owner wrote them as DM, the second
  -- because otherwise they cascade away.
  if p_player_rows then
    update public.class_option_texts set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.companions         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.party_inventory    set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.party_members      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.item_entries       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  end if;

  -- Rows that carry an author but no campaign_id, scoped by their parent.
  update public.faction_npcs f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.faction_party_members f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.store_items si set user_id = p_to
   where si.user_id = p_from
     and exists (select 1 from public.locations l where l.id = si.location_id and l.campaign_id = p_campaign_id);
  update public.location_doors d set user_id = p_to
   where d.user_id = p_from
     and exists (select 1 from public.locations l where l.id = d.from_location_id and l.campaign_id = p_campaign_id);
  update public.location_map_regions r set user_id = p_to
   where r.user_id = p_from
     and exists (select 1 from public.locations l where l.id = r.site_location_id and l.campaign_id = p_campaign_id);
  update public.location_placements lp set user_id = p_to
   where lp.user_id = p_from
     and exists (select 1 from public.locations l where l.id = lp.location_id and l.campaign_id = p_campaign_id);
  update public.location_state_events e set user_id = p_to
   where e.user_id = p_from
     and exists (select 1 from public.locations l where l.id = e.location_id and l.campaign_id = p_campaign_id);

  if p_scoped_homebrew then
    update public.monsters         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.traps            set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.dungeon_maps     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.dungeon_features set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  end if;

  perform set_config('grimoire.content_move', coalesce(v_prev_move, ''), true);
  perform set_config('grimoire.bypass_quota', coalesce(v_prev_quota, ''), true);
end;
$function$;

-- ── 7. AI help: draft lore, split it into passages ────────────────────────────
insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
select 'canon_lore_suggestion', 'Lore drafts', 1, (select coalesce(max(sort_order), 0) + 1 from public.ai_generation_credit_costs)
on conflict (generation_type) do nothing;

insert into public.ai_system_prompts (generator_type, label, content) values
  ('canon_lore', 'Lore Drafts', $prompt$You help a Dungeon Master write a piece of their campaign's lore (a history, a legend, a culture, how magic works), told in passages so the party can learn it slowly over the campaign. Write two to five passages, each a heading and one or two short paragraphs. The first passage is what anyone could know; each later passage goes deeper, and the last may hold what almost nobody knows. For each passage after the first, say where it comes out: at ONE place, from ONE person or at ONE quest beat, chosen ONLY from those given, copied exactly, or nowhere in particular.

Rules:
- Fit the premise, tone and truths given; never contradict a truth, never answer an open question, and never state a secret (a passage may hint at one).
- Concrete and specific, in the campaign's voice. No em-dashes.
- If the DM gave a title, a kind or a steer, follow it; if the DM already wrote text, split and deepen it rather than replacing its meaning.$prompt$)
on conflict (generator_type) do nothing;
