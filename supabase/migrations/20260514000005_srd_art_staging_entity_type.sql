-- Migration: srd_art_staging_entity_type
-- Add entity_type column so monster and spell staging queues are separate

alter table srd_art_staging
  add column entity_type text not null default 'monster'
    check (entity_type in ('monster', 'spell'));
