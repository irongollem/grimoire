create table class_features (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  campaign_id  uuid references campaigns,   -- null = available across all campaigns

  name         text not null,
  description  text,                        -- Tiptap JSON string (rich text)
  feature_type text not null default 'passive',
                                            -- 'passive' | 'active' | 'reaction' | 'bonus_action' | 'legendary'
  source       text,                        -- 'PHB', 'XGtE', 'Homebrew', etc.
  tags         text[] not null default '{}',

  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create trigger class_features_updated_at
  before update on class_features
  for each row execute procedure update_updated_at();

alter table class_features enable row level security;

create policy "class_features_select" on class_features for select using (auth.uid() = user_id);
create policy "class_features_insert" on class_features for insert with check (auth.uid() = user_id);
create policy "class_features_update" on class_features for update using (auth.uid() = user_id);
create policy "class_features_delete" on class_features for delete using (auth.uid() = user_id);
