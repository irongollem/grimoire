-- Migration: crafting_inventions
-- AI invention on the experiment bench (#1103 story 5): a player asks what the
-- materials on the bench could make, or describes something they want to build,
-- and an AI drafts the item, its rules, its value and a recipe for it. The DM
-- approves every draft before anything exists in the campaign.
--
-- The design (the maintainer's, 25 Oct 2026; the epic body holds it in full):
--   * Two ways in, one rule. Materials first: the ingredients are exactly what is
--     on the bench. Idea first: the AI names the ingredients, real items (or, at
--     most a couple, new materials the DM must accept along with the draft) rare
--     and costly enough to pay for the result. Either way the result is no rarer
--     than its rarest ingredient (common as the floor), worth at most a multiple of
--     its ingredients (the `value_multiple` of the optional rule
--     `crafting_ai_invention`, default 2), in the discipline's lane, and its
--     declared mechanics fit its rarity's budget. Those checks are the edge
--     function's (supabase/functions/_shared/invention/), deterministic, and run
--     before a draft is ever written here: only the service role writes `draft`.
--   * The DM always approves outside solo mode ("to prevent the world from
--     sliding away from them"). There is no automatic path, so nothing here
--     materialises without a DM's call to decide_crafting_invention.
--   * It is a collaboration: a draft can be revised with a note (each revision a
--     paid generation), sent to the DM, and sent back by the DM with a note the
--     next revision reads.
--
-- Status: draft (the player's, still being revised) -> pending (with the DM)
-- -> approved (the recipe, and any new item and materials, exist and are shared
-- with the character). Sent back = pending -> draft with a dm_note. Discarded =
-- deleted, by the asker or by the DM.
--
-- Why clients cannot write the table: `draft` is what the validator passed. A
-- player able to update it could put a +3 sword in front of the DM labelled as
-- checked. So rows are inserted and revised by the edge function (service role),
-- and moved between statuses only by the two RPCs below. Delete is the one
-- client write, through RLS.

-- ── The table ───────────────────────────────────────────────────────────────

create table public.crafting_inventions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  party_member_id uuid not null references public.party_members (id) on delete cascade,
  -- The player who asked (and paid). RLS reads by it.
  user_id uuid not null references auth.users (id) on delete cascade,
  discipline text not null check (discipline in ('alchemy','smithing','leathercraft','woodcraft','jewelcrafting','herbalism','poisoncraft','tinkering','cooking','scribing','forgery','brewing','weaving','masonry','painting')),
  mode text not null check (mode in ('materials', 'idea')),
  -- What the player asked for, in idea mode. Materials mode has none.
  wish text check (wish is null or char_length(wish) <= 1000),
  -- The bench as laid out (materials mode), one entry per distinct row:
  -- {row_id, dishes, item_id | library_item_id, name, rarity, item_type, cost}.
  bench jsonb not null default '[]'::jsonb,
  -- The validated draft. Shape: src/types/crafting.types.ts (InventionDraft), the
  -- validator's output (supabase/functions/_shared/invention/validate.ts).
  draft jsonb not null,
  revision integer not null default 1 check (revision >= 1),
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved')),
  dm_note text check (dm_note is null or char_length(dm_note) <= 1000),
  recipe_id uuid references public.crafting_recipes (id) on delete set null,
  ai_provenance jsonb not null,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crafting_inventions_idea_has_wish check (mode <> 'idea' or (wish is not null and btrim(wish) <> '')),
  constraint crafting_inventions_approved_has_recipe check (status <> 'approved' or decided_at is not null)
);

comment on table public.crafting_inventions is
  'AI-drafted inventions from the experiment bench (#1103): a player''s draft, revised with notes, sent to the DM, approved into a recipe. Written by the invent-recipe edge function and the submit/decide RPCs only.';

create index crafting_inventions_campaign_status_idx on public.crafting_inventions (campaign_id, status);
create index crafting_inventions_party_member_idx on public.crafting_inventions (party_member_id);
create index crafting_inventions_user_idx on public.crafting_inventions (user_id);
create index crafting_inventions_recipe_idx on public.crafting_inventions (recipe_id) where recipe_id is not null;
create index crafting_inventions_decided_by_idx on public.crafting_inventions (decided_by);

create trigger crafting_inventions_updated_at
  before update on public.crafting_inventions
  for each row execute procedure update_updated_at();

-- A campaign-scoped foreign key stays inside the campaign (#892).
create trigger zz_same_campaign_refs
  before insert or update of party_member_id, recipe_id, campaign_id on public.crafting_inventions
  for each row execute procedure private.enforce_same_campaign_refs(
    'party_member_id', 'party_members', 'owned',
    'recipe_id', 'crafting_recipes', 'owned');

-- The asker must play the character, in this campaign. zz_same_campaign_refs skips the
-- service-role path (auth.uid() is null there), which is the path every insert takes, so this
-- check does not: materialisation shares the recipe with `party_member_id`, and a mismatched
-- pair would plant another campaign's character in a recipe's audience (audit, 25 Oct 2026).
create function private.guard_invention_seat()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if not exists (
    select 1 from public.campaign_members cm
     where cm.user_id = new.user_id
       and cm.campaign_id = new.campaign_id
       and cm.party_member_id = new.party_member_id
  ) then
    raise exception 'Invention does not match the asker''s seat' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_invention_seat() from public, anon, authenticated;

create trigger crafting_inventions_seat
  before insert or update of user_id, campaign_id, party_member_id on public.crafting_inventions
  for each row execute procedure private.guard_invention_seat();

-- A draft is frozen once it leaves the player. decide_crafting_invention approves whatever
-- `draft` holds, so a revision landing while the DM reads it would have the DM approve what
-- they never saw (audit, 25 Oct 2026). Sent back to `draft`, it can be revised again.
create function private.guard_invention_draft_frozen()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if old.status <> 'draft' and (new.draft is distinct from old.draft
      or new.bench is distinct from old.bench
      or new.revision is distinct from old.revision) then
    raise exception 'A draft sent to the DM cannot be revised' using errcode = 'CX003';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_invention_draft_frozen() from public, anon, authenticated;

create trigger crafting_inventions_freeze_draft
  before update of draft, bench, revision on public.crafting_inventions
  for each row execute procedure private.guard_invention_draft_frozen();

-- Live: the DM's queue and the player's notebook both hear a change. Doorbell,
-- like crafting_recipes: a player may read only their own rows.
create trigger crafting_inventions_signal_insert
  after insert on public.crafting_inventions
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger crafting_inventions_signal_update
  after update on public.crafting_inventions
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger crafting_inventions_signal_delete
  after delete on public.crafting_inventions
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

alter table public.crafting_inventions enable row level security;

-- The asker reads their own; the DM reads the campaign's.
create policy "crafting_inventions_select" on public.crafting_inventions for select
  using ((select auth.uid()) = user_id or private.is_campaign_dm(campaign_id));

-- The asker may throw away a draft, withdraw one from the DM, or clear an
-- approved one from their notebook (the recipe it made stays). The DM may
-- discard anything.
create policy "crafting_inventions_delete" on public.crafting_inventions for delete
  using ((select auth.uid()) = user_id or private.is_campaign_dm(campaign_id));

-- No insert or update policy, on purpose: see the header.

grant select, delete on public.crafting_inventions to authenticated;
grant select, insert, update, delete on public.crafting_inventions to service_role;

-- Play state: a demo starts with nothing invented.
insert into private.demo_campaign_tables (table_name, tier, copy, reason)
values ('crafting_inventions', 1, false, 'play state: a player''s AI drafts; a demo starts with nothing invented');

-- ── The bench guard, shared ─────────────────────────────────────────────────
-- craft_experiment's identity and row checks, lifted out so the invention
-- context reads the bench by exactly the same rule. Returns the campaign.
-- p_allow_empty: idea mode may lay nothing out.

create function private.craft_bench_guard(p_party_member_id uuid, p_row_ids uuid[], p_allow_empty boolean)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_campaign uuid;
  v_distinct int;
begin
  -- Identity from auth.uid() only: the caller must be the player seated as this character, and
  -- its owner rather than a caretaker minding it (private.plays_for_another, #1059).
  select pm.campaign_id into v_campaign from party_members pm where pm.id = p_party_member_id;
  if v_uid is null or v_campaign is null or not exists (
    select 1 from campaign_members cm
    where cm.user_id = v_uid
      and cm.campaign_id = v_campaign
      and cm.party_member_id = p_party_member_id
  ) or private.plays_for_another(p_party_member_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- A NULL element is refused outright: cardinality() counts it but every row check below
  -- ignores it, so `array[null]` would otherwise reach the matching with nothing laid out and
  -- probe for secret single-ingredient recipes (audit, 24 Oct 2026).
  if p_row_ids is null or cardinality(p_row_ids) > 8
     or (cardinality(p_row_ids) = 0 and not p_allow_empty)
     or array_position(p_row_ids, null) is not null then
    raise exception 'Lay out between one and eight items' using errcode = '22023';
  end if;

  v_distinct := (select count(distinct x) from unnest(p_row_ids) as x);

  -- Every laid-out row must be this character's or the party stash's, in this campaign, and
  -- spendable, and fill no more dishes than it holds units (so never an empty stack). Anything
  -- else is refused outright rather than silently dropped, so the answer can never depend on a
  -- row the caller does not hold. Its own code, apart from the caller's 42501, so the bench can
  -- say which of the two went wrong.
  if v_distinct <> (
    select count(*)
    from (select x as id, count(*)::int as dishes from unnest(p_row_ids) as x group by x) d
    join party_inventory pi on pi.id = d.id
    where pi.campaign_id = v_campaign
      and (pi.carried_by = p_party_member_id or pi.carried_by is null)
      and not pi.is_ruined and not pi.is_equipped and not pi.is_container
      and pi.quantity >= d.dishes
  ) then
    raise exception 'Those items cannot be laid out' using errcode = 'CX001';
  end if;

  return v_campaign;
end;
$$;

revoke execute on function private.craft_bench_guard(uuid, uuid[], boolean) from public, anon, authenticated;

-- craft_experiment, now through the shared guard. Behaviour unchanged; its pgTAP
-- (craft_experiment.test.sql) holds it.
create or replace function public.craft_experiment(p_party_member_id uuid, p_discipline text, p_row_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_campaign uuid;
  v_rows int;
  v_hide_hints boolean;
  v_result jsonb;
begin
  v_campaign := private.craft_bench_guard(p_party_member_id, p_row_ids, false);

  if p_discipline is null then
    raise exception 'Lay out between one and eight items' using errcode = '22023';
  end if;

  -- One element per dish; a row id repeats when its stack fills several.
  v_rows := cardinality(p_row_ids);

  -- No row means the rule's default, which is on (defaultEnabled in the client registry).
  select not coalesce(
    (select cr.enabled from campaign_rules cr
      where cr.campaign_id = v_campaign and cr.rule_key = 'crafting_near_miss_hints'),
    true)
    into v_hide_hints;

  with
  placed as (
    -- One row per dish, so a stack laid twice is two dishes. Its tags come from whichever
    -- catalogue the row references. `idx` is the dish's bit (0-7) in the masks below.
    select pi.item_id, pi.library_item_id, coalesce(i.tags, li.tags) as tags,
           (d.ord - 1)::int as idx
    from unnest(p_row_ids) with ordinality as d(id, ord)
    join party_inventory pi on pi.id = d.id
    left join items i on i.id = pi.item_id
    left join library_items li on li.id = pi.library_item_id
  ),
  sized as (
    -- Only recipes within one ingredient of the laid-out count can match or be a near miss.
    -- A recipe with no ingredients cannot be found by materials at all.
    select r.id, r.name, r.created_at, count(g.id)::int as n_ing
    from crafting_recipes r
    join crafting_recipe_ingredients g on g.recipe_id = r.id
    where r.campaign_id = v_campaign
      and r.discipline = p_discipline
      and r.discoverable
      and not (p_party_member_id = any(r.player_visible_to))
    group by r.id
    having count(g.id) between greatest(v_rows - 1, 1) and v_rows + 1
  ),
  fits as (
    -- Per ingredient, the bitmask of dishes that could fill it: the same item, or a row carrying
    -- all its tags. 0 means nothing laid out fits it.
    select g.recipe_id, g.position, g.id,
           coalesce(bit_or(1 << p.idx), 0) as mask
    from crafting_recipe_ingredients g
    join sized z on z.id = g.recipe_id
    left join placed p on
      (g.item_id is not null and p.item_id = g.item_id)
      or (g.library_item_id is not null and p.library_item_id = g.library_item_id)
      or (g.item_id is null and g.library_item_id is null
          and cardinality(g.tags) > 0 and p.tags @> g.tags)
    group by g.recipe_id, g.position, g.id
  ),
  scored as (
    -- One aggregated pass, then the matching on at most eight bits per recipe
    -- (private.craft_max_matching). An earlier recursive-CTE version scanned the unindexed edge
    -- list per search state and took seconds on a campaign of hundreds of broad-tag recipes
    -- (audit, 24 Oct 2026); this one is linear in the recipes and cheap per recipe.
    select z.id, z.name, z.created_at, z.n_ing,
           private.craft_max_matching(array_agg(f.mask order by f.position, f.id), v_rows) as m
    from sized z
    join fits f on f.recipe_id = z.id
    group by z.id, z.name, z.created_at, z.n_ing
  )
  select coalesce(
    (select jsonb_build_object('result', 'match', 'recipe_id', sc.id, 'name', sc.name)
       from scored sc
      where sc.n_ing = v_rows and sc.m = v_rows
      order by sc.created_at, sc.id
      limit 1),
    case
      when not v_hide_hints and exists (select 1 from scored sc where sc.n_ing = v_rows + 1 and sc.m = v_rows)
        then jsonb_build_object('result', 'near', 'hint', 'missing')
      when not v_hide_hints and exists (select 1 from scored sc where sc.n_ing = v_rows - 1 and sc.m = sc.n_ing)
        then jsonb_build_object('result', 'near', 'hint', 'extra')
      else jsonb_build_object('result', 'none')
    end
  ) into v_result;

  if v_result ->> 'result' = 'match' then
    -- The reveal: the character joins the recipe's audience, so RLS lets the player read it
    -- from now on. The row's ring triggers tell every open client.
    -- Guarded so two simultaneous matches append the character once, and pinned to the campaign.
    update crafting_recipes
       set player_visible_to = array_append(player_visible_to, p_party_member_id)
     where id = (v_result ->> 'recipe_id')::uuid
       and campaign_id = v_campaign
       and not (p_party_member_id = any(player_visible_to));
  end if;

  return v_result;
end;
$$;

-- ── The invention context ───────────────────────────────────────────────────
-- What the edge function needs to draft an invention, read under the caller's
-- own JWT so the seat and the bench are checked by the same guard as an
-- experiment: the campaign, the setting, and the laid-out materials with the
-- facts the validator prices and caps by. Refuses (CX002) when the campaign has
-- turned invention off. `ai_enabled` and credits are the edge function's.

create function public.craft_invention_context(p_party_member_id uuid, p_discipline text, p_row_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_campaign uuid;
  v_rule record;
  v_bench jsonb;
begin
  v_campaign := private.craft_bench_guard(p_party_member_id, coalesce(p_row_ids, '{}'::uuid[]), true);

  if p_discipline is null or p_discipline not in ('alchemy','smithing','leathercraft','woodcraft','jewelcrafting','herbalism','poisoncraft','tinkering','cooking','scribing','forgery','brewing','weaving','masonry','painting') then
    raise exception 'Choose a discipline' using errcode = '22023';
  end if;

  -- No row means the rule's default, which is on (defaultEnabled in the client registry).
  select cr.enabled, cr.config into v_rule
    from campaign_rules cr
   where cr.campaign_id = v_campaign and cr.rule_key = 'crafting_ai_invention';
  if v_rule.enabled is not null and not v_rule.enabled then
    raise exception 'Invention is turned off in this campaign' using errcode = 'CX002';
  end if;

  -- A row with neither catalogue reference (a typed-in item) cannot be an ingredient: a recipe
  -- names its ingredients by item. The guard has already proven the rows are the caller's.
  if exists (
    select 1 from unnest(coalesce(p_row_ids, '{}'::uuid[])) x
    join party_inventory pi on pi.id = x
    where pi.item_id is null and pi.library_item_id is null
  ) then
    raise exception 'Those items cannot be laid out' using errcode = 'CX001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'row_id', pi.id,
           'dishes', d.dishes,
           'item_id', pi.item_id,
           'library_item_id', pi.library_item_id,
           'name', coalesce(i.name, li.name, pi.name),
           'rarity', coalesce(i.rarity, li.rarity, 'mundane'),
           'item_type', coalesce(i.item_type, li.item_type, 'gear'),
           'cost', coalesce(i.cost, li.cost),
           'tags', to_jsonb(coalesce(i.tags, li.tags, '{}'::text[]))
         ) order by d.first_ord), '[]'::jsonb)
    into v_bench
    from (select x as id, count(*)::int as dishes, min(ord) as first_ord
            from unnest(coalesce(p_row_ids, '{}'::uuid[])) with ordinality as u(x, ord)
           group by x) d
    join party_inventory pi on pi.id = d.id
    left join items i on i.id = pi.item_id
    left join library_items li on li.id = pi.library_item_id;

  return jsonb_build_object(
    'campaign_id', v_campaign,
    -- A hand-written config that is not a number reads as the default, and the multiple stays
    -- inside the rule's own 1 to 5 (src/rules/optionalRules.ts), so a bad row cannot break the
    -- read or loosen the cap.
    'value_multiple', case
      when (v_rule.config ->> 'value_multiple') ~ '^[0-9]+(\.[0-9]+)?$'
        then least(greatest((v_rule.config ->> 'value_multiple')::numeric, 1), 5)
      else 2
    end,
    'bench', v_bench
  );
end;
$$;

comment on function public.craft_invention_context(uuid, text, uuid[]) is
  'AI invention (#1103): the campaign, the value multiple and the laid-out materials for the invent-recipe edge function. Refuses (42501) a caller who is not the character''s seated owner, (CX001) a row they do not hold or cannot spend, (CX002) a campaign with invention turned off.';

revoke execute on function public.craft_invention_context(uuid, text, uuid[]) from public, anon;
grant execute on function public.craft_invention_context(uuid, text, uuid[]) to authenticated, service_role;

-- ── Sending a draft to the DM ───────────────────────────────────────────────

create function public.submit_crafting_invention(p_invention_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row crafting_inventions%rowtype;
begin
  select * into v_row from crafting_inventions where id = p_invention_id for update;
  -- Only the asker, still seated as the character's owner (a caretaker cannot send an
  -- invention on the owner's behalf any more than they can make one).
  if v_uid is null or not found or v_row.user_id <> v_uid
     or not exists (
       select 1 from campaign_members cm
        where cm.user_id = v_uid and cm.campaign_id = v_row.campaign_id
          and cm.party_member_id = v_row.party_member_id)
     or private.plays_for_another(v_row.party_member_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_row.status <> 'draft' then
    raise exception 'Only a draft can be sent' using errcode = 'CX003';
  end if;

  update crafting_inventions set status = 'pending' where id = p_invention_id;
  return jsonb_build_object('status', 'pending');
end;
$$;

comment on function public.submit_crafting_invention(uuid) is
  'AI invention (#1103): the asker sends their draft to the DM (draft -> pending). Refuses (42501) anyone else, (CX003) a row that is not a draft.';

revoke execute on function public.submit_crafting_invention(uuid) from public, anon;
grant execute on function public.submit_crafting_invention(uuid) to authenticated, service_role;

-- ── Materialising an approved draft ─────────────────────────────────────────
-- The recipe, its ingredients and output, any new item and new materials, all
-- owned by the campaign's owner like every DM-authored recipe, and the recipe
-- shared with the inventing character. Reads only `draft`, which only the
-- service role wrote. Called only by decide_crafting_invention.
--
-- draft.item:        {ref: {item_id} | {library_item_id} | null, new: {...} | null, ...}
-- draft.ingredients: [{ref: {item_id} | {library_item_id} | null, new: {...} | null, quantity}]
-- draft.recipe:      {name, description, dc, requires_proficiency, requires_tools, crafting_time, crafting_time_unit}
-- draft.quantity:    the output count

-- An existing item a draft points at must be one the campaign may use: its own row, the
-- owner's global row, or a library row. The validator only offers such ids, but approval is
-- where the rows get linked, so the check lives here too (audit, 25 Oct 2026). Exactly one
-- reference is set; true or false, never NULL.
create function private.invention_ref_ok(p_item uuid, p_library text, p_campaign uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when p_item is not null and p_library is null then exists (
      select 1 from items i
       where i.id = p_item
         and (i.campaign_id = p_campaign or (i.campaign_id is null and i.user_id = p_owner)))
    when p_library is not null and p_item is null then exists (
      select 1 from library_items li where li.id = p_library)
    else false
  end;
$$;

revoke execute on function private.invention_ref_ok(uuid, text, uuid, uuid) from public, anon, authenticated;

create function private.materialise_crafting_invention(p_invention_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row crafting_inventions%rowtype;
  v_owner uuid;
  v_draft jsonb;
  v_new jsonb;
  v_output_item uuid;
  v_output_library text;
  v_recipe uuid;
  v_ing jsonb;
  v_ing_item uuid;
  v_ing_library text;
  v_pos int := 0;
begin
  select * into v_row from crafting_inventions where id = p_invention_id;
  select c.user_id into v_owner from campaigns c where c.id = v_row.campaign_id;
  v_draft := v_row.draft;

  -- The output: an existing item, or a new one carrying the AI label.
  v_new := v_draft -> 'item' -> 'new';
  if v_new is not null and jsonb_typeof(v_new) = 'object' then
    insert into items (
      user_id, campaign_id, name, item_type, subtype, rarity, requires_attunement,
      attunement_requirements, weight, cost, damage_rolls, armor_class, properties,
      charges, recharge, description, tags, ai_provenance)
    values (
      v_owner, v_row.campaign_id, v_new ->> 'name', v_new ->> 'item_type', v_new ->> 'subtype',
      v_new ->> 'rarity', coalesce((v_new ->> 'requires_attunement')::boolean, false),
      v_new ->> 'attunement_requirements', (v_new ->> 'weight')::numeric, v_new ->> 'cost',
      case when jsonb_typeof(v_new -> 'damage_rolls') = 'array' then v_new -> 'damage_rolls' end,
      v_new ->> 'armor_class',
      coalesce(array(select jsonb_array_elements_text(coalesce(v_new -> 'properties', '[]'::jsonb))), '{}'::text[]),
      (v_new ->> 'charges')::int, v_new ->> 'recharge', coalesce(v_new ->> 'description', ''),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_new -> 'tags', '[]'::jsonb))), '{}'::text[]),
      v_row.ai_provenance)
    returning id into v_output_item;
  else
    v_output_item := (v_draft -> 'item' -> 'ref' ->> 'item_id')::uuid;
    v_output_library := v_draft -> 'item' -> 'ref' ->> 'library_item_id';
    if not private.invention_ref_ok(v_output_item, v_output_library, v_row.campaign_id, v_owner) then
      raise exception 'The draft names an item outside this campaign' using errcode = '42501';
    end if;
  end if;

  insert into crafting_recipes (
    user_id, campaign_id, name, description, discipline, dc, requires_proficiency,
    requires_tools, crafting_time, crafting_time_unit, player_visible_to, discoverable, ai_provenance)
  values (
    v_owner, v_row.campaign_id, v_draft -> 'recipe' ->> 'name',
    coalesce(v_draft -> 'recipe' ->> 'description', ''), v_row.discipline,
    (v_draft -> 'recipe' ->> 'dc')::int,
    coalesce((v_draft -> 'recipe' ->> 'requires_proficiency')::boolean, false),
    coalesce((v_draft -> 'recipe' ->> 'requires_tools')::boolean, true),
    (v_draft -> 'recipe' ->> 'crafting_time')::int,
    v_draft -> 'recipe' ->> 'crafting_time_unit', array[v_row.party_member_id], false,
    v_row.ai_provenance)
  returning id into v_recipe;

  insert into crafting_recipe_outputs (recipe_id, item_id, library_item_id, quantity, position)
  values (v_recipe, v_output_item, v_output_library, greatest(coalesce((v_draft ->> 'quantity')::int, 1), 1), 0);

  for v_ing in select value from jsonb_array_elements(coalesce(v_draft -> 'ingredients', '[]'::jsonb)) loop
    v_ing_item := null;
    v_ing_library := null;
    v_new := v_ing -> 'new';
    if v_new is not null and jsonb_typeof(v_new) = 'object' then
      -- A new material the DM accepts with the draft: a plain campaign item.
      insert into items (user_id, campaign_id, name, item_type, rarity, cost, description, tags, ai_provenance)
      values (v_owner, v_row.campaign_id, v_new ->> 'name', coalesce(v_new ->> 'item_type', 'crafting_material'),
              v_new ->> 'rarity', v_new ->> 'cost', coalesce(v_new ->> 'description', ''),
              coalesce(array(select jsonb_array_elements_text(coalesce(v_new -> 'tags', '[]'::jsonb))), '{}'::text[]),
              v_row.ai_provenance)
      returning id into v_ing_item;
    else
      v_ing_item := (v_ing -> 'ref' ->> 'item_id')::uuid;
      v_ing_library := v_ing -> 'ref' ->> 'library_item_id';
      if not private.invention_ref_ok(v_ing_item, v_ing_library, v_row.campaign_id, v_owner) then
        raise exception 'The draft names an item outside this campaign' using errcode = '42501';
      end if;
    end if;

    insert into crafting_recipe_ingredients (recipe_id, item_id, library_item_id, quantity, position)
    values (v_recipe, v_ing_item, v_ing_library, greatest(coalesce((v_ing ->> 'quantity')::int, 1), 1), v_pos);
    v_pos := v_pos + 1;
  end loop;

  return v_recipe;
end;
$$;

revoke execute on function private.materialise_crafting_invention(uuid) from public, anon, authenticated;

-- ── The DM's call ───────────────────────────────────────────────────────────

create function public.decide_crafting_invention(p_invention_id uuid, p_decision text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row crafting_inventions%rowtype;
  v_recipe uuid;
begin
  select * into v_row from crafting_inventions where id = p_invention_id for update;
  if v_uid is null or not found or not private.is_campaign_dm(v_row.campaign_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  -- NULL-total: a NULL decision is refused, never read as a send-back (audit, 25 Oct 2026).
  if p_decision is null or p_decision not in ('approve', 'return') then
    raise exception 'Decide approve or return' using errcode = '22023';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'Only a draft sent to you can be decided' using errcode = 'CX003';
  end if;

  if p_decision = 'approve' then
    v_recipe := private.materialise_crafting_invention(p_invention_id);
    update crafting_inventions
       set status = 'approved', recipe_id = v_recipe, dm_note = null,
           decided_by = v_uid, decided_at = now()
     where id = p_invention_id;
    return jsonb_build_object('status', 'approved', 'recipe_id', v_recipe);
  end if;

  update crafting_inventions
     set status = 'draft',
         dm_note = nullif(btrim(left(coalesce(p_note, ''), 1000)), ''),
         decided_by = v_uid, decided_at = now()
   where id = p_invention_id;
  return jsonb_build_object('status', 'draft');
end;
$$;

comment on function public.decide_crafting_invention(uuid, text, text) is
  'AI invention (#1103): the DM approves a pending draft (the recipe, and any new item and materials, are created and shared with the character) or sends it back with a note. Refuses (42501) anyone who is not a DM of its campaign, (CX003) a row that is not pending.';

revoke execute on function public.decide_crafting_invention(uuid, text, text) from public, anon;
grant execute on function public.decide_crafting_invention(uuid, text, text) to authenticated, service_role;

-- ── Credits and the prompt ──────────────────────────────────────────────────

insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
values ('recipe_invention', 'Recipe Invention', 1, 48)
on conflict (generation_type) do nothing;

insert into public.ai_system_prompts (generator_type, label, content)
values ('recipe_invention', 'Recipe Invention (experiment bench)', $prompt$You are the inventor's assistant for a Dungeons & Dragons 5e crafting table. A player character is inventing an item in one crafting discipline. You draft the item, its rules, its value and a recipe for it. A server checks every number you give against fixed limits afterwards and lowers or rejects anything out of bounds, and the Dungeon Master approves the result, so aim to fit the limits rather than test them.

You receive:
- mode: "materials" (the player laid materials on a bench and asks what they could make) or "idea" (the player describes what they want to build).
- discipline, and the item types it makes.
- rarity_ceiling and the value limit in copper pieces, when the materials are fixed.
- bench: the laid-out materials (materials mode).
- wish: what the player wants (idea mode), and possibly a previous draft with a revision note from the player or the DM.
- candidates: existing items that might already be what is wanted (output candidates), and existing materials (material candidates), each with an id.

Most inventions are mundane: a better lantern, a folding stool, a lute, a trap for rats. That is the normal and welcome case. Magic is rare and earned: it needs rare, costly materials and serious skill, and the recipe will demand both.

Rules:
1. Prefer what exists. If an output candidate is what the materials or the wish describe, return it by id and write no new item.
2. Only write a new item when no candidate fits. Its item_type must be one the discipline makes.
3. Rarity is paid for in materials. The result may be no rarer than its rarest ingredient (mundane materials can still make a common item). Rarer results need rarer materials.
4. Value is paid for in materials. The result's total value (value_cp times quantity) may be at most the value limit, which is the ingredients' combined value times the campaign's multiple.
5. Declare every mechanic. Each game effect the item has must appear in "mechanics" as one typed entry. "rules_text" states the same rules in game-ready prose and must not add any effect that is not declared. "flavor" is description only, with no numbers or game effects. Fit the power to the rarity as the Dungeon Master's Guide does: no bonus at common; +1 at uncommon, +2 at rare, +3 at very rare; spells no higher than the rarity allows (cantrip or 1st level at common, 2nd-3rd at uncommon, 4th-5th at rare); attunement only from uncommon up and only when the item's power warrants it. Small, odd, useful effects are the heart of invention: a clockwork bird that sings when someone enters a room is a fine common item with one minor effect.
6. In materials mode the ingredients are exactly the bench; do not list ingredients. In idea mode, choose the ingredients: prefer material candidates by id; you may invent at most two new materials (item_type crafting_material) when nothing fitting exists, each with a plausible rarity and cost. Their rarity and value must pay for the result under rules 3 and 4.
7. The recipe's name usually matches the item. Its description says in one or two sentences how the thing is made. For a mundane item, suggest a DC for the work between 8 (simple) and 15 (masterwork), and whether it needs proficiency with the discipline's tools (true for skilled or masterwork pieces); a magic item's DC is set by its rarity and always needs proficiency. Every recipe needs the discipline's ordinary toolkit; never invent special tools. If the work plausibly needs special training (taught by a runesmith, a guild's secret), say so in "special_requirement" as one short phrase, else null; the Dungeon Master judges it. Suggest a crafting time that fits real work: hours for simple goods, several days for anything intricate, tens of days or more for magic. Give it in minutes, hours or days only (a month is 30 days).
8. If nothing sensible can be made from these materials (materials mode), answer with {"nothing": true, "reason": "<one short sentence, in the world>"}.

Respond with JSON only:
{
  "output": {"candidate_id": "<id>"} | {"new": {"name": "", "item_type": "", "subtype": null, "rarity": "", "value_cp": 0, "weight": null, "flavor": "", "rules_text": "", "requires_attunement": false, "attunement_requirements": null, "charges": null, "recharge": null, "damage_dice": null, "damage_type": null, "armor_class": null, "properties": []}},
  "mechanics": [{"kind": "minor", "text": ""} | {"kind": "attack_bonus", "value": 1} | {"kind": "ac_bonus", "value": 1} | {"kind": "save_bonus", "value": 1} | {"kind": "extra_damage", "dice": "1d4", "damage_type": ""} | {"kind": "healing", "dice": "2d4+2"} | {"kind": "spell", "name": "", "level": 0} | {"kind": "charges", "max": 3} | {"kind": "resistance", "damage_type": ""} | {"kind": "advantage", "on": ""}],
  "quantity": 1,
  "ingredients": [{"candidate_id": "<id>", "quantity": 1} | {"new": {"name": "", "rarity": "", "value_cp": 0, "description": ""}, "quantity": 1}],
  "recipe": {"name": "", "description": "", "dc": 10, "requires_proficiency": false, "special_requirement": null, "crafting_time": 1, "crafting_time_unit": "hours"}
}$prompt$)
on conflict do nothing;
