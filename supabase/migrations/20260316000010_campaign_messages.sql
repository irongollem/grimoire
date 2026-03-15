-- Campaign chat messages
create table public.campaign_messages (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id     uuid not null references auth.users(id),
  sender_name text,            -- denormalised display name at time of send
  message     text not null,
  type        text not null default 'chat' check (type in ('chat', 'roll', 'system')),
  metadata    jsonb,           -- roll results: { label, total, breakdown, modifier, isCrit, isFumble }
  created_at  timestamptz default now()
);

create index campaign_messages_campaign_id_created_at
  on public.campaign_messages (campaign_id, created_at desc);

alter table public.campaign_messages enable row level security;

-- Campaign members can read all messages in their campaign
create policy "campaign_messages_select" on public.campaign_messages
  for select using (public.is_campaign_member(campaign_id));

-- Campaign members can insert their own messages
create policy "campaign_messages_insert" on public.campaign_messages
  for insert with check (
    auth.uid() = user_id
    and public.is_campaign_member(campaign_id)
  );

-- Users can delete their own messages
create policy "campaign_messages_delete" on public.campaign_messages
  for delete using (auth.uid() = user_id);

-- Enable realtime for this table
alter publication supabase_realtime add table public.campaign_messages;
