-- Migration: drop_image_migration_rpcs
-- Remove the one-shot RPCs used by the PNG→WebP migration and orphan cleanup
-- now that the migration has completed. Re-add via git history if ever needed.

drop function if exists migrate_image_url(text, text);
drop function if exists find_orphan_image_urls(text[]);
drop function if exists image_url_referenced(text);
