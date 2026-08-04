-- Migration: player_visible_minis
-- Restore the player-facing mini reveal (#612) that 20260718000007 broke.
--
-- That migration was right to narrow `minis_select` to the DM: the previous
-- `is_campaign_member` branch handed players every sculpt in the campaign,
-- including secret NPCs and unencountered monsters. But it also killed the
-- feature `MiniPortraitOverlay` exists for, so players have been unable to see
-- a mini of their own character since.
--
-- `minis_select` therefore stays exactly as hardened. Players instead read a
-- narrow projection through this SECURITY DEFINER RPC, which gates each source
-- type on what that player has already been shown, and which never returns the
-- job/credit columns (`meshy_task_id`, `credits_spent`, `reservation_ids`,
-- `sculpt_count`, `error`, `poll_*`) that are the DM's business alone.

create or replace function public.get_player_visible_mini(
  p_source_table text,
  p_source_id uuid
)
returns table (
  id uuid,
  campaign_id uuid,
  source_table text,
  source_id uuid,
  format text,
  status text,
  provider text,
  glb_path text,
  stl_path text,
  thumbnail_url text,
  label text,
  base_id text,
  scale_mm integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.campaign_id,
    m.source_table,
    m.source_id,
    m.format,
    m.status,
    m.provider,
    m.glb_path,
    m.stl_path,
    m.thumbnail_url,
    -- `label` is the source entity's name snapshotted at forge time. An NPC can
    -- have a shared portrait but a hidden name (PlayerNpcCard renders "???"),
    -- so drop the label rather than the whole mini: the model is the portrait
    -- the player is already looking at, the name is a separate reveal.
    case
      when m.source_table = 'npcs'
        and not exists (
          select 1 from public.npcs n
          where n.id = m.source_id
            and 'name' = any (n.player_visible_fields)
        )
      then null
      else m.label
    end,
    m.base_id,
    m.scale_mm,
    m.created_at,
    m.updated_at
  from public.minis m
  where m.source_table = p_source_table
    and m.source_id = p_source_id
    -- In-flight and failed rows are job state, not a shareable artifact.
    and m.status = 'ready'
    and (
      -- Owner and DM keep full reach; this is also what makes the overlay work
      -- in DM preview mode, which renders the same player components.
      m.user_id = (select auth.uid())
      or (m.campaign_id is not null and private.is_campaign_dm(m.campaign_id))
      or (
        m.campaign_id is not null
        and private.is_campaign_member(m.campaign_id)
        and case m.source_table
          -- Party members: the party already sees every member's portrait.
          when 'party_members' then exists (
            select 1 from public.party_members pm
            where pm.id = m.source_id
              and pm.campaign_id = m.campaign_id
          )
          -- NPCs: shared with this player (individually or via a shared
          -- location), with the portrait among the shared fields, and NOT
          -- wearing an unrevealed disguise — the sculpt is of the true face, so
          -- a mini badge on a concealed NPC would blow the disguise that
          -- get_player_visible_npcs is careful to preserve.
          when 'npcs' then exists (
            select 1
            from public.get_player_visible_npcs(m.campaign_id) v
            join public.npcs n on n.id = v.id
            where v.id = m.source_id
              and 'portrait' = any (v.player_visible_fields)
              and not (
                (n.disguise_name is not null or n.disguise_portrait_url is not null)
                and not n.is_revealed
              )
          )
          -- Monsters: only creatures this player has discovered, or had a form
          -- pinned for them. Same rule as the player bestiary itself.
          when 'monsters' then exists (
            select 1 from public.get_player_visible_monsters(m.campaign_id) v
            where v.id = m.source_id
          )
          else false
        end
      )
    )
  order by m.created_at desc
  limit 1;
$$;

revoke execute on function public.get_player_visible_mini(text, uuid) from public, anon;
grant execute on function public.get_player_visible_mini(text, uuid) to authenticated, service_role;

comment on function public.get_player_visible_mini(text, uuid) is
  'Newest ready mini for a source entity, projected to the columns a player may '
  'see and gated on that player having been shown the entity. Powers '
  'MiniPortraitOverlay; the minis table itself stays DM-only (see #612).';
