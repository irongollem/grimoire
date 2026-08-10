-- Supabase resets load seed data after all migrations. This file sorts after
-- the optional, gitignored seed.sql when the seed*.sql glob is expanded.
-- Re-run the idempotent projection so locally seeded quests receive the same
-- overview and encounter staging beats as rows present during deployment.
select private.backfill_quest_story_flows(false);
