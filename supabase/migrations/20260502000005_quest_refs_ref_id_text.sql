-- Migration: quest_refs_ref_id_text
-- Change ref_id from uuid to text so SRD monster slugs (e.g. "srd_winter_wolf") can be stored alongside UUID refs

alter table quest_refs alter column ref_id type text using ref_id::text;
