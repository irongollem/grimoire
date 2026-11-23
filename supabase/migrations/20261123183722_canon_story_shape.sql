-- The Canon audit's second round (#1258): the shape a story needs beyond a world bible.
--
-- 1. Arcs have a shape (item 7): a status (planned, running, ended), the dramatic question the arc asks, what is at
--    stake, and how it ended. A quest can belong to an arc (`quests.arc_id`), so an arc gathers its quests too.
-- 2. A secret records the session it was revealed in (`revealed_session_id`, item 8), as a clue records where it was
--    found, a passage when it was told and a step when it was reached, so a session can list what it changed.
-- 3. A force step can be due on a date in the world (`due_year/_month/_day`, item 9), and a force says what happens if
--    nobody stops it (`if_succeeds`).
-- 4. An entry can carry a theme (item 17): a `carries` link from a force, secret, truth or lore entry to a theme line
--    of the premise, and an arc names the theme it carries (`canon_arcs.theme_id`). Quests carry themes through the arc
--    they belong to.
-- 5. A clue can lie in an item or a handout (item 30), so the letter the party is handed is where the clue is.
-- 6. A question can be tied to the quests that should answer it (item 24): `canon_entry_quests` takes questions.
-- 7. Players can wonder aloud (item 24): `canon_wonders` holds a player's question about the world; the DM adopts it
--    as an open question or lets it be. A player writes and reads only their own; the DM reads all.

-- ── 1. Arcs ─────────────────────────────────────────────────────────────────────
alter table public.canon_arcs
  add column status text not null default 'running'
    constraint canon_arcs_status check (status in ('planned', 'running', 'ended')),
  add column question text,
  add column stakes text,
  add column ending text,
  add column theme_id uuid references public.canon_entries (id) on delete set null,
  add constraint canon_arcs_ending_when_ended check (ending is null or status = 'ended');
create index canon_arcs_theme_idx on public.canon_arcs (theme_id) where theme_id is not null;

-- An arc's theme is a line of the premise, in the arc's campaign.
create trigger canon_arcs_theme_is_premise
  before insert or update of theme_id on public.canon_arcs
  for each row when (new.theme_id is not null)
  execute procedure private.canon_child_belongs_to('premise', 'theme_id');
create trigger zz_same_campaign_refs
  before insert or update of theme_id, campaign_id on public.canon_arcs
  for each row execute procedure private.enforce_same_campaign_refs('theme_id', 'canon_entries', 'owned');

alter table public.quests add column arc_id uuid references public.canon_arcs (id) on delete set null;
create index quests_arc_idx on public.quests (arc_id) where arc_id is not null;

drop trigger zz_same_campaign_refs on public.quests;
create trigger zz_same_campaign_refs
  before insert or update of giver_npc_id, location_id, parent_quest_id, arc_id, campaign_id on public.quests
  for each row execute procedure private.enforce_same_campaign_refs('giver_npc_id', 'npcs', 'owned', 'location_id', 'locations', 'owned', 'parent_quest_id', 'quests', 'owned', 'arc_id', 'canon_arcs', 'owned');

-- ── 2. The session a secret came out ────────────────────────────────────────────
alter table public.canon_entries
  add column revealed_session_id uuid references public.campaign_sessions (id) on delete set null,
  add constraint canon_entries_revealed_session_when_revealed check (revealed_session_id is null or revealed_at is not null);
create index canon_entries_revealed_session_idx on public.canon_entries (revealed_session_id) where revealed_session_id is not null;

-- ── 3. A force's schedule and stakes ────────────────────────────────────────────
alter table public.canon_force_steps
  add column due_year integer,
  add column due_month integer,
  add column due_day integer,
  -- A date is a year, a year and month, or a whole date; never a day without its month.
  add constraint canon_force_steps_due_shape check (
    (due_month is null or due_year is not null) and (due_day is null or due_month is not null));

alter table public.canon_entries
  add column if_succeeds text,
  add constraint canon_entries_if_succeeds_force check (if_succeeds is null or part = 'force');

-- ── 5. Clues in items and handouts ──────────────────────────────────────────────
alter table public.canon_clues
  add column item_id uuid references public.items (id) on delete set null,
  add column document_id uuid references public.scriptorium_documents (id) on delete set null,
  drop constraint canon_clues_one_place,
  add constraint canon_clues_one_place check (num_nonnulls(location_id, npc_id, quest_beat_id, item_id, document_id) <= 1);
create index canon_clues_item_idx on public.canon_clues (item_id) where item_id is not null;
create index canon_clues_document_idx on public.canon_clues (document_id) where document_id is not null;

drop trigger zz_same_campaign_refs on public.canon_clues;
create trigger zz_same_campaign_refs
  before insert or update of secret_id, location_id, npc_id, quest_beat_id, item_id, document_id, found_session_id, passage_id, campaign_id
  on public.canon_clues
  for each row execute procedure private.enforce_same_campaign_refs('secret_id', 'canon_entries', 'owned', 'location_id', 'locations', 'owned',
    'npc_id', 'npcs', 'owned', 'quest_beat_id', 'quest_beats', 'unowned', 'item_id', 'items', 'owned',
    'document_id', 'scriptorium_documents', 'owned', 'found_session_id', 'campaign_sessions', 'owned', 'passage_id', 'canon_lore_passages', 'owned');

-- canon_entries takes the new reference to a session.
drop trigger zz_same_campaign_refs on public.canon_entries;
create trigger zz_same_campaign_refs
  before insert or update of party_member_id, became_entry_id, from_fact_id, arc_id, habitat_id, revealed_session_id, campaign_id
  on public.canon_entries
  for each row execute procedure private.enforce_same_campaign_refs('party_member_id', 'party_members', 'owned', 'became_entry_id', 'canon_entries', 'owned',
    'from_fact_id', 'story_facts', 'owned', 'arc_id', 'canon_arcs', 'owned', 'habitat_id', 'campaign_habitats', 'owned',
    'revealed_session_id', 'campaign_sessions', 'owned');

-- ── 4. Themes ───────────────────────────────────────────────────────────────────
-- The catalogue, restated whole: src/lib/worldLinks/catalogueMirror.test.ts reads the newest block between the markers.
-- catalogue:start
insert into private.world_link_types (from_kind, to_kind, type, is_symmetric) values
  ('npc', 'npc', 'friend', true),
  ('npc', 'npc', 'ally', true),
  ('npc', 'npc', 'lover', true),
  ('npc', 'npc', 'contact', true),
  ('npc', 'npc', 'rival', true),
  ('npc', 'npc', 'enemy', true),
  ('npc', 'npc', 'mentor_of', false),
  ('npc', 'npc', 'superior_of', false),
  ('npc', 'npc', 'chosen_family', true),
  ('npc', 'npc', 'former_ally', true),
  ('npc', 'npc', 'former_enemy', true),
  ('npc', 'npc', 'employer_of', false),
  ('npc', 'npc', 'patron_of', false),
  ('npc', 'npc', 'creditor_of', false),
  ('npc', 'npc', 'blackmails', false),
  ('npc', 'npc', 'betrayed', false),
  ('npc', 'npc', 'sworn_to', false),
  ('npc', 'party_member', 'friend', true),
  ('npc', 'party_member', 'ally', true),
  ('npc', 'party_member', 'lover', true),
  ('npc', 'party_member', 'contact', true),
  ('npc', 'party_member', 'rival', true),
  ('npc', 'party_member', 'enemy', true),
  ('npc', 'party_member', 'mentor_of', false),
  ('npc', 'party_member', 'superior_of', false),
  ('npc', 'party_member', 'chosen_family', true),
  ('npc', 'party_member', 'former_ally', true),
  ('npc', 'party_member', 'former_enemy', true),
  ('npc', 'party_member', 'employer_of', false),
  ('npc', 'party_member', 'patron_of', false),
  ('npc', 'party_member', 'creditor_of', false),
  ('npc', 'party_member', 'blackmails', false),
  ('npc', 'party_member', 'betrayed', false),
  ('npc', 'party_member', 'sworn_to', false),
  ('party_member', 'npc', 'friend', true),
  ('party_member', 'npc', 'ally', true),
  ('party_member', 'npc', 'lover', true),
  ('party_member', 'npc', 'contact', true),
  ('party_member', 'npc', 'rival', true),
  ('party_member', 'npc', 'enemy', true),
  ('party_member', 'npc', 'mentor_of', false),
  ('party_member', 'npc', 'superior_of', false),
  ('party_member', 'npc', 'chosen_family', true),
  ('party_member', 'npc', 'former_ally', true),
  ('party_member', 'npc', 'former_enemy', true),
  ('party_member', 'npc', 'employer_of', false),
  ('party_member', 'npc', 'patron_of', false),
  ('party_member', 'npc', 'creditor_of', false),
  ('party_member', 'npc', 'blackmails', false),
  ('party_member', 'npc', 'betrayed', false),
  ('party_member', 'npc', 'sworn_to', false),
  ('party_member', 'party_member', 'friend', true),
  ('party_member', 'party_member', 'ally', true),
  ('party_member', 'party_member', 'lover', true),
  ('party_member', 'party_member', 'contact', true),
  ('party_member', 'party_member', 'rival', true),
  ('party_member', 'party_member', 'enemy', true),
  ('party_member', 'party_member', 'mentor_of', false),
  ('party_member', 'party_member', 'superior_of', false),
  ('party_member', 'party_member', 'chosen_family', true),
  ('party_member', 'party_member', 'former_ally', true),
  ('party_member', 'party_member', 'former_enemy', true),
  ('party_member', 'party_member', 'employer_of', false),
  ('party_member', 'party_member', 'patron_of', false),
  ('party_member', 'party_member', 'creditor_of', false),
  ('party_member', 'party_member', 'blackmails', false),
  ('party_member', 'party_member', 'betrayed', false),
  ('party_member', 'party_member', 'sworn_to', false),
  ('npc', 'location', 'born_in', false),
  ('npc', 'location', 'rules', false),
  ('npc', 'location', 'works_at', false),
  ('npc', 'location', 'guards', false),
  ('npc', 'location', 'owns', false),
  ('npc', 'location', 'haunts', false),
  ('npc', 'location', 'hides_in', false),
  ('npc', 'location', 'buried_at', false),
  ('npc', 'location', 'exiled_from', false),
  ('npc', 'location', 'banned_from', false),
  ('npc', 'location', 'seeks', false),
  ('party_member', 'location', 'born_in', false),
  ('party_member', 'location', 'rules', false),
  ('party_member', 'location', 'works_at', false),
  ('party_member', 'location', 'guards', false),
  ('party_member', 'location', 'owns', false),
  ('party_member', 'location', 'haunts', false),
  ('party_member', 'location', 'hides_in', false),
  ('party_member', 'location', 'buried_at', false),
  ('party_member', 'location', 'exiled_from', false),
  ('party_member', 'location', 'banned_from', false),
  ('party_member', 'location', 'seeks', false),
  ('npc', 'deity', 'worships', false),
  ('npc', 'deity', 'serves', false),
  ('npc', 'deity', 'champion_of', false),
  ('npc', 'deity', 'chosen_of', false),
  ('npc', 'deity', 'blessed_by', false),
  ('npc', 'deity', 'cursed_by', false),
  ('npc', 'deity', 'defies', false),
  ('npc', 'deity', 'forsook', false),
  ('party_member', 'deity', 'worships', false),
  ('party_member', 'deity', 'serves', false),
  ('party_member', 'deity', 'champion_of', false),
  ('party_member', 'deity', 'chosen_of', false),
  ('party_member', 'deity', 'blessed_by', false),
  ('party_member', 'deity', 'cursed_by', false),
  ('party_member', 'deity', 'defies', false),
  ('party_member', 'deity', 'forsook', false),
  ('npc', 'item', 'seeks', false),
  ('npc', 'item', 'made', false),
  ('npc', 'item', 'guards', false),
  ('npc', 'item', 'stole', false),
  ('npc', 'item', 'lost', false),
  ('npc', 'item', 'owes', false),
  ('npc', 'item', 'bound_to', false),
  ('npc', 'item', 'cursed_by', false),
  ('party_member', 'item', 'seeks', false),
  ('party_member', 'item', 'made', false),
  ('party_member', 'item', 'guards', false),
  ('party_member', 'item', 'stole', false),
  ('party_member', 'item', 'lost', false),
  ('party_member', 'item', 'owes', false),
  ('party_member', 'item', 'bound_to', false),
  ('party_member', 'item', 'cursed_by', false),
  ('faction', 'faction', 'allied', false),
  ('faction', 'faction', 'friendly', false),
  ('faction', 'faction', 'neutral', false),
  ('faction', 'faction', 'suspicious', false),
  ('faction', 'faction', 'rival', false),
  ('faction', 'faction', 'hostile', false),
  ('faction', 'faction', 'secret_ally', false),
  ('faction', 'faction', 'secret_enemy', false),
  ('faction', 'location', 'controls', false),
  ('faction', 'location', 'based_in', false),
  ('faction', 'location', 'operates_in', false),
  ('faction', 'location', 'contests', false),
  ('faction', 'location', 'protects', false),
  ('faction', 'location', 'taxes', false),
  ('faction', 'location', 'raids', false),
  ('faction', 'location', 'founded', false),
  ('faction', 'location', 'banned_from', false),
  ('faction', 'deity', 'worships', false),
  ('faction', 'deity', 'serves', false),
  ('faction', 'deity', 'sponsored_by', false),
  ('faction', 'deity', 'opposes', false),
  ('faction', 'deity', 'suppresses', false),
  ('faction', 'item', 'holds', false),
  ('faction', 'item', 'seeks', false),
  ('faction', 'item', 'guards', false),
  ('faction', 'item', 'made', false),
  ('faction', 'item', 'lost', false),
  ('faction', 'item', 'forbids', false),
  ('location', 'location', 'allied_with', true),
  ('location', 'location', 'at_war_with', true),
  ('location', 'location', 'trades_with', true),
  ('location', 'location', 'rival_of', true),
  ('location', 'location', 'sister_town_of', true),
  ('location', 'location', 'liege_of', false),
  ('location', 'location', 'road_to', true),
  ('deity', 'deity', 'ally_of', true),
  ('deity', 'deity', 'rival_of', true),
  ('deity', 'deity', 'enemy_of', true),
  ('deity', 'deity', 'consort_of', true),
  ('deity', 'deity', 'parent_of', false),
  ('deity', 'deity', 'master_of', false),
  ('deity', 'deity', 'aspect_of', false),
  ('deity', 'deity', 'usurped', false),
  ('location', 'deity', 'sacred_to', false),
  ('location', 'deity', 'shrine_to', false),
  ('location', 'deity', 'blessed_by', false),
  ('location', 'deity', 'cursed_by', false),
  ('location', 'deity', 'forsaken_by', false),
  ('item', 'location', 'kept_at', false),
  ('item', 'location', 'hidden_at', false),
  ('item', 'location', 'lost_at', false),
  ('item', 'location', 'forged_at', false),
  ('item', 'deity', 'relic_of', false),
  ('item', 'deity', 'blessed_by', false),
  ('item', 'deity', 'cursed_by', false),
  ('canon', 'npc', 'about', false),
  ('canon', 'npc', 'known_to', false),
  ('canon', 'party_member', 'about', false),
  ('canon', 'party_member', 'known_to', false),
  ('canon', 'faction', 'about', false),
  ('canon', 'faction', 'known_to', false),
  ('canon', 'location', 'about', false),
  ('canon', 'location', 'took_place_at', false),
  ('canon', 'deity', 'about', false),
  ('canon', 'item', 'about', false),
  ('canon', 'canon', 'led_to', false),
  ('canon', 'canon', 'related_to', true),
  ('canon', 'canon', 'carries', false)
on conflict do nothing;
-- catalogue:end

-- ── 6. Questions answered in quests ─────────────────────────────────────────────
drop trigger canon_entry_quests_belong_to_an_entry on public.canon_entry_quests;
create trigger canon_entry_quests_belong_to_an_entry
  before insert or update of entry_id on public.canon_entry_quests
  for each row execute procedure private.canon_child_belongs_to('force,secret,truth,lore,backstory,question', 'entry_id');

-- ── 7. What the players wonder ──────────────────────────────────────────────────
create table public.canon_wonders (
  id uuid primary key default gen_random_uuid(),
  -- The player who wondered. A DM's own questions are canon entries, never wonders.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  party_member_id uuid references public.party_members (id) on delete set null,
  body text not null constraint canon_wonders_body_length check (char_length(btrim(body)) between 1 and 300),
  -- The DM's answer to it: taken up as an open question, or let be. Never both.
  adopted_entry_id uuid references public.canon_entries (id) on delete set null,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canon_wonders_adopted_or_dismissed check (adopted_entry_id is null or dismissed_at is null)
);
create index canon_wonders_campaign_idx on public.canon_wonders (campaign_id, created_at);
create index canon_wonders_user_idx on public.canon_wonders (user_id);
create index canon_wonders_member_idx on public.canon_wonders (party_member_id) where party_member_id is not null;
create index canon_wonders_adopted_idx on public.canon_wonders (adopted_entry_id) where adopted_entry_id is not null;

create trigger canon_wonders_updated_at
  before update on public.canon_wonders
  for each row execute procedure update_updated_at();

create trigger zz_same_campaign_refs
  before insert or update of party_member_id, adopted_entry_id, campaign_id on public.canon_wonders
  for each row execute procedure private.enforce_same_campaign_refs('party_member_id', 'party_members', 'owned', 'adopted_entry_id', 'canon_entries', 'owned');

-- A player writes their own words; the DM answers them (adopts or lets be) but never rewrites them, and a player
-- cannot answer their own. The author never changes.
create function private.canon_wonders_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id then
    raise exception using errcode = '42501', message = 'A wonder keeps its author and campaign';
  end if;
  if (select auth.uid()) = old.user_id and not private.is_campaign_dm(old.campaign_id) then
    if new.adopted_entry_id is distinct from old.adopted_entry_id or new.dismissed_at is distinct from old.dismissed_at then
      raise exception using errcode = '42501', message = 'Only the DM answers a wonder';
    end if;
  elsif new.body is distinct from old.body or new.party_member_id is distinct from old.party_member_id then
    raise exception using errcode = '42501', message = 'The DM answers a wonder but does not rewrite it';
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_wonders_guard() from public, anon, authenticated;
create trigger canon_wonders_guard before update on public.canon_wonders
  for each row execute procedure private.canon_wonders_guard();

alter table public.canon_wonders enable row level security;
create policy "canon_wonders_select" on public.canon_wonders for select
  using ((select auth.uid()) = user_id or private.is_campaign_dm(campaign_id));
create policy "canon_wonders_insert" on public.canon_wonders for insert
  with check ((select auth.uid()) = user_id and private.is_campaign_member(campaign_id));
create policy "canon_wonders_update" on public.canon_wonders for update
  using ((select auth.uid()) = user_id or private.is_campaign_dm(campaign_id))
  with check ((select auth.uid()) = user_id or private.is_campaign_dm(campaign_id));
create policy "canon_wonders_delete" on public.canon_wonders for delete
  using ((select auth.uid()) = user_id or private.is_campaign_dm(campaign_id));
grant select, insert, update, delete on public.canon_wonders to authenticated, service_role;

create trigger canon_wonders_signal_insert after insert on public.canon_wonders
  referencing new table as changed for each statement execute procedure signal_campaign_change();
create trigger canon_wonders_signal_update after update on public.canon_wonders
  referencing old table as left_rows new table as changed for each statement execute procedure signal_campaign_change();
create trigger canon_wonders_signal_delete after delete on public.canon_wonders
  referencing old table as changed for each statement execute procedure signal_campaign_change();

-- The demo template's players wonder nothing a new DM inherits.
insert into private.demo_campaign_tables (table_name, tier, copy, reason) values
  ('canon_wonders', 1, false, 'a player''s own questions, not part of the template');

-- ── 8. A player tells the party what their character knows (item 14) ───────────
-- A truth known to some reaches the players whose characters it is `known_to`. A player who knows it may tell the
-- rest of the party: the truth becomes `known_to` every character of the campaign. Nothing else changes, and the
-- links are the DM's (the canon's author), as if the DM had named them. A definer because a player cannot write the
-- DM's links; it refuses anyone whose own character does not already know the truth.
create function public.tell_party_canon_truth(p_entry_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.canon_entries%rowtype;
  v_member uuid;
  v_added integer;
begin
  select * into v_entry from public.canon_entries where id = p_entry_id;
  if v_entry.id is null or v_entry.part <> 'truth' or v_entry.knowledge is distinct from 'some' then
    raise exception using errcode = '42501', message = 'Not a truth you can tell';
  end if;
  select cm.party_member_id into v_member from public.campaign_members cm
   where cm.campaign_id = v_entry.campaign_id and cm.user_id = (select auth.uid()) and cm.party_member_id is not null
   limit 1;
  if v_member is null or not private.canon_entry_seen(p_entry_id, v_member) then
    raise exception using errcode = '42501', message = 'Not a truth you can tell';
  end if;
  insert into public.world_links (user_id, campaign_id, from_kind, from_canon_entry_id, to_kind, to_party_member_id, type)
  select v_entry.user_id, v_entry.campaign_id, 'canon', v_entry.id, 'party_member', pm.id, 'known_to'
    from public.party_members pm
   where pm.campaign_id = v_entry.campaign_id
     and not exists (select 1 from public.world_links l
                      where l.from_canon_entry_id = v_entry.id and l.type = 'known_to' and l.to_party_member_id = pm.id);
  get diagnostics v_added = row_count;
  return v_added;
end;
$$;
revoke execute on function public.tell_party_canon_truth(uuid) from public, anon;
grant execute on function public.tell_party_canon_truth(uuid) to authenticated, service_role;

-- ── 9. The player's canon says who else knows a truth (item 14) ────────────────
-- "Only you know" was said of every truth known to some, even one the whole faction knew. The read now returns the
-- other characters of the party who know it, by name, so the journal can say "You and Mira know".
drop function public.get_player_canon(uuid, uuid);
create function public.get_player_canon(p_campaign_id uuid, p_preview_member_id uuid default null)
returns table (
  id uuid, part text, premise_kind text, knowledge text, title text, body text, sort_order integer, image_url text,
  ai_provenance jsonb, created_at timestamptz, updated_at timestamptz, lore_kind text, world_year integer,
  world_month integer, world_day integer, party_member_id uuid, became_entry_id uuid, known_with text[]
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
         e.image_url, e.ai_provenance, e.created_at, e.updated_at, e.lore_kind, e.world_year, e.world_month, e.world_day,
         e.party_member_id,
         case when e.became_entry_id is not null
                and exists (select 1 from me where private.canon_entry_seen(e.became_entry_id, me.member))
              then e.became_entry_id end,
         case when e.part = 'truth' and e.knowledge = 'some' then
           coalesce((select array_agg(pm.name order by pm.name) from public.party_members pm
                      where pm.campaign_id = p_campaign_id
                        and not exists (select 1 from me where me.member = pm.id)
                        and private.canon_entry_seen(e.id, pm.id)), '{}')
         end
    from public.canon_entries e
   where e.campaign_id = p_campaign_id
     and exists (select 1 from me where private.canon_entry_seen(e.id, me.member))
   order by e.part, e.sort_order, e.created_at
$$;
revoke execute on function public.get_player_canon(uuid, uuid) from public, anon;
grant execute on function public.get_player_canon(uuid, uuid) to authenticated, service_role;

-- ── The registries a new column or table joins ─────────────────────────────────
-- Merging two sessions moves the reveal with the rest of the session's log.
CREATE OR REPLACE FUNCTION public.merge_campaign_sessions(p_keep uuid, p_absorb uuid)
 RETURNS campaign_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_keep   public.campaign_sessions;
  v_absorb public.campaign_sessions;
begin
  -- Authorize before locking anything: a caller who may not merge these rows
  -- must not be able to hold locks on them either, even for a moment.
  -- One message for missing and foreign alike: a caller learns nothing about
  -- sessions in a campaign they do not run.
  select * into v_keep from public.campaign_sessions where id = p_keep;
  select * into v_absorb from public.campaign_sessions where id = p_absorb;
  if auth.uid() is null
     or v_keep.id is null
     or v_absorb.id is null
     or v_keep.campaign_id <> v_absorb.campaign_id
     or not coalesce(private.is_campaign_dm(v_keep.campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  -- Both rows locked in one statement, in id order: two merges naming the same
  -- pair the other way round would otherwise each hold one row and wait on
  -- the other. Then read again, since a concurrent merge may have changed or
  -- removed either while this one waited.
  perform 1 from public.campaign_sessions where id in (p_keep, p_absorb) order by id for update;
  select * into v_keep from public.campaign_sessions where id = p_keep;
  select * into v_absorb from public.campaign_sessions where id = p_absorb;
  if v_keep.id is null or v_absorb.id is null then
    raise exception 'That session was merged or deleted in the meantime';
  end if;

  if v_keep.id = v_absorb.id then
    raise exception 'A session cannot be merged into itself';
  end if;
  if (v_keep.started_at is not null and v_keep.ended_at is null)
     or (v_absorb.started_at is not null and v_absorb.ended_at is null) then
    raise exception 'End the running session before merging it';
  end if;

  update public.notes                  set session_id = p_keep where session_id = p_absorb;
  update public.session_proposals      set session_id = p_keep where session_id = p_absorb;
  update public.encounter_state        set session_id = p_keep where session_id = p_absorb;
  update public.npc_reveals            set session_id = p_keep where session_id = p_absorb;
  update public.location_reveals       set session_id = p_keep where session_id = p_absorb;
  update public.handout_reveals        set session_id = p_keep where session_id = p_absorb;
  update public.discovered_monsters    set session_id = p_keep where session_id = p_absorb;
  update public.quest_beat_transitions set session_id = p_keep where session_id = p_absorb;
  update public.npc_memories           set session_id = p_keep where session_id = p_absorb;
  update public.party_member_memories  set session_id = p_keep where session_id = p_absorb;
  update public.character_caretakers   set session_id = p_keep where session_id = p_absorb;
  update public.agent_sessions         set campaign_session_id = p_keep where campaign_session_id = p_absorb;
  update public.story_facts            set session_id = p_keep where session_id = p_absorb;
  -- The canon (#1226): when a clue was found, a force's step reached or its clock ticked, a lore passage told.
  update public.canon_clues            set found_session_id = p_keep where found_session_id = p_absorb;
  update public.canon_force_steps      set reached_session_id = p_keep where reached_session_id = p_absorb;
  update public.canon_force_ticks      set session_id = p_keep where session_id = p_absorb;
  update public.canon_lore_passages    set told_session_id = p_keep where told_session_id = p_absorb;
  -- When a secret was revealed (#1258).
  update public.canon_entries          set revealed_session_id = p_keep where revealed_session_id = p_absorb;

  delete from public.campaign_sessions where id = p_absorb;

  update public.campaign_sessions
     set number     = coalesce(v_keep.number, v_absorb.number),
         title      = coalesce(nullif(btrim(v_keep.title), ''), nullif(btrim(v_absorb.title), '')),
         played_on  = coalesce(v_keep.played_on, v_absorb.played_on),
         started_at = case
                        when v_keep.started_at is null then v_absorb.started_at
                        when v_absorb.started_at is null then v_keep.started_at
                        else least(v_keep.started_at, v_absorb.started_at)
                      end,
         ended_at   = case
                        when v_keep.started_at is null then v_absorb.ended_at
                        when v_absorb.started_at is null then v_keep.ended_at
                        else greatest(v_keep.ended_at, v_absorb.ended_at)
                      end
   where id = p_keep
  returning * into v_keep;

  return v_keep;
end;
$function$;

-- The demo copy: an arc's theme and an entry's arc point at each other, so the theme goes in after the entries.
update private.demo_campaign_tables set defer_columns = array_append(coalesce(defer_columns, '{}'), 'theme_id')
 where table_name = 'canon_arcs';

-- "Canon here" on an item's sheet and a handout: the clues that lie in it (item 30). Invoker, as before.
CREATE OR REPLACE FUNCTION public.get_canon_here(p_kind text, p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'clues', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'title', c.title, 'secret_id', c.secret_id, 'secret_title', e.title,
               'found_at', c.found_at, 'found_session_id', c.found_session_id) order by e.title, c.sort_order)
        from public.canon_clues c
        join public.canon_entries e on e.id = c.secret_id
       where (p_kind = 'location' and c.location_id = p_id)
          or (p_kind = 'npc' and c.npc_id = p_id)
          or (p_kind = 'quest_beat' and c.quest_beat_id = p_id)
          or (p_kind = 'item' and c.item_id = p_id)
          or (p_kind = 'document' and c.document_id = p_id)), '[]'::jsonb),
    'passages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'title', p.title, 'entry_id', p.entry_id, 'entry_title', e.title) order by e.title, p.sort_order)
        from public.canon_lore_passages p
        join public.canon_entries e on e.id = p.entry_id
       where p.told_at is null
         -- Lore's first passage is told with the entry, so it is never offered here; another part (a backstory) has
         -- no free first passage. Written as part <> 'lore' so a later part is offered by default.
         and (e.part <> 'lore'
              or p.id <> (select f.id from public.canon_lore_passages f where f.entry_id = p.entry_id
                           order by f.sort_order, f.created_at limit 1))
         and ((p_kind = 'location' and p.location_id = p_id)
              or (p_kind = 'npc' and p.npc_id = p_id)
              or (p_kind = 'quest_beat' and p.quest_beat_id = p_id))), '[]'::jsonb))
$function$;

-- ── 10. What the party has found (item 23) ─────────────────────────────────────
-- A clue is the DM's until the party finds it; then it is something the party holds. Players read the clues their
-- party has found, with the place they lay, never the secret they point at or the clues still lying unfound. A
-- definer because clues are DM-only rows; it returns rows only to a member of the campaign (or the DM previewing).
create function public.get_player_found_clues(p_campaign_id uuid)
returns table (id uuid, title text, found_at timestamptz, found_session_id uuid, location_id uuid, npc_id uuid, item_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.title, c.found_at, c.found_session_id, c.location_id, c.npc_id, c.item_id
    from public.canon_clues c
   where c.campaign_id = p_campaign_id
     and c.found_at is not null
     and private.is_campaign_member(p_campaign_id)
   order by c.found_at desc
$$;
revoke execute on function public.get_player_found_clues(uuid) from public, anon;
grant execute on function public.get_player_found_clues(uuid) to authenticated, service_role;

-- ── 11. The canon AI helps promised in #1226 (#1255 item 7) ────────────────────
-- Suggest secrets (each with three clues placed where the campaign already has places, people and beats) and Read it
-- through (contradictions between entries; the loose ends are found in code and cost nothing). Each mode is priced and
-- prompted on its own row. Read it through reads the whole canon, so it costs more than a suggestion.
insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
select 'canon_secret_suggestion', 'Secret drafts', 1, (select coalesce(max(sort_order), 0) + 1 from public.ai_generation_credit_costs)
on conflict (generation_type) do nothing;
insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
select 'canon_read_through', 'Read the canon through', 2, (select coalesce(max(sort_order), 0) + 1 from public.ai_generation_credit_costs)
on conflict (generation_type) do nothing;

insert into public.ai_system_prompts (generator_type, label, content) values
  ('canon_secrets', 'Secret Drafts', $prompt$You help a Dungeon Master write the secrets of their campaign: what is true and hidden, which the party can uncover by play. Write up to five secrets. Each is one sentence of what is really so, and comes with three clues: things the party can find, hear or see, each of which hints at the secret from a different side and none of which states it. A clue may lie at ONE place, with ONE person or at ONE quest beat, chosen ONLY from those given, by its id copied exactly, or nowhere in particular.

Rules:
- Fit the premise, tone and truths given; never contradict a truth, and never repeat a secret the campaign already has.
- A secret should change how the party sees something they already know.
- Clues are concrete objects, words or sights, never a summary of the secret. Spread the three clues over different places, people or beats.
- Concrete and specific, in the campaign's voice. No em-dashes.
- If the DM gave a steer, follow it.$prompt$),
  ('canon_read_through', 'Read the Canon Through', $prompt$You read a Dungeon Master's campaign canon (its premise, truths, what is moving, secrets, open questions, lore and backstories) as a careful editor, and report where two entries contradict each other: they cannot both be so, as written. Name the entries by the ids given, copied exactly, and say in one sentence what the conflict is.

Rules:
- Report only real contradictions between entries. A secret that a truth hides is not a contradiction; a question nothing answers is not one; a missing clue, step or quest is not one (those are found separately).
- Name at least two entries for each contradiction.
- Report nothing rather than something doubtful. No em-dashes.$prompt$)
on conflict (generator_type) do nothing;
