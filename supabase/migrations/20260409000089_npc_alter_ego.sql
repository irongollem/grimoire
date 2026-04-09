-- NPC Alter Ego: disguise name, portrait, and reveal state
-- Lets a DM give an NPC a false identity (name + portrait) that shows by default
-- until the DM marks them as revealed.

alter table npcs
  add column disguise_name              text,
  add column disguise_portrait_url      text,
  add column disguise_portrait_focal_point jsonb,
  add column is_revealed                boolean not null default false;
