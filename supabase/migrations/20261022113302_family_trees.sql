-- Migration: family_trees
-- Family trees (#1083). Kinship becomes its own record with a direction, so a tree can be drawn; a noble line can be a
-- House, a faction with a descent rule and a line of succession. The design is the "Family Trees" canvas
-- (claude.ai artifact CPEegPZ7SaQufxge9gZQ2N); the decisions that shape this file:
--
--   * Kin is not a bond. `npc_relationships` (and `npc_pc_notes`) say how two people feel about each other; `kin_links`
--     says who is whose parent, spouse or sibling. They differ in shape as well as meaning: kin joins any two people in
--     the campaign, NPC or PC, and a PC can be the sibling or spouse of another PC, which neither bond table can hold.
--     So the old symmetric `family` and `sibling` bond types leave the bond tables entirely (rule 1: no legacy).
--   * One link per pair, read in one direction: `parent` means `from` is the parent of `to`. A child link is stored as
--     the parent link the other way round, so a tree never has to reconcile two spellings of one fact. Siblings are
--     read from shared parents; a stored `sibling` is for when the parents are unknown.
--   * `parent_role` (father / mother) is on the link, not on the person: NPCs carry no gender, and a House that descends
--     through one parent only needs to know which parent a child is reckoned through. Left empty, the parent is just a
--     parent and counts for either line.
--   * The old `family` links cannot say which way they go. They move across as `relative` with `needs_sorting`, and the
--     DM sorts them once ("Sort out family links"); an old `sibling` moves across as a sibling.
--   * A House is `faction_type = 'House'` (faction_type is free text, so the type needs no change here). `descent`
--     decides who the Lineage tab counts as of the house, `succession_note` is the house's own custom in words (read by
--     the AI, never enforced), and the line of succession is a rank on the membership rows, first in line being the
--     heir. Succession is set by hand: it is politics, not arithmetic.
--   * Players never read kin_links. get_player_visible_kin projects the links between two people the caller can see,
--     never a link's note, and never a link of an NPC whose disguise still holds.

-- ── 1. kin_links ────────────────────────────────────────────────────────────────
create table public.kin_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  from_npc_id uuid references public.npcs (id) on delete cascade,
  from_party_member_id uuid references public.party_members (id) on delete cascade,
  to_npc_id uuid references public.npcs (id) on delete cascade,
  to_party_member_id uuid references public.party_members (id) on delete cascade,
  -- parent: `from` is the parent of `to`. spouse / former_spouse / sibling / relative are symmetric.
  kind text not null check (kind in ('parent', 'spouse', 'former_spouse', 'sibling', 'relative')),
  parent_role text check (parent_role in ('father', 'mother')),
  adoptive boolean not null default false,
  note text not null default '',
  -- An old "Family" link nobody has sorted out yet: shown in the review, counted by the notice.
  needs_sorting boolean not null default false,
  ai_provenance jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kin_links_one_from check (num_nonnulls(from_npc_id, from_party_member_id) = 1),
  constraint kin_links_one_to check (num_nonnulls(to_npc_id, to_party_member_id) = 1),
  constraint kin_links_not_self check (coalesce(from_npc_id, from_party_member_id) <> coalesce(to_npc_id, to_party_member_id)),
  constraint kin_links_parent_details check (kind = 'parent' or (parent_role is null and not adoptive)),
  constraint kin_links_sorting_is_relative check (not needs_sorting or kind = 'relative')
);

-- One link per pair, whichever way round it was written: two people are parent and child, or spouses, not both.
create unique index kin_links_one_per_pair on public.kin_links (
  campaign_id,
  least(coalesce(from_npc_id, from_party_member_id), coalesce(to_npc_id, to_party_member_id)),
  greatest(coalesce(from_npc_id, from_party_member_id), coalesce(to_npc_id, to_party_member_id))
);
create index kin_links_campaign_idx on public.kin_links (campaign_id);
create index kin_links_user_idx on public.kin_links (user_id);
create index kin_links_from_npc_idx on public.kin_links (from_npc_id) where from_npc_id is not null;
create index kin_links_from_pm_idx on public.kin_links (from_party_member_id) where from_party_member_id is not null;
create index kin_links_to_npc_idx on public.kin_links (to_npc_id) where to_npc_id is not null;
create index kin_links_to_pm_idx on public.kin_links (to_party_member_id) where to_party_member_id is not null;

create trigger kin_links_updated_at
  before update on public.kin_links
  for each row execute procedure update_updated_at();

create trigger zz_same_campaign_refs
  before insert or update of from_npc_id, from_party_member_id, to_npc_id, to_party_member_id, campaign_id
  on public.kin_links
  for each row execute procedure private.enforce_same_campaign_refs(
    'from_npc_id', 'npcs', 'owned', 'from_party_member_id', 'party_members', 'owned',
    'to_npc_id', 'npcs', 'owned', 'to_party_member_id', 'party_members', 'owned');

-- Access is by campaign role, never by user_id: a co-DM edits the family a fellow DM drew, and an ownership transfer
-- moves nothing here. user_id records who made a row.
alter table public.kin_links enable row level security;
create policy "kin_links_select" on public.kin_links for select using (private.is_campaign_dm(campaign_id));
create policy "kin_links_insert" on public.kin_links for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "kin_links_update" on public.kin_links for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "kin_links_delete" on public.kin_links for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.kin_links to authenticated, service_role;

-- ── 2. Old family links move across ────────────────────────────────────────────
-- Between NPCs. Old rows could hold a pair twice, once each way, each with its own note; they become one link that
-- keeps every note (the sorting review reads them), written the way the earliest row was.
with old as (
  select r.*, least(r.npc_id, r.related_npc_id) as a, greatest(r.npc_id, r.related_npc_id) as b
    from public.npc_relationships r
   where r.relationship_type in ('family', 'sibling') and r.campaign_id is not null
),
pairs as (
  select o.campaign_id, o.a, o.b,
         (array_agg(o.id order by o.created_at, o.id))[1] as first_id,
         bool_and(o.relationship_type = 'sibling') as all_sibling,
         coalesce(string_agg(nullif(btrim(o.notes), ''), ' / ' order by o.created_at), '') as notes
    from old o
   group by o.campaign_id, o.a, o.b
)
insert into public.kin_links (user_id, campaign_id, from_npc_id, to_npc_id, kind, note, needs_sorting, ai_provenance, created_at)
select o.user_id, o.campaign_id, o.npc_id, o.related_npc_id,
       case when p.all_sibling then 'sibling' else 'relative' end,
       p.notes,
       not p.all_sibling,
       o.ai_provenance,
       o.created_at
  from pairs p
  join old o on o.id = p.first_id;

delete from public.npc_relationships
 where relationship_type in ('family', 'sibling') and campaign_id is not null;

-- A library NPC (no campaign) has no family to belong to: its tie stays a bond, and says what it was.
update public.npc_relationships
   set notes = case when coalesce(notes, '') = '' then 'Family' else 'Family: ' || notes end,
       relationship_type = 'contact'
 where relationship_type in ('family', 'sibling') and campaign_id is null;

-- Between an NPC and a PC. The note row stays (it holds the PC's notes on the NPC); its bond becomes a plain contact.
insert into public.kin_links (user_id, campaign_id, from_npc_id, to_party_member_id, kind, needs_sorting, created_at)
select n.user_id, n.campaign_id, n.npc_id, n.party_member_id,
       case when n.relationship_type = 'sibling' then 'sibling' else 'relative' end,
       n.relationship_type = 'family',
       n.created_at
  from public.npc_pc_notes n
 where n.relationship_type in ('family', 'sibling')
 order by n.created_at
on conflict do nothing;

update public.npc_pc_notes set relationship_type = 'contact' where relationship_type in ('family', 'sibling');

-- The bond tables now hold bonds only, and say so. Anything outside the list was never a type the app could show.
update public.npc_relationships set relationship_type = 'contact'
 where relationship_type not in ('chosen_family', 'friend', 'ally', 'rival', 'enemy', 'lover', 'mentor', 'apprentice',
                                 'subordinate', 'superior', 'contact', 'former_ally', 'former_enemy');
update public.npc_pc_notes set relationship_type = 'contact'
 where relationship_type not in ('chosen_family', 'friend', 'ally', 'rival', 'enemy', 'lover', 'mentor', 'apprentice',
                                 'subordinate', 'superior', 'contact', 'former_ally', 'former_enemy');
alter table public.npc_relationships add constraint npc_relationships_type_known check (relationship_type in (
  'chosen_family', 'friend', 'ally', 'rival', 'enemy', 'lover', 'mentor', 'apprentice',
  'subordinate', 'superior', 'contact', 'former_ally', 'former_enemy'));
alter table public.npc_pc_notes add constraint npc_pc_notes_type_known check (relationship_type in (
  'chosen_family', 'friend', 'ally', 'rival', 'enemy', 'lover', 'mentor', 'apprentice',
  'subordinate', 'superior', 'contact', 'former_ally', 'former_enemy'));

-- The doorbell, after the move: the moved rows are not news to anyone.
create trigger kin_links_signal_insert after insert on public.kin_links
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger kin_links_signal_update after update on public.kin_links
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger kin_links_signal_delete after delete on public.kin_links
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

insert into private.demo_campaign_tables (table_name, tier, copy, reason) values ('kin_links', 1, true, null);

-- ── 3. Houses ───────────────────────────────────────────────────────────────────
-- descent: either (cognatic, the default for a House), father, mother, or oath (membership is the member list, not blood).
alter table public.factions
  add column descent text check (descent in ('either', 'father', 'mother', 'oath')),
  add column succession_note text not null default '';

-- The line of succession: 1 is the heir. Null is "not in the line".
alter table public.faction_npcs add column succession_rank integer check (succession_rank > 0);
alter table public.faction_party_members add column succession_rank integer check (succession_rank > 0);

-- Sets the whole line in one write, so a reorder never passes through a half-ranked state. p_line holds person keys,
-- 'npc:<uuid>' or 'pc:<uuid>', in order. Someone picked who is not yet a member joins the house as a Member. A definer
-- because the membership rows belong to whichever DM added them; the faction edit check below is the whole gate.
create or replace function public.set_house_succession(p_faction_id uuid, p_line text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign uuid;
  v_key text;
  v_kind text;
  v_id uuid;
  v_rank integer := 0;
begin
  select f.campaign_id into v_campaign from public.factions f where f.id = p_faction_id;
  if (select auth.uid()) is null or v_campaign is null
     or not coalesce(private.is_campaign_dm(v_campaign), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  update public.faction_npcs set succession_rank = null where faction_id = p_faction_id and succession_rank is not null;
  update public.faction_party_members set succession_rank = null where faction_id = p_faction_id and succession_rank is not null;

  foreach v_key in array coalesce(p_line, '{}') loop
    v_kind := split_part(v_key, ':', 1);
    v_id := split_part(v_key, ':', 2)::uuid;
    v_rank := v_rank + 1;
    if v_kind = 'npc' then
      if not exists (select 1 from public.npcs n where n.id = v_id and n.campaign_id = v_campaign) then
        raise exception 'Not in this campaign' using errcode = '23514';
      end if;
      update public.faction_npcs set succession_rank = v_rank where faction_id = p_faction_id and npc_id = v_id;
      if not found then
        insert into public.faction_npcs (user_id, faction_id, npc_id, role, succession_rank)
        values ((select auth.uid()), p_faction_id, v_id, 'Member', v_rank);
      end if;
    elsif v_kind = 'pc' then
      if not exists (select 1 from public.party_members p where p.id = v_id and p.campaign_id = v_campaign) then
        raise exception 'Not in this campaign' using errcode = '23514';
      end if;
      update public.faction_party_members set succession_rank = v_rank where faction_id = p_faction_id and party_member_id = v_id;
      if not found then
        insert into public.faction_party_members (user_id, faction_id, party_member_id, role, succession_rank)
        values ((select auth.uid()), p_faction_id, v_id, 'Member', v_rank);
      end if;
    else
      raise exception 'Unknown person key %', v_key using errcode = '22023';
    end if;
  end loop;
end;
$$;
revoke execute on function public.set_house_succession(uuid, text[]) from public, anon;
grant execute on function public.set_house_succession(uuid, text[]) to authenticated, service_role;

-- The player projection returns setof factions positionally, so the new columns are named here. Descent is how the
-- house reckons its own, which a player who knows the house may know; its succession custom is the DM's.
create or replace function public.get_player_visible_factions(p_campaign_id uuid, p_preview_member_id uuid default null::uuid)
returns setof factions
language sql
stable security definer
set search_path to 'public', 'private'
as $function$
  select
    f.id,
    f.user_id,
    f.name,
    f.faction_type,
    private.withhold_secret_blocks(f.description),
    f.emblem_url,
    f.alignment,
    f.tags,
    f.created_at,
    f.updated_at,
    f.player_visible_to,
    f.campaign_id,
    f.ai_provenance,
    f.setting_source,
    null::text,                          -- demo_source (#912): a quota marker, nothing for players
    f.party_standing,
    f.descent,                           -- #1083: how the house reckons its own
    ''::text                             -- succession_note (#1083): the DM's
  from factions f
  where f.campaign_id = p_campaign_id
    and (
      private.faction_is_visible_to_caller(f.id)
      or (
        private.is_campaign_dm(f.campaign_id)
        and case
          when p_preview_member_id is not null then
            p_preview_member_id = any (f.player_visible_to)
            or exists (
              select 1 from faction_party_members fpm
               where fpm.faction_id = f.id
                 and fpm.party_member_id = p_preview_member_id
            )
          else
            array_length(f.player_visible_to, 1) is not null
            or exists (select 1 from faction_party_members fpm where fpm.faction_id = f.id)
        end
      )
    )
$function$;

-- ── 4. What a player may see of a family ─────────────────────────────────────────
-- A House the player knows shows them its people: the maintainer's call for the Lineage tab (#1083), and wider than
-- faction_npcs_select, which shows membership only to a member's own player. It names only people the player already
-- knows, and never one expelled or defected: those are the DM's to reveal.
-- The links between two people the caller can see: an NPC whose name the projection shows (and whose disguise has
-- fallen, if it had one: a kin line from a disguise would name who is behind it), or a character in the party. No
-- note, which is the DM's. Plus, for each House the caller knows, which of those people belong to it, so the player's
-- Lineage tab can draw the house without reading membership tables. p_preview_member_id: the DM sees what that member
-- would, as get_player_visible_npcs does.
create or replace function public.get_player_visible_kin(p_campaign_id uuid, p_preview_member_id uuid default null::uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dm boolean;
begin
  v_dm := coalesce(private.is_campaign_dm(p_campaign_id), false);
  if (select auth.uid()) is null or not (v_dm or coalesce(private.is_campaign_member(p_campaign_id), false)) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return (
    with seen_npcs as (
      select v.id
        from public.get_player_visible_npcs(p_campaign_id, null, p_preview_member_id) v
        join public.npcs n on n.id = v.id
       where v.name is not null
         and (n.is_revealed or (n.disguise_name is null and n.disguise_portrait_url is null))
    ),
    seen as (
      select 'npc:' || s.id::text as key, s.id from seen_npcs s
      union all
      select 'pc:' || p.id::text, p.id from public.party_members p where p.campaign_id = p_campaign_id
    ),
    links as (
      select k.*,
             case when k.from_npc_id is not null then 'npc:' || k.from_npc_id::text else 'pc:' || k.from_party_member_id::text end as from_key,
             case when k.to_npc_id is not null then 'npc:' || k.to_npc_id::text else 'pc:' || k.to_party_member_id::text end as to_key
        from public.kin_links k
       where k.campaign_id = p_campaign_id
    ),
    houses as (
      select f.id
        from public.factions f
       where f.campaign_id = p_campaign_id
         and f.faction_type = 'House'
         and (private.faction_is_visible_to_caller(f.id)
              -- The DM previews exactly the houses get_player_visible_factions would show that member.
              or (v_dm and case
                    when p_preview_member_id is not null then
                      p_preview_member_id = any (f.player_visible_to)
                      or exists (select 1 from public.faction_party_members fpm
                                  where fpm.faction_id = f.id and fpm.party_member_id = p_preview_member_id)
                    else
                      array_length(f.player_visible_to, 1) is not null
                      or exists (select 1 from public.faction_party_members fpm where fpm.faction_id = f.id)
                  end))
    )
    select jsonb_build_object(
      'links', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', l.id, 'from', l.from_key, 'to', l.to_key, 'kind', l.kind,
                 'parent_role', l.parent_role, 'adoptive', l.adoptive) order by l.created_at)
          from links l
         where l.from_key in (select key from seen) and l.to_key in (select key from seen)), '[]'::jsonb),
      'houses', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'faction_id', h.id,
                 'members', coalesce((
                   select jsonb_agg(m.key order by m.key)
                     from (select 'npc:' || fn.npc_id::text as key from public.faction_npcs fn
                            where fn.faction_id = h.id and fn.status not in ('Expelled', 'Defected')
                           union
                           select 'pc:' || fp.party_member_id::text from public.faction_party_members fp
                            where fp.faction_id = h.id and fp.status not in ('Expelled', 'Defected')) m
                    where m.key in (select key from seen)), '[]'::jsonb)))
          from houses h), '[]'::jsonb)
    )
  );
end;
$$;
revoke execute on function public.get_player_visible_kin(uuid, uuid) from public, anon;
grant execute on function public.get_player_visible_kin(uuid, uuid) to authenticated, service_role;

-- ── 5. Who keeps a family when its author leaves ────────────────────────────────
-- kin_links.user_id cascades on account delete, so a campaign handed to a new owner (or left by a co-DM) must re-home
-- the rows that author wrote, as it does every other authored table; otherwise deleting the old account deletes the
-- tree. notice_boards and notice_board_pins (20261015234112) were never added either, and had the same hole. The
-- body is 20261013231042's with those three lines added.
create or replace function private.move_campaign_content(
  p_campaign_id uuid, p_from uuid, p_to uuid, p_scoped_homebrew boolean, p_player_rows boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
  update public.faction_deities       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.factions              set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.items                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.kin_links             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notice_board_pins     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notice_boards         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.locations             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.loot_tables           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notes                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_inventory         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_pc_notes          set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_relationships     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
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
  update public.faction_items f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.faction_locations f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.faction_npcs f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.faction_party_members f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.faction_relations f set user_id = p_to
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
$$;

revoke execute on function private.move_campaign_content(uuid, uuid, uuid, boolean, boolean) from public, anon, authenticated;
