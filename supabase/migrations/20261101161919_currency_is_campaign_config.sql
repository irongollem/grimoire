-- Currency is campaign config (#934, story 4).
--
-- The five D&D coins (pp, gp, ep, sp, cp) were fixed in every layer: five
-- integer columns on party_members, five keys in every coin-bearing jsonb
-- (loot, chat drops and offers, loot tables, encounter pools, downtime), and
-- the 5e exchange rates written into claim_player_offer. A campaign could not
-- have homebrew coins, and no other game system could have any.
--
-- Now:
--   * `campaigns.currency` holds the campaign's denominations (`{default_key,
--     denominations: [{key, name, abbr, value, color, makes_change}]}`, highest
--     value first, `value` in the smallest coin). New campaigns start with the
--     5e set, the one every existing campaign already uses. A price written as
--     a bare number is read in `default_key` (the client parses prices; the
--     database never sees price text).
--   * Every place that holds coins holds a coin map, `{"<key>": count}`:
--     `party_members.coins`, `payload.coins` on currency loot, `coins` on
--     currency drops and loot-chest atoms, `price` on vendor and player offers,
--     `coins` on loot-table currency entries and encounter pools, and
--     `gain` / `spend` on downtime gold effects. Old shapes are converted here
--     and dropped: nothing reads the five keys after this migration.
--   * Paying takes the coins it needs, breaks the smallest coin that covers the
--     rest and hands change back in the coins that make change. The old sale
--     re-packed both whole purses and zeroed electrum.
--   * Removing a denomination from a campaign converts what it held, by value,
--     into the coins that remain (the maintainer's call, 1 Nov 2026), in purses,
--     unsent loot, loot tables, encounter pools, chat history and downtime.
--   * Vendor payment moves into claim_vendor_offer. The client used to debit the
--     purse after the claim, so a closed tab between the two left an offer paid
--     for nothing.

-- ── Coin arithmetic ─────────────────────────────────────────────────────────

create or replace function private.dnd5e_currency()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'default_key', 'gp',
    'denominations', jsonb_build_array(
      jsonb_build_object('key', 'pp', 'name', 'Platinum', 'abbr', 'pp', 'value', 1000, 'color', '#b8c4d6', 'makes_change', true),
      jsonb_build_object('key', 'gp', 'name', 'Gold',     'abbr', 'gp', 'value', 100,  'color', '#d4a017', 'makes_change', true),
      jsonb_build_object('key', 'ep', 'name', 'Electrum', 'abbr', 'ep', 'value', 50,   'color', '#7fa7b5', 'makes_change', false),
      jsonb_build_object('key', 'sp', 'name', 'Silver',   'abbr', 'sp', 'value', 10,   'color', '#a8a9ad', 'makes_change', true),
      jsonb_build_object('key', 'cp', 'name', 'Copper',   'abbr', 'cp', 'value', 1,    'color', '#b87333', 'makes_change', true)
    )
  );
$$;

-- A currency is valid when it can price anything: at least one denomination,
-- unique keys and abbreviations, whole positive values sorted highest first,
-- exactly one coin worth 1 (so every value has exact change), and a default
-- that names one of them. Total: never NULL.
create or replace function private.valid_currency(p_currency jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_denoms jsonb;
  v_d jsonb;
  v_prev numeric;
  v_ones int := 0;
begin
  if p_currency is null or jsonb_typeof(p_currency) <> 'object' then return false; end if;
  v_denoms := p_currency->'denominations';
  if jsonb_typeof(v_denoms) is distinct from 'array' or jsonb_array_length(v_denoms) = 0 then return false; end if;
  if jsonb_typeof(p_currency->'default_key') is distinct from 'string' then return false; end if;

  for v_d in select d from jsonb_array_elements(v_denoms) d loop
    if jsonb_typeof(v_d) <> 'object'
       or coalesce(v_d->>'key', '') !~ '^[a-z][a-z0-9_]{0,15}$'
       or btrim(coalesce(v_d->>'name', '')) = ''
       or btrim(coalesce(v_d->>'abbr', '')) = ''
       or jsonb_typeof(v_d->'value') is distinct from 'number'
       or (v_d->>'value')::numeric < 1
       or (v_d->>'value')::numeric <> trunc((v_d->>'value')::numeric)
       or coalesce(v_d->>'color', '') !~ '^#[0-9a-fA-F]{6}$'
       or jsonb_typeof(v_d->'makes_change') is distinct from 'boolean' then
      return false;
    end if;
    if v_prev is not null and (v_d->>'value')::numeric >= v_prev then return false; end if;
    v_prev := (v_d->>'value')::numeric;
    if v_prev = 1 then v_ones := v_ones + 1; end if;
  end loop;

  return v_ones = 1
    and (select count(distinct d->>'key') from jsonb_array_elements(v_denoms) d) = jsonb_array_length(v_denoms)
    and (select count(distinct lower(btrim(d->>'abbr'))) from jsonb_array_elements(v_denoms) d) = jsonb_array_length(v_denoms)
    and exists (select 1 from jsonb_array_elements(v_denoms) d where d->>'key' = p_currency->>'default_key');
end;
$$;

-- A coin map: an object of whole, non-negative counts. Keys are not checked
-- against a currency here (a column check cannot read the campaign); callers
-- that need that use coins_known.
create or replace function private.valid_coins(p_coins jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_coins) = 'object'
    and not exists (
      select 1 from jsonb_each(p_coins) e
       where jsonb_typeof(e.value) <> 'number'
          or (e.value #>> '{}')::numeric < 0
          or (e.value #>> '{}')::numeric <> trunc((e.value #>> '{}')::numeric)
    ),
    false
  );
$$;

-- Every key in the map is one of the currency's denominations.
create or replace function private.coins_known(p_coins jsonb, p_currency jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1 from jsonb_object_keys(coalesce(p_coins, '{}'::jsonb)) k
     where not exists (
       select 1 from jsonb_array_elements(p_currency->'denominations') d where d->>'key' = k
     )
  );
$$;

-- Total in the currency's smallest coin. Keys the currency does not know are
-- worth nothing.
create or replace function private.coins_value(p_coins jsonb, p_currency jsonb)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum((c.value #>> '{}')::numeric * (d->>'value')::bigint), 0)::bigint
    from jsonb_each(coalesce(p_coins, '{}'::jsonb)) c
    join jsonb_array_elements(p_currency->'denominations') d on d->>'key' = c.key;
$$;

-- Per-key sum of two maps; zero counts are dropped.
create or replace function private.coins_add(p_a jsonb, p_b jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, s) filter (where s <> 0), '{}'::jsonb)
    from (
      select k, sum(v)::bigint as s
        from (
          select e.key as k, (e.value #>> '{}')::numeric as v from jsonb_each(coalesce(p_a, '{}'::jsonb)) e
          union all
          select e.key, (e.value #>> '{}')::numeric from jsonb_each(coalesce(p_b, '{}'::jsonb)) e
        ) x
       group by k
    ) y;
$$;

-- A value as coins: greedy over the denominations that make change, highest
-- first; whatever is left below the smallest of those goes in the coin worth 1.
create or replace function private.make_change(p_value bigint, p_currency jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_rem bigint := greatest(coalesce(p_value, 0), 0);
  v_out jsonb := '{}'::jsonb;
  v_d jsonb;
  v_n bigint;
begin
  for v_d in
    select d from jsonb_array_elements(p_currency->'denominations') d
     where (d->>'makes_change')::boolean
     order by (d->>'value')::bigint desc
  loop
    v_n := v_rem / (v_d->>'value')::bigint;
    if v_n > 0 then
      v_out := v_out || jsonb_build_object(v_d->>'key', v_n);
      v_rem := v_rem - v_n * (v_d->>'value')::bigint;
    end if;
  end loop;
  if v_rem > 0 then
    v_out := private.coins_add(v_out, (
      select jsonb_build_object(d->>'key', v_rem)
        from jsonb_array_elements(p_currency->'denominations') d
       where (d->>'value')::bigint = 1
    ));
  end if;
  return v_out;
end;
$$;

-- Pays p_price (in the smallest coin) out of a purse and returns the purse
-- left. Takes the coins it needs, highest first, without breaking any; if a
-- remainder is left, every coin still held is worth more than it, so the
-- smallest of them is broken and the change comes back in coins that make
-- change. Other coins are never touched, so electrum is no longer re-packed.
create or replace function private.pay_coins(p_purse jsonb, p_price bigint, p_currency jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_purse jsonb := coalesce(p_purse, '{}'::jsonb);
  v_rem bigint := p_price;
  v_d jsonb;
  v_held bigint;
  v_take bigint;
begin
  if p_price is null or p_price < 0 then
    raise exception 'Invalid price' using errcode = '22023';
  end if;
  if private.coins_value(v_purse, p_currency) < p_price then
    raise exception 'Insufficient funds' using errcode = '22023';
  end if;

  for v_d in
    select d from jsonb_array_elements(p_currency->'denominations') d order by (d->>'value')::bigint desc
  loop
    exit when v_rem = 0;
    v_held := coalesce((v_purse->>(v_d->>'key'))::bigint, 0);
    v_take := least(v_held, v_rem / (v_d->>'value')::bigint);
    if v_take > 0 then
      v_purse := jsonb_set(v_purse, array[v_d->>'key'], to_jsonb(v_held - v_take));
      v_rem := v_rem - v_take * (v_d->>'value')::bigint;
    end if;
  end loop;

  if v_rem > 0 then
    select d into v_d
      from jsonb_array_elements(p_currency->'denominations') d
     where coalesce((v_purse->>(d->>'key'))::bigint, 0) > 0
     order by (d->>'value')::bigint asc
     limit 1;
    v_purse := jsonb_set(v_purse, array[v_d->>'key'], to_jsonb((v_purse->>(v_d->>'key'))::bigint - 1));
    v_purse := private.coins_add(v_purse, private.make_change((v_d->>'value')::bigint - v_rem, p_currency));
  end if;

  return private.coins_add(v_purse, '{}'::jsonb);
end;
$$;

-- Re-expresses the coins of denominations p_new no longer has, by their value
-- in p_old, as change in p_new. Coins p_new still has keep their counts, and
-- keys neither currency knows are left alone.
create or replace function private.convert_coins(p_coins jsonb, p_old jsonb, p_new jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select private.coins_add(
    (select coalesce(jsonb_object_agg(c.key, c.value), '{}'::jsonb)
       from jsonb_each(coalesce(p_coins, '{}'::jsonb)) c
      where exists (select 1 from jsonb_array_elements(p_new->'denominations') d where d->>'key' = c.key)
         or not exists (select 1 from jsonb_array_elements(p_old->'denominations') d where d->>'key' = c.key)),
    private.make_change(
      (select coalesce(sum((c.value #>> '{}')::numeric * (d->>'value')::bigint), 0)::bigint
         from jsonb_each(coalesce(p_coins, '{}'::jsonb)) c
         join jsonb_array_elements(p_old->'denominations') d on d->>'key' = c.key
        where not exists (select 1 from jsonb_array_elements(p_new->'denominations') n where n->>'key' = c.key)),
      p_new
    )
  );
$$;

-- "120 gp, 40 sp": the chat line for a coin map, highest coin first.
create or replace function private.coins_text(p_coins jsonb, p_currency jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg((c.value #>> '{}') || ' ' || (d->>'abbr'), ', ' order by (d->>'value')::bigint desc), '')
    from jsonb_each(coalesce(p_coins, '{}'::jsonb)) c
    join jsonb_array_elements(p_currency->'denominations') d on d->>'key' = c.key
   where (c.value #>> '{}')::numeric > 0;
$$;

-- ── Schema ──────────────────────────────────────────────────────────────────

alter table public.campaigns
  add column currency jsonb not null default private.dnd5e_currency(),
  add constraint campaigns_currency_valid check (private.valid_currency(currency));

create or replace function private.campaign_currency(p_campaign_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select c.currency from public.campaigns c where c.id = p_campaign_id;
$$;

alter table public.party_members
  add column coins jsonb not null default '{}'::jsonb,
  add constraint party_members_coins_valid check (private.valid_coins(coins));

-- ── Data: every old five-key shape becomes a coin map ──────────────────────

-- The positive whole counts of the five legacy keys, as a coin map. Dropped at
-- the end of this migration: nothing reads the old keys afterwards.
create function private.legacy_coins(p_obj jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, floor((p_obj->>k)::numeric)::bigint), '{}'::jsonb)
    from unnest(array['pp', 'gp', 'ep', 'sp', 'cp']) k
   where jsonb_typeof(p_obj->k) = 'number' and floor((p_obj->>k)::numeric) > 0;
$$;

-- The same object without the legacy keys.
create function private.strip_legacy_coins(p_obj jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$ select p_obj - array['pp', 'gp', 'ep', 'sp', 'cp']; $$;

-- A loot-chest atom array with every currency atom converted.
create function private.legacy_atoms(p_atoms jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
           case when a->>'type' = 'currency'
                then private.strip_legacy_coins(a) || jsonb_build_object('coins', private.legacy_coins(a))
                else a end
           order by ord), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_atoms, '[]'::jsonb)) with ordinality as t(a, ord);
$$;

update public.party_members
   set coins = private.coins_add('{}'::jsonb,
                 jsonb_build_object('pp', pp, 'gp', gp, 'ep', ep, 'sp', sp, 'cp', cp));

-- Dispatched loot is immutable provenance; this rewrite changes its shape, not
-- what it records, so the guard is held off for the conversion only.
alter table public.loot_placements disable trigger validate_loot_placement;
update public.loot_placements
   set payload = private.strip_legacy_coins(payload) || jsonb_build_object('coins', private.legacy_coins(payload))
 where kind = 'currency';
update public.loot_placements
   set payload = jsonb_set(payload, '{rolled_atoms}', private.legacy_atoms(payload->'rolled_atoms'))
 where kind = 'loot_chest' and jsonb_typeof(payload->'rolled_atoms') = 'array';
alter table public.loot_placements enable trigger validate_loot_placement;

update public.campaign_messages
   set metadata = private.strip_legacy_coins(metadata) || jsonb_build_object('coins', private.legacy_coins(metadata))
 where type = 'currency_drop' and metadata is not null;
update public.campaign_messages
   set metadata = private.strip_legacy_coins(metadata) || jsonb_build_object('price', private.legacy_coins(metadata))
 where type in ('vendor_offer', 'player_offer') and metadata is not null;
update public.campaign_messages
   set metadata = jsonb_set(metadata, '{rolled_atoms}', private.legacy_atoms(metadata->'rolled_atoms'))
 where type = 'loot_chest' and jsonb_typeof(metadata->'rolled_atoms') = 'array';

update public.loot_tables lt
   set entries = (
     select coalesce(jsonb_agg(
              case when e->>'type' = 'currency'
                   then private.strip_legacy_coins(e) || jsonb_build_object('coins', private.legacy_coins(e))
                   else e end
              order by ord), '[]'::jsonb)
       from jsonb_array_elements(lt.entries) with ordinality as t(e, ord))
 where jsonb_typeof(lt.entries) = 'array'
   and exists (select 1 from jsonb_array_elements(lt.entries) e where e->>'type' = 'currency');

update public.encounters en
   set reward_currency_pools = (
     select coalesce(jsonb_agg(
              private.strip_legacy_coins(p) || jsonb_build_object('coins', private.legacy_coins(p))
              order by ord), '[]'::jsonb)
       from jsonb_array_elements(en.reward_currency_pools) with ordinality as t(p, ord))
 where jsonb_typeof(en.reward_currency_pools) = 'array'
   and jsonb_array_length(en.reward_currency_pools) > 0;

-- A downtime gold effect mixed signs per coin ("gp": -25 spends). It becomes
-- what the character earns and what they pay, each a coin map.
update public.downtime_outcomes o
   set proposed_effects = (
     select coalesce(jsonb_agg(
              case when e->>'kind' = 'gold'
                   then private.strip_legacy_coins(e) || jsonb_build_object(
                          'gain', private.legacy_coins(e),
                          'spend', (select coalesce(jsonb_object_agg(k, -floor((e->>k)::numeric)::bigint), '{}'::jsonb)
                                      from unnest(array['pp', 'gp', 'ep', 'sp', 'cp']) k
                                     where jsonb_typeof(e->k) = 'number' and floor((e->>k)::numeric) < 0))
                   else e end
              order by ord), '[]'::jsonb)
       from jsonb_array_elements(o.proposed_effects) with ordinality as t(e, ord))
 where exists (select 1 from jsonb_array_elements(o.proposed_effects) e where e->>'kind' = 'gold');

drop function private.legacy_atoms(jsonb);
drop function private.strip_legacy_coins(jsonb);
drop function private.legacy_coins(jsonb);

alter table public.party_members
  drop column pp,
  drop column gp,
  drop column ep,
  drop column sp,
  drop column cp;

-- ── A changed currency converts what the removed coins held ─────────────────

-- AFTER the campaigns row is written, so the loot validation trigger reads the
-- new currency. Dispatched loot keeps its payload (it is provenance; the chat
-- message it became is converted instead).
create or replace function private.campaign_currency_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := old.currency;
  v_new jsonb := new.currency;
begin
  if not exists (
    select 1 from jsonb_array_elements(v_old->'denominations') o
     where not exists (select 1 from jsonb_array_elements(v_new->'denominations') n where n->>'key' = o->>'key')
  ) then
    return null; -- nothing removed: counts stand, a revalued coin keeps its count
  end if;

  update public.party_members
     set coins = private.convert_coins(coins, v_old, v_new)
   where campaign_id = new.id;

  update public.loot_placements
     set payload = jsonb_set(payload, '{coins}', private.convert_coins(payload->'coins', v_old, v_new))
   where campaign_id = new.id and kind = 'currency' and dispatched_at is null;

  update public.campaign_messages
     set metadata = jsonb_set(metadata, '{coins}', private.convert_coins(metadata->'coins', v_old, v_new))
   where campaign_id = new.id and type = 'currency_drop' and metadata ? 'coins';
  update public.campaign_messages
     set metadata = jsonb_set(metadata, '{price}', private.convert_coins(metadata->'price', v_old, v_new))
   where campaign_id = new.id and type in ('vendor_offer', 'player_offer') and metadata ? 'price';

  update public.loot_tables lt
     set entries = (
       select coalesce(jsonb_agg(
                case when e->>'type' = 'currency'
                     then jsonb_set(e, '{coins}', private.convert_coins(e->'coins', v_old, v_new))
                     else e end
                order by ord), '[]'::jsonb)
         from jsonb_array_elements(lt.entries) with ordinality as t(e, ord))
   where lt.campaign_id = new.id and jsonb_typeof(lt.entries) = 'array';

  update public.encounters en
     set reward_currency_pools = (
       select coalesce(jsonb_agg(
                jsonb_set(p, '{coins}', private.convert_coins(p->'coins', v_old, v_new)) order by ord), '[]'::jsonb)
         from jsonb_array_elements(en.reward_currency_pools) with ordinality as t(p, ord))
   where en.campaign_id = new.id and jsonb_array_length(en.reward_currency_pools) > 0;

  update public.downtime_outcomes o
     set proposed_effects = (
       select coalesce(jsonb_agg(
                case when e->>'kind' = 'gold'
                     then e || jsonb_build_object(
                            'gain', private.convert_coins(e->'gain', v_old, v_new),
                            'spend', private.convert_coins(e->'spend', v_old, v_new))
                     else e end
                order by ord), '[]'::jsonb)
         from jsonb_array_elements(o.proposed_effects) with ordinality as t(e, ord))
   where o.campaign_id = new.id;

  return null;
end;
$$;
revoke execute on function private.campaign_currency_changed() from public, anon, authenticated;

create trigger campaigns_currency_converts_holdings
  after update of currency on public.campaigns
  for each row
  when (old.currency is distinct from new.currency)
  execute procedure private.campaign_currency_changed();

-- ── Functions that move coins ───────────────────────────────────────────────

create or replace function public.claim_currency_drop(p_message_id uuid, p_claimer_name text, p_party_member_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_msg  public.campaign_messages;
  v_meta jsonb;
begin
  select * into v_msg from public.campaign_messages
  where id = p_message_id and type = 'currency_drop'
  for update;

  if v_msg is null then raise exception 'Drop not found'; end if;
  if not private.is_campaign_member(v_msg.campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  v_meta := coalesce(v_msg.metadata, '{}'::jsonb);
  if v_meta->>'claimed_by_user_id' is not null then
    raise exception 'Already claimed';
  end if;
  -- Drops are member-authored messages, so the coins are checked rather than
  -- trusted: whole and non-negative, so a claim can never debit a purse.
  -- Known keys too: a coin the campaign does not have is worthless today and
  -- would become real money the day the DM adds a coin by that key.
  if not private.valid_coins(coalesce(v_meta->'coins', '{}'::jsonb))
     or not private.coins_known(v_meta->'coins', private.campaign_currency(v_msg.campaign_id)) then
    raise exception 'Invalid drop';
  end if;

  v_meta := v_meta || jsonb_build_object(
    'claimed_by_user_id',      auth.uid()::text,
    'claimed_by_name',         p_claimer_name,
    'claimed_party_member_id', p_party_member_id
  );
  update public.campaign_messages set metadata = v_meta where id = p_message_id;

  -- Credit the claimer's own linked/owned member atomically (a null member is a
  -- DM claim — no purse to credit).
  if p_party_member_id is not null then
    if not exists (
      select 1 from public.party_members pm
      where pm.id = p_party_member_id
        and pm.campaign_id = v_msg.campaign_id
        and (
          pm.owner_user_id = auth.uid()
          or exists (
            select 1 from public.campaign_members cm
            where cm.campaign_id = v_msg.campaign_id
              and cm.user_id = auth.uid()
              and cm.party_member_id = p_party_member_id
          )
        )
    ) then
      raise exception 'Cannot claim currency to a member you do not control';
    end if;

    update public.party_members
       set coins = private.coins_add(coins, v_meta->'coins')
     where id = p_party_member_id;
  end if;

  return v_meta;
end;
$function$;

-- Paying a vendor now debits the purse here, in the claim's transaction, by the
-- campaign's currency with change. A null member is the DM buying for nobody.
create or replace function public.claim_vendor_offer(p_message_id uuid, p_payer_name text, p_party_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_msg  public.campaign_messages;
  v_meta jsonb;
  v_currency jsonb;
begin
  select * into v_msg from public.campaign_messages
  where id = p_message_id and type = 'vendor_offer'
  for update;

  if v_msg is null then raise exception 'Offer not found'; end if;
  if not private.is_campaign_member(v_msg.campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  if p_party_member_id is null then
    if not private.is_campaign_dm(v_msg.campaign_id) then
      raise exception 'Only the DM can buy without a character';
    end if;
  elsif not exists (
    select 1 from public.party_members pm
     where pm.id = p_party_member_id and pm.owner_user_id = auth.uid()
       and pm.campaign_id = v_msg.campaign_id
  ) then
    raise exception 'Cannot spend from a character you do not own';
  end if;

  -- Any member may post a message of any type, and paying now debits a purse,
  -- so only an offer a DM of this campaign posted can be paid. A player's
  -- look-alike offer would take the coins and deliver nothing.
  if not exists (
    select 1 from public.campaign_members cm
     where cm.campaign_id = v_msg.campaign_id and cm.user_id = v_msg.user_id and cm.role = 'dm'
  ) and not exists (
    select 1 from public.campaigns c where c.id = v_msg.campaign_id and c.user_id = v_msg.user_id
  ) then
    raise exception 'Only a DM''s offer can be paid';
  end if;

  v_meta := coalesce(v_msg.metadata, '{}'::jsonb);
  if v_meta->>'paid_by_user_id' is not null then
    raise exception 'Already paid';
  end if;
  v_currency := private.campaign_currency(v_msg.campaign_id);
  if not private.valid_coins(coalesce(v_meta->'price', '{}'::jsonb))
     or not private.coins_known(v_meta->'price', v_currency) then
    raise exception 'Invalid offer price';
  end if;

  if p_party_member_id is not null then
    perform 1 from public.party_members where id = p_party_member_id for update;
    update public.party_members
       set coins = private.pay_coins(coins, private.coins_value(v_meta->'price', v_currency), v_currency)
     where id = p_party_member_id;
  end if;

  v_meta := v_meta || jsonb_build_object(
    'paid_by_user_id',      auth.uid()::text,
    'paid_by_name',         p_payer_name,
    'paid_party_member_id', p_party_member_id
  );
  update public.campaign_messages set metadata = v_meta where id = p_message_id;
  return v_meta;
end;
$function$;

-- The #936 validation is unchanged; the price is now a coin map, the seller is
-- credited the coins paid, and the buyer pays with change instead of having
-- their whole purse re-packed.
create or replace function public.claim_player_offer(p_message_id uuid, p_buyer_name text, p_party_member_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid         uuid := auth.uid();
  v_msg         public.campaign_messages;
  v_meta        jsonb;
  v_price       jsonb;
  v_currency    jsonb;
  v_seller_pmid uuid;
  v_inv_id      uuid;
  v_seller      public.party_members;
  v_buyer       public.party_members;
begin
  select * into v_msg from public.campaign_messages
  where id = p_message_id and type = 'player_offer'
  for update;

  if v_msg is null then raise exception 'Offer not found'; end if;
  if not private.is_campaign_member(v_msg.campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  v_meta := coalesce(v_msg.metadata, '{}'::jsonb);
  if v_meta->>'sold_to_user_id' is not null then
    raise exception 'Already sold';
  end if;

  -- A negative price would debit the seller and credit the buyer.
  v_price := coalesce(v_meta->'price', '{}'::jsonb);
  v_currency := private.campaign_currency(v_msg.campaign_id);
  if not private.valid_coins(v_price) or not private.coins_known(v_price, v_currency) then
    raise exception 'Invalid offer price';
  end if;
  v_seller_pmid := (v_meta->>'seller_party_member_id')::uuid;
  v_inv_id      := (v_meta->>'inventory_item_id')::uuid;

  select * into v_seller from public.party_members where id = v_seller_pmid for update;
  if v_seller is null then raise exception 'Seller not found'; end if;

  if v_seller.campaign_id is distinct from v_msg.campaign_id then
    raise exception 'Seller is not in this campaign';
  end if;
  if not coalesce((
    v_seller.owner_user_id = v_msg.user_id
    or exists (
      select 1 from public.campaign_members cm
      where cm.campaign_id = v_msg.campaign_id
        and cm.user_id = v_msg.user_id
        and (cm.party_member_id = v_seller_pmid or cm.role = 'dm')
    )
  ), false) then
    raise exception 'Seller is not controlled by the offer author';
  end if;
  if not exists (
    select 1 from public.party_inventory pi
    where pi.id = v_inv_id
      and pi.campaign_id = v_msg.campaign_id
      and pi.carried_by = v_seller_pmid
  ) then
    raise exception 'Item is not carried by the seller';
  end if;
  if p_party_member_id is not null then
    select * into v_buyer from public.party_members where id = p_party_member_id;
    if found then
      if v_buyer.owner_user_id is distinct from v_uid then
        raise exception 'Cannot spend from a character you do not own';
      end if;
      if p_party_member_id = v_seller_pmid then
        raise exception 'Cannot buy from yourself';
      end if;
      if v_buyer.campaign_id is distinct from v_msg.campaign_id then
        raise exception 'Buyer is not in this campaign';
      end if;
    end if;
  end if;

  update public.party_members
     set coins = private.coins_add(coins, v_price)
   where id = v_seller_pmid;

  if p_party_member_id is null then
    if not private.is_campaign_dm(v_msg.campaign_id) then
      raise exception 'Only the DM can buy without a character';
    end if;
    delete from public.party_inventory where id = v_inv_id;
  else
    select * into v_buyer from public.party_members where id = p_party_member_id for update;
    if v_buyer is null then raise exception 'Buyer not found'; end if;
    if v_buyer.owner_user_id is distinct from v_uid then
      raise exception 'Cannot spend from a character you do not own';
    end if;

    update public.party_members
       set coins = private.pay_coins(coins, private.coins_value(v_price, v_currency), v_currency)
     where id = p_party_member_id;

    update public.party_inventory set
      carried_by  = p_party_member_id,
      user_id     = v_uid,
      location    = 'backpack',
      slot        = null,
      is_equipped = false,
      is_attuned  = false
    where id = v_inv_id;
  end if;

  v_meta := v_meta || jsonb_build_object(
    'sold_to_user_id',        v_uid::text,
    'sold_to_name',           p_buyer_name,
    'sold_to_party_member_id', p_party_member_id
  );
  update public.campaign_messages set metadata = v_meta where id = p_message_id;
  return v_meta;
end;
$function$;

drop function public.give_coins(uuid, uuid, integer, integer, integer, integer, integer);

-- Coins handed over as they are, no change: the giver chooses which coins.
create function public.give_coins(p_from_member_id uuid, p_to_member_id uuid, p_coins jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.party_members%rowtype;
  v_to_campaign uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_from from public.party_members where id = p_from_member_id;
  if not found or v_from.campaign_id is null
     or not private.can_write_pack(v_from.campaign_id, v_from.id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  perform 1 from public.party_members
   where id in (p_from_member_id, p_to_member_id)
   order by id
     for update;
  select * into v_from from public.party_members where id = p_from_member_id;
  if not found or v_from.campaign_id is null
     or not private.can_write_pack(v_from.campaign_id, v_from.id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_to_member_id = p_from_member_id then
    raise exception 'Give the coins to someone else' using errcode = '22023';
  end if;
  select pm.campaign_id into v_to_campaign from public.party_members pm where pm.id = p_to_member_id;
  if v_to_campaign is distinct from v_from.campaign_id then
    raise exception 'That character is not in this campaign' using errcode = '22023';
  end if;

  if not private.valid_coins(p_coins)
     or private.coins_add(p_coins, '{}'::jsonb) = '{}'::jsonb then
    raise exception 'Give at least one coin' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_each(p_coins) c
     where (c.value #>> '{}')::bigint > coalesce((v_from.coins->>c.key)::bigint, 0)
  ) then
    raise exception 'Not that many coins in the purse' using errcode = '22023';
  end if;

  update public.party_members
     set coins = private.coins_add(coins, (
       select jsonb_object_agg(c.key, -((c.value #>> '{}')::bigint)) from jsonb_each(p_coins) c))
   where id = p_from_member_id;
  update public.party_members
     set coins = private.coins_add(coins, p_coins)
   where id = p_to_member_id;
end;
$$;

comment on function public.give_coins(uuid, uuid, jsonb) is
  'Move coins from a purse the caller may act for into another party member''s purse, atomically (#1112).';

revoke execute on function public.give_coins(uuid, uuid, jsonb) from public, anon;
grant execute on function public.give_coins(uuid, uuid, jsonb) to authenticated, service_role;

-- Pays a price out of a purse, with change: what a downtime cost or any other
-- in-world expense does. Same authority as handing the purse's coins over.
create function public.spend_coins(p_member_id uuid, p_price jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.party_members%rowtype;
  v_currency jsonb;
  v_coins jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  -- Authorized before the lock, so a caller cannot lock a purse they may not
  -- touch; read again under the lock and judged again, as give_coins does.
  select * into v_member from public.party_members where id = p_member_id;
  if not found or v_member.campaign_id is null
     or not private.can_write_pack(v_member.campaign_id, v_member.id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into v_member from public.party_members where id = p_member_id for update;
  if not found or v_member.campaign_id is null
     or not private.can_write_pack(v_member.campaign_id, v_member.id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  v_currency := private.campaign_currency(v_member.campaign_id);
  if not private.valid_coins(p_price) or not private.coins_known(p_price, v_currency) then
    raise exception 'Invalid price' using errcode = '22023';
  end if;

  v_coins := private.pay_coins(v_member.coins, private.coins_value(p_price, v_currency), v_currency);
  update public.party_members set coins = v_coins where id = p_member_id;
  return v_coins;
end;
$$;

comment on function public.spend_coins(uuid, jsonb) is
  'Pay a price out of a party member''s purse in the campaign''s currency, breaking a coin for change when needed (#934).';

revoke execute on function public.spend_coins(uuid, jsonb) from public, anon;
grant execute on function public.spend_coins(uuid, jsonb) to authenticated, service_role;

-- ── Loot ────────────────────────────────────────────────────────────────────

create or replace function private.validate_loot_placement()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'private'
as $function$
declare
  v_currency jsonb;
begin
  -- See 20261013231042 for why the availability check runs only on a change.
  if new.kind = 'item'
     and new.item_id is not null
     and (tg_op = 'INSERT'
          or new.item_id is distinct from old.item_id
          or new.campaign_id is distinct from old.campaign_id)
     and not exists (
    select 1 from public.items i
    where i.id = new.item_id
      and private.can_use_in_campaign(i.user_id, i.campaign_id, new.campaign_id)
  ) then
    raise exception 'Item is not available to this campaign' using errcode = '23514';
  end if;

  -- Currency loot is a coin map in the campaign's own denominations, worth
  -- something.
  if new.kind = 'currency' then
    v_currency := private.campaign_currency(new.campaign_id);
    if not private.valid_coins(coalesce(new.payload->'coins', 'null'::jsonb)) then
      raise exception 'Currency loot must count whole, non-negative coins' using errcode = '23514';
    end if;
    if not private.coins_known(new.payload->'coins', v_currency) then
      raise exception 'Currency loot must use this campaign''s coins' using errcode = '23514';
    end if;
    if private.coins_value(new.payload->'coins', v_currency) = 0 then
      raise exception 'Currency loot must contain at least one coin' using errcode = '23514';
    end if;
  end if;

  if new.kind = 'loot_chest' and (
    jsonb_typeof(new.payload->'rolled_atoms') is distinct from 'array'
    or jsonb_typeof(new.payload->'claims_total') is distinct from 'number'
    or (new.payload->>'claims_total')::integer < 1
  ) then
    raise exception 'Loot chest requires rolled_atoms and a positive claims_total' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.dispatched_at is not null and (
    new.beat_id is distinct from old.beat_id
    or new.quest_id is distinct from old.quest_id
    or new.location_id is distinct from old.location_id
    or new.campaign_id is distinct from old.campaign_id
    or new.kind is distinct from old.kind
    or new.item_id is distinct from old.item_id
    or new.library_item_id is distinct from old.library_item_id
    or new.quantity is distinct from old.quantity
    or new.payload is distinct from old.payload
    or new.source_type is distinct from old.source_type
    or new.source_id is distinct from old.source_id
    or new.dispatch_message_id is distinct from old.dispatch_message_id
    or new.dispatched_at is distinct from old.dispatched_at
  ) then
    raise exception 'Dispatched loot provenance is immutable' using errcode = '23514';
  end if;

  return new;
end;
$function$;

-- The currency branch now copies the coin map and writes the chat line in the
-- campaign's abbreviations. Everything else is 20261003083553's body.
create or replace function public.dispatch_loot(p_entry_ids uuid[])
 returns table(loot_entry_id uuid, message_id uuid, delivery_state text)
 language plpgsql
 security definer
 set search_path to 'public', 'private'
as $function$
declare
  v_entry public.loot_placements;
  v_item public.items;
  v_lib public.library_items;
  v_item_name text;
  v_item_rarity text;
  v_image_url text;
  v_tags text[];
  v_message_id uuid;
  v_metadata jsonb;
  v_sender_name text;
  v_message text;
begin
  if p_entry_ids is null or cardinality(p_entry_ids) = 0 then
    return;
  end if;

  -- One check, one message: see 20261003083553 (an existence oracle otherwise).
  if (
    select count(*) from public.loot_placements l
    where l.id = any(p_entry_ids) and private.is_campaign_dm(l.campaign_id)
  ) <> (
    select count(distinct e) from unnest(p_entry_ids) e where e is not null
  ) then
    raise exception 'One or more loot entries are not yours to drop';
  end if;

  for v_entry in
    select l.* from public.loot_placements l
    where l.id = any(p_entry_ids)
    order by l.sort_order, l.created_at, l.id
    for update
  loop
    select cm.display_name into v_sender_name
    from public.campaign_members cm
    where cm.campaign_id = v_entry.campaign_id and cm.user_id = auth.uid();
    v_sender_name := coalesce(nullif(btrim(v_sender_name), ''), 'Dungeon Master');

    if v_entry.dispatched_at is not null then
      loot_entry_id := v_entry.id;
      message_id := v_entry.dispatch_message_id;
      delivery_state := case when exists (
        select 1 from public.campaign_messages cm where cm.id = v_entry.dispatch_message_id
      ) then 'chat' else 'message_removed' end;
      return next;
      continue;
    end if;

    -- No location_id here: see 20261003083553 (players could resolve a room
    -- they were never shown).
    v_metadata := jsonb_build_object(
      'quest_id', v_entry.quest_id,
      'beat_id', v_entry.beat_id,
      'quest_loot_entry_id', v_entry.id,
      'source_type', v_entry.source_type,
      'source_id', v_entry.source_id
    );

    if v_entry.kind = 'item' then
      if v_entry.library_item_id is not null then
        select * into v_lib from public.library_items li where li.id = v_entry.library_item_id;
        if v_lib is null then
          raise exception 'Prepared item % no longer exists', v_entry.library_item_id;
        end if;
        v_item_name := v_lib.name;
        v_item_rarity := v_lib.rarity;
        v_image_url := case when v_lib.rarity = 'mundane' then v_lib.image_url else v_lib.mundane_image_url end;
        v_tags := v_lib.tags;
      else
        select * into v_item from public.items i where i.id = v_entry.item_id;
        if v_item is null then
          raise exception 'Prepared item % no longer exists', v_entry.item_id;
        end if;
        v_item_name := v_item.name;
        v_item_rarity := v_item.rarity;
        v_image_url := case when v_item.rarity = 'mundane' then v_item.image_url else v_item.mundane_image_url end;
        v_tags := v_item.tags;
      end if;
      v_metadata := v_metadata || jsonb_build_object(
        'item_id', v_entry.item_id,
        'library_item_id', v_entry.library_item_id,
        'item_name', v_item_name,
        'item_rarity', v_item_rarity,
        'quantity', v_entry.quantity,
        'quantity_remaining', v_entry.quantity,
        'claims', '[]'::jsonb,
        'image_url', v_image_url,
        'description', null,
        'is_container', 'container' = any(v_tags),
        'claimed_by_user_id', null,
        'claimed_by_name', null,
        'claimed_party_member_id', null
      );
      v_message := 'dropped ' || case when v_entry.quantity > 1 then v_entry.quantity || 'x ' else '' end || v_item_name;
    elsif v_entry.kind = 'currency' then
      v_metadata := v_metadata || jsonb_build_object(
        'label', nullif(v_entry.label, ''),
        'coins', private.coins_add(v_entry.payload->'coins', '{}'::jsonb),
        'claimed_by_user_id', null,
        'claimed_by_name', null,
        'claimed_party_member_id', null
      );
      v_message := 'dropped '
        || case when v_entry.label <> '' then v_entry.label || ': ' else 'currency: ' end
        || private.coins_text(v_entry.payload->'coins', private.campaign_currency(v_entry.campaign_id));
    else
      v_metadata := v_entry.payload || v_metadata || jsonb_build_object('claims', '[]'::jsonb);
      v_message := 'dropped a chest from ' || coalesce(nullif(v_entry.payload->>'loot_table_name', ''), nullif(v_entry.label, ''), 'prepared loot');
    end if;

    insert into public.campaign_messages (
      campaign_id, user_id, recipient_user_id, sender_name, message, type, metadata
    ) values (
      v_entry.campaign_id, auth.uid(), null, v_sender_name, v_message,
      case v_entry.kind when 'item' then 'item_drop' when 'currency' then 'currency_drop' else 'loot_chest' end,
      v_metadata
    ) returning id into v_message_id;

    update public.loot_placements
    set dispatch_message_id = v_message_id, dispatched_at = now()
    where id = v_entry.id;

    -- #830: dropping a room's loot is looting the room. See 20261003083553 for
    -- why the insert is not wrapped in an insufficient_privilege handler.
    if v_entry.location_id is not null then
      if not exists (
        select 1 from public.location_state
        where location_id = v_entry.location_id and fact = 'looted' and value
      ) then
        insert into public.location_state_events (user_id, location_id, fact, value, note)
        values (auth.uid(), v_entry.location_id, 'looted', true, 'Loot was dropped from this room');
      end if;
    end if;

    loot_entry_id := v_entry.id;
    message_id := v_message_id;
    delivery_state := 'chat';
    return next;
  end loop;
end;
$function$;

-- ── A caretaker may still spend a purse ────────────────────────────────────

create or replace function private.guard_caretaker_party_member_update()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_new     jsonb;
  v_old     jsonb;
  v_changed text[];
begin
  if current_user not in ('authenticated', 'anon') or not private.plays_for_another(old.id) then
    return new;
  end if;

  v_new := to_jsonb(new);
  v_old := to_jsonb(old);
  select array_agg(k order by k) into v_changed
    from jsonb_object_keys(v_new) k
   where v_new -> k is distinct from v_old -> k
     and k <> all (array[
       'current_hp', 'temp_hp', 'current_initiative', 'conditions', 'inspiration',
       'death_save_successes', 'death_save_failures', 'coins',
       'spell_slots', 'class_resources', 'class_choices', 'hit_dice_remaining',
       'concentration', 'wildshape_state', 'wildshapes_used', 'wildshape_reset',
       'disguise_species_id', 'disguise_race', 'disguise_subrace', 'updated_at'
     ]);
  if v_changed is not null then
    raise exception 'A character you are looking after stays as its player built it (%)',
      array_to_string(v_changed, ', ')
      using errcode = '42501';
  end if;

  if new.class_choices is distinct from old.class_choices and exists (
    select 1
      from (select jsonb_object_keys(coalesce(new.class_choices, '{}'::jsonb)) as k
            union
            select jsonb_object_keys(coalesce(old.class_choices, '{}'::jsonb))) keys
     where new.class_choices -> keys.k is distinct from old.class_choices -> keys.k
       and keys.k !~ '_active$'
       and keys.k <> 'innate_sorcery_expires_at'
  ) then
    raise exception 'A character you are looking after keeps the choices its player made'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ── The AI prompts speak in the campaign's coins ───────────────────────────
-- The edge functions now send the campaign's denominations with every request;
-- the prompts describe the coin map and stop naming five fixed coins. Each
-- replacement is asserted, so a prompt edited away from its migration text
-- fails here instead of shipping a model that still answers in pp..cp.

do $$
declare
  v_before text;
  v_after text;
begin
  select content into v_before from public.ai_system_prompts where generator_type = 'loot';
  v_after := replace(replace(v_before,
    '"pp": 0, "gp": 120, "ep": 0, "sp": 40, "cp": 0,',
    '"coins": {"gp": 120, "sp": 40},'),
    '- "currency" entries: whole numbers per denomination, zero for the ones this hoard does not contain.',
    '- "currency" entries: "coins" maps a denomination key from the campaign''s currency (listed in the request) to a whole number; leave out the denominations this hoard does not contain.');
  if v_after = v_before or v_after like '%"ep": 0%' then
    raise exception 'loot prompt did not take the coin-map wording';
  end if;
  update public.ai_system_prompts set content = v_after where generator_type = 'loot';

  select content into v_before from public.ai_system_prompts where generator_type = 'downtime';
  v_after := replace(replace(v_before,
    '- Coin: {"kind":"gold","note":"why, in the DM''s voice","cp":0,"sp":0,"ep":0,"gp":-25,"pp":0}',
    '- Coin: {"kind":"gold","note":"why, in the DM''s voice","gain":{},"spend":{"gp":25}}'),
    'Negative = the character spends. Positive = they earn. Include all five coin fields.',
    '"gain" is what the character earns and "spend" what they pay, each mapping a denomination key from the campaign''s currency (listed in the request) to a whole number.');
  if v_after = v_before or v_after like '%all five coin fields%' then
    raise exception 'downtime prompt did not take the coin-map wording';
  end if;
  update public.ai_system_prompts set content = v_after where generator_type = 'downtime';

  select content into v_before from public.ai_system_prompts where generator_type = 'recipe_invention';
  v_after := replace(v_before, 'the value limit in copper pieces', 'the value limit in the smallest coin of the campaign''s currency');
  if v_after = v_before then
    raise exception 'recipe_invention prompt did not take the smallest-coin wording';
  end if;
  update public.ai_system_prompts set content = v_after where generator_type = 'recipe_invention';
end;
$$;
