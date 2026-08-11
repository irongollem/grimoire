# Grimoire — Full Feature Index

**Grimoire** is a full-stack D&D 5e campaign management platform for Dungeon Masters and their players. It is a multi-user web app: the DM gets a rich authoring toolkit, and players get a separate, role-appropriate portal with live data sync. It is not just a note-taking app — it covers the entire campaign lifecycle from world-building through live combat.

Production domain: `dungeongrimoire.com`  
Stack: Vue 3 + TypeScript + Vite + Tailwind v4 + Supabase (PostgreSQL + Auth + Realtime)  
Auth: Supabase Auth. Role system: `dm` or `player` per campaign (stored in `campaign_members`).

---

## Feature Docs

Each doc covers **both DM and player perspectives**, lists exact file paths, composables, TypeScript types, and DB tables. Read the relevant doc before working on a feature.

| File                                                     | What it covers                                                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [campaign-notes-calendar.md](campaign-notes-calendar.md) | Dashboard, Session Notes, Player Journal, Faerûn Calendar, timeline, AI Chronicler image gen                                                     |
| [world-building.md](world-building.md)                   | Atlas/Locations (17 types, hierarchical), Quest Log (kanban + status), Factions + relations                                                      |
| [npcs.md](npcs.md)                                       | NPC list, full detail sheet, force-directed Relationship Web, NPC Generator, player visibility                                                   |
| [party-characters.md](party-characters.md)               | Party Tracker, full D&D 5e character sheet, Character Codex, Hall of Heroes, shapeshifter disguise                                               |
| [combat-encounters.md](combat-encounters.md)             | Bestiary (monster builder + discovery), Encounter Builder, live Encounter Runner, player combat view                                             |
| [items-spells-crafting.md](items-spells-crafting.md)     | Item Vault, player Paper Doll inventory, Spellbook, Workshop recipes + player crafting                                                           |
| [dungeon-craft.md](dungeon-craft.md)                     | Dungeon Features, Traps (CR advisor), Puzzles (DM/player split), Roll Tables, Loot Tables                                                        |
| [cartographer.md](cartographer.md)                       | **(Spec)** Tile-based battle map builder; versioned tile packs; per-brush theme; bakes to Atlas locations                                        |
| [downtime-interlude.md](downtime-interlude.md)           | The Interlude: DM-granted downtime credits, card-driven player draws, DM batch resolution, prepped deck backs                                    |
| [simulacrum.md](simulacrum.md)                           | Simulacrum: portrait → AI mini-render → Meshy 3D sculpt (print STL / VTT GLB), teaser demand gate, /minis gallery                                |
| [publishing-tools.md](publishing-tools.md)               | Scriptorium (document publisher), Card Forge (MTG/Tarot print), The Mint (tokens+coins), Illuminator, Reliquary                                  |
| [player-portal.md](player-portal.md)                     | The full player experience: all /play/\* views, layout, nav, live encounter panel, DM Preview Mode                                               |
| [collaboration.md](collaboration.md)                     | Multi-user invite system, campaign members, DM/player roles, live sync, RLS security model                                                       |
| [soundboard.md](soundboard.md)                           | Soundboard: HTML/Web Audio engine, pages/playlists, five sound sources, Spotify/Cast/Media Session, free-tier quotas — DM-only, no player access |
| [notifications.md](notifications.md)                     | Player email notifications (note shared, session date proposed), per-user opt-out, send-notification-email edge function + Resend setup          |

Adding or changing an AI generator? Read
[../compliance/ai-act.md](../compliance/ai-act.md) first — the AI Act
transparency register (roles, system inventory, exemptions, provider
due-diligence) that every AI-touching feature needs to stay in step with.

Cross-cutting system diagrams (internal layers, third-party integrations,
release pipeline) and the **outage triage table** live in
[../architecture/index.md](../architecture/index.md) — start there when a
problem spans features or points outside the app.

---

## Full Feature List (marketing reference)

### Campaign Management

- **Dashboard** — at-a-glance campaign overview: active quests, party presence, live encounter banner, unidentified items, pinned notes
- **Session Notes** — rich-text notes with categories, tags, session numbers, per-player visibility, inline calendar event insertion, AI image generation (Chronicler)
- **Player Journal** — private + shareable per-player journal entries with entity context links; party journal aggregates all shared entries
- **Faerûn Calendar** — Calendar of Harptos month grid + Chronicle timeline view; travel events update party member locations; calendar adapter pattern supports custom settings

### World-Building

- **Atlas** — hierarchical location tree (World → Plane → Continent → Region → Country → City → District → Building → Room); 17 type taxonomy; map pinning with descendant surfacing; store/tavern inventory; per-field player visibility
- **Quest Log** — kanban board + list view; 5 status tiers; `quest_refs` junction for NPC/location/monster/encounter linking; reward currency pools; Scriptorium export; player quest view filters undiscovered quests
- **Factions** — directional relations (8 types including secret variants); per-player visibility or membership-based access; known-member reveal gated by RLS

### Characters & Party

- **NPC Tracker** — card grid list with 5-filter system; full detail sheet (identity, lore, inventory, combat tabs); stat block with template/bestiary import; Scriptorium export; promote-to-monster
- **NPC Relationship Web** — force-directed graph; 13 relationship types with directional inverses; shift+click to create edges on graph; DM-managed with player-facing visibility controls
- **NPC Generator** — quick-create (faction + associate auto-wired); AI generation with optional alter-ego portrait (2× credits); setting population bulk-import
- **Party Tracker** — initiative tracker; HP tracking (temp HP absorbs first); conditions, exhaustion, named curses; death saves; companions; inline party inventory with Vault combobox
- **Character Sheet** — full D&D 5e stats; Wild Shape (CR filtering, stat block override, Circle of Moon); health visibility modes (strategic numeric vs. immersive prose); level-up wizard; 2024 background ASI (+2/+1 or +1/+1/+1) + Origin feat
- **Character Codex** — Species (traits, shapeshifter flag, Open5e import); Backgrounds; custom Classes (full 20×9 spell slot grid); Archetypes (Open5e import); Abilities/Features
- **Hall of Heroes** — reusable iconic characters importable into any campaign; supports bench characters and campaign guests
- **Shapeshifter Disguise** — player-controlled via server RPC; DM sees true form + badge; others see full fake species profile

### Combat

- **Bestiary** — custom monster builder; 12 SRD template presets; full stat block (all speeds, senses, saves, skills, resistances, actions, reactions, legendary/lair); dual-edition (2014/2024) `library_monsters`, 2024 stat blocks carry their own initiative bonus; Open5e sync; AI generator; per-monster player discovery/visibility system
- **Encounter Builder** — combatant roster (CombatantDef); faction system (4 defaults + custom); pre-scripted events (4 trigger types, 2 action types); boss mechanics (legendary + lair actions); difficulty calculator; loot + trap linking
- **Encounter Runner** — live combat tracker; initiative order (ruleset-aware monster initiative modifier); HP flash animations; dual-edition conditions (2024 Exhaustion math); reaction tracking; surprised badge; DM detail panel (roll modes, chat modes, legendary action tracker); mid-encounter spawn; bidirectional HP sync with party_members

### Items, Spells & Crafting

- **Item Vault** — dual-image identification system (mundane vs. identified portrait with focal point); weapon/armor stats; 2024 weapon mastery properties; magic properties (attunement, charges, recharge, arcane focus); container flag; bundle/pack auto-expansion; linked spells; shared dual-edition `library_items` table with per-user shadowing + clone-to-customize (#303)
- **Player Inventory** — paper doll with 11 anatomical slots; attunement 3-pip tracker; carry weight bar with 4-tier burden portraits; Powerful Build species doubling; extradimensional weight exclusion; drag-and-drop reordering; coin purse with chat drop; real-time sync
- **Spellbook** — custom + Open5e import; Spell Level Advisor wizard; player view adapts to caster type (spellbook/prepared/known/none); multiclass-accurate slot computation
- **Workshop** — crafting recipes with discipline, DC, time, tool proficiency check, critical fail ruins ingredient; per-player visibility; roll posts to campaign chat; cooking food variant

### Dungeon Building

- **Dungeon Craft** — tabbed hub at `/dungeon-craft` for all dungeon prep tools
- **Dungeon Features** — secret doors, hazards, enigmas; Populate Examples bulk-insert
- **Traps** — full trigger/effect/detection/disable fields; interactive CR Advisor calculator (5 dimensions → CR range + XP + reference benchmarks)
- **Puzzles** — DM controls hint reveals per-hint; `read_aloud` field; player portal receives realtime updates via Supabase Realtime; `shared_hints[]` array with per-hint Eye toggle
- **Roll Tables** — range-based entries; overlap validation; optional Encounter entity link
- **Loot Tables** — 3 entry types (specific item, currency pool, random-by-rarity); drop chance per entry; "Drop chest in chat" posts claimable loot atoms with claims cap; AI generator grounded in the DM's own vault with a tier-derived rarity band (#602)
- **Cartographer** _(spec, not yet built)_ — tile-based battle map editor on an infinite canvas; versioned WebP tile packs with schema-validated category slots; per-brush theme switching; **edge-based walls** (thin partitions) coexisting with a **`solidBlock` layer** (thick masonry) so the builder controls wall thickness; cell-level entity links (traps, encounters, NPCs); bakes to Atlas location maps; data preserved for a future in-app VTT

### Publishing & Output Tools (desktop-only)

- **Scriptorium** — Tiptap document editor; live paginated preview; two PHB themes (2024 OneDnD / Classic 2014); three page sizes; ink-friendly mode; PDF export; `is_published` sharing
- **Card Forge** — Trading card (63×88mm, 9/sheet) + Tarot (70×120mm, 4/sheet) card printing; 20 card components (NPC/Monster/Item/Spell × trading/Tarot × front/back); cross-type mixing; duplex with column reversal; 1mm bleed; named Card Library in localStorage
- **The Mint** — VTT token creator (ring color, name arc, 280/512px PNG, print queue in 3 sizes) + coin designer (metal/motif/rim text, A4 print sheet)
- **Illuminator** — client-side canvas image processing: colour grading, vignette, texture overlay, depth of field (click focal point), torn/faded edges per edge; exports full-resolution PNG
- **Reliquary** — DM screen (quick reference, SRD compendium, custom rules with Tracker builder, built-in manual); player portal version: Reference, Compendium, Codex, house rules (read-only)

### Multi-User Collaboration

- **Invite System** — token-based URLs; expiry + max uses; role assignment; label/copy/revoke
- **Campaign Members** — member list; player→character assignment; presence indicator; remove player
- **Player Portal** — full separate experience under `/play/*`; own layout with fixed bottom nav; persistent live encounter sidebar (drag-resize); campaign chat sidebar; DM Preview Mode
- **Live Sync** — Supabase Realtime subscriptions on 7 campaign tables; presence tracking
- **Role-Based Access** — DM vs player enforced via Supabase RLS on every table; players see only DM-shared data + their own private data

### Soundboard

- **Soundboard** — ambient sounds & music for live sessions; multi-page/scene organisation; five sound sources (upload, URL, Spotify, Freesound SFX search, AI-generated via Lyria — upload and AI generation are Pro-gated); music playlists (sequential auto-advance) and ambient playlists (layered simultaneous scenes); Web Audio filter effects (muffled through door/wall, distant, underwater, cave, sewer); Google Cast + Media Session (CarPlay/lock screen) for music playlists; free tier capped at 20 sounds / 1 page / 3 playlists; DM-only — players have no access (owner-only RLS, no realtime channel). See [soundboard.md](soundboard.md).

---

## Key USPs vs Competitors

1. **Unified platform** — world-building, combat, and player portal all in one app; no switching tools
2. **True multi-user** — players join via invite link and get a live, role-appropriate view of campaign data — not just a shared Google Doc
3. **Live encounter participation** — players see the combat tracker in real time, get turn notifications (audio + visual), and see combatants appropriate to their discovery level
4. **Full character ownership** — players create, edit, and level up their own characters; Wild Shape, inventory, spells, and crafting all player-controlled
5. **Shapeshifter disguise** — unique feature: player-controlled disguise that fools other players but the DM always sees the truth
6. **Print-quality output** — Card Forge, Scriptorium, The Mint, and Illuminator produce professional-quality physical assets from campaign data
7. **DM screen + custom rules** — Reliquary is a full DM screen with a custom Tracker builder for homebrew mechanics (exhaustion variants, sanity, etc.)
8. **Deep item system** — attunement tracking, paper doll slots, carry weight, containers, bundles, extradimensional weight rules — all modeled properly
9. **Monster discovery** — monsters are revealed to players incrementally; DM controls which stats are visible

---

## Agent Conventions

When working on any feature:

1. **Read the relevant feature doc first** — it lists exact file paths, composables, types, and DB tables
2. Use `RichTextEditor` for all multi-line text, never `<textarea>`
3. Use `FocalImage` for all images, never `<img>`
4. Use `TagInput` for all tag fields
5. Use `EntityCombobox` for entity selection, never `<select>`
6. Filter state → `useUiStore` (`src/stores/ui.ts`), not local refs
7. Server state → TanStack Query composables; UI state → Pinia
8. After create/save/delete → always `router.push('/list-route')`
9. New tables need RLS + `update_updated_at()` trigger; use `/new-migration` skill for migration files
10. **After implementing a feature** → update the relevant feature doc in `context/features/`
