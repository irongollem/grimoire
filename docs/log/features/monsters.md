# Features — Monsters & Bestiary

Shipped features in the **Monsters & Bestiary** area, newest first. Part of the Grimoire feature log — see the [log index](../index.md).

- [x] Bestiary — monster builder with 12 SRD template presets + full SRD bundle

- [x] **Wildshape beast preview lightbox** — clicking a beast form in the wild shape picker now opens a full stat block preview (AC, HP, speed, abilities, special abilities, actions, bonus actions, reactions, portrait) before committing to the transform; confirm button is disabled when no uses remain; Cancel closes without transforming

- [x] **Druid Wild Shape** (irongollem/grimoire#348) — already fully implemented: dedicated Wild Shape tab, CR-gated beast picker with preview lightbox, active form HP/AC/speed display, Revert button, Circle of the Moon detection, usage pips; closed as already-done

- [x] **Phase 2 — Player Bestiary** (`/play/bestiary`) — resolves discoveries against in-memory SRD + DB monsters; portrait grid with CR colour bars; lightbox with artwork banner, AC/HP/Speed, AbilityScoreTable, PlayerNotesWidget (lore, weaknesses, how to defeat). "Bestiary" in player nav (Skull icon). Eye/EyeOff toggle on **all** DM bestiary cards (SRD + custom); lit when shared, hover-reveal when hidden; per-player visibility popover (whole party or specific party members via `visible_to uuid[]`); optimistic updates for instant UI feedback; DM preview respects per-player visibility client-side; focal point passed to bestiary lightbox and card thumbnails; cursor-pointer on eye buttons.

- [x] **Phase 4 — Shapeshifter browser** — "Available Forms" tab in `/play/bestiary` (shown only for Druids, Rangers, Summoners). Druids: filters discovered + SRD beasts by CR ≤ ⌊level/2⌋, Beast type, no fly/swim speed (until level 8). Summoners/Rangers: shows linked companion templates. Full stat block viewable per form. DM can pin extra forms to a player regardless of filter rules. (Note that circle of the moon druids have more flexible rules with regards to available forms)

- [x] **Phase 5 — Wildshape in encounter** — Druid player panel in encounter runner gets a "Wildshape" button. Opens a picker showing available beast forms. Selecting a form temporarily overlays that combatant's HP/AC/speed with the beast's stats (HP tracked separately, reverts to original when beast HP hits 0 or "Revert Form" is clicked). Beast's actions/abilities shown in detail panel during wildshape.

- [x] **Player-visible pre-scripted events** (irongollem/grimoire#297) — fired events with `is_player_visible=true` now appear as amber parchment-style narrative beat callouts in `PlayerEncounterPanel`, between the round header and combatant list. `broadcast_message` text is shown prominently in italic fell font; the event name is shown as a dim cinzel label beneath it. Events remain visible for the remainder of the encounter.

- [x] Server-side pagination for Spellbook — 50 per page, Supabase-filtered by level/school/class/name, debounced search, keepPreviousData for smooth transitions

- [x] **MonsterSheet — lair location link** (irongollem/grimoire#168) — migration `20260720000001` adds nullable `monsters.lair_location_id` FK → `locations` (on delete set null; user monsters only, SRD rows unaffected). `EntityCombobox` picker (depth-indented location tree) next to Habitat in `MonsterDetail` + `MonsterEditMobile`; "Lair: <name>" nav link on `MonsterSheet` + `MonsterSheetMobile`, resolved against the active campaign's location tree so cross-campaign danglers just don't render.
