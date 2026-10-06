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
