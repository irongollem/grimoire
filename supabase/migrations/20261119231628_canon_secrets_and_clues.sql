-- Secrets with clues, and open questions (#1226 story 3, frame 05).
--
-- A secret is an answer the DM holds (`canon_entries.part = 'secret'`, its statement the title). Its clues are placed
-- where the party can find them: at a place, on a person, or at a quest beat. The DM ticks a clue found at the table;
-- the secret then reads "partly known" to the DM, and only the DM reveals it (`revealed_at`), so players never learn a
-- secret by accident. Players never read a clue as an entry: what a clue says reaches them through play. An open
-- question is a plain entry (`part = 'question'`) that nobody may settle by invention; players never read one.

-- ── 1. A secret is revealed by the DM ─────────────────────────────────────────
alter table public.canon_entries
  add column revealed_at timestamptz,
  add constraint canon_entries_only_a_secret_is_revealed check (revealed_at is null or part = 'secret');

-- ── 2. canon_clues ────────────────────────────────────────────────────────────
create table public.canon_clues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  secret_id uuid not null references public.canon_entries (id) on delete cascade,
  -- What the party can find, in a line ("a locket in the dust, stamped with the guild's sheaf").
  title text not null default '',
  sort_order integer not null default 0,
  -- Where it lies: one place, one person or one beat, or nowhere yet (a clue the DM has not placed).
  location_id uuid references public.locations (id) on delete set null,
  npc_id uuid references public.npcs (id) on delete set null,
  quest_beat_id uuid references public.quest_beats (id) on delete set null,
  found_at timestamptz,
  found_session_id uuid references public.campaign_sessions (id) on delete set null,
  ai_provenance jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canon_clues_one_place check (num_nonnulls(location_id, npc_id, quest_beat_id) <= 1),
  constraint canon_clues_session_when_found check (found_session_id is null or found_at is not null)
);

create index canon_clues_secret_idx on public.canon_clues (secret_id, sort_order);
create index canon_clues_campaign_idx on public.canon_clues (campaign_id);
create index canon_clues_user_idx on public.canon_clues (user_id);
create index canon_clues_location_idx on public.canon_clues (location_id) where location_id is not null;
create index canon_clues_npc_idx on public.canon_clues (npc_id) where npc_id is not null;
create index canon_clues_beat_idx on public.canon_clues (quest_beat_id) where quest_beat_id is not null;
create index canon_clues_session_idx on public.canon_clues (found_session_id) where found_session_id is not null;

create trigger canon_clues_updated_at
  before update on public.canon_clues
  for each row execute procedure update_updated_at();

create trigger canon_clues_guard_content_author
  before update on public.canon_clues
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

-- A clue belongs to a secret: never to a truth, a force or a piece of lore.
create function private.canon_clues_belong_to_a_secret()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.canon_entries e where e.id = new.secret_id and e.part = 'secret') then
    raise exception using errcode = '23514', message = 'A clue belongs to a secret';
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_clues_belong_to_a_secret() from public, anon, authenticated;

create trigger canon_clues_belong_to_a_secret
  before insert or update of secret_id on public.canon_clues
  for each row execute procedure private.canon_clues_belong_to_a_secret();

create trigger zz_same_campaign_refs
  before insert or update of secret_id, location_id, npc_id, quest_beat_id, found_session_id, campaign_id
  on public.canon_clues
  for each row execute procedure private.enforce_same_campaign_refs(
    'secret_id', 'canon_entries', 'owned',
    'location_id', 'locations', 'owned',
    'npc_id', 'npcs', 'owned',
    'quest_beat_id', 'quest_beats', 'unowned',
    'found_session_id', 'campaign_sessions', 'owned');

alter table public.canon_clues enable row level security;
create policy "canon_clues_select" on public.canon_clues for select using (private.is_campaign_dm(campaign_id));
create policy "canon_clues_insert" on public.canon_clues for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "canon_clues_update" on public.canon_clues for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "canon_clues_delete" on public.canon_clues for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.canon_clues to authenticated, service_role;

create trigger canon_clues_signal_insert after insert on public.canon_clues
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_clues_signal_update after update on public.canon_clues
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_clues_signal_delete after delete on public.canon_clues
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

insert into private.demo_campaign_tables (table_name, tier, copy, reason) values ('canon_clues', 1, true, null);

-- An AI-placed clue is marked edited when its words change, as an entry is.
create function private.canon_clues_mark_edited()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.ai_provenance is not null
     and new.ai_provenance is not distinct from old.ai_provenance
     and coalesce((old.ai_provenance ->> 'edited')::boolean, false) = false
     and new.title is distinct from old.title then
    new.ai_provenance := jsonb_set(old.ai_provenance, '{edited}', 'true'::jsonb);
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_clues_mark_edited() from public, anon, authenticated;

create trigger canon_clues_mark_edited
  before update on public.canon_clues
  for each row execute procedure private.canon_clues_mark_edited();

-- ── 3. Who among the party may read an entry, now with secrets ────────────────
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
      -- A secret reaches the party only once the DM has revealed it, and then only the members it was revealed to.
      when 'secret' then e.revealed_at is not null and p_member = any (e.player_visible_to)
      else false
    end
      from public.canon_entries e
     where e.id = p_entry_id and p_member is not null), false)
$$;

-- ── 4. Clues change hands with their campaign ─────────────────────────────────
-- Restated whole from 20261119214935 with the one line added.
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

-- ── 5. AI help: place clues, keep questions open ──────────────────────────────
insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
select v.generation_type, v.label, v.credit_cost, (select coalesce(max(sort_order), 0) from public.ai_generation_credit_costs) + v.n
  from (values ('canon_clue_suggestion', 'Clue suggestions', 1, 1),
               ('canon_question_suggestion', 'Open question suggestions', 1, 2)) as v(generation_type, label, credit_cost, n)
on conflict (generation_type) do nothing;

insert into public.ai_system_prompts (generator_type, label, content) values
  ('canon_clues', 'Clue Suggestions', $prompt$You help a Dungeon Master place clues to one secret of their campaign, so the party can find the truth in play. A secret wants three clues, so the party can miss two and still find it. Propose up to three new clues, each one line, each placed at ONE place, ONE person or ONE quest beat chosen ONLY from those given, copied exactly.

Rules:
- A clue hints; it never states the secret outright.
- Each clue is something the party can see, hear, find or be told there: concrete, specific, playable at the table.
- Spread the clues: different kinds of place, person and beat; never two at the same spot, and never where a clue already lies.
- Fit the premise, tone and truths given; never contradict a truth.
- Plain, concrete words. No em-dashes.
- If the DM gave a steer, let it shape the clues.$prompt$),
  ('canon_questions', 'Open Question Suggestions', $prompt$You help a Dungeon Master name the questions their campaign keeps open on purpose: mysteries nobody at the table, and no AI, may settle by invention. Propose up to six, each one line, phrased as a question.

Rules:
- A good open question is one the campaign's truths, secrets and premise raise but do not answer.
- Never answer it, and never propose a question a truth or secret already answers.
- Never repeat a question the campaign already keeps.
- Plain, concrete words. No em-dashes.
- If the DM gave a steer, let it shape the questions.$prompt$)
on conflict (generator_type) do nothing;
