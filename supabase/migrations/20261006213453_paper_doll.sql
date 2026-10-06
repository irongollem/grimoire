-- #975: the paper doll.
--
-- A doll is three sprite sheets (garb, armour, burden; three 512x1024 cells
-- each) plus the layout that keeps every outfit cell in one frame. The shape is `DollSheets` in
-- supabase/functions/_shared/paperDoll/types.ts; this column only holds it.
--
-- One jsonb value rather than a column per sheet: the three sheets and their
-- layout are one generation and are only valid together. A re-roll replaces
-- the whole value at once, so a reader can never see a garb sheet from one set
-- beside a layout measured on another.
--
-- party_members.doll is written by generate-character-doll (service role).
-- library_species.doll is canonical library art, written by
-- scripts/generate-dolls.ts (`npm run doll:species`), the same code path the
-- character generator runs. copy_party_member copies the whole row, so a copied character keeps
-- its doll.

alter table public.party_members
  add column doll jsonb,
  add constraint party_members_doll_is_object
    check (doll is null or jsonb_typeof(doll) = 'object');

-- A player without credits asks their DM for a doll by setting this; the DM
-- grants it (paying from their own credits) or declines by clearing it, and a
-- finished doll clears it. One column rather than a request table: there is
-- at most one open ask per character and nothing to keep once it is answered,
-- and party_members_player_update already lets exactly those two people write
-- the row (the owner and the campaign's DM). The DM learns of it through the
-- party live sync the row already travels on.
alter table public.party_members
  add column doll_requested_at timestamptz;

comment on column public.party_members.doll_requested_at is
  'When the player asked their DM for a paper doll (#975); null when there is no open ask.';

comment on column public.party_members.doll is
  'Paper doll sprite sheets + layout (#975), DollSheets in _shared/paperDoll/types.ts. Null: the doll falls back to the species, then the size template.';

alter table public.library_species
  add column doll jsonb,
  add constraint library_species_doll_is_object
    check (doll is null or jsonb_typeof(doll) = 'object');

comment on column public.library_species.doll is
  'Canonical paper doll for this species (#975), DollSheets in _shared/paperDoll/types.ts.';

-- One price for the whole set: three renders (garb, armour, burden).
-- High quality because that is what the fidelity spike proved placement and
-- likeness on; the admin pricing tab can still lower it.
insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order, image_quality_tier)
values ('character_doll', 'Paper doll (AI)', 100, 46, 'high')
on conflict (generation_type) do nothing;

-- Only the generator writes a doll. The row's update policy lets the owner and
-- the DM write it (they must, for doll_requested_at), and without this guard a
-- client could store any jsonb as its doll: point the doll and token at
-- arbitrary images, or steer the generator's clean-up of the previous set at a
-- folder that is not that set (it deletes the folder the stored doll names).
-- The service role (generate-character-doll) and SECURITY DEFINER functions
-- (copy_party_member) run as other roles and pass straight through.
create or replace function public.guard_party_member_doll()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.doll is not null then
      raise exception 'A paper doll is drawn by its generator, not written by a client' using errcode = '42501';
    end if;
    return new;
  end if;
  raise exception 'A paper doll is drawn by its generator, not written by a client' using errcode = '42501';
end;
$$;

revoke execute on function public.guard_party_member_doll() from public, anon, authenticated;

create trigger party_members_guard_doll_insert
  before insert on public.party_members
  for each row execute procedure public.guard_party_member_doll();

create trigger party_members_guard_doll_update
  before update of doll on public.party_members
  for each row when (new.doll is distinct from old.doll)
  execute procedure public.guard_party_member_doll();

-- One doll in the making per character. generate-character-doll checks for a
-- pending job before it reserves credits, but two requests at once (two tabs,
-- two devices) can both pass that check; this makes the second job's insert
-- fail, so it releases its reservation and answers doll_in_progress instead of
-- charging twice and orphaning one of the sets. fail-stale-image-jobs flips a
-- job stuck pending past ten minutes to failed, which frees the slot.
create unique index image_generation_jobs_one_pending_doll
  on public.image_generation_jobs (target_id)
  where kind = 'character_doll' and status = 'pending';
