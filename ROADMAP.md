# Grimoire — Feature Roadmap

Features built and planned. Check off items as they ship.

---

## Done

- [x] Notes tracker (Tiptap editor, categories, tags, pinning)
- [x] Faerûn Calendar / timeline (Calendar of Harptos, adapter pattern for future settings)
- [x] Scriptorium — Homebrewery-style editor, OneDnD 2024 PHB preview + PDF export
- [x] NPC tracker with full stat blocks, portrait upload, TraitSection editor
- [x] Bestiary (monster builder with 12 SRD template presets)
- [x] Party Tracker (initiative, HP, conditions, death saves, passive skills)
- [x] Card Forge — MTG (63×88mm) and Tarot (70×120mm) print-ready cards with duplex alignment
- [x] Scriptorium import engine — convert NPCs / monsters to Scriptorium documents ("Send to Scriptorium")
- [x] Scriptorium asset insert panel — browse and inject NPCs / monsters as new pages inside the editor
- [x] Image controls in Scriptorium editor (size presets S/M/L/XL, float left / center / right)
- [x] Nav restructured into three sections: Campaign, Assets, Publish

---

## In Progress / Next Up

- [ ] Scriptorium visual assets (page border PNG, chapter art) — see `ASSETS_PROMPT_LIST.md`

---

## Locations

Recursive location hierarchy: a region can contain towns, a town can contain buildings, a building can contain rooms, etc. Depth is unlimited.

- [x] `locations` table — id, user_id, parent_id (self-referencing FK, nullable = root), name, location_type (enum: continent, region, country, city, town, village, district, building, room, dungeon, wilderness, other), description (rich text / Tiptap JSON), notes, tags[], image_url, updated_at + RLS
- [x] `useLocations` composable — list roots, list children of a given parent, CRUD
- [x] LocationsView — flat list of all locations with search + type filter, parent breadcrumb on cards
- [x] LocationDetail — description editor (Tiptap), child list, "Add sublocation" button, breadcrumb trail, "Send to Scriptorium"
- [x] Scriptorium formatter for locations
- [x] Add Locations to nav (Campaign section) and to the Scriptorium asset insert panel

---

## Quests

- [x] `quests` table — id, user_id, campaign_id, parent_quest_id (nullable, for sub-quests), title, summary, status (active / completed / failed / on-hold), giver_npc_id (FK nullable), location_id (FK nullable), rewards (text), tags[], notes (Tiptap JSON), started_at (calendar date fields), resolved_at (calendar date fields) + RLS
- [x] `quest_objectives` table — id, quest_id, description, is_done, sort_order
- [x] `quest_refs` join table — quest_id, ref_type (npc / location / monster / item), ref_id — polymorphic references to related entities
- [ ] `quest_triggers` table — id, quest_id, trigger_type (quest_complete / objective_done), offset_days (int), action_type (create_calendar_event), action_payload (JSONB) — e.g. "5 days after this quest completes, create a calendar event"
- [x] `useQuests` composable — CRUD, fetch by status, fetch sub-quests
- [x] QuestsView — kanban board grouped by status (active / on-hold / completed / failed), or list toggle
- [x] QuestDetail — objectives checklist, sub-quest list, giver NPC + location linking, Tiptap notes
- [ ] Related entities panel (linked NPCs / locations / monsters / items via quest_refs)
- [ ] Trigger engine — when a quest status changes or objective is checked off, evaluate pending triggers and auto-create calendar events at the computed calendar date
- [ ] Scriptorium formatter for quests
- [x] Add Quests to nav (Campaign section)

---

## Items & Magic Items

- [ ] `items` table — id, user_id, name, item_type (enum: weapon, armor, wondrous, consumable, tool, vehicle, currency, other), rarity (common / uncommon / rare / very rare / legendary / artifact), attunement (bool), description (Tiptap JSON), properties[], value_gp, weight_lb, tags[], source, notes + RLS
- [ ] `useItems` composable — CRUD + filter by type/rarity
- [ ] ItemsView — filterable list with rarity color badges
- [ ] ItemDetail — full editor, "Send to Scriptorium" (formatted as item card)
- [ ] Scriptorium formatter for items (stat block style: name, type line, rarity, attunement, description)
- [ ] Party inventory — assign items to party members (join table `party_member_items`)
- [ ] Add Items to nav (Assets section) and to Scriptorium asset insert panel

---

## Spells

- [ ] `spells` table — id, user_id, name, level (0–9, 0 = cantrip), school (enum), casting_time, range, components (V/S/M + material), duration, concentration (bool), ritual (bool), description (Tiptap JSON), higher_levels, classes[], tags[], source + RLS
- [ ] `useSpells` composable — CRUD + filter by level/school/class
- [ ] SpellsView — filterable list grouped by level or school
- [ ] SpellDetail — full editor, "Send to Scriptorium"
- [ ] Scriptorium formatter for spells (classic spell card block)
- [ ] Spell list on NPC/monster stat block (link to spell entries)
- [ ] Add Spells to nav (Assets section) and to Scriptorium asset insert panel

---

## Encounters

- [ ] `encounters` table — id, user_id, name, description, difficulty (trivial / easy / medium / hard / deadly), status (planned / active / complete), location_id (FK nullable), calendar date fields, notes (Tiptap JSON), tags[] + RLS
- [ ] `encounter_combatants` join table — encounter_id, monster_id (nullable FK), npc_id (nullable FK), custom_name, quantity, initiative_bonus, notes
- [ ] `useEncounters` composable — CRUD
- [ ] EncountersView — list by status, filterable
- [ ] EncounterDetail — combatant builder (pick monsters/NPCs, set quantities), difficulty calculator (XP thresholds), "Run Encounter" mode (integrates with Party Tracker initiative)
- [ ] Add Encounters to nav (Campaign section)

---

## Ideas & Future Considerations

- [ ] **Party companions** — allow adding companion characters (familiars, sidekicks, hired NPCs) to the party tracker, with their own HP/conditions but a simpler stat display than a full PC slot
- [ ] **Monster import from external sources** — import tool to pull monster stat blocks from D&D Beyond (or Open5e API as a free alternative) directly into the Bestiary, mapping fields to our `Monster` type
- [ ] **Open5e API — spells & items** — use the same fetch-and-bundle approach (`scripts/fetch-srd-monsters.mjs` as template) to pre-populate the Spells and Items modules with SRD content (spells endpoint: `/v1/spells/?document__slug=wotc-srd`, items: `/v1/magicitems/`). Open5e is scrape/bundle only — no runtime API dependency.
- [ ] **Scriptorium two-column layout** — CSS `columns: 2` toggle for PHB-style two-column pages
- [ ] **Scriptorium table support** — Tiptap table extension for stat comparison tables
- [ ] **Calendar integration** — pin quests, encounters, and location events to Faerûn calendar dates
- [ ] **Campaign settings page** — set active calendar, current year, campaign name, and default location
- [ ] **Dashboard stat cards** — live counts per entity type (currently placeholder)
- [ ] **Full-text search** — cross-entity search across NPCs, monsters, notes, spells, items, locations
- [ ] **Export / import** — JSON export of entire campaign data; import to restore or share
- [ ] **Collaboration features** — invite other users to view/edit the campaign, with role-based permissions (DM vs player) and setup the skeleton for VTT type tooling
- [ ] \*\*

### Bugs and Issues

- [x]you cannot delete a scriptorium entry
- [x] clicking a day in the calendar doesn't do anything yet
- [x] adding a multi day event only shows it on the first day
- [ ] The dashboard is dummy and doesn't work yet
- [x] cant manually set initiative
- [x] under party, clicking the condition button opens the dropdown inside a overflow:hidden container, causing it to be cut off
- [x] Calendar only scrolls per month making navigation slow — added ◀◀/▶▶ year-skip buttons and direct year input
- [x] Calendar position (year/month) now persists to localStorage across sessions
- [x] in party view keys and values and units are without spacing( e.x. speed30ft)
- [x] in party view the values are abbrieviated too much like PP instead of passive perception, also i'd like to see other valuable passives like knowledge skills
- [x] bestiary should be preloaded with the free available monsters stored centrally (uneditable by non admin users) from the 5e SRD, so users have something to start with and can customize from there (add a custom only filter to see just user created monsters)
- [x] in spells, affected targets is only an area of effect of 1 or a template, but many spells have more complex targeting (e.g. "one creature you can see within range" or "up to three creatures in range")
- [x] 400 error when uploading a portrait for a party member, and the image doesn't save (error"Bucket not found")
- [x] Inconsistent UI, no delete button INSIDE scriptorum file
- [x] Styling, remove up/down arrows from number inputs
- [x] Upgrade, in party overview show the avatar if there is one
- [x] In the Encounters list view, theres two "new encounter" buttons right below each other. To stick with the pattern of other create new resource items, perhaps remove the one besides the search input
