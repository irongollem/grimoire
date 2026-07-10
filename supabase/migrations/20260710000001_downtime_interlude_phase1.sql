-- Migration: downtime_interlude_phase1
-- The Interlude (#486) phase 1: DM-granted downtime credits, player draws,
-- DM-resolved outcomes, and the DM's prepped "stack the deck" pile.

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS helper: which character does the calling user play in this campaign?
--
-- Lives in `private` (not `public`) because it is referenced from RLS policies:
-- PostgREST does not expose `private`, but authenticated/anon retain USAGE +
-- EXECUTE so the policies still resolve. See 20260629000002.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function private.my_party_member_id(cid uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cm.party_member_id
  from campaign_members cm
  where cm.campaign_id = cid
    and cm.user_id = (select auth.uid())
  limit 1;
$$;

grant execute on function private.my_party_member_id(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- downtime_grants — append-only credit ledger. One row per DM grant.
-- Credits are per-CHARACTER (a user may own several party_members).
-- ─────────────────────────────────────────────────────────────────────────────
create table downtime_grants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  party_member_id uuid not null references party_members(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  amount integer not null check (amount > 0),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index downtime_grants_campaign_idx on downtime_grants (campaign_id);
create index downtime_grants_member_idx on downtime_grants (party_member_id);

create trigger downtime_grants_updated_at
  before update on downtime_grants
  for each row execute procedure update_updated_at();

alter table downtime_grants enable row level security;

create policy "downtime_grants_select" on downtime_grants for select
  using (
    private.is_campaign_dm(campaign_id)
    or (
      private.is_campaign_member(campaign_id)
      and party_member_id = private.my_party_member_id(campaign_id)
    )
  );
create policy "downtime_grants_insert" on downtime_grants for insert
  with check (private.is_campaign_dm(campaign_id));
create policy "downtime_grants_update" on downtime_grants for update
  using (private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));
create policy "downtime_grants_delete" on downtime_grants for delete
  using (private.is_campaign_dm(campaign_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- downtime_draws — one spent credit. Lands `pending` until the DM resolves it.
--
-- `activity_key` is deliberately unconstrained: the archetype catalog lives in
-- code (src/data/downtimeActivities.ts) so a new archetype is data, not a
-- migration.
-- ─────────────────────────────────────────────────────────────────────────────
create table downtime_draws (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  party_member_id uuid not null references party_members(id) on delete cascade,
  activity_key text not null check (length(trim(activity_key)) > 0),
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index downtime_draws_campaign_idx on downtime_draws (campaign_id);
create index downtime_draws_member_idx on downtime_draws (party_member_id);
create index downtime_draws_pending_idx on downtime_draws (campaign_id, status)
  where status = 'pending';

create trigger downtime_draws_updated_at
  before update on downtime_draws
  for each row execute procedure update_updated_at();

alter table downtime_draws enable row level security;

-- Players never INSERT directly: spend_downtime_draw() is the only path, so the
-- balance check and the insert are atomic.
create policy "downtime_draws_select" on downtime_draws for select
  using (
    private.is_campaign_dm(campaign_id)
    or (
      private.is_campaign_member(campaign_id)
      and party_member_id = private.my_party_member_id(campaign_id)
    )
  );
create policy "downtime_draws_insert" on downtime_draws for insert
  with check (private.is_campaign_dm(campaign_id));
create policy "downtime_draws_update" on downtime_draws for update
  using (private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));
create policy "downtime_draws_delete" on downtime_draws for delete
  using (private.is_campaign_dm(campaign_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- downtime_deck_backs — the DM's prepped pile ("stack the deck").
--
-- Polymorphic reward as a (reward_type, reward_id) pair rather than one nullable
-- FK per reward kind — mirrors player_read_items(entity_type, entity_id) and
-- quest_refs. Trade-off: no referential integrity, so a deleted target must
-- render as the "???" absence marker rather than being coerced away.
--
-- FIFO by (position, created_at). One-shot backs get consumed_at stamped;
-- recurring backs are never consumed.
-- ─────────────────────────────────────────────────────────────────────────────
create table downtime_deck_backs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  activity_key text not null check (length(trim(activity_key)) > 0),
  reward_type text not null
    check (reward_type in ('npc', 'item', 'spell', 'quest', 'note', 'faction')),
  reward_id uuid not null,
  is_recurring boolean not null default false,
  position integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index downtime_deck_backs_campaign_idx on downtime_deck_backs (campaign_id);
create index downtime_deck_backs_pile_idx
  on downtime_deck_backs (campaign_id, activity_key, position)
  where consumed_at is null;

create trigger downtime_deck_backs_updated_at
  before update on downtime_deck_backs
  for each row execute procedure update_updated_at();

alter table downtime_deck_backs enable row level security;

-- DM-only: the prepped pile is the DM's hidden prep. Players must not read it.
create policy "downtime_deck_backs_select" on downtime_deck_backs for select
  using (private.is_campaign_dm(campaign_id));
create policy "downtime_deck_backs_insert" on downtime_deck_backs for insert
  with check (private.is_campaign_dm(campaign_id));
create policy "downtime_deck_backs_update" on downtime_deck_backs for update
  using (private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));
create policy "downtime_deck_backs_delete" on downtime_deck_backs for delete
  using (private.is_campaign_dm(campaign_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- downtime_outcomes — the resolved vignette.
--
-- reward_type/reward_id are nullable: an outcome may create nothing.
-- proposed_effects is a jsonb array the DM ticks off explicitly on the board;
-- the app never silently mutates a character.
--   [{ "kind": "gold", "gp": -50, "applied": false, "note": "drank the purse dry" }]
-- ─────────────────────────────────────────────────────────────────────────────
create table downtime_outcomes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  draw_id uuid not null unique references downtime_draws(id) on delete cascade,
  title text not null,
  vignette text,
  reward_type text
    check (reward_type is null or reward_type in ('npc', 'item', 'spell', 'quest', 'note', 'faction')),
  reward_id uuid,
  proposed_effects jsonb not null default '[]'::jsonb
    check (jsonb_typeof(proposed_effects) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- a reward is either fully specified or wholly absent
  constraint downtime_outcomes_reward_pair
    check ((reward_type is null) = (reward_id is null))
);

create index downtime_outcomes_campaign_idx on downtime_outcomes (campaign_id);
create index downtime_outcomes_draw_idx on downtime_outcomes (draw_id);

create trigger downtime_outcomes_updated_at
  before update on downtime_outcomes
  for each row execute procedure update_updated_at();

alter table downtime_outcomes enable row level security;

create policy "downtime_outcomes_select" on downtime_outcomes for select
  using (
    private.is_campaign_dm(campaign_id)
    or (
      private.is_campaign_member(campaign_id)
      and exists (
        select 1 from downtime_draws d
        where d.id = downtime_outcomes.draw_id
          and d.party_member_id = private.my_party_member_id(downtime_outcomes.campaign_id)
      )
    )
  );
create policy "downtime_outcomes_insert" on downtime_outcomes for insert
  with check (private.is_campaign_dm(campaign_id));
create policy "downtime_outcomes_update" on downtime_outcomes for update
  using (private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));
create policy "downtime_outcomes_delete" on downtime_outcomes for delete
  using (private.is_campaign_dm(campaign_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- spend_downtime_draw — the ONLY way a player spends a credit.
--
-- SECURITY DEFINER, so it authorizes internally as its first act: the character
-- is derived from auth.uid(), never supplied by the caller. The advisory lock
-- closes the double-spend race a client-side balance check cannot.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.spend_downtime_draw(
  p_campaign_id uuid,
  p_activity_key text
)
returns downtime_draws
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member uuid;
  v_balance integer;
  v_draw downtime_draws;
begin
  -- Authorize first. my_party_member_id() returns null for non-members.
  v_member := private.my_party_member_id(p_campaign_id);
  if v_member is null then
    raise exception 'You do not play a character in this campaign'
      using errcode = 'insufficient_privilege';
  end if;

  if length(trim(coalesce(p_activity_key, ''))) = 0 then
    raise exception 'activity_key is required' using errcode = 'check_violation';
  end if;

  -- Serialize concurrent spends for this character.
  perform pg_advisory_xact_lock(hashtextextended(v_member::text, 0));

  select
    coalesce((select sum(amount) from downtime_grants
              where party_member_id = v_member and campaign_id = p_campaign_id), 0)
    - (select count(*) from downtime_draws
       where party_member_id = v_member and campaign_id = p_campaign_id
         and status <> 'cancelled')
  into v_balance;

  if v_balance < 1 then
    raise exception 'No downtime credits remaining'
      using errcode = 'check_violation';
  end if;

  insert into downtime_draws (campaign_id, party_member_id, activity_key)
  values (p_campaign_id, v_member, p_activity_key)
  returning * into v_draw;

  return v_draw;
end;
$$;

revoke execute on function public.spend_downtime_draw(uuid, text) from public, anon;
grant execute on function public.spend_downtime_draw(uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- resolve_downtime_draw — DM-only. Writes the outcome, closes the draw, and
-- consumes the prepped back in one transaction.
--
-- The reward entity (e.g. the cloned NPC) is created BEFORE this call as an
-- ordinary RLS-checked insert and its id passed in, so this definer function
-- never creates entities on the caller's behalf.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.resolve_downtime_draw(
  p_draw_id uuid,
  p_title text,
  p_vignette text,
  p_reward_type text,
  p_reward_id uuid,
  p_effects jsonb,
  p_back_id uuid
)
returns downtime_outcomes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_draw downtime_draws;
  v_outcome downtime_outcomes;
begin
  select * into v_draw from downtime_draws where id = p_draw_id for update;
  if not found then
    raise exception 'Draw not found' using errcode = 'no_data_found';
  end if;

  -- Authorize against the draw's own campaign, not a caller-supplied one.
  if not private.is_campaign_dm(v_draw.campaign_id) then
    raise exception 'Only the DM may resolve a downtime draw'
      using errcode = 'insufficient_privilege';
  end if;

  if v_draw.status <> 'pending' then
    raise exception 'This draw is already %', v_draw.status
      using errcode = 'check_violation';
  end if;

  insert into downtime_outcomes (
    campaign_id, draw_id, title, vignette, reward_type, reward_id, proposed_effects
  )
  values (
    v_draw.campaign_id, v_draw.id, p_title, p_vignette,
    p_reward_type, p_reward_id, coalesce(p_effects, '[]'::jsonb)
  )
  returning * into v_outcome;

  update downtime_draws
     set status = 'resolved', resolved_at = now()
   where id = v_draw.id;

  -- Recurring backs are never consumed; one-shots are stamped once.
  if p_back_id is not null then
    update downtime_deck_backs
       set consumed_at = now()
     where id = p_back_id
       and campaign_id = v_draw.campaign_id
       and is_recurring = false
       and consumed_at is null;
  end if;

  return v_outcome;
end;
$$;

revoke execute on function public.resolve_downtime_draw(uuid, text, text, text, uuid, jsonb, uuid) from public, anon;
grant execute on function public.resolve_downtime_draw(uuid, text, text, text, uuid, jsonb, uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime — these are multi-participant tables (useCampaignLiveSync).
-- ─────────────────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.downtime_grants;
alter publication supabase_realtime add table public.downtime_draws;
alter publication supabase_realtime add table public.downtime_deck_backs;
alter publication supabase_realtime add table public.downtime_outcomes;
