-- Migration: rls_auth_uid_select_wrap
-- Wrap auth.uid() in (select ...) in all RLS policies so Postgres evaluates it once per query, not once per row

-- ── npcs ──────────────────────────────────────────────────────────────────────
drop policy if exists "Users see own npcs"    on npcs;
drop policy if exists "Users insert own npcs" on npcs;
drop policy if exists "Users update own npcs" on npcs;
drop policy if exists "Users delete own npcs" on npcs;
drop policy if exists "npcs_player_select"    on npcs;

create policy "Users see own npcs"    on npcs for select using ((select auth.uid()) = user_id);
create policy "Users insert own npcs" on npcs for insert with check ((select auth.uid()) = user_id);
create policy "Users update own npcs" on npcs for update using ((select auth.uid()) = user_id);
create policy "Users delete own npcs" on npcs for delete using ((select auth.uid()) = user_id);

create policy "npcs_player_select" on npcs for select using (
  campaign_id in (
    select campaign_id from campaign_members where user_id = (select auth.uid())
  )
  and exists (
    select 1 from campaign_members cm
    where cm.user_id = (select auth.uid())
      and cm.campaign_id = npcs.campaign_id
      and cm.party_member_id = any(npcs.player_visible_to)
  )
);

-- ── monsters ──────────────────────────────────────────────────────────────────
drop policy if exists "monsters: owner full access" on monsters;
drop policy if exists "monsters_player_select"      on monsters;

create policy "monsters: owner full access" on monsters
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "monsters_player_select" on monsters for select using (
  (select auth.uid()) = user_id
  or exists (
    select 1
    from discovered_monsters dm
    join campaign_members cm on cm.campaign_id = dm.campaign_id
      and cm.user_id = (select auth.uid())
    where dm.monster_id = monsters.id
  )
);

-- ── spells ────────────────────────────────────────────────────────────────────
drop policy if exists "spells_select" on spells;
drop policy if exists "spells_insert" on spells;
drop policy if exists "spells_update" on spells;
drop policy if exists "spells_delete" on spells;

create policy "spells_select" on spells for select using (
  (select auth.uid()) = user_id
  or exists (
    select 1
    from campaign_members cm_me
    join campaign_members cm_owner
      on cm_owner.campaign_id = cm_me.campaign_id
      and cm_owner.user_id = spells.user_id
    where cm_me.user_id = (select auth.uid())
  )
);
create policy "spells_insert" on spells for insert with check ((select auth.uid()) = user_id);
create policy "spells_update" on spells for update using ((select auth.uid()) = user_id);
create policy "spells_delete" on spells for delete using ((select auth.uid()) = user_id);

-- ── encounters ────────────────────────────────────────────────────────────────
drop policy if exists "owner select" on encounters;
drop policy if exists "owner insert" on encounters;
drop policy if exists "owner update" on encounters;
drop policy if exists "owner delete" on encounters;

create policy "owner select" on encounters for select using ((select auth.uid()) = user_id);
create policy "owner insert" on encounters for insert with check ((select auth.uid()) = user_id);
create policy "owner update" on encounters for update using ((select auth.uid()) = user_id);
create policy "owner delete" on encounters for delete using ((select auth.uid()) = user_id);

-- ── deities ───────────────────────────────────────────────────────────────────
drop policy if exists "deities_player_select" on deities;

create policy "deities_player_select" on deities for select using (
  public.is_campaign_member(campaign_id)
  and player_visible_to is not null
  and exists (
    select 1 from public.campaign_members cm
    where cm.user_id = (select auth.uid())
      and cm.role = 'player'
      and cm.party_member_id = any(deities.player_visible_to)
  )
);

-- ── pantheons ─────────────────────────────────────────────────────────────────
drop policy if exists "pantheons_player_select" on pantheons;

create policy "pantheons_player_select" on pantheons for select using (
  public.is_campaign_member(campaign_id)
  and player_visible_to is not null
  and exists (
    select 1 from public.campaign_members cm
    where cm.user_id = (select auth.uid())
      and cm.role = 'player'
      and cm.party_member_id = any(pantheons.player_visible_to)
  )
);

-- ── faction_deities ───────────────────────────────────────────────────────────
drop policy if exists "faction_deities_player_select" on faction_deities;

create policy "faction_deities_player_select" on faction_deities for select using (
  public.is_campaign_member(campaign_id)
  and (
    exists (
      select 1 from public.factions f
      where f.id = faction_deities.faction_id
        and f.player_visible_to is not null
        and exists (
          select 1 from public.campaign_members cm
          where cm.user_id = (select auth.uid())
            and cm.role = 'player'
            and cm.party_member_id = any(f.player_visible_to)
        )
    )
    or exists (
      select 1 from public.deities d
      where d.id = faction_deities.deity_id
        and d.player_visible_to is not null
        and exists (
          select 1 from public.campaign_members cm
          where cm.user_id = (select auth.uid())
            and cm.role = 'player'
            and cm.party_member_id = any(d.player_visible_to)
        )
    )
  )
);

-- ── player_favourites ─────────────────────────────────────────────────────────
drop policy if exists "player_favourites_select" on player_favourites;
drop policy if exists "player_favourites_insert" on player_favourites;
drop policy if exists "player_favourites_update" on player_favourites;
drop policy if exists "player_favourites_delete" on player_favourites;

create policy "player_favourites_select" on player_favourites for select using ((select auth.uid()) = user_id);
create policy "player_favourites_insert" on player_favourites for insert with check ((select auth.uid()) = user_id);
create policy "player_favourites_update" on player_favourites for update using ((select auth.uid()) = user_id);
create policy "player_favourites_delete" on player_favourites for delete using ((select auth.uid()) = user_id);

-- ── ai_credit_ledger ──────────────────────────────────────────────────────────
drop policy if exists "ai_credit_ledger_select" on ai_credit_ledger;

create policy "ai_credit_ledger_select" on ai_credit_ledger
  for select using ((select auth.uid()) = user_id);

-- ── calendar_events ───────────────────────────────────────────────────────────
drop policy if exists "calendar_events_player_select" on calendar_events;

create policy "calendar_events_player_select" on calendar_events
  for select using (
    campaign_id is not null
    and campaign_id in (
      select campaign_id from campaign_members where user_id = (select auth.uid())
    )
    and (player_visible = true or event_type = 'session')
  );

-- ── player_read_items ─────────────────────────────────────────────────────────
drop policy if exists "player_read_items_select" on player_read_items;
drop policy if exists "player_read_items_insert" on player_read_items;
drop policy if exists "player_read_items_update" on player_read_items;
drop policy if exists "player_read_items_delete" on player_read_items;

create policy "player_read_items_select" on player_read_items for select using ((select auth.uid()) = user_id);
create policy "player_read_items_insert" on player_read_items for insert with check ((select auth.uid()) = user_id);
create policy "player_read_items_update" on player_read_items for update using ((select auth.uid()) = user_id);
create policy "player_read_items_delete" on player_read_items for delete using ((select auth.uid()) = user_id);

-- ── quest_triggers ────────────────────────────────────────────────────────────
drop policy if exists "quest_triggers_select" on quest_triggers;
drop policy if exists "quest_triggers_insert" on quest_triggers;
drop policy if exists "quest_triggers_update" on quest_triggers;
drop policy if exists "quest_triggers_delete" on quest_triggers;

create policy "quest_triggers_select" on quest_triggers for select using ((select auth.uid()) = user_id);
create policy "quest_triggers_insert" on quest_triggers for insert with check ((select auth.uid()) = user_id);
create policy "quest_triggers_update" on quest_triggers for update using ((select auth.uid()) = user_id);
create policy "quest_triggers_delete" on quest_triggers for delete using ((select auth.uid()) = user_id);

-- ── quest_trigger_scheduled ───────────────────────────────────────────────────
drop policy if exists "quest_trigger_scheduled_select" on quest_trigger_scheduled;
drop policy if exists "quest_trigger_scheduled_insert" on quest_trigger_scheduled;
drop policy if exists "quest_trigger_scheduled_update" on quest_trigger_scheduled;
drop policy if exists "quest_trigger_scheduled_delete" on quest_trigger_scheduled;

create policy "quest_trigger_scheduled_select" on quest_trigger_scheduled for select using ((select auth.uid()) = user_id);
create policy "quest_trigger_scheduled_insert" on quest_trigger_scheduled for insert with check ((select auth.uid()) = user_id);
create policy "quest_trigger_scheduled_update" on quest_trigger_scheduled for update using ((select auth.uid()) = user_id);
create policy "quest_trigger_scheduled_delete" on quest_trigger_scheduled for delete using ((select auth.uid()) = user_id);

-- ── soundboard_pages ──────────────────────────────────────────────────────────
drop policy if exists "soundboard_pages_select" on soundboard_pages;
drop policy if exists "soundboard_pages_insert" on soundboard_pages;
drop policy if exists "soundboard_pages_update" on soundboard_pages;
drop policy if exists "soundboard_pages_delete" on soundboard_pages;

create policy "soundboard_pages_select" on soundboard_pages for select using ((select auth.uid()) = user_id);
create policy "soundboard_pages_insert" on soundboard_pages for insert with check ((select auth.uid()) = user_id);
create policy "soundboard_pages_update" on soundboard_pages for update using ((select auth.uid()) = user_id);
create policy "soundboard_pages_delete" on soundboard_pages for delete using ((select auth.uid()) = user_id);

-- ── srd_spell_art ─────────────────────────────────────────────────────────────
drop policy if exists "srd_spell_art_select"                  on srd_spell_art;
drop policy if exists "srd_spell_art_campaign_member_select"  on srd_spell_art;
drop policy if exists "srd_spell_art_canonical_select"        on srd_spell_art;
drop policy if exists "srd_spell_art_insert"                  on srd_spell_art;
drop policy if exists "srd_spell_art_update"                  on srd_spell_art;
drop policy if exists "srd_spell_art_delete"                  on srd_spell_art;

create policy "srd_spell_art_select" on srd_spell_art
  for select using ((select auth.uid()) = user_id);

create policy "srd_spell_art_campaign_member_select" on srd_spell_art
  for select using (
    (select auth.uid()) = user_id
    or exists (
      select 1
      from campaign_members cm_player
      join campaign_members cm_owner
        on cm_owner.campaign_id = cm_player.campaign_id
        and cm_owner.user_id = srd_spell_art.user_id
      where cm_player.user_id = (select auth.uid())
    )
  );

create policy "srd_spell_art_canonical_select" on srd_spell_art
  for select using (is_canonical = true and (select auth.uid()) is not null);

create policy "srd_spell_art_insert" on srd_spell_art
  for insert with check ((select auth.uid()) = user_id);

create policy "srd_spell_art_update" on srd_spell_art
  for update using ((select auth.uid()) = user_id);

create policy "srd_spell_art_delete" on srd_spell_art
  for delete using ((select auth.uid()) = user_id);

-- ── user_subscriptions ────────────────────────────────────────────────────────
drop policy if exists "user_subscriptions_select_own" on user_subscriptions;

create policy "user_subscriptions_select_own" on user_subscriptions
  for select using ((select auth.uid()) = user_id);

-- ── character_classes ─────────────────────────────────────────────────────────
drop policy if exists "character_classes_select" on character_classes;
drop policy if exists "character_classes_insert" on character_classes;
drop policy if exists "character_classes_update" on character_classes;
drop policy if exists "character_classes_delete" on character_classes;

create policy "character_classes_select" on character_classes
  for select using (
    exists (
      select 1 from party_members pm
      where pm.id = character_classes.party_member_id
        and (pm.user_id = (select auth.uid()) or pm.owner_user_id = (select auth.uid()))
    )
  );

create policy "character_classes_insert" on character_classes
  for insert with check (
    exists (
      select 1 from party_members pm
      where pm.id = character_classes.party_member_id
        and (pm.user_id = (select auth.uid()) or pm.owner_user_id = (select auth.uid()))
    )
  );

create policy "character_classes_update" on character_classes
  for update using (
    exists (
      select 1 from party_members pm
      where pm.id = character_classes.party_member_id
        and (pm.user_id = (select auth.uid()) or pm.owner_user_id = (select auth.uid()))
    )
  );

create policy "character_classes_delete" on character_classes
  for delete using (
    exists (
      select 1 from party_members pm
      where pm.id = character_classes.party_member_id
        and (pm.user_id = (select auth.uid()) or pm.owner_user_id = (select auth.uid()))
    )
  );
