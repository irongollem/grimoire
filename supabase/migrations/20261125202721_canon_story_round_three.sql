-- The third Canon review's story tools (#1279 wave 2). One migration for the data the client work stands on.
--
--   1. A secret's cover story (item 15): what people believe instead, until the reveal.
--   2. Tonight's plan (item 20): entries pinned for the next session, and one line of intent.
--   3. "Leave it" (item 21): a loose end the DM has decided is not one.
--   4. Cultures (item 22): a people may take its own name, a species may hold several, and a people lives in places.
--   5. Telling a truth (item 27): a truth told to the party carries a time and a session, as a revealed secret does.
--   6. Lines and veils a player asks for privately (item 29).
--   7. A DM's edit of a player's passage keeps what it replaced (item 30).
--   8. A backstory's places hang off the character (item 12).

-- ── 1. Cover stories ──────────────────────────────────────────────────────────
-- What the world wrongly believes in the secret's place ("the king died of fever"). It is fed to the world block as
-- common belief, and players read it, alone and unattributed, until the secret is revealed to them.
alter table public.canon_entries add column cover_story text;
alter table public.canon_entries add constraint canon_entries_cover_story_on_a_secret
  check (cover_story is null or part = 'secret');
alter table public.canon_entries add constraint canon_entries_cover_story_length
  check (cover_story is null or char_length(btrim(cover_story)) between 1 and 500);

-- What a player's character believes: the cover stories of the secrets not yet revealed to them. Only the belief
-- leaves the function, never the secret's title, id or words, so a player learns no more than that people say this.
create function public.get_player_common_beliefs(p_campaign_id uuid, p_preview_member_id uuid default null)
returns table (belief text)
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
  select e.cover_story
    from public.canon_entries e
    join me on true
   where e.campaign_id = p_campaign_id
     and e.part = 'secret'
     and e.cover_story is not null
     and e.closed_at is null
     and not private.canon_entry_seen(e.id, me.member)
   order by e.sort_order, e.created_at
$$;
revoke execute on function public.get_player_common_beliefs(uuid, uuid) from public, anon;
grant execute on function public.get_player_common_beliefs(uuid, uuid) to authenticated, service_role;

-- ── 2. Tonight's plan ─────────────────────────────────────────────────────────
-- What the DM means to bring to the next session: a pinned clue, passage, force step or thread (any canon entry), in
-- the DM's order. A pin is the DM's prep and nothing a player reads.
create table public.canon_tonight_pins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  clue_id uuid references public.canon_clues (id) on delete cascade,
  passage_id uuid references public.canon_lore_passages (id) on delete cascade,
  step_id uuid references public.canon_force_steps (id) on delete cascade,
  entry_id uuid references public.canon_entries (id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canon_tonight_pins_one_thing check (num_nonnulls(clue_id, passage_id, step_id, entry_id) = 1)
);
create unique index canon_tonight_pins_clue_once on public.canon_tonight_pins (clue_id) where clue_id is not null;
create unique index canon_tonight_pins_passage_once on public.canon_tonight_pins (passage_id) where passage_id is not null;
create unique index canon_tonight_pins_step_once on public.canon_tonight_pins (step_id) where step_id is not null;
create unique index canon_tonight_pins_entry_once on public.canon_tonight_pins (entry_id) where entry_id is not null;
create index canon_tonight_pins_campaign_idx on public.canon_tonight_pins (campaign_id, sort_order);
create index canon_tonight_pins_user_idx on public.canon_tonight_pins (user_id);
create trigger canon_tonight_pins_updated_at
  before update on public.canon_tonight_pins
  for each row execute procedure update_updated_at();
create trigger canon_tonight_pins_guard_content_author
  before update on public.canon_tonight_pins
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger zz_same_campaign_refs
  before insert or update of clue_id, passage_id, step_id, entry_id, campaign_id on public.canon_tonight_pins
  for each row execute procedure private.enforce_same_campaign_refs(
    'clue_id', 'canon_clues', 'owned',
    'passage_id', 'canon_lore_passages', 'owned',
    'step_id', 'canon_force_steps', 'owned',
    'entry_id', 'canon_entries', 'owned');

alter table public.canon_tonight_pins enable row level security;
create policy "canon_tonight_pins_select" on public.canon_tonight_pins for select
  using (private.is_campaign_dm(campaign_id));
create policy "canon_tonight_pins_insert" on public.canon_tonight_pins for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "canon_tonight_pins_update" on public.canon_tonight_pins for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "canon_tonight_pins_delete" on public.canon_tonight_pins for delete
  using (private.is_campaign_dm(campaign_id));
grant select, insert, update, delete on public.canon_tonight_pins to authenticated, service_role;

-- The one line of intent for the next session ("open on the burned mill; Mira learns about her mother"). One row per
-- campaign, the DM's alone. It is not a column on campaigns, whose row its players read.
create table public.canon_tonight_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  body text not null constraint canon_tonight_plans_body_length check (char_length(body) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canon_tonight_plans_one_per_campaign unique (campaign_id)
);
create index canon_tonight_plans_user_idx on public.canon_tonight_plans (user_id);
create trigger canon_tonight_plans_updated_at
  before update on public.canon_tonight_plans
  for each row execute procedure update_updated_at();
create trigger canon_tonight_plans_guard_content_author
  before update on public.canon_tonight_plans
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

alter table public.canon_tonight_plans enable row level security;
create policy "canon_tonight_plans_select" on public.canon_tonight_plans for select
  using (private.is_campaign_dm(campaign_id));
create policy "canon_tonight_plans_insert" on public.canon_tonight_plans for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "canon_tonight_plans_update" on public.canon_tonight_plans for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "canon_tonight_plans_delete" on public.canon_tonight_plans for delete
  using (private.is_campaign_dm(campaign_id));
grant select, insert, update, delete on public.canon_tonight_plans to authenticated, service_role;

-- ── 3. Leave it ───────────────────────────────────────────────────────────────
-- A loose end the DM has decided is not one: a world force that needs no quest, a backstory with no open thread.
-- Tonight and the paid read-through both read loose ends through one rule (canonLooseEnds.ts), and both skip these.
alter table public.canon_entries add column loose_end_left_at timestamptz;

-- ── 4. Cultures ───────────────────────────────────────────────────────────────
-- A people was a species or a creature, once per campaign, so two human nations could not both be listed. A people
-- now takes its own name over its record ("the Vell", humans), and a record may stand behind several peoples. Its
-- share is still rolled by the record's people, so the NPC generator still makes humans of either nation.
alter table public.campaign_peoples add column name text;
alter table public.campaign_peoples add constraint campaign_peoples_name_length
  check (name is null or char_length(btrim(name)) between 1 and 80);
drop index public.campaign_peoples_species_once;
drop index public.campaign_peoples_library_species_once;
drop index public.campaign_peoples_monster_once;
drop index public.campaign_peoples_library_monster_once;
-- Two peoples of one record are told apart by name: an unnamed second one would read as the first listed twice.
create unique index campaign_peoples_species_once on public.campaign_peoples (campaign_id, species_id, coalesce(lower(btrim(name)), ''))
  where species_id is not null;
create unique index campaign_peoples_library_species_once on public.campaign_peoples (campaign_id, library_species_id, coalesce(lower(btrim(name)), ''))
  where library_species_id is not null;
create unique index campaign_peoples_monster_once on public.campaign_peoples (campaign_id, monster_id, coalesce(lower(btrim(name)), ''))
  where monster_id is not null;
create unique index campaign_peoples_library_monster_once on public.campaign_peoples (campaign_id, library_monster_id, coalesce(lower(btrim(name)), ''))
  where library_monster_id is not null;

-- The view keeps its columns and adds two at its end: `name` is the people's own name where it has one, and
-- `record_name` is always the species or creature behind it. security_invoker is said again with the replace.
create or replace view public.campaign_peoples_named
with (security_invoker = true) as
select p.id, p.campaign_id, p.percent, p.sort_order,
       case when p.species_id is not null or p.library_species_id is not null then 'species' else 'creature' end as kind,
       coalesce(p.species_id::text, p.library_species_id, p.monster_id::text, p.library_monster_id) as record_id,
       p.species_id is null and p.monster_id is null as from_library,
       coalesce(nullif(btrim(p.name), ''), s.name, ls.name, m.name, lm.name) as name,
       p.body,
       coalesce(s.name, ls.name, m.name, lm.name) as record_name,
       nullif(btrim(p.name), '') as own_name
  from public.campaign_peoples p
  left join public.species s on s.id = p.species_id
  left join public.library_species ls on ls.id = p.library_species_id
  left join public.monsters m on m.id = p.monster_id
  left join public.library_monsters lm on lm.id = p.library_monster_id;

-- The Atlas places a people lives in. A place may hold several peoples (a port city), unlike a habitat.
create table public.campaign_people_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  people_id uuid not null references public.campaign_peoples (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_people_places_once unique (people_id, location_id)
);
create index campaign_people_places_location_idx on public.campaign_people_places (location_id);
create index campaign_people_places_campaign_idx on public.campaign_people_places (campaign_id);
create index campaign_people_places_user_idx on public.campaign_people_places (user_id);
create trigger campaign_people_places_updated_at
  before update on public.campaign_people_places
  for each row execute procedure update_updated_at();
create trigger campaign_people_places_guard_content_author
  before update on public.campaign_people_places
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();
create trigger zz_same_campaign_refs
  before insert or update of people_id, location_id, campaign_id on public.campaign_people_places
  for each row execute procedure private.enforce_same_campaign_refs(
    'people_id', 'campaign_peoples', 'owned',
    'location_id', 'locations', 'owned');

alter table public.campaign_people_places enable row level security;
create policy "campaign_people_places_select" on public.campaign_people_places for select
  using (private.is_campaign_dm(campaign_id));
create policy "campaign_people_places_insert" on public.campaign_people_places for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "campaign_people_places_update" on public.campaign_people_places for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "campaign_people_places_delete" on public.campaign_people_places for delete
  using (private.is_campaign_dm(campaign_id));
grant select, insert, update, delete on public.campaign_people_places to authenticated, service_role;

-- ── 5. Telling a truth ────────────────────────────────────────────────────────
-- A truth reached a player through a known_to tie with no moment, so it had no New dot and was absent from "Canon this
-- session". A truth the DM tells now carries revealed_at and the open session, as a revealed secret does.
alter table public.canon_entries drop constraint canon_entries_only_a_secret_is_revealed;
alter table public.canon_entries add constraint canon_entries_only_a_secret_or_truth_is_revealed
  check (revealed_at is null or part in ('secret', 'truth'));

-- The player's read gains when an entry reached them: a secret's reveal, a truth's telling, a told lore entry's first
-- telling. The return type changes, so the function is dropped and made again with its grants.
drop function public.get_player_canon(uuid, uuid);
create function public.get_player_canon(p_campaign_id uuid, p_preview_member_id uuid default null)
returns table (id uuid, part text, premise_kind text, knowledge text, title text, body text, sort_order integer,
               image_url text, ai_provenance jsonb, created_at timestamptz, updated_at timestamptz, lore_kind text,
               world_year integer, world_month integer, world_day integer, party_member_id uuid, became_entry_id uuid,
               known_with text[], revealed_at timestamptz)
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
         end,
         e.revealed_at
    from public.canon_entries e
   where e.campaign_id = p_campaign_id
     and exists (select 1 from me where private.canon_entry_seen(e.id, me.member))
   order by e.part, e.sort_order, e.created_at
$$;
revoke execute on function public.get_player_canon(uuid, uuid) from public, anon;
grant execute on function public.get_player_canon(uuid, uuid) to authenticated, service_role;

-- ── 6. Lines and veils, asked for privately ───────────────────────────────────
-- Safety tools work when a player can ask without being seen to ask. A request is the DM's row from the moment it is
-- written (user_id is the campaign's owner), so no read of it can name the asker; `asked_by` is set only when the
-- player chooses to sign it. Players write through ask_for_line_or_veil and never read the table.
create table public.canon_line_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  kind text not null constraint canon_line_requests_kind check (kind in ('line', 'veil')),
  body text not null constraint canon_line_requests_body_length check (char_length(btrim(body)) between 1 and 300),
  asked_by uuid references public.party_members (id) on delete set null,
  -- The DM's answer: added as a line or veil of the premise, or let be.
  adopted_entry_id uuid references public.canon_entries (id) on delete set null,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canon_line_requests_adopted_or_dismissed check (adopted_entry_id is null or dismissed_at is null)
);
create index canon_line_requests_campaign_idx on public.canon_line_requests (campaign_id, created_at);
create index canon_line_requests_user_idx on public.canon_line_requests (user_id);
create index canon_line_requests_asked_by_idx on public.canon_line_requests (asked_by) where asked_by is not null;
create index canon_line_requests_adopted_idx on public.canon_line_requests (adopted_entry_id) where adopted_entry_id is not null;
create trigger canon_line_requests_updated_at
  before update on public.canon_line_requests
  for each row execute procedure update_updated_at();
create trigger canon_line_requests_guard_content_author
  before update on public.canon_line_requests
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

-- The DM answers a request but never rewrites the player's words or who signed them.
create function private.canon_line_requests_keep_words()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.body is distinct from old.body or new.kind is distinct from old.kind or new.asked_by is distinct from old.asked_by then
    raise exception using errcode = '42501', message = 'A request keeps the player''s words';
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_line_requests_keep_words() from public, anon, authenticated;
create trigger canon_line_requests_keep_words before update on public.canon_line_requests
  for each row execute procedure private.canon_line_requests_keep_words();
create trigger zz_same_campaign_refs
  before insert or update of adopted_entry_id, asked_by, campaign_id on public.canon_line_requests
  for each row execute procedure private.enforce_same_campaign_refs(
    'adopted_entry_id', 'canon_entries', 'owned',
    'asked_by', 'party_members', 'owned');

alter table public.canon_line_requests enable row level security;
create policy "canon_line_requests_select" on public.canon_line_requests for select
  using (private.is_campaign_dm(campaign_id));
create policy "canon_line_requests_insert" on public.canon_line_requests for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "canon_line_requests_update" on public.canon_line_requests for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "canon_line_requests_delete" on public.canon_line_requests for delete
  using (private.is_campaign_dm(campaign_id));
grant select, insert, update, delete on public.canon_line_requests to authenticated, service_role;

-- A player with a character in the campaign asks. Signed, the request names their character; unsigned, nothing in the
-- row points back at them. The DM may not ask through it: a DM's own lines are premise entries.
create function public.ask_for_line_or_veil(p_campaign_id uuid, p_kind text, p_body text, p_signed boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_owner uuid;
  v_id uuid;
begin
  select cm.party_member_id into v_member from public.campaign_members cm
   where cm.campaign_id = p_campaign_id and cm.user_id = (select auth.uid()) and cm.party_member_id is not null
   limit 1;
  if v_member is null or private.is_campaign_dm(p_campaign_id) then
    raise exception using errcode = '42501', message = 'Only a player at this table can ask';
  end if;
  select c.user_id into v_owner from public.campaigns c where c.id = p_campaign_id;
  insert into public.canon_line_requests (user_id, campaign_id, kind, body, asked_by)
  values (v_owner, p_campaign_id, p_kind, btrim(p_body), case when coalesce(p_signed, false) then v_member end)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.ask_for_line_or_veil(uuid, text, text, boolean) from public, anon;
grant execute on function public.ask_for_line_or_veil(uuid, text, text, boolean) to authenticated, service_role;

-- ── 7. A DM's edit of a player's passage ──────────────────────────────────────
-- The DM may rewrite a player's backstory passage, and autosave overwrote it with no trace. Now the first DM edit
-- since the player last wrote keeps what the player had, and marks the passage, so the player sees "Edited by your
-- DM" and what it said. The player's own next edit takes the mark away: the words are theirs again.
alter table public.canon_lore_passages add column dm_edited_at timestamptz;
alter table public.canon_lore_passages add column body_before_dm_edit text;

create function private.canon_lore_passages_keep_player_words()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.author_id is null or (new.body is not distinct from old.body and new.title is not distinct from old.title) then
    return new;
  end if;
  if (select auth.uid()) = old.author_id then
    new.dm_edited_at := null;
    new.body_before_dm_edit := null;
  elsif (select auth.uid()) is not null and private.is_campaign_dm(old.campaign_id)
        and not exists (select 1 from public.campaigns c where c.id = old.campaign_id and c.user_id = old.author_id)
        and not exists (select 1 from public.campaign_members cm
                         where cm.campaign_id = old.campaign_id and cm.user_id = old.author_id and cm.role = 'dm') then
    if old.dm_edited_at is null then
      new.body_before_dm_edit := old.body;
    end if;
    new.dm_edited_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_lore_passages_keep_player_words() from public, anon, authenticated;
create trigger canon_lore_passages_keep_player_words before update on public.canon_lore_passages
  for each row execute procedure private.canon_lore_passages_keep_player_words();

-- ── 8. A backstory's places hang off the character ────────────────────────────
-- A hometown could be tied to the character or to the backstory, and neither page showed the other's tie. The
-- character is now the one subject: the backstory pane edits the character's own Connections. Ties a backstory
-- entry held to anything but the canon move to its character, unless the character already holds the same tie.
insert into public.world_links (user_id, campaign_id, from_kind, from_party_member_id, to_kind, to_npc_id,
                                to_party_member_id, to_faction_id, to_location_id, to_deity_id, to_item_id, type, note,
                                told, player_visible_to, ai_provenance)
select l.user_id, l.campaign_id, 'party_member', e.party_member_id, l.to_kind, l.to_npc_id, l.to_party_member_id,
       l.to_faction_id, l.to_location_id, l.to_deity_id, l.to_item_id, l.type, l.note, l.told, l.player_visible_to,
       l.ai_provenance
  from public.world_links l
  join public.canon_entries e on e.id = l.from_canon_entry_id and e.part = 'backstory'
 where l.to_kind not in ('canon', 'party_member')
   and not exists (select 1 from public.world_links c
                    where c.from_party_member_id = e.party_member_id and c.type = l.type and c.to_kind = l.to_kind
                      and c.to_id = l.to_id);
delete from public.world_links l
 using public.canon_entries e
 where e.id = l.from_canon_entry_id and e.part = 'backstory' and l.to_kind not in ('canon', 'party_member');

-- ── Live sync and the demo template ───────────────────────────────────────────
create trigger canon_tonight_pins_signal_insert after insert on public.canon_tonight_pins
  referencing new table as changed for each statement execute procedure signal_campaign_change();
create trigger canon_tonight_pins_signal_update after update on public.canon_tonight_pins
  referencing old table as left_rows new table as changed for each statement execute procedure signal_campaign_change();
create trigger canon_tonight_pins_signal_delete after delete on public.canon_tonight_pins
  referencing old table as changed for each statement execute procedure signal_campaign_change();
create trigger canon_tonight_plans_signal_insert after insert on public.canon_tonight_plans
  referencing new table as changed for each statement execute procedure signal_campaign_change();
create trigger canon_tonight_plans_signal_update after update on public.canon_tonight_plans
  referencing old table as left_rows new table as changed for each statement execute procedure signal_campaign_change();
create trigger canon_tonight_plans_signal_delete after delete on public.canon_tonight_plans
  referencing old table as changed for each statement execute procedure signal_campaign_change();
create trigger campaign_people_places_signal_insert after insert on public.campaign_people_places
  referencing new table as changed for each statement execute procedure signal_campaign_change();
create trigger campaign_people_places_signal_update after update on public.campaign_people_places
  referencing old table as left_rows new table as changed for each statement execute procedure signal_campaign_change();
create trigger campaign_people_places_signal_delete after delete on public.campaign_people_places
  referencing old table as changed for each statement execute procedure signal_campaign_change();
create trigger canon_line_requests_signal_insert after insert on public.canon_line_requests
  referencing new table as changed for each statement execute procedure signal_campaign_change();
create trigger canon_line_requests_signal_update after update on public.canon_line_requests
  referencing old table as left_rows new table as changed for each statement execute procedure signal_campaign_change();
create trigger canon_line_requests_signal_delete after delete on public.canon_line_requests
  referencing old table as changed for each statement execute procedure signal_campaign_change();

insert into private.demo_campaign_tables (table_name, tier, copy, reason) values
  ('canon_tonight_pins', 1, false, 'the DM''s prep for their own next session, not part of the template'),
  ('canon_tonight_plans', 1, false, 'the DM''s plan for their own next session, not part of the template'),
  ('campaign_people_places', 1, true, null),
  ('canon_line_requests', 1, false, 'a player''s private safety request, never copied to another table');
