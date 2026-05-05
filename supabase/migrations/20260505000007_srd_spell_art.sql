-- Migration: srd_spell_art
-- Per-user art overrides for SRD spells, mirroring the srd_monster_art pattern

create table "public"."srd_spell_art" (
  "id"                   uuid default gen_random_uuid() not null,
  "user_id"              uuid not null,
  "srd_id"               text not null,
  "image_url"            text,
  "portrait_focal_point" jsonb,
  "is_canonical"         boolean default false not null,
  "updated_at"           timestamp with time zone default now() not null
);

alter table "public"."srd_spell_art" owner to postgres;

alter table only "public"."srd_spell_art"
  add constraint "srd_spell_art_pkey" primary key ("id");

alter table only "public"."srd_spell_art"
  add constraint "srd_spell_art_user_id_srd_id_key" unique ("user_id", "srd_id");

alter table only "public"."srd_spell_art"
  add constraint "srd_spell_art_user_id_fkey" foreign key ("user_id") references auth.users(id) on delete cascade;

create trigger srd_spell_art_updated_at
  before update on srd_spell_art
  for each row execute procedure update_updated_at();

alter table "public"."srd_spell_art" enable row level security;

create policy "srd_spell_art_select" on "public"."srd_spell_art"
  for select using (auth.uid() = user_id);

create policy "srd_spell_art_campaign_member_select" on "public"."srd_spell_art"
  for select using (
    auth.uid() = user_id
    or exists (
      select 1
      from campaign_members cm_player
      join campaign_members cm_owner
        on cm_owner.campaign_id = cm_player.campaign_id
        and cm_owner.user_id = srd_spell_art.user_id
      where cm_player.user_id = auth.uid()
    )
  );

create policy "srd_spell_art_canonical_select" on "public"."srd_spell_art"
  for select using (is_canonical = true and auth.uid() is not null);

create policy "srd_spell_art_insert" on "public"."srd_spell_art"
  for insert with check (auth.uid() = user_id);

create policy "srd_spell_art_update" on "public"."srd_spell_art"
  for update using (auth.uid() = user_id);

create policy "srd_spell_art_delete" on "public"."srd_spell_art"
  for delete using (auth.uid() = user_id);
