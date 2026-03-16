-- Campaign chat messages (group + private whispers)
create table public.campaign_messages (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references public.campaigns(id) on delete cascade,
  user_id             uuid not null references auth.users(id),
  recipient_user_id   uuid references auth.users(id),  -- null = group, non-null = private whisper
  sender_name         text,
  message             text not null,
  type                text not null default 'chat' check (type in ('chat', 'roll', 'system')),
  metadata            jsonb,  -- roll: { label, total, breakdown, modifier, isCrit, isFumble }
  created_at          timestamptz default now()
);

create index campaign_messages_campaign_created
  on public.campaign_messages (campaign_id, created_at desc);

alter table public.campaign_messages enable row level security;

-- Group messages: visible to all campaign members
-- Private messages: visible only to sender and recipient
create policy "campaign_messages_select" on public.campaign_messages
  for select using (
    public.is_campaign_member(campaign_id)
    and (
      recipient_user_id is null                          -- group message
      or auth.uid() = user_id                            -- sender
      or auth.uid() = recipient_user_id                  -- recipient
    )
  );

create policy "campaign_messages_insert" on public.campaign_messages
  for insert with check (
    auth.uid() = user_id
    and public.is_campaign_member(campaign_id)
  );

create policy "campaign_messages_delete" on public.campaign_messages
  for delete using (auth.uid() = user_id);

alter publication supabase_realtime add table public.campaign_messages;
