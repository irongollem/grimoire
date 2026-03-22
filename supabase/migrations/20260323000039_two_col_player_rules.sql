-- ── Scriptorium two-column layout ────────────────────────────────────────────
alter table scriptorium_documents
  add column if not exists is_two_column boolean not null default false;

-- ── Custom rules: player visibility ──────────────────────────────────────────
alter table rules
  add column if not exists is_player_visible boolean not null default false;

-- Players can read the DM's player-visible rules in their shared campaign
create policy "rules_player_select" on rules
  for select
  using (
    is_player_visible = true
    AND user_id IN (
      SELECT cm_dm.user_id
      FROM campaign_members cm_player
      JOIN campaign_members cm_dm
        ON cm_player.campaign_id = cm_dm.campaign_id
       AND cm_dm.role = 'dm'
      WHERE cm_player.user_id = auth.uid()
        AND cm_player.role = 'player'
    )
  );
