-- Migration: vtt_show_tokens_to_players
-- Campaign-level toggle for hiding all tokens from the player battle map
-- view. Default true preserves today's behaviour. Useful for in-person
-- sessions where the DM uses the VTT for map + fog of war only and runs
-- combat with physical miniatures or theater of the mind.

alter table campaigns
  add column if not exists battle_map_show_tokens boolean not null default true;
