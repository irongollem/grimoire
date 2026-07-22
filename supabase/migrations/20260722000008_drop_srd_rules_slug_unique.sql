-- Migration: drop_srd_rules_slug_unique
-- srd_rules.slug carried a global UNIQUE from the pre-versioned era. The v2
-- sync writes raw Open5e keys as slugs for both editions, so any key shared
-- by the srd-2014 and srd-2024 documents would violate it even though row
-- identity is the (source_document_key, source_record_key) unique index from
-- 20260720000018. All readers filter by ruleset (useRules.ts), so per-edition
-- slug reuse is expected; the source-identity index remains the authority. (#562)

alter table public.srd_rules drop constraint if exists srd_rules_slug_key;
