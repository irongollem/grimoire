-- A [secret] block has a stable id, and an NPC memory can name the one it
-- discloses (#1053, split from #1019).
--
-- A secret block (#932) was a bare `secretBlock` node: nothing identified one,
-- so "Bram told them the vault is under the chapel" could not point at the
-- chapel's secret, and "the party knows this now" was not data. Now:
--
-- 1. Every secret block carries `attrs.secretId`, a uuid. The editor mints it
--    when the block is made (or pasted, or duplicated) so the open editor holds
--    the id it will save; see src/lib/tiptap/secretBlock.ts. This trigger is
--    the net under every other way in (a markdown import, a hand-written
--    value, an editor older than the id): it stamps a block that has no id, or
--    one it shares with an earlier block of the same document, and leaves a
--    value that needs nothing byte for byte. The editor is the source because
--    every editor here keeps its own document after a save and never reloads
--    the server's (useRecordDraft), so an id the server alone minted would be
--    missing from the open editor and replaced by a new one on its next save.
-- 2. Existing blocks are stamped once below. On 13 Oct 2026 production held
--    none, so this touches no row there.
-- 3. `npc_memories` gains the reference: the entity (type and id) and the
--    block's id, all three or none. The entity must belong to the memory's own
--    campaign. The block itself is not checked: the DM may rewrite or delete
--    it later, and the memory then shows a secret that is no longer there
--    rather than failing the DM's edit.
-- 4. `list_campaign_secrets(campaign)` lists a campaign's secret blocks with a
--    short plain-text excerpt, for the memory form's picker. DM only.
--
-- A player reading a shared memory row sees the three reference columns: ids,
-- never the secret's text, which the projections still strip (20261007092700).

-- ── 1. Stamping ──────────────────────────────────────────────────────────────

-- Recursive over the node tree, carrying the ids already used so a duplicate
-- (a block copied within the document) gets a fresh one. This is the last
-- resort: the server cannot tell a paste from the original, so the first
-- occurrence keeps the id by position. The editor strips ids from pasted
-- slices (src/lib/tiptap/secretBlock.ts), so a copy normally arrives id-less
-- and the original keeps its own wherever the copy lands. Children are only
-- ever under `content`, as in private.strip_secret_nodes.
create function private.stamp_secret_nodes(p_node jsonb, p_seen text[], out node jsonb, out seen text[])
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_id    text;
  v_kids  jsonb := '[]'::jsonb;
  v_child jsonb;
begin
  node := p_node;
  seen := p_seen;
  if jsonb_typeof(p_node) is distinct from 'object' then
    return;
  end if;

  if node ->> 'type' = 'secretBlock' then
    v_id := node #>> '{attrs,secretId}';
    if v_id is null
       or v_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or v_id = any (seen) then
      v_id := gen_random_uuid()::text;
      node := node || jsonb_build_object('attrs',
        (case when jsonb_typeof(node -> 'attrs') = 'object' then node -> 'attrs' else '{}'::jsonb end)
        || jsonb_build_object('secretId', v_id));
    end if;
    seen := seen || v_id;
  end if;

  if jsonb_typeof(node -> 'content') = 'array' then
    for v_child in
      select e.child from jsonb_array_elements(node -> 'content') with ordinality as e(child, ord) order by e.ord
    loop
      select s.node, s.seen into v_child, seen from private.stamp_secret_nodes(v_child, seen) s;
      v_kids := v_kids || jsonb_build_array(v_child);
    end loop;
    node := jsonb_set(node, '{content}', v_kids);
  end if;
end;
$$;

-- A stored Tiptap JSON string with every secret block holding its own id.
-- Anything that is not a parseable document, or holds no secret block, or
-- whose blocks already have distinct ids, comes back unchanged.
create function private.stamp_secret_ids(p_value text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_doc jsonb;
  v_ids text[];
  v_out jsonb;
begin
  if p_value is null or p_value !~ '^\s*{' or position('secretBlock' in p_value) = 0 then
    return p_value;
  end if;
  begin
    v_doc := p_value::jsonb;
  exception when others then
    return p_value;
  end;

  select array_agg(b #>> '{attrs,secretId}')
    into v_ids
    from jsonb_path_query(v_doc, 'strict $.** ? (@.type == "secretBlock")') b;
  if v_ids is null
     or (array_position(v_ids, null) is null
         and not exists (select 1 from unnest(v_ids) i
                          where i !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
         and cardinality(v_ids) = (select count(distinct i) from unnest(v_ids) i)) then
    return p_value;
  end if;

  select s.node into v_out from private.stamp_secret_nodes(v_doc, '{}'::text[]) s;
  return v_out::text;
end;
$$;

-- The trigger: its arguments name the rich-text columns of the table.
create function private.stamp_secret_block_ids()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row   jsonb := to_jsonb(new);
  v_patch jsonb := '{}'::jsonb;
  v_col   text;
  v_old   text;
  v_new   text;
begin
  foreach v_col in array tg_argv loop
    v_old := v_row ->> v_col;
    v_new := private.stamp_secret_ids(v_old);
    if v_new is distinct from v_old then
      v_patch := v_patch || jsonb_build_object(v_col, v_new);
    end if;
  end loop;
  if v_patch = '{}'::jsonb then
    return new;
  end if;
  return jsonb_populate_record(new, v_patch);
end;
$$;

-- A trigger function needs no EXECUTE grant. The two helpers keep theirs: the
-- trigger runs as the writer, who must be able to call them, and `private` is
-- not exposed over PostgREST.
revoke execute on function private.stamp_secret_block_ids() from public, anon, authenticated;

-- Every column the player projections strip (20261007092700), so the two
-- lists stay the same list.
create trigger locations_stamp_secret_ids
  before insert or update of description on public.locations
  for each row execute procedure private.stamp_secret_block_ids('description');
create trigger items_stamp_secret_ids
  before insert or update of description, mundane_description, curse_description, content on public.items
  for each row execute procedure private.stamp_secret_block_ids('description', 'mundane_description', 'curse_description', 'content');
create trigger puzzle_rooms_stamp_secret_ids
  before insert or update of description, read_aloud on public.puzzle_rooms
  for each row execute procedure private.stamp_secret_block_ids('description', 'read_aloud');
create trigger notes_stamp_secret_ids
  before insert or update of content on public.notes
  for each row execute procedure private.stamp_secret_block_ids('content');
create trigger factions_stamp_secret_ids
  before insert or update of description on public.factions
  for each row execute procedure private.stamp_secret_block_ids('description');

-- ── 2. The blocks already written ────────────────────────────────────────────

update public.locations set description = private.stamp_secret_ids(description)
 where description like '%secretBlock%';
update public.items
   set description = private.stamp_secret_ids(description),
       mundane_description = private.stamp_secret_ids(mundane_description),
       curse_description = private.stamp_secret_ids(curse_description),
       content = private.stamp_secret_ids(content)
 where concat(description, mundane_description, curse_description, content) like '%secretBlock%';
update public.puzzle_rooms
   set description = private.stamp_secret_ids(description),
       read_aloud = private.stamp_secret_ids(read_aloud)
 where concat(description, read_aloud) like '%secretBlock%';
update public.notes set content = private.stamp_secret_ids(content)
 where content like '%secretBlock%';
update public.factions set description = private.stamp_secret_ids(description)
 where description like '%secretBlock%';

-- ── 3. A memory names the secret it discloses ────────────────────────────────

alter table public.npc_memories
  add column secret_entity_type text
    check (secret_entity_type in ('location', 'item', 'puzzle', 'note', 'faction')),
  add column secret_entity_id uuid,
  add column secret_id uuid,
  add constraint npc_memories_secret_ref_whole
    check (num_nulls(secret_entity_type, secret_entity_id, secret_id) in (0, 3));

create index npc_memories_secret_id_idx on public.npc_memories (secret_id) where secret_id is not null;

-- The normalize trigger (20261012105632) learns the reference: the entity must
-- be one of the memory's own campaign. As a definer it can see the entity
-- whoever made it, and it still decides nothing about the writer: RLS does.
create or replace function private.normalize_npc_memory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is not null then
    new.user_id := old.user_id;
  end if;
  select n.campaign_id into new.campaign_id from public.npcs n where n.id = new.npc_id;
  if new.campaign_id is null then
    raise exception 'A memory belongs to an NPC in a campaign';
  end if;
  new.body := btrim(new.body);
  new.party_member_ids := array(
    select pm.id from public.party_members pm
     where pm.campaign_id = new.campaign_id and pm.id = any (new.party_member_ids)
     order by pm.id);
  new.player_visible_to := array(
    select pm.id from public.party_members pm
     where pm.campaign_id = new.campaign_id and pm.id = any (new.player_visible_to)
     order by pm.id);
  if new.secret_entity_id is not null and not (
    case new.secret_entity_type
      when 'location' then exists (select 1 from public.locations x where x.id = new.secret_entity_id and x.campaign_id = new.campaign_id)
      when 'item'     then exists (select 1 from public.items x where x.id = new.secret_entity_id and x.campaign_id = new.campaign_id)
      when 'puzzle'   then exists (select 1 from public.puzzle_rooms x where x.id = new.secret_entity_id and x.campaign_id = new.campaign_id)
      when 'note'     then exists (select 1 from public.notes x where x.id = new.secret_entity_id and x.campaign_id = new.campaign_id)
      when 'faction'  then exists (select 1 from public.factions x where x.id = new.secret_entity_id and x.campaign_id = new.campaign_id)
      else false
    end) then
    raise exception 'A memory can only disclose a secret from its own campaign';
  end if;
  return new;
end;
$$;
revoke execute on function private.normalize_npc_memory() from public, anon, authenticated;

-- ── 4. The campaign's secrets, for the picker ───────────────────────────────

-- The secret blocks of one stored document, each with a short plain-text
-- excerpt. Unparseable or legacy values hold none.
create function private.secret_blocks_in(p_value text)
returns table (secret_id uuid, excerpt text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_doc jsonb;
begin
  if p_value is null or p_value !~ '^\s*{' or position('secretBlock' in p_value) = 0 then
    return;
  end if;
  begin
    v_doc := p_value::jsonb;
  exception when others then
    return;
  end;
  return query
    select (b #>> '{attrs,secretId}')::uuid,
           left(btrim(regexp_replace(
             coalesce((select string_agg(t #>> '{}', ' ') from jsonb_path_query(b, 'strict $.**.text') t), ''),
             '\s+', ' ', 'g')), 160)
      from jsonb_path_query(v_doc, 'strict $.** ? (@.type == "secretBlock")') b
     where b #>> '{attrs,secretId}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
end;
$$;

-- Invoker: the DM reads their own rows through RLS like any other read, and
-- the check below keeps a player out even of rows a policy would show them,
-- since an excerpt is the secret's own text.
create function public.list_campaign_secrets(p_campaign_id uuid)
returns table (entity_type text, entity_id uuid, entity_name text, field text, secret_id uuid, excerpt text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;
  return query
    select q.entity_type, q.entity_id, q.entity_name, q.field, q.secret_id, q.excerpt
      from (
        select 'location'::text as entity_type, x.id as entity_id, x.name as entity_name, 'description'::text as field, s.secret_id, s.excerpt
          from public.locations x cross join lateral private.secret_blocks_in(x.description) s
         where x.campaign_id = p_campaign_id
        union all
        select 'item', x.id, x.name, f.field, s.secret_id, s.excerpt
          from public.items x
         cross join lateral (values ('description', x.description), ('mundane_description', x.mundane_description),
                                    ('curse_description', x.curse_description), ('content', x.content)) f(field, value)
         cross join lateral private.secret_blocks_in(f.value) s
         where x.campaign_id = p_campaign_id
        union all
        select 'puzzle', x.id, x.name, f.field, s.secret_id, s.excerpt
          from public.puzzle_rooms x
         cross join lateral (values ('description', x.description), ('read_aloud', x.read_aloud)) f(field, value)
         cross join lateral private.secret_blocks_in(f.value) s
         where x.campaign_id = p_campaign_id
        union all
        select 'note', x.id, x.title, 'content', s.secret_id, s.excerpt
          from public.notes x cross join lateral private.secret_blocks_in(x.content) s
         where x.campaign_id = p_campaign_id
        union all
        select 'faction', x.id, x.name, 'description', s.secret_id, s.excerpt
          from public.factions x cross join lateral private.secret_blocks_in(x.description) s
         where x.campaign_id = p_campaign_id
      ) q
     order by q.entity_type, q.entity_name, q.secret_id;
end;
$$;

revoke execute on function public.list_campaign_secrets(uuid) from public, anon;
grant execute on function public.list_campaign_secrets(uuid) to authenticated, service_role;
