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
- [x] **Collaboration — Phase 1**: campaign_members + campaign_invites tables, DM auto-membership trigger, invite link flow (/join/:token), role-based router guard, Campaign Settings UI (members tab, invites tab with generate/copy/revoke)
- [x] **Collaboration — Phase 2**: Player portal (/play/\* routes + PlayerLayout), presence indicators (online dots on dashboard party cards + campaign switcher pip count), notes/quest `is_player_visible` flags + DM eye-icon toggles, party inventory for players (read), campaign broadcast system (DM announcements → player toast), campaign chat + dice roll log (floating panel, realtime via Supabase)
- [x] **Collaboration — Phase 3**: `encounter_state` table, live encounter sync (DM "Go Live" button writes state to DB; Supabase Realtime pushes to players), PlayerEncounterView (initiative order, HP labels, active combatant highlight), live encounter indicators (sidebar badge next to logo, dashboard banner, list card badge, detail page contextual Resume / Restart / Stop buttons), encounter state persists across navigation/refresh
- [x] **Collaboration — Phase 4**: Full interactive D&D Beyond-style player character sheet (clickable ability/save/skill rolls → roll toast + campaign chat, HP ±buttons, death save pips, condition toggles, inspiration — all player-editable and written to DB); inventory tab on character sheet (add/remove items, quantity, carried-by); RLS policy for player-owned party member updates; broadcast notifications when DM shares a note, quest, or adds an inventory item
- [x] Named curses in encounter runner — separate from flat conditions, free-text input, syncs back to party on end combat
- [x] End-combat sync — HP, conditions, curses, and death saves written back to `party_members` when DM ends combat
- [x] Atlas (renamed from Locations, Globe icon)
- [x] Atlas — "Populate Setting" button seeds iconic locations from the active campaign's setting (Faerûn: ~70 locations across worlds, planes, continents, regions, countries, cities, towns, dungeons, wilderness; Greyhawk/Eberron/Dragonlance: ~15–20 each). Deduplicates by name. Planar locations exported separately as `PLANAR_LOCATIONS` for future use.
- [x] Atlas — `world` and `plane` added to `LocationType` (DB enum extended via migration). `world` = planet/world (Toril, Oerth, Krynn, Eberron); `plane` = dimension/realm (Nine Hells, Feywild, Shadowfell, Astral Plane, etc.).
- [x] Atlas — Parent picker in location editor: searchable combobox to assign or change a location's parent from any existing campaign location. Breadcrumb updates live; saves with the form. Clearing sets the location back to top-level.
- [x] Atlas — Delete hang fix: `useDeleteLocation` now calls `queryClient.removeQueries` for the specific location key before invalidating lists, preventing the 406 retry loop that occurred while the detail view was still mounted mid-navigation.

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

**What's already built:** full CRUD, objectives checklist, sub-quest hierarchy, kanban + list dual-view, player visibility toggle, player quest log + detail view, NPC giver + primary location linking, item + encounter + NPC + location + monster refs (all five ref types in editor UI), calendar integration, Tiptap notes, tags, timeline date fields (started_at / resolved_at), Scriptorium formatter + "Send to Scriptorium" button.

- [x] **Related entities panel** — NPC, location, and monster ref panels added to QuestEditor alongside items and encounters.
- [x] **Player quest detail view** — `/play/quests/:id` shows objectives checklist (read-only), summary, giver NPC, primary location, linked items/encounters/NPCs/locations/creatures, rewards. Guard: only visible for `is_player_visible` quests.
- [x] **Quest timeline UI** — `started_at` / `resolved_at` date pickers in QuestEditor metadata grid; displayed in player detail view.
- [x] **Scriptorium formatter for quests** — "Send to Scriptorium" button in QuestEditor top bar; generates title, status, meta block, objectives list, notes body.
- [x] **Player quest notes** — `quest_player_notes` table (one row per player per quest). Each player writes their own note on the quest detail page; Private toggle (lock icon) = only you see it, Shared toggle (eye icon) = visible to all campaign members including DM. "Party Notes" section shows all shared notes from other players. Autosaves on textarea blur.
- [ ] **Quest triggers** — `quest_triggers` table: quest_id, trigger_type (quest_complete / objective_done), offset_days, action_type (create_calendar_event / send_broadcast), action_payload JSONB. Example: "5 days after this quest completes, create a calendar event". Requires a trigger-evaluation step on quest/objective status changes.

---

## Items & Magic Items (remaining)

- [x] Party inventory — shared `party_inventory` table; DM and players can add/remove items, adjust quantity, mark carried-by; shown in Party Tracker and player character sheet inventory tab
- [x] **Player character sheet** — inventory split into "My Items" (carried by that player) and "Party Stash" (uncarried); equip toggle on My Items; equipped vault-linked weapons show a clickable Attack + Damage roller on the Character tab (ability mod auto-selected: DEX for ranged/finesse when DEX > STR, STR otherwise); all rolls post to campaign chat
- [x] **Loot drops in chat** — items can be dropped directly into the campaign chat as a loot card. Anyone in the campaign can then **Claim** (→ their My Items) or **To Stash** (→ Party Stash); once claimed the card updates for everyone in real-time. How to drop loot:
  - **DM / Party Tracker**: click the ↑ arrow on any existing inventory row, or use "Drop in Chat" in the Add Item form instead of "Add"
  - **Player / My Items**: click the ↑ arrow on any item in the My Items tab of their character sheet — removes it from their inventory and drops it to chat
- [ ] Scriptorium formatter for items (stat block style: name, type line, rarity, attunement, description)
- [ ] Show details on hover over an item in the chat before claiming (tooltip with item description, or expand the card in place to show details)
- [ ] Only show claim button enabled if a player actually has an inventory (so a PC claimed that has inventory). The DM can't claim nor can any player that joined but didnt claim a PC yet

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
- [x] **Collaboration features** — invite other users to view/edit the campaign, with role-based permissions (DM vs player) and setup the skeleton for VTT type tooling
- [x] **Setting bundles** — pre-populate calendar events for supported settings (matching the active calendar adapter). Faerûn bundle ships 30 major events (Time of Troubles, Spellplague, Sundering, 5e adventures). Importable via "Setting Events" button in the calendar view. Adding new bundles requires only a new file in `src/data/bundles/` and an entry in the registry.
- [ ] **Publish token maker** - create visual tokens for use in virtual tabletops, with configurable fields (name, HP, AC, portrait) and export as image or JSON for upload to VTTs that support it (e.g. Roll20 API tokens) integrating with existing items, monsters, and NPCs in the database for easy token creation from existing records
- [x] **items** load all free accessible items from the Open5e API to create a pre-populated item vault, similar to the monster import described above. This would give users a rich starting point of SRD items to use and customize without needing to input everything manually
- [x] **Locations** — "Populate Setting" button now implemented (see Done section above).
- [ ] **Atlas — Time-bound locations** — add optional `era_start` / `era_end` year fields to the `locations` table. Atlas list view can then grey-out or hide locations that don't exist in the current campaign year (e.g. Elturel pre/post 1492 DR, floating Netherese cities pre −339 DR, Istar post Cataclysm). Populate seed data already notes time-sensitive entries with `[Time-sensitive: ...]` in the notes field as a temporary measure.
- [ ] **Atlas — Planar locations populate** — `PLANAR_LOCATIONS` array (21 entries: inner planes, upper/lower outer planes, transitive planes, Sigil) exported from `settingLocations.ts`. Add a second "Populate Planes" button to the Atlas, or include planes in the main populate (opt-in checkbox). Planes are setting-agnostic so they apply to any campaign.
- [x] **Atlas — Nesting / hierarchy on populate** — currently all seeded locations are inserted flat (no `parent_id`). Future: insert in topological order (world → plane → continent → region → country → city → town) and link `parent_id` so the Atlas tree renders the full hierarchy automatically. Requires a two-pass insert or a dependency-aware seed runner.
- [ ] **World Bundles — unified per-setting bundle** — unify all per-setting seed data into a single `WorldBundle` interface (calendar events + locations + key NPCs + starting items) so that `src/data/bundles/faerun.ts` becomes a single file per world. This would also make user-uploaded world bundles possible — one JSON file = an entire setting scaffold. Design the `WorldBundle` schema and migrate existing `SETTING_BUNDLES` (calendar events) and `SETTING_LOCATIONS` into it as the first step.
- [ ] **World Bundles — user-uploadable** — allow DMs to upload a world bundle JSON file to populate a new campaign with a custom setting (custom calendar, locations, factions, NPCs). Validate the schema client-side and show a diff of what will be imported before confirming. A long-term community-sharing feature.
- [x] **QUESTS** - `is_player_visible` toggle per quest; DM shares individual quests to the player portal; players see only shared quests in their quest log view.
- [x] **ITEMS/REWARDS** — loot drop cards in campaign chat (see Items & Magic Items section above for detail)

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
