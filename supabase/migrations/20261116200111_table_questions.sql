-- Table questions (#1212): a DM sends a roll table to the table as a question, and
-- each player picks their own, the table votes, or a player rolls.
--
--   table_questions: one row per question sent. The options are a SNAPSHOT of the
--     roll table's entries at the moment it was sent (label, a player-facing blurb,
--     a picture, the thing an entry names, its range), because roll_tables is DM-only
--     and carries DM notes: a player reads the question, never the table. Mode, dice
--     and options are fixed once sent; a different list is a new question.
--   table_question_answers: one row per member per question. A pick or a vote names
--     an option; a roll is rolled here, on the server.
--
-- Why these choices:
-- * A hidden vote is hidden by the select policy, not by the screen: while a hidden
--   question is open a player reads only their own answer (decision 2). The DM reads
--   every answer. Closing it (closed_at) shows them to everyone at the table.
-- * `hidden` is a vote's setting and `exclusive` a pick's, held by check constraints.
--   That keeps every pick answer readable to the players, which is what lets the
--   exclusivity guard below run as the player (security invoker) and still see the
--   option someone else has taken. Nothing here is security definer.
-- * The roll is random() in the guard trigger, whatever the client sends, and a
--   player cannot change or withdraw it: a reroll is the DM deleting the answer.
-- * A pick can be a gift (`gift`, the DM's switch, off by default: a question about
--   items is not always a gift of one). Then what a player picks is theirs, granted
--   here in the same insert as the answer, so a pick and its reward never drift: an
--   item lands in the character's pack (party_inventory), a creature or an NPC joins
--   the character's companions. A gift is final; the DM deleting the answer takes
--   back what it gave and lets the player choose again. Deleting the whole question
--   takes nothing back: the party keeps what it was given.
-- * Session scheduling (session_proposals) is not folded in (decision 3).

create table public.table_questions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- The DM who asked.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The table it was sent from, for "questions from this table". The snapshot below
  -- is what players read, so deleting the table leaves the question whole.
  roll_table_id uuid references public.roll_tables (id) on delete set null,
  prompt text not null constraint table_questions_prompt_check check (char_length(btrim(prompt)) between 1 and 300),
  mode text not null constraint table_questions_mode_check check (mode in ('pick', 'vote', 'roll')),
  -- The die a roll question rolls; copied from the table.
  dice text constraint table_questions_dice_check check (dice in ('1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '1d100')),
  -- A pick: only one of each option at this table.
  exclusive boolean not null default false,
  -- A vote: answers unseen by the players until the DM closes it.
  hidden boolean not null default false,
  -- A pick: what each player picks is theirs to keep (see the header).
  gift boolean not null default false,
  -- [{id, label, blurb, image_url, focal, ref: {kind, id} | null, min, max}]
  options jsonb not null,
  closed_at timestamptz,
  -- The DM's call when a vote closes (decision 1: the result is the DM's, not an engine's).
  outcome_option_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint table_questions_roll_has_dice check ((mode = 'roll') = (dice is not null)),
  constraint table_questions_exclusive_is_a_pick check (not exclusive or mode = 'pick'),
  constraint table_questions_hidden_is_a_vote check (not hidden or mode = 'vote'),
  constraint table_questions_gift_is_a_pick check (not gift or mode = 'pick'),
  constraint table_questions_outcome_is_a_closed_vote check (outcome_option_id is null or (mode = 'vote' and closed_at is not null))
);

comment on table public.table_questions is
  'A roll table sent to the table as a question (#1212): each player picks, the table votes, or a player rolls. The options are a snapshot players read instead of the DM-only roll table.';

create index table_questions_campaign_idx on public.table_questions (campaign_id, created_at desc);
create index table_questions_roll_table_idx on public.table_questions (roll_table_id) where roll_table_id is not null;

create trigger table_questions_updated_at
  before update on public.table_questions
  for each row execute procedure update_updated_at();

create trigger zz_same_campaign_refs
  before insert or update of roll_table_id, campaign_id
  on public.table_questions
  for each row execute procedure private.enforce_same_campaign_refs('roll_table_id', 'roll_tables', 'owned');

-- Shape of the options, and what may change once sent.
create function private.guard_table_question()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_ids text[];
begin
  if tg_op = 'UPDATE' then
    if new.mode is distinct from old.mode or new.dice is distinct from old.dice or new.gift is distinct from old.gift
       or new.options is distinct from old.options or new.campaign_id is distinct from old.campaign_id then
      raise exception 'A question''s mode, die, options and gifts are fixed once it is sent'
        using errcode = '23514';
    end if;
  end if;

  if jsonb_typeof(new.options) <> 'array' or jsonb_array_length(new.options) not between 1 and 100 then
    raise exception 'A question needs between 1 and 100 options' using errcode = '23514';
  end if;

  if exists (
    select 1 from jsonb_array_elements(new.options) o
     where jsonb_typeof(o) <> 'object'
        or jsonb_typeof(o -> 'id') is distinct from 'string'
        or jsonb_typeof(o -> 'label') is distinct from 'string'
        or char_length(btrim(o ->> 'label')) = 0
  ) then
    raise exception 'Every option needs an id and a label' using errcode = '23514';
  end if;

  select array_agg(o ->> 'id') into v_ids from jsonb_array_elements(new.options) o;
  if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x) then
    raise exception 'Option ids must be unique' using errcode = '23514';
  end if;

  if new.mode = 'roll' and exists (
    select 1 from jsonb_array_elements(new.options) o
     where jsonb_typeof(o -> 'min') is distinct from 'number'
        or jsonb_typeof(o -> 'max') is distinct from 'number'
  ) then
    raise exception 'A roll question''s options need a range' using errcode = '23514';
  end if;

  if new.outcome_option_id is not null and not (new.outcome_option_id = any (v_ids)) then
    raise exception 'The outcome must be one of the options' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_table_question() from public, anon, authenticated;

create trigger table_questions_guard
  before insert or update on public.table_questions
  for each row execute procedure private.guard_table_question();

alter table public.table_questions enable row level security;

create policy "table_questions_select" on public.table_questions for select
  using (private.is_campaign_member(campaign_id));
create policy "table_questions_insert" on public.table_questions for insert
  with check ((select auth.uid()) = user_id and private.is_campaign_dm(campaign_id));
create policy "table_questions_update" on public.table_questions for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "table_questions_delete" on public.table_questions for delete
  using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.table_questions to authenticated, service_role;

create trigger table_questions_signal_insert after insert on public.table_questions referencing new table as changed
  for each statement execute function public.signal_campaign_change();
create trigger table_questions_signal_update after update on public.table_questions referencing old table as left_rows new table as changed
  for each statement execute function public.signal_campaign_change();
create trigger table_questions_signal_delete after delete on public.table_questions referencing old table as changed
  for each statement execute function public.signal_campaign_change();

insert into private.demo_campaign_tables (table_name, tier, copy, reason)
values ('table_questions', 1, false, 'play state: a question the DM sent during a game');

-- ── Answers ─────────────────────────────────────────────────────────────────

create table public.table_question_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.table_questions (id) on delete cascade,
  -- Copied from the question by the guard below; kept for the policies and the ring.
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- The member answering.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The character the answer is for (a pet goes to a character, not an account).
  party_member_id uuid references public.party_members (id) on delete set null,
  -- Null only for a roll that landed in a gap of the table.
  option_id text,
  rolled smallint constraint table_question_answers_rolled_check check (rolled between 1 and 100),
  -- What a gift gave (see the header): the companion a creature or NPC became, or the
  -- item put in the pack. Written only by the guard below.
  companion_id uuid references public.companions (id) on delete set null,
  inventory_item_id uuid references public.party_inventory (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint table_question_answers_one_each unique (question_id, user_id)
);

comment on table public.table_question_answers is
  'One member''s answer to a table question (#1212). A hidden vote''s answers are readable only by their author and the DM until it closes.';

create index table_question_answers_campaign_idx on public.table_question_answers (campaign_id);
create index table_question_answers_party_member_idx on public.table_question_answers (party_member_id) where party_member_id is not null;
create index table_question_answers_companion_idx on public.table_question_answers (companion_id) where companion_id is not null;
create index table_question_answers_inventory_idx on public.table_question_answers (inventory_item_id) where inventory_item_id is not null;

create trigger table_question_answers_updated_at
  before update on public.table_question_answers
  for each row execute procedure update_updated_at();

create function private.guard_table_question_answer()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_q public.table_questions;
  v_is_dm boolean;
  v_max integer;
  v_question_id uuid;
  v_option jsonb;
  v_ref_kind text;
  v_ref_id text;
begin
  v_question_id := case when tg_op = 'DELETE' then old.question_id else new.question_id end;

  select * into v_q from public.table_questions where id = v_question_id;
  if not found then
    -- Cascading from a deleted question, or a question the caller cannot read
    -- (the foreign key and RLS report the latter).
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Server code (no JWT) is trusted, like the DM.
  v_is_dm := auth.uid() is null or coalesce(private.is_campaign_dm(v_q.campaign_id), false);

  if tg_op = 'DELETE' then
    if not v_is_dm and (v_q.closed_at is not null or v_q.mode = 'roll' or v_q.gift) then
      raise exception 'Only the DM can take back this answer' using errcode = '42501';
    end if;
    return old;
  end if;

  new.campaign_id := v_q.campaign_id;

  if tg_op = 'UPDATE' then
    if new.question_id is distinct from old.question_id or new.user_id is distinct from old.user_id then
      raise exception 'An answer cannot move to another question or member' using errcode = '23514';
    end if;
    if not v_is_dm and v_q.closed_at is not null then
      raise exception 'This question is closed' using errcode = '42501';
    end if;
    if not v_is_dm and v_q.gift
       and (new.option_id is distinct from old.option_id
            or new.party_member_id is distinct from old.party_member_id) then
      raise exception 'A gift is yours to keep' using errcode = '42501';
    end if;
    -- What a gift gave is the guard's to write, never the client's.
    new.companion_id := old.companion_id;
    new.inventory_item_id := old.inventory_item_id;
  else
    if not v_is_dm and v_q.closed_at is not null then
      raise exception 'This question is closed' using errcode = '42501';
    end if;
    new.companion_id := null;
    new.inventory_item_id := null;
  end if;

  -- The character must be one the answering member plays.
  if new.party_member_id is not null
     and (tg_op = 'INSERT' or new.party_member_id is distinct from old.party_member_id)
     and not v_is_dm
     and not exists (
       select 1 from public.party_members pm
        where pm.id = new.party_member_id
          and pm.campaign_id = v_q.campaign_id
          and (pm.owner_user_id = new.user_id or (pm.owner_user_id is null and pm.user_id = new.user_id))
     ) then
    raise exception 'That character is not yours' using errcode = '42501';
  end if;

  if v_q.mode = 'roll' then
    if tg_op = 'INSERT' then
      v_max := split_part(v_q.dice, 'd', 2)::integer;
      new.rolled := (1 + floor(random() * v_max))::smallint;
      new.option_id := (
        select o ->> 'id'
          from jsonb_array_elements(v_q.options) o
         where (o ->> 'min')::integer <= new.rolled and new.rolled <= (o ->> 'max')::integer
         limit 1);
    else
      -- What was rolled stays rolled.
      new.rolled := old.rolled;
      new.option_id := old.option_id;
    end if;
    return new;
  end if;

  -- A pick or a vote names one of the options, and rolls nothing.
  new.rolled := null;
  if new.option_id is null or not exists (
    select 1 from jsonb_array_elements(v_q.options) o where o ->> 'id' = new.option_id
  ) then
    raise exception 'Choose one of the options' using errcode = '23514';
  end if;

  if v_q.exclusive and (tg_op = 'INSERT' or new.option_id is distinct from old.option_id) then
    -- Two players tapping the same picture at once: one waits for the other.
    perform pg_advisory_xact_lock(hashtextextended('table_question:' || v_q.id::text, 0));
    if exists (
      select 1 from public.table_question_answers a
       where a.question_id = v_q.id and a.option_id = new.option_id and a.id <> new.id
    ) then
      raise exception 'Someone has already chosen that one' using errcode = '23505';
    end if;
  end if;

  -- A gift: what was picked becomes the character's, as the player (this function
  -- is invoker, so the pack and companion policies hold exactly as for a hand edit).
  if v_q.gift and tg_op = 'INSERT' then
    if new.party_member_id is null then
      raise exception 'A gift goes to a character' using errcode = '23514';
    end if;
    -- One gift per member, judged before granting: an upsert fires this BEFORE
    -- INSERT on the proposed row and only then finds the conflict and turns into
    -- an update, so without this a replayed upsert would grant again each time
    -- (found in the pre-push audit). The lock makes a second, concurrent first
    -- answer wait and then see the first.
    perform pg_advisory_xact_lock(hashtextextended('table_gift:' || v_q.id::text || ':' || new.user_id::text, 0));
    if exists (
      select 1 from public.table_question_answers a where a.question_id = v_q.id and a.user_id = new.user_id
    ) then
      raise exception 'A gift is yours to keep' using errcode = '42501';
    end if;
    select o into v_option from jsonb_array_elements(v_q.options) o where o ->> 'id' = new.option_id;
    v_ref_kind := v_option -> 'ref' ->> 'kind';
    v_ref_id := v_option -> 'ref' ->> 'id';
    if v_ref_kind = 'item' then
      insert into public.party_inventory (campaign_id, user_id, name, quantity, carried_by, location, item_id, library_item_id)
      values (
        v_q.campaign_id, new.user_id, v_option ->> 'label', 1, new.party_member_id, 'backpack',
        -- A campaign item is a uuid, a library item a text id (the #597 split).
        case when v_ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_ref_id::uuid end,
        case when v_ref_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_ref_id end)
      returning id into new.inventory_item_id;
    elsif v_ref_kind in ('monster', 'npc') then
      -- A creature is a pet and an NPC an ally. The stats are placeholders the DM
      -- tunes, and neither fights until the DM makes it combat-ready.
      insert into public.companions (
        campaign_id, user_id, name, companion_type, source_type, source_monster_id, source_npc_id,
        owner_party_member_id, combat_ready, portrait_url, portrait_focal_point)
      values (
        v_q.campaign_id, new.user_id, v_option ->> 'label',
        (case when v_ref_kind = 'monster' then 'pet' else 'ally' end)::public.companion_type,
        v_ref_kind::public.companion_source_type,
        case when v_ref_kind = 'monster' then v_ref_id end,
        case when v_ref_kind = 'npc' then v_ref_id::uuid end,
        new.party_member_id, false, v_option ->> 'image_url', v_option -> 'focal')
      returning id into new.companion_id;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_table_question_answer() from public, anon, authenticated;

-- Named to run before zz_same_campaign_refs, which needs the campaign it fills in.
create trigger table_question_answers_guard
  before insert or update or delete on public.table_question_answers
  for each row execute procedure private.guard_table_question_answer();

create trigger zz_same_campaign_refs
  before insert or update of question_id, party_member_id, companion_id, inventory_item_id, campaign_id
  on public.table_question_answers
  for each row execute procedure private.enforce_same_campaign_refs(
    'question_id', 'table_questions', 'owned',
    'party_member_id', 'party_members', 'owned',
    'companion_id', 'companions', 'owned',
    'inventory_item_id', 'party_inventory', 'owned');

-- The DM taking a gift's answer back takes back what it gave, so the player can choose
-- again. After the delete, so the rows' own "on delete set null" never touches the
-- answer mid-delete; and only while the question stands, so deleting the question
-- (which cascades here) leaves the party what it was given.
create function private.take_back_table_gift()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  if not exists (select 1 from public.table_questions q where q.id = old.question_id and q.gift) then
    return null;
  end if;
  if old.companion_id is not null then
    delete from public.companions where id = old.companion_id;
  end if;
  if old.inventory_item_id is not null then
    delete from public.party_inventory where id = old.inventory_item_id;
  end if;
  return null;
end;
$$;

revoke execute on function private.take_back_table_gift() from public, anon, authenticated;

create trigger table_question_answers_take_back
  after delete on public.table_question_answers
  for each row execute procedure private.take_back_table_gift();

-- Whether the caller may read the other members' answers to this question: they sit
-- at its table, and it is not a hidden vote still open. Total: exists() is never NULL.
create function private.can_see_table_answers(p_question_id uuid)
returns boolean
language sql
stable
security invoker
set search_path to ''
as $$
  select exists (
    select 1 from public.table_questions q
     where q.id = p_question_id
       and private.is_campaign_member(q.campaign_id)
       and (not q.hidden or q.closed_at is not null)
  );
$$;

revoke execute on function private.can_see_table_answers(uuid) from public, anon;
grant execute on function private.can_see_table_answers(uuid) to authenticated, service_role;

alter table public.table_question_answers enable row level security;

create policy "table_question_answers_select" on public.table_question_answers for select
  using (
    (select auth.uid()) = user_id
    or private.is_campaign_dm(campaign_id)
    or private.can_see_table_answers(question_id)
  );
create policy "table_question_answers_insert" on public.table_question_answers for insert
  with check ((select auth.uid()) = user_id and private.is_campaign_member(campaign_id));
create policy "table_question_answers_update" on public.table_question_answers for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and private.is_campaign_member(campaign_id));
create policy "table_question_answers_delete" on public.table_question_answers for delete
  using ((select auth.uid()) = user_id or private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.table_question_answers to authenticated, service_role;

create trigger table_question_answers_signal_insert after insert on public.table_question_answers referencing new table as changed
  for each statement execute function public.signal_campaign_change();
create trigger table_question_answers_signal_update after update on public.table_question_answers referencing old table as left_rows new table as changed
  for each statement execute function public.signal_campaign_change();
create trigger table_question_answers_signal_delete after delete on public.table_question_answers referencing old table as changed
  for each statement execute function public.signal_campaign_change();

insert into private.demo_campaign_tables (table_name, tier, copy, reason)
values ('table_question_answers', 1, false, 'play state: the players'' answers to a question');

-- A gift question shows the campaign the items it offers, so the pack's disclosure
-- guard (#964, 20261003230336) lets a picked gift land there. Restated whole from
-- that migration with one clause added at the end.
create or replace function private.item_shown_to_campaign(p_item uuid, p_campaign uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  select coalesce(p_item is not null and p_campaign is not null and (select auth.uid()) is not null and (
    private.is_campaign_member(p_campaign)
  ) and (
    exists (select 1 from public.items i where i.id = p_item and i.user_id = (select auth.uid()))
    or exists (
      select 1 from public.party_inventory pi
      where pi.campaign_id = p_campaign and pi.item_id = p_item
    )
    or exists (
      select 1
      from public.store_items si
      join public.locations l on l.id = si.location_id
      join public.campaign_members cm on cm.campaign_id = l.campaign_id
      where si.item_id = p_item
        and si.visible
        and l.is_inventory_shared
        and l.campaign_id = p_campaign
        and cm.user_id = (select auth.uid())
        and cm.party_member_id = any (l.player_visible_to)
    )
    or exists (
      select 1 from public.crafting_recipes r
      where r.campaign_id = p_campaign
        and (
          exists (select 1 from public.crafting_recipe_outputs o where o.recipe_id = r.id and o.item_id = p_item)
          or exists (select 1 from public.crafting_recipe_ingredients g where g.recipe_id = r.id and g.item_id = p_item)
        )
    )
    or exists (
      select 1 from public.campaign_messages m
      where m.campaign_id = p_campaign
        and m.type in ('item_drop', 'vendor_offer', 'player_offer', 'loot_chest')
        and (m.recipient_user_id is null
             or m.recipient_user_id = (select auth.uid())
             or m.user_id = (select auth.uid()))
        and p_item in (select private.message_item_ids(m.metadata))
    )
    -- A gift question offering it (#1212): only the DM writes questions, and the
    -- item must be the asking DM's own, so this shows only what the DM chose to.
    or exists (
      select 1
      from public.table_questions q
      join public.items i on i.id = p_item and i.user_id = q.user_id
      where q.campaign_id = p_campaign
        and q.gift
        and exists (
          select 1 from jsonb_array_elements(q.options) o
          where o -> 'ref' ->> 'kind' = 'item' and o -> 'ref' ->> 'id' = p_item::text
        )
    )
  ), false);
$function$;

revoke execute on function private.item_shown_to_campaign(uuid, uuid) from public, anon;
grant execute on function private.item_shown_to_campaign(uuid, uuid) to authenticated, service_role;
