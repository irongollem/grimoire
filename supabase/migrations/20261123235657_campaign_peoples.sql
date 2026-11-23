-- The peoples of the world (#1255 item 30; maintainer, 23 Nov 2026).
--
-- Generated NPCs came out mostly human: the generator's species list was fifteen hard-coded names, and a species left
-- blank was the model's to choose, which chooses humans. Nothing in the canon said who lives in the world.
--
-- `campaign_peoples` says it as percentages ("a world where elves are 80% of the populace generates elf NPCs 80% of
-- the time"). Each row is a people and its share. A people is never typed: it is a record the campaign already has,
-- one of four kinds, so a goblin country can be as much a people as an elven one:
--
--   species_id          a species the DM wrote            (uuid, a real foreign key)
--   library_species_id  a species from a shared book      (text id, checked on write and in content_integrity.sql)
--   monster_id          a creature the DM wrote           (uuid, a real foreign key)
--   library_monster_id  a creature from a shared book     (text id, checked the same way)
--
-- Exactly one of the four is set. The shares of a campaign never pass a hundred; what they leave over is "anyone
-- else". The roll is made in code and handed to the generator as a constraint, never left to the model, which cannot
-- sample. A campaign with no rows has not said, and every generator behaves as it did before.
--
-- The campaign's DMs read and write it, as they do every other part of "How the world works". Nothing else needs it:
-- the generators run for a DM, and the world block is built on the server.

create table public.campaign_peoples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  species_id uuid references public.species (id) on delete cascade,
  library_species_id text,
  monster_id uuid references public.monsters (id) on delete cascade,
  library_monster_id text,
  percent numeric(5, 2) not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_peoples_one_people check (num_nonnulls(species_id, library_species_id, monster_id, library_monster_id) = 1),
  constraint campaign_peoples_percent check (percent >= 0 and percent <= 100)
);

-- One people, one share: listed twice, a people would be rolled at the sum of two numbers the DM never saw added.
create unique index campaign_peoples_species_once on public.campaign_peoples (campaign_id, species_id) where species_id is not null;
create unique index campaign_peoples_library_species_once on public.campaign_peoples (campaign_id, library_species_id) where library_species_id is not null;
create unique index campaign_peoples_monster_once on public.campaign_peoples (campaign_id, monster_id) where monster_id is not null;
create unique index campaign_peoples_library_monster_once on public.campaign_peoples (campaign_id, library_monster_id) where library_monster_id is not null;
create index campaign_peoples_campaign_idx on public.campaign_peoples (campaign_id, sort_order);
create index campaign_peoples_user_idx on public.campaign_peoples (user_id);
create index campaign_peoples_species_idx on public.campaign_peoples (species_id) where species_id is not null;
create index campaign_peoples_monster_idx on public.campaign_peoples (monster_id) where monster_id is not null;

create trigger campaign_peoples_updated_at
  before update on public.campaign_peoples
  for each row execute procedure update_updated_at();

create trigger campaign_peoples_guard_content_author
  before update on public.campaign_peoples
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

-- A species or creature the DM wrote belongs to this campaign or to the DM's own shelf, never to another campaign.
create trigger zz_same_campaign_refs
  before insert or update of species_id, monster_id, campaign_id
  on public.campaign_peoples
  for each row execute procedure private.enforce_same_campaign_refs(
    'species_id', 'species', 'owned',
    'monster_id', 'monsters', 'owned');

-- A shared book's id is text and cannot be a foreign key (a book's rows are re-keyed in place when its edition
-- changes), so a write that names one is checked here, and production is checked by content_integrity.sql.
create function private.campaign_peoples_library_ids_exist()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.library_species_id is not null
     and not exists (select 1 from public.library_species s where s.id = new.library_species_id) then
    raise exception using errcode = '23503', message = 'campaign_peoples.library_species_id names no species in the library';
  end if;
  if new.library_monster_id is not null
     and not exists (select 1 from public.library_monsters m where m.id = new.library_monster_id) then
    raise exception using errcode = '23503', message = 'campaign_peoples.library_monster_id names no creature in the library';
  end if;
  return new;
end;
$$;
revoke execute on function private.campaign_peoples_library_ids_exist() from public, anon, authenticated;

create trigger campaign_peoples_library_ids_exist
  before insert or update of library_species_id, library_monster_id
  on public.campaign_peoples
  for each row execute procedure private.campaign_peoples_library_ids_exist();

-- The shares of one campaign never pass a hundred. Checked at commit, once per transaction, so the screen may save a
-- whole list (some shares up, some down) in any order without tripping over a moment in between.
create function private.campaign_peoples_within_hundred()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_total numeric;
begin
  -- One checker per campaign at a time: two DMs committing at the same moment each see the other's rows as not yet
  -- there, and would both pass. The lock is released with the transaction.
  perform pg_advisory_xact_lock(hashtextextended('campaign_peoples:' || new.campaign_id::text, 0));
  select coalesce(sum(p.percent), 0) into v_total from public.campaign_peoples p where p.campaign_id = new.campaign_id;
  if v_total > 100 then
    raise exception using errcode = '23514',
      message = format('The peoples of a campaign add up to %s%%: they cannot pass 100%%', trim_scale(v_total));
  end if;
  return null;
end;
$$;
revoke execute on function private.campaign_peoples_within_hundred() from public, anon, authenticated;

create constraint trigger campaign_peoples_within_hundred
  after insert or update of percent, campaign_id on public.campaign_peoples
  deferrable initially deferred
  for each row execute procedure private.campaign_peoples_within_hundred();

alter table public.campaign_peoples enable row level security;

create policy "campaign_peoples_select" on public.campaign_peoples for select
  using (private.is_campaign_dm(campaign_id));
create policy "campaign_peoples_insert" on public.campaign_peoples for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "campaign_peoples_update" on public.campaign_peoples for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "campaign_peoples_delete" on public.campaign_peoples for delete
  using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.campaign_peoples to authenticated, service_role;

-- Live: another DM's change reaches the page through the campaign doorbell.
create trigger campaign_peoples_signal_insert after insert on public.campaign_peoples
  referencing new table as changed for each statement execute procedure signal_campaign_change();
create trigger campaign_peoples_signal_update after update on public.campaign_peoples
  referencing old table as left_rows new table as changed for each statement execute procedure signal_campaign_change();
create trigger campaign_peoples_signal_delete after delete on public.campaign_peoples
  referencing old table as changed for each statement execute procedure signal_campaign_change();

-- The peoples by name, for the screen, the roll and the world block: one read instead of four. An invoker view, so a
-- reader sees only the rows the table's own policy gives them. A name may be null: a species one DM wrote on their own
-- shelf is not readable by a co-DM, but its share still counts toward the hundred, so the row is kept and the screen
-- says it is another DM's rather than showing a total that does not add up.
create view public.campaign_peoples_named
with (security_invoker = true) as
select p.id, p.campaign_id, p.percent, p.sort_order,
       case when p.species_id is not null or p.library_species_id is not null then 'species' else 'creature' end as kind,
       coalesce(p.species_id::text, p.library_species_id, p.monster_id::text, p.library_monster_id) as record_id,
       p.species_id is null and p.monster_id is null as from_library,
       coalesce(s.name, ls.name, m.name, lm.name) as name
  from public.campaign_peoples p
  left join public.species s on s.id = p.species_id
  left join public.library_species ls on ls.id = p.library_species_id
  left join public.monsters m on m.id = p.monster_id
  left join public.library_monsters lm on lm.id = p.library_monster_id;

grant select on public.campaign_peoples_named to authenticated, service_role;

-- The demo campaign copies its peoples with everything else that describes its world.
insert into private.demo_campaign_tables (table_name, tier, copy, reason) values ('campaign_peoples', 1, true, null);

comment on table public.campaign_peoples is
  'Who lives in the world, as percentages: each row links a species or a bestiary creature to its share. Rolled in code when a generator invents a person (#1255).';
