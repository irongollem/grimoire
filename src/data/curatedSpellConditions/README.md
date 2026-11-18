# Readings of the spell conditions pass

One JSON file per reader (`claude.json`, `gpt.json`), spell id to entry, in the shape of `src/lib/library/curatedSpellConditions.ts`. The procedure is the `/spell-conditions-pass` skill. Nothing here is used until two readings agree (`npm run spells:conditions -- check`).
