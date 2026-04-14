-- Fix party_members rows where `race` accidentally got the species UUID
-- written into it instead of the species name.
--
-- Root cause: `PartyMemberForm.vue` piped EntityCombobox's `opt.id` (species
-- UUID) straight into `f.race` via `@update:model-value`. The dashboard renders
-- `member.race` as a plain string, so those rows showed as a UUID. The form
-- is fixed in this PR to write the species *name* into `race` and the UUID
-- into `species_id`; this migration cleans up any rows already damaged.

UPDATE party_members pm
SET
  race       = sp.name,
  species_id = sp.id
FROM species sp
WHERE pm.race = sp.id::text
  AND pm.race ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Also backfill species_id for rows that have a clean `race` (by name) but no
-- species_id yet — makes the combobox pre-select after this deploy.
UPDATE party_members pm
SET species_id = sp.id
FROM species sp
WHERE pm.species_id IS NULL
  AND pm.race IS NOT NULL
  AND pm.race = sp.name;
