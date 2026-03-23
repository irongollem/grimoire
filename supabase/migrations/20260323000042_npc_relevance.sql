-- Add relevance rating (1–5) to NPCs. 5 = pivotal character, 1 = background/one-off.
-- Default 3 so existing NPCs are mid-range rather than high or low.
alter table npcs
  add column relevance smallint not null default 3
    check (relevance between 1 and 5);
