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
| [world-building.md](world-building.md)                   | Atlas/Locations (19 types, hierarchical), Factions + relations, Pantheons & Deities, shared AI retrieval grounding                               |
| [quests.md](quests.md)                                   | Quests: the beat/objective model, story-flow graph, run cockpit, runtime cursor + RPCs, player journal, threads and parallel routes (#850), and staging a beat at a site (#868)      |
| [npcs.md](npcs.md)                                       | NPC list, full detail sheet, force-directed Relationship Web, NPC Generator, player visibility                                                   |
| [party-characters.md](party-characters.md)               | Party Tracker, full D&D 5e character sheet, Character Codex, class features, subclass features and feats (#976), Hall of Heroes, shapeshifter disguise      |
| [combat-encounters.md](combat-encounters.md)             | Bestiary (monster builder + discovery), Encounter Builder, live Encounter Runner, player combat view                                             |
| [items-spells-crafting.md](items-spells-crafting.md)     | Item Vault, player Paper Doll inventory, Spellbook, Workshop recipes + player crafting                                                           |
| [dungeon-craft.md](dungeon-craft.md)                     | Dungeon Features, Traps (CR advisor), Puzzles (DM/player split), Roll Tables, Loot Tables                                                        |
| [cartographer.md](cartographer.md)                       | Tile-based battle map builder; versioned tile packs; per-brush theme; derives structure (spaces/ways/zones) from the drawing and publishes it into the Atlas                                        |
| [downtime-interlude.md](downtime-interlude.md)           | The Interlude: DM-granted downtime credits, card-driven player draws, DM batch resolution, prepped deck backs                                    |
| [simulacrum.md](simulacrum.md)                           | Simulacrum: portrait → AI mini-render → Meshy 3D sculpt (print STL / VTT GLB), teaser demand gate, /minis gallery                                |
| [publishing-tools.md](publishing-tools.md)               | Scriptorium (document publisher), Card Forge (MTG/Tarot print), The Mint (tokens+coins), Illuminator, Reliquary                                  |
| [player-portal.md](player-portal.md)                     | The full player experience: all /play/\* views, layout, nav, live encounter panel, DM Preview Mode                                               |
| [player-hearth.md](player-hearth.md)                     | Hearth, the player's home at /play (#977): between sessions, at the table, first visit; what each section reads, and the decisions behind it |
| [collaboration.md](collaboration.md)                     | Multi-user invite system, campaign members, DM/player roles, live sync, RLS security model                                                       |
| [sessions.md](sessions.md)                               | The campaign session: starting and ending the table, what changes while it runs, the live rail, and how encounters and quest chains nest inside |
| [soundboard.md](soundboard.md)                           | Soundboard: HTML/Web Audio engine, pages/playlists, five sound sources, Spotify/Cast/Media Session, free-tier quotas — DM-only, no player access |
| [notifications.md](notifications.md)                     | Player email notifications (note shared, session date proposed), per-user opt-out, send-notification-email edge function + Resend setup          |
| [document-import.md](document-import.md)                 | Document Import: PDF / page-photo upload, AI extraction, seven-step review wizard, per-page credit cost — DM-only, no player surface            |
| [demo-campaign.md](demo-campaign.md)                     | Demo campaign: a published template any DM copies into their own account, quota-free; reset/remove, admin publish, the catalogue-driven copy and its template rules |
| [young-players.md](young-players.md)                     | Parent-managed accounts for players under 16: the parent link, login-name sign-in, the three paths to a child account, every restriction layer, parent controls, graduation at 16, the Terms gate |

Adding or changing an AI generator? Read
[../compliance/ai-act.md](../compliance/ai-act.md) first — the AI Act
transparency register (roles, system inventory, exemptions, provider
due-diligence) that every AI-touching feature needs to stay in step with.

Cross-cutting system diagrams (internal layers, third-party integrations,
release pipeline) and the **outage triage table** live in
[../architecture/index.md](../architecture/index.md) — start there when a
problem spans features or points outside the app.

---

## AI generation plumbing (epic #910)

Epic #910 ("offer AI help wherever a DM authors content") added a generator or fill to most authoring surfaces. Each surface is documented in the doc that owns it (Dungeon Features and Dungeon Craft in [dungeon-craft.md](dungeon-craft.md), site rooms and deities in [world-building.md](world-building.md), NPC connection suggestions in [npcs.md](npcs.md), the Codex generators in [party-characters.md](party-characters.md), recipes in [items-spells-crafting.md](items-spells-crafting.md), calendar events in [campaign-notes-calendar.md](campaign-notes-calendar.md), quest beats in [quests.md](quests.md), house rules, Scriptorium drafts and Paint portrait in [publishing-tools.md](publishing-tools.md)). This section holds what they share. Read [../compliance/ai-act.md](../compliance/ai-act.md) first for the transparency register.

**Panel chrome: one of two components, never a hand-copied skeleton.**

- `GeneratorPanelFrame.vue` is the chrome and nothing else: click-away overlay, slide-in `aside`, header with title and close, scrolling body (`default` slot) and an optional footer bar (`footer` slot, drawn only when supplied). Both overlay and close emit `close`; the owner decides what closing means. Use it directly only for a panel whose form the Shell cannot express (the NPC and Quest generators still do).
- `GeneratorPanelShell.vue` is the standard concept-to-generate form built on the Frame: concept box with counter (`AI_PROMPT_LIMIT`), a `constraints` slot (heading omitted when empty), an optional image toggle, an `extra` slot, the generating state with "Continue in background", the error block, cost badge, Generate button, AI-off notice and the "New Blank X" link. A panel with a results step (roll and loot tables, encounters) passes `show-results`; the `results` slot then replaces the form and `results-footer` replaces the Generate footer inside the same Frame. A new panel supplies only its constraints, its state and its generate handler.

Every generator panel now uses one of the two, and `GeneratorPanelFrame.test.ts` and `GeneratorPanelShell.test.ts` hold their contracts. Panels are mounted app-wide in `AiGeneratorPanels.vue` and opened through a `ui.<name>GeneratorOpen` flag, each registering with `registerAiGenerator` (`src/ai/aiGeneratorRegistry.ts`) so the floating `AiGenerationBadge` can report progress and reopen the panel from any page. A fill that lives inside an existing form (a site room, a quest beat, a calendar event) or produces no entity to open (NPC connection suggestions) either registers with a no-op `openPanel` or does not register, and says why at the call site.

**`generate-entity-text` carries twelve more generators.** The edge function (`supabase/functions/generate-entity-text/index.ts`) is the server path for generators whose only job is one JSON text call. Besides spell, monster, item and faction it now serves `feature`, `deity`, `species`, `background`, `custom_class`, `custom_subclass`, `class_feature`, `custom_rule`, `recipe`, `calendar_event`, `room` and `quest_beat`. The key is the generator's own name because the client's local-key path (`src/ai/entityTextGeneration.ts`, `EntityTextGenerator`) reads `ai_system_prompts` by it; the map in the function gives each key its prompt row and ledger reason. The response carries `ai_provenance`, stamped by the function (provider, model, time, `edited: false`).

**Constraints are now at most 12 lines of at most 400 characters** (was 8 of 300). The fill generators ground themselves in the campaign (a site and its neighbouring rooms, the beats either side of a quest beat, the pantheon), and that context travels as constraint lines. They are still bounded so the body cannot smuggle a second prompt past the limit, and each client builder clips to the same numbers because an overrun is a 400.

**Two new image purposes**, `dungeon_feature` and `deity` (`src/ai/imagePrompt.ts` and the server copy `supabase/functions/_shared/image-prompt.ts`), with matching Gallery kinds. Any new purpose must be added to both copies.

**Migration `20261003235538_ai_help_wherever_a_dm_authors`:** adds nullable `ai_provenance jsonb` to thirteen tables (`dungeon_features`, `deities`, `species`, `backgrounds`, `custom_classes`, `custom_subclasses`, `class_features`, `rules`, `crafting_recipes`, `calendar_events`, `quest_beats`, `npc_relationships`, `scriptorium_documents`); one `ai_generation_credit_costs` row per new generation type (`feature_generation`, `deity_generation`, `species_generation`, `background_generation`, `custom_class_generation` at 2, `custom_subclass_generation`, `class_feature_generation`, `custom_rule_generation`, `recipe_generation`, `calendar_event_generation`, `room_generation`, `quest_beat_generation`, `npc_relationship_suggestion`, `scriptorium_draft` at 2), each priced and calibrated on its own in the admin Pricing tab; and one `ai_system_prompts` row per generator key (plus `npc_relationships` and `scriptorium_draft` for the two dedicated functions), which admins edit in the Prompts tab and a re-run does not overwrite. Site rooms reuse `locations.ai_provenance`, which already existed.

**The provenance rule for all of them:** a hand-written row has no provenance. The generator writes it at create (or fill) time. The first save that changes what the model wrote flips `edited` through `markEdited()` (`src/ai/provenance.ts`), and a save that leaves the text untouched keeps it as generated. Fill surfaces that write into a draft compare against what the model produced to decide.

**Every AI edge function is DM-gated.** Each one admits only the campaign owner or a `dm` member (`isCampaignDm`, `supabase/functions/_shared/campaignAccess.ts`), never any member. A player is a member, and no player surface calls any generator, so the old "owner or any member" check only ever let a player in by calling the function directly: to read DM-only content the function fed the model (hidden NPCs, session notes, an NPC's backstory), or to spend the campaign's credits and the owner's own provider key. A player-facing generator, if one is ever built, needs its reads filtered by the player projections instead.

---

## Navigation

`src/lib/nav.ts` is the single registry. Three surfaces read it: the desktop
sidebar, the bottom bar's tab pools (`DmBottomNav`), and the "All sections"
sheet (`DmNavMoreSheet`). Nothing else should hold its own copy of a
destination — the bar used to, and carried a second set of labels and icons that
could disagree with the registry about either.

### The three groups

| Group | What belongs there |
| --- | --- |
| **Campaign** | The story you author and the things you reach for at the table |
| **Compendium** | The 5e content a campaign draws on — statblocks, spells, items, species, rules |
| **Publish** | Tools that turn a campaign into something outside the app |

This replaced **Campaign / Reference / Assets / Publish**, and the two names that
went were both describing a split that had stopped existing:

- **"Reference" held exactly one item** (Reliquary). A group heading over a
  single row is chrome that says nothing, and Reliquary is rules content by any
  reading, so it joined the rest of it.
- **"Assets" implied a global library standing apart from the campaign.** That
  stopped being true when Bestiary, Spellbook and Item Vault gained per-campaign
  source gating (`campaign_enabled_sources`) and `campaign_id` scoping: switching
  campaign changes what is in them, exactly as it does for Notes.

So the line between the first two groups is **not scope, it is kind** — above is
the story you write, below is the material you write it from. Judge a new entry
by that, not by whether it happens to be campaign-scoped.

**Compendium entries stay ungated** (`requiresCampaign` unset) while every
Campaign entry is gated. That is a preference, not an oversight: the group is a
mix — Bestiary, Spellbook and Item Vault narrow to the active campaign, Hall of
Heroes and most of the Codex do not — so there is no single honest answer, and
letting a DM browse content before picking a campaign is the friendlier one.

### Order

Campaign is ordered by how often a DM opens each entry, not by when it was
built, which is what the order used to be. Dashboard, Notes, Quests and Calendar
lead as the session loop (what happened, what is next, when); NPCs and Atlas
follow as the two things looked up mid-scene; Encounters and Soundboard sit with
them as live-play surfaces. Party is lower than its importance suggests only
because the Dashboard already shows it. Factions, Pantheon, Workshop and
Interlude are world-building you set up once. Settings is last everywhere.

### `SESSION_TAB_ROUTES` — the bar's ranking

The bottom bar ranks by mode (`prep` / `play`) rather than following the sidebar,
and **deliberately ignores the groups**: at the table nobody is thinking "is a
monster campaign content or compendium content", they are thinking "I need the
statblock". Grouping is a browsing aid and belongs to the sidebar; the bar is a
reaching aid, ranked purely by frequency. `sessionTabs(mode)` resolves those
routes against the registry so labels and icons come from one place.

Rule-gated sections (Workshop, Interlude) stay out of the pools on purpose — the
bar never checks campaign rules, so an entry there would show for campaigns that
have the rule switched off.

### Why two surfaces at all

The bar is a *compression* of the sidebar for when there is no room, and the
`barnav` / `sidenav` variants switch on **pointer type**, not width, so an iPad in
landscape gets the bar and a same-width laptop gets the sidebar. Collapsing
desktop onto the bar too would trade a grouped, fully-visible 29-item list for a
flat top-10 plus a sheet — the grouping only pays off where there is room to show
it. The drift risk that suggests merging them is real, and is answered by the
shared registry rather than by deleting a surface.

### `desktopOnly` is per item, not per group

A4/letter-output tools (Scriptorium, Card Forge, The Mint, Character Sheet,
Simulacrum, Illuminator, Cartographer) are impractical on a phone and hide below
`md`. The flag lives on the **item** because Publish stopped being uniformly
A4-bound when Gallery moved there — Gallery is a list of images a phone handles
fine, and a group-level flag would have hidden it from the devices most likely to
want it. `DmNavMoreSheet` filters per item and drops a group that empties out, so
a heading never appears over an empty grid.

---

## Full Feature List (marketing reference)

### Campaign Management

- **Dashboard** — at-a-glance campaign overview: active quests, party presence, live encounter banner, unidentified items, pinned notes
- **Session Notes** — rich-text notes with categories, tags, session numbers, per-player visibility, inline calendar event insertion, AI image generation (Chronicler)
- **Player Journal** — private + shareable per-player journal entries with entity context links; party journal aggregates all shared entries
- **Faerûn Calendar** — Calendar of Harptos month grid + Chronicle timeline view; travel events update party member locations; calendar adapter pattern supports custom settings

### World-Building

- **Atlas** — hierarchical location tree (World → Plane → Continent → Region → Country → City → District → Building → Room); 18 type taxonomy; map pinning with descendant surfacing; store/tavern inventory; per-field player visibility
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
- **Cartographer** — tile-based battle map editor on an infinite canvas; versioned WebP tile packs with schema-validated category slots; per-brush theme switching; **edge-based walls** (thin partitions) coexisting with a **`solidBlock` layer** (thick masonry) so the builder controls wall thickness; cell-level entity links (traps, encounters, NPCs); derives spaces/ways/zones from the drawing and reconciles them into the Atlas via Publish to Atlas; data preserved for a future in-app VTT

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
- **Live Sync** — Supabase Realtime subscriptions on every table in `SYNC_TABLES` (`useCampaignLiveSync`), plus the `campaign_sync` doorbell that carries what a campaign-filtered subscription cannot: deletes, whose payload is primary-key-only under RLS, and `store_items`, which has no `campaign_id`. Presence tracking
- **Role-Based Access** — DM vs player enforced via Supabase RLS on every table; players see only DM-shared data + their own private data

### Soundboard

- **Soundboard** — ambient sounds & music for live sessions; multi-page/scene organisation; five sound sources (upload, URL, Spotify, Freesound SFX search, AI-generated via Lyria — upload is Pro-gated, AI generation is `ai_enabled`- and credit-gated on any plan); music playlists (sequential auto-advance) and ambient playlists (layered simultaneous scenes); Web Audio filter effects (muffled through door/wall, distant, underwater, cave, sewer); Google Cast + Media Session (CarPlay/lock screen) for music playlists; free tier capped at 20 sounds / 1 page / 3 playlists; DM-only — players have no access (owner-only RLS, no realtime channel). See [soundboard.md](soundboard.md).

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
10. Shared library content (`library_*`) → resolve source slugs with `useLibrarySourceSlugs()`, never re-derive them from `useEnabledSources()` — see below
11. **After implementing a feature** → update the relevant feature doc in `context/features/`

### Reading shared library content

Any composable merging `library_*` rows with a user's own must take its source slugs from **`useLibrarySourceSlugs()`** (`useEnabledSources.ts`). Do not write `enabledQuery.data.value?.map(e => e.source_slug) ?? null` again.

That line looks self-evidently correct and is wrong in one case. `useEnabledSources` is *disabled* when there is no active campaign, so its data never arrives, the slug list sits at `null` forever, and the library query — gated on `!== null` — never runs. Every shared-content surface is then silently empty for a user who belongs to no campaign, which standalone play (#730) made an ordinary state rather than an edge case.

Six call sites had written that computed by hand and exactly one remembered the standalone case. The other five were empty for campaign-less users: no spells, items, monsters or species. It stayed invisible because nothing errors — the query simply never fires — and because the account you would naturally test on always has a campaign. It surfaced only when it collided with the level-up wizard's mandatory spell picks and produced a level-up that could never be confirmed (#736), which a real user reported (#737).

Three properties the helper encodes, all load-bearing:

- **`null` means "not known yet", `[]` means "the DM disabled everything."** They must stay distinct: `[]` fires a query that matches nothing and caches it.
- **No campaign → the `srd-2014` baseline**, never `null`. Without a campaign `useRuleset` resolves to 2014, so that is the matching edition.
- **A cleared campaign wins over cached source rows**, which may still be in hand after leaving one.

`resolveLibrarySlugs` holds the decision without Vue or the store, and `useEnabledSources.test.ts` pins all three.

**Library monsters, items and spells are never loaded as whole lists (#972).** A page that lists them reads one server page at a time (`browse_monsters`, `browse_items`, `browse_spells` through `useMonsterBrowse`, `useItemBrowse`, `useSpellBrowse`). A picker or name lookup reads the slim index (`useMonsterIndex`, `useItemIndex`, `useSpellIndex`: id, name and facets only, disk-cached under `library-*-index`). Anything holding a stored id reads those rows by id (`useMonstersByIds`, `useItemsByIds`, `useSpellsByIds`, `useStoredItemRefs`), and a player reads the projection plus by-id reads. `["library-monsters", id]` and `["library-spells", id]` hold single full rows only. An art or source change invalidates the index, browse, by-id and resolved keys together. The browse functions send their summary (totals, the select-all ids, the quota lock, the Vault's sources) with the first page only, so the three composables share one paging core (`useCatalogueBrowse`: settled search, next offset from page 0's total, stop on an empty page) and the three lists one sentinel (`useServerInfiniteScroll`, which re-observes after each page so a short page keeps loading). `browse_spells` lists co-members' custom spells (RLS allows it) and marks each row `is_own`; only own rows are editable or selectable. The by-id readers keep the previous rows while a changed id set loads (filtered to the ids still asked for), so adding one id never blanks the rest or unmounts the encounter runner, and a click that must decide on an item's flags reads it first (`resolveItemById`).
