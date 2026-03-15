# Grimoire — Feature Roadmap

Features built and planned. Check off items as they ship.

---

## Done

- [x] Notes tracker (Tiptap editor, categories, tags, pinning)
- [x] Faerûn Calendar / timeline (Calendar of Harptos, adapter pattern for future settings)
- [x] Scriptorium — Homebrewery-style editor, OneDnD 2024 PHB preview + PDF export
- [x] NPC tracker with full stat blocks, portrait upload, TraitSection editor
- [x] Bestiary (monster builder with 12 SRD template presets + full SRD bundle)
- [x] Party Tracker (initiative, HP, conditions, curses, death saves, passive skills)
- [x] Card Forge — MTG (63×88mm) and Tarot (70×120mm) print-ready cards with duplex alignment
- [x] Scriptorium import engine — convert NPCs / monsters to Scriptorium documents ("Send to Scriptorium")
- [x] Scriptorium asset insert panel — browse and inject NPCs / monsters / locations as new pages inside the editor
- [x] Image controls in Scriptorium editor (size presets S/M/L/XL, float left / center / right)
- [x] Nav restructured into three sections: Campaign, Assets, Publish
- [x] Locations — recursive hierarchy (continent → region → city → building → room), Tiptap description, sub-location list, Scriptorium formatter
- [x] Item Vault — full CRUD with 15 item types, 7 rarities, weapon damage dice, charges, attunement, image upload, card printing (MTG + Tarot)
- [x] Spellbook — full CRUD with school/level/class filters, Spell Level Advisor modal, attack mechanics, AOE, conditions, card printing
- [x] Encounters — builder (combatants + NPC combatants, factions, XP difficulty calculator with ally offset) + live combat runner (initiative, HP, conditions, death saves)
- [x] Quests — kanban + list view, objectives checklist, sub-quests, giver NPC / location linking, linked item & encounter rewards, Tiptap notes
- [x] Campaign Dashboard — live stat cards, active quests, party at a glance (HP bars, passive scores, conditions/curses), pinned + recent notes

---

## In Progress / Next Up

- [ ] Scriptorium visual assets (page border PNG, chapter art) — see `ASSETS_PROMPT_LIST.md`

---

## Companions

- [x] `companions` table — id, user_id, campaign_id, name, companion_type (enum: familiar / animal_companion / mount / ally / sidekick), source_type (monster / npc / custom), source_monster_id (FK nullable), source_npc_id (FK nullable), owner_party_member_id (FK to party_members, nullable — who the companion belongs to), max_hp, current_hp, ac, speed, conditions[], notes, sort_order + RLS
- [x] `useCompanions` composable — CRUD, fetch all for campaign, fetch by owner
- [x] Companion cards in Party Tracker — shown below their owner (or ungrouped if no owner); simpler card than a PC: name, type badge, HP bar + damage/heal controls, AC, conditions, link to source monster/NPC sheet
- [x] Add companion from monster — pick from Bestiary, copies name/HP/AC/speed as defaults, owner optional
- [x] Add companion from NPC — pick from NPC list, same defaulting behaviour
- [x] Custom companion — enter stats manually (no source record required)
- [x] Companions included in Encounter Runner initiative — can be added to an encounter alongside party members

---

## Quests (remaining)

- [ ] `quest_triggers` table — quest_id, trigger_type (quest_complete / objective_done), offset_days, action_type (create_calendar_event), action_payload JSONB — "5 days after this quest completes, create a calendar event"
- [ ] Trigger engine — evaluate pending triggers on quest status / objective changes, auto-create calendar events
- [ ] Related entities panel — link arbitrary NPCs / locations / monsters to a quest via quest_refs (beyond the already-wired items + encounters)
- [ ] Scriptorium formatter for quests

---

## Items & Magic Items (remaining)

- [ ] Party inventory — assign items to party members (join table `party_member_items`); show on party card
- [ ] Scriptorium formatter for items (stat block style: name, type line, rarity, attunement, description)

---

## Spells (remaining)

- [ ] Scriptorium formatter for spells (classic spell card block)
- [ ] Spell list on NPC / monster stat block — link to spell entries in the Spellbook

---

## Ideas & Future Considerations

- [ ] **Monster import from external sources** — import tool to pull monster stat blocks from D&D Beyond (or Open5e API as a free alternative) directly into the Bestiary, mapping fields to our `Monster` type
- [ ] **Open5e API — spells & items** — use the same fetch-and-bundle approach (`scripts/fetch-srd-monsters.mjs` as template) to pre-populate the Spells and Items modules with SRD content (spells endpoint: `/v1/spells/?document__slug=wotc-srd`, items: `/v1/magicitems/`). Open5e is scrape/bundle only — no runtime API dependency.
- [ ] **Scriptorium two-column layout** — CSS `columns: 2` toggle for PHB-style two-column pages
- [ ] **Scriptorium table support** — Tiptap table extension for stat comparison tables
- [x] **Calendar integration** — pin quests, encounters, and location events to calendar dates
- [ ] **Campaign settings page** — set active calendar, current year, campaign name, and default location
- [ ] **Full-text search** — cross-entity search across NPCs, monsters, notes, spells, items, locations, quests
- [ ] **Export / import** — JSON export of entire campaign data; import to restore or share
- [ ] **Collaboration features** — invite other users to view/edit the campaign, with role-based permissions (DM vs player) and setup the skeleton for VTT type tooling
- [x] **Setting bundles** — pre-populate calendar events for supported settings (matching the active calendar adapter). Faerûn bundle ships 30 major events (Time of Troubles, Spellplague, Sundering, 5e adventures). Importable via "Setting Events" button in the calendar view. Adding new bundles requires only a new file in `src/data/bundles/` and an entry in the registry.
- [ ] **Publish token maker** - create visual tokens for use in virtual tabletops, with configurable fields (name, HP, AC, portrait) and export as image or JSON for upload to VTTs that support it (e.g. Roll20 API tokens) integrating with existing items, monsters, and NPCs in the database for easy token creation from existing records

---

### Bugs and Issues

- [x] You cannot delete a Scriptorium entry
- [x] Clicking a day in the calendar doesn't do anything yet
- [x] Adding a multi-day event only shows it on the first day
- [x] Dashboard was dummy / placeholder — now live with real data
- [x] Can't manually set initiative
- [x] Under party, clicking the condition button opens the dropdown inside an overflow:hidden container, causing it to be cut off — fixed with viewport-aware flip logic
- [x] Calendar only scrolls per month making navigation slow — added ◀◀/▶▶ year-skip buttons and direct year input
- [x] Calendar position (year/month) now persists to localStorage across sessions
- [x] In party view keys and values and units are without spacing (e.g. speed30ft)
- [x] In party view the values are abbreviated too much; expanded to full passive skill names + added knowledge passives
- [x] Bestiary should be preloaded with SRD monsters (uneditable), users can add custom on top
- [x] In spells, affected targets is only an area of effect of 1 or a template — now supports free-form targeting description
- [x] 400 error when uploading a portrait for a party member (bucket not found)
- [x] No delete button inside Scriptorium file
- [x] Styling: remove up/down arrows from number inputs
- [x] In party overview show the avatar if there is one
- [x] In the Encounters list view, two "New Encounter" buttons stacked — removed the redundant one
