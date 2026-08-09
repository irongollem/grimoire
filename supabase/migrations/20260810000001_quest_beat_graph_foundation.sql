-- Quest beats deliberately separate authored structure from live session state.
-- A beat is a narrative moment (not necessarily combat); edges describe possible
-- authored routes, while quest_runtime_state and quest_beat_transitions record
-- the route a campaign actually takes.

alter table public.quests
  add constraint quests_id_campaign_id_key unique (id, campaign_id);

create table public.quest_beats (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null,
  campaign_id uuid not null,
  title text not null default '',
  dm_content text,
  rumor_text text,
  reveal_text text,
  visibility text not null default 'hidden'
    check (visibility in ('hidden', 'rumored', 'revealed')),
  kind text not null default 'neutral'
    check (length(btrim(kind)) > 0),
  presentation_hint text,
  canvas_x double precision not null default 0,
  canvas_y double precision not null default 0,
  is_improvised boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quest_beats_quest_campaign_fkey
    foreign key (quest_id, campaign_id)
    references public.quests(id, campaign_id) on delete cascade,
  constraint quest_beats_id_quest_campaign_key unique (id, quest_id, campaign_id)
);

comment on column public.quest_beats.kind is
  'Presentation hint such as combat, social, explore, discovery, or neutral. It does not constrain attachments.';
comment on column public.quest_beats.dm_content is
  'DM-only narrative content. Player projections must never use this as fallback copy.';
comment on column public.quest_beats.rumor_text is
  'Explicit player-safe copy used only while the beat is rumored.';
comment on column public.quest_beats.reveal_text is
  'Explicit player-safe copy used only once the beat is revealed.';

create index quest_beats_quest_id_idx on public.quest_beats (quest_id);
create index quest_beats_campaign_id_idx on public.quest_beats (campaign_id);

create trigger set_quest_beats_updated_at
  before update on public.quest_beats
  for each row execute procedure public.update_updated_at();

create table public.quest_beat_edges (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null,
  campaign_id uuid not null,
  source_beat_id uuid not null,
  target_beat_id uuid not null,
  label text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint quest_beat_edges_not_self check (source_beat_id <> target_beat_id),
  constraint quest_beat_edges_source_fkey
    foreign key (source_beat_id, quest_id, campaign_id)
    references public.quest_beats(id, quest_id, campaign_id) on delete cascade,
  constraint quest_beat_edges_target_fkey
    foreign key (target_beat_id, quest_id, campaign_id)
    references public.quest_beats(id, quest_id, campaign_id) on delete cascade,
  constraint quest_beat_edges_route_key
    unique (quest_id, source_beat_id, target_beat_id, label)
);

create index quest_beat_edges_source_idx on public.quest_beat_edges (source_beat_id);
create index quest_beat_edges_target_idx on public.quest_beat_edges (target_beat_id);

-- There is one shared cursor per campaign, rather than one "current" flag per
-- beat or quest. This makes cross-quest jumps and co-DM handoff unambiguous.
create table public.quest_runtime_state (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  current_quest_id uuid,
  current_beat_id uuid,
  return_stack jsonb not null default '[]'::jsonb
    check (jsonb_typeof(return_stack) = 'array'),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quest_runtime_state_cursor_complete check (
    (current_quest_id is null and current_beat_id is null)
    or (current_quest_id is not null and current_beat_id is not null)
  ),
  constraint quest_runtime_state_current_fkey
    foreign key (current_beat_id, current_quest_id, campaign_id)
    references public.quest_beats(id, quest_id, campaign_id)
    on delete set null (current_beat_id, current_quest_id)
);

create trigger set_quest_runtime_state_updated_at
  before update on public.quest_runtime_state
  for each row execute procedure public.update_updated_at();

-- Each row represents entering a beat. A null `from` pair is the first visit;
-- subsequent rows preserve navigation intent and optional improv provenance.
create table public.quest_beat_transitions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  from_quest_id uuid,
  from_beat_id uuid,
  to_quest_id uuid not null,
  to_beat_id uuid not null,
  transition_kind text not null
    check (transition_kind in ('enter', 'forward', 'previous', 'jump', 'return', 'improv')),
  provenance jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provenance) = 'object'),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint quest_beat_transitions_from_complete check (
    (from_quest_id is null and from_beat_id is null)
    or (from_quest_id is not null and from_beat_id is not null)
  ),
  constraint quest_beat_transitions_from_fkey
    foreign key (from_beat_id, from_quest_id, campaign_id)
    references public.quest_beats(id, quest_id, campaign_id)
    on delete set null (from_beat_id, from_quest_id),
  constraint quest_beat_transitions_to_fkey
    foreign key (to_beat_id, to_quest_id, campaign_id)
    references public.quest_beats(id, quest_id, campaign_id) on delete cascade
);

create index quest_beat_transitions_campaign_created_idx
  on public.quest_beat_transitions (campaign_id, created_at desc);
create index quest_beat_transitions_to_beat_idx
  on public.quest_beat_transitions (to_beat_id);

alter table public.quest_beats enable row level security;
alter table public.quest_beat_edges enable row level security;
alter table public.quest_runtime_state enable row level security;
alter table public.quest_beat_transitions enable row level security;

create policy quest_beats_dm_all on public.quest_beats
  for all using (private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));

create policy quest_beat_edges_dm_all on public.quest_beat_edges
  for all using (private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));

create policy quest_runtime_state_dm_all on public.quest_runtime_state
  for all using (private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));

-- History is append-only for authenticated clients: there are deliberately no
-- UPDATE or DELETE policies. Cascades still permit campaign/quest erasure.
create policy quest_beat_transitions_dm_select on public.quest_beat_transitions
  for select using (private.is_campaign_dm(campaign_id));
create policy quest_beat_transitions_dm_insert on public.quest_beat_transitions
  for insert with check (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.quest_beats to authenticated;
grant select, insert, update, delete on public.quest_beat_edges to authenticated;
grant select, insert, update, delete on public.quest_runtime_state to authenticated;
grant select, insert on public.quest_beat_transitions to authenticated;

-- Players receive only explicit player-authored copy. The result intentionally
-- has no DM title/content columns, so a null rumor/reveal is rendered as null.
create or replace function public.get_player_visible_quest_beats(
  p_campaign_id uuid,
  p_quest_id uuid default null
)
returns table (
  id uuid,
  quest_id uuid,
  campaign_id uuid,
  visibility text,
  kind text,
  presentation_hint text,
  player_text text,
  updated_at timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select
    b.id,
    b.quest_id,
    b.campaign_id,
    b.visibility,
    b.kind,
    b.presentation_hint,
    case b.visibility
      when 'rumored' then b.rumor_text
      when 'revealed' then b.reveal_text
    end as player_text,
    b.updated_at
  from public.quest_beats b
  where b.campaign_id = p_campaign_id
    and (p_quest_id is null or b.quest_id = p_quest_id)
    and b.visibility in ('rumored', 'revealed')
    and private.is_quest_player_visible(b.quest_id);
$$;

revoke all on function public.get_player_visible_quest_beats(uuid, uuid) from public;
revoke execute on function public.get_player_visible_quest_beats(uuid, uuid) from anon;
grant execute on function public.get_player_visible_quest_beats(uuid, uuid) to authenticated;
