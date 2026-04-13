# Grimoire — Feature Roadmap

---

## Core Features (Complete)

### Campaign Management

- [x] Campaign setting field — datalist with canonical D&D settings (Forgotten Realms, Eberron, Ravenloft, Dragonlance, Greyhawk, Planescape, Spelljammer, Dark Sun, Mystara, Homebrew) for quick selection while still allowing free-text custom worlds; `src/data/dndSettings.ts` shared across HeroEditor, HeroDetail, HallOfHeroes
- [x] Calendar adapters — added Ravenloft (BC), Planescape (PCR), Spelljammer (SY), Dark Sun (FY/Athas tenday), Mystara (AC/Thyatian) to the calendar registry; all settings now have a matching atlas location bundle in `settingLocations.ts`
- [x] Settings architecture refactor — each D&D setting is now a single `DndSettingDef` JSON file in `src/settings/` (calendar + locations + factions + Hall of Heroes seed data + default AI prompt); `src/settings/index.ts` is the single registry; calendar adapters derived at runtime via `toCalendarAdapter()`; custom DM settings can be injected at runtime via `registerSetting()`; `AiTab.vue` gained a "Load [Setting] Defaults" button; backward-compat re-exports kept in `src/data/dndSettings.ts` and `src/calendars/index.ts`
- [x] Populate from Setting — campaign edit modal (Details tab) shows a "Populate" button when editing the active campaign with a known setting selected; seeds atlas locations, notable NPCs, and factions in parallel (deduplicating by name); picking a different calendar now also auto-fills the WORLD field from the setting label; `usePopulateFactions()` and `usePopulateSettingNpcs()` added; `factions.color` column added via migration
- [x] Campaign Dashboard — live stat cards, active quests, party at a glance (HP bars, passive scores, conditions/curses), pinned + recent notes
- [x] PWA install support — `vite-plugin-pwa` generates a Workbox service worker; dashboard shows a dismissible install banner when the browser fires `beforeinstallprompt` (Chrome/Edge); event captured in `main.ts` before Vue mounts to avoid missing the early-fire
- [x] PWA auto-reload on service worker update — `controllerchange` listener in `main.ts` reloads the page when a new SW takes control, so installed PWA users always run the latest version without manual reinstall
- [x] Pull-to-refresh for iOS PWA — `usePullToRefresh` composable detects downward touch drag on any scroll-container-at-top, shows a themed indicator pill, and reloads on release past threshold; wired globally in `App.vue`; player settings also has an explicit "Reload app" button as fallback
- [x] DM Notes tracker (Tiptap editor, categories, tags, pinning)
- [x] Faerûn Calendar / timeline (Calendar of Harptos, adapter pattern for future settings)

### Rules Reliquary

- [x] Rules Reliquary — `/rules` with three tabs: DM Screen, Compendium, Custom Rules
- [x] DM Screen — hardcoded reference tables: conditions, combat actions, cover, light, skills, DCs, exhaustion, death saves, travel pace, concentration, spell slots
- [x] Compendium — 317 SRD 2024 rules synced from Open5e v2 into `srd_rules` table (shared, no user_id); searchable + tree-browsable
- [x] Custom Rules — per-user CRUD with Tiptap editor, category, tags, search
- [x] `sync-srd-rules` Supabase Edge Function — upserts Open5e v2 rules weekly (deployable via `supabase functions deploy`)
- [x] add a player view version of the reliquary: `/play/rules` with Reference tab (full DM screen tables), Compendium tab (full SRD), House Rules tab (view-only custom rules where DM toggled "Visible to players"), Codex tab (species with artwork/traits/variants and classes with features-by-level/subclasses in read-only accordions); DM sets visibility per rule in rule editor; eye icon on DM rule cards

### Content Creation & Homebrew

- [x] Scriptorium — Homebrewery-style editor, OneDnD 2024 PHB preview + PDF export
- [x] Scriptorium import engine — convert NPCs / monsters to Scriptorium documents
- [x] Scriptorium asset insert panel — browse and inject NPCs / monsters / locations as new pages
- [x] Image controls in Scriptorium editor (size presets S/M/L/XL, float left / center / right)

### Game Entities

- [x] NPC Generator — faction picker + role, known associate picker + relationship type added to generator panel; all three (location, faction, associate) are folded into the AI prompt as grounding constraints and pre-applied to the created NPC via post-create hooks
- [x] Item Generator — AI generates magic or mundane item (name, type, rarity, description, mechanical properties) from a flavor prompt with optional type/rarity constraints; creates item directly and navigates to it; same panel pattern as Monster/NPC generators
- [x] NPC tracker with full stat blocks, portrait upload, TraitSection editor
- [x] Spellcasting block on NPC/Monster stat blocks — structured `SpellcastingBlock` (ability, DC, attack bonus, spell groups with freeform frequency labels); spell picker in edit UI searches the Spellbook and renders selected spells as chip badges; display view renders each spell as a clickable link to `/spells/:id`; no migration needed (stored in existing `stat_block` JSONB column)
- [x] NPC Alter Ego — disguise name + portrait for NPCs with hidden true identities (hags, shapeshifters, spies); DM sets disguise name/portrait in the editor; when concealed the list/sheet/title all show the disguise identity; one-click Reveal/Conceal toggle in the sheet view saves instantly without entering edit mode; `is_revealed`, `disguise_name`, `disguise_portrait_url`, `disguise_portrait_focal_point` columns added to npcs table
- [x] Read-only sheet views for Monster, NPC, Item, and Spell — DnD-stat-block-style layout (image top-left, portrait fills row height up to 80vh with sticky on desktop, bordered stat block panel, trait sections); pencil button in page header toggles to edit form via `?edit` query param; shared `StatBlockPanel` and `TraitList` components reused across monster/NPC sheets; `StatBlockPanel` uses per-ability row layout (name | score | mod | save, per-ability color tints), `MonsterSheet` uses two-column layout (stat block left, traits/actions right); **Source Sans 3** added as `font-stat` for all stat block and trait text (15px body, 20px section titles, matching official DnD Beyond typographic spec)
- [x] List card quick-edit — hover any card to reveal an "Edit" button (pencil, floats top-left over portrait, `z-10` above the `z-2` card overlay link) that jumps directly to `?edit=true`, bypassing the sheet view; SRD monsters excluded
- [x] TraitSection descriptions switched from fixed-height `<textarea>` to `RichTextEditor` (auto-grows, rich text, handles legacy plain strings via `parseContent`)
- [x] Focal point support for items and spells — `image_focal_point` jsonb column added; `ImageUpload` uses `show-focal-point` mode matching NPC/monster pattern
- [x] Saving Throws and Proficiency Bonus added to NPC and Monster stat block types and editors
- [x] NPC detail reorganized: Lore/Inventory/Combat tabs, monster link + template unified on Combat tab, player sharing moved to action bar foldout, NPC Connections below Identity, Party Stance renamed from Relationship; Class/Role field removed (use Occupation); DM Secret merged into DM Notes; old affiliation column dropped
- [x] Bestiary — monster builder with 12 SRD template presets + full SRD bundle
- [x] Item Vault — full CRUD with 15 item types, 7 rarities, weapon damage dice, charges, attunement, image upload, card printing
- [x] Item Vault imports — real source from open5e `document__slug`; `weapon_range` + `versatile_damage` fields captured; re-import updates source/range/versatile without touching user images/tags; ammunition uses "Quantity" label instead of "Charges"
- [x] Vault: Cursed Items — `curse_description` + `curse_revealed` fields; DM always sees curse with hidden/revealed badge and inline reveal toggle on the detail view; players see curse only once DM reveals it
- [x] Vault: Services — added `service` item type; 36 SRD services (lifestyle expenses, food/drink, lodging, meals, hirelings, transport, spellcasting) imported via the existing SRD import button; DMs can edit or delete individual entries
- [x] Spellbook — full CRUD with school/level/class filters, Spell Level Advisor, attack mechanics, AOE, conditions, card printing
- [x] Atlas (Locations) — recursive hierarchy (world → plane → continent → region → city → town → building → room), Tiptap description, Scriptorium formatter
- [x] Atlas — "Populate Setting" button seeds iconic locations from the active campaign's setting (Faerûn: ~70 locations, Greyhawk/Eberron/Dragonlance: ~15–20 each)
- [x] Atlas — Parent picker in location editor with live breadcrumb updates
- [x] Atlas — Location sigil/emblem image upload (square format) displayed in editor and list cards
- [x] Atlas — Location editor restructured: large sigil left, name/parent/child/tags/pins right; child picker as combobox to reparent existing locations; compact calendar pins row

### Factions

- [x] **Factions system** — full CRUD for guilds, governments, religions, cults, etc. with emblem upload, type, alignment, player visibility toggle (per-player via `PlayerVisibilityToggle`), tags, rich-text description
- [x] **Unified player sharing pattern** — refactored Atlas, Quests, Factions, and Workshop (Crafting) to use the same `PlayerVisibilityToggle` component and DB pattern (`shared_with_players` + `player_visible_to`); replaced Crafting's grant-table system with the per-player visibility column approach; NPCs already implemented this pattern
- [x] **Faction members** — NPC multi-faction membership with roles (Leader, Officer, Member, etc.); replaces free-text affiliation field on NPCs
- [x] **Faction associations** — link locations and items to factions from the faction detail board
- [x] **Directional faction relations** — outgoing stance + incoming (how others view this faction); 8 relation types (Allied → Hostile + secret variants)
- [x] **Entity notes** — generic `entity_notes` table keyed by `entity_type + entity_id`; private (author only) or party-shared notes on any entity; shown on faction detail board
- [x] **Player faction portal** — `/play/factions` shows player-visible factions with description, notes panel (players can add private + party notes)

### Encounters & Combat

- [x] Encounters — builder (combatants + NPC combatants, factions, XP difficulty calculator with ally offset); combatant entries and monster search results now show AC and Speed alongside CR/XP
- [x] Encounter Runner — live combat with initiative, HP, conditions, death saves
- [x] Encounter Runner — spawn monsters/NPCs mid-encounter via ⚔ SPAWN panel (EntityCombobox + faction + count, stacked with traps in shared sidebar column)
- [x] Named curses in encounter runner (separate from flat conditions, syncs back to party on end combat)
- [x] End-combat sync — HP, conditions, curses, and death saves written back to party_members
- [x] Per-player combat faction assignment — party members and companions can be assigned to any combat faction in the encounter builder (e.g. charmed players fight for the enemy); stored in `party_member_factions` JSONB column (irongollem/grimoire#48)
- [x] Story faction membership for players — party members can join campaign factions (`faction_party_members` table, same role/status system as NPCs); faction detail page shows both NPC and player members; player portal faction panel shows fellow NPC members + the player's own rank when they share a faction (irongollem/grimoire#5)
- [x] Encounter list quest filter — dropdown with All / Unassigned / per-quest options; uses `quest_refs` (ref_type=encounter) via `useEncounterQuestLinks`; filter state persisted in ui store (irongollem/grimoire#15)
- [x] Unarmed strike + improvised weapon attacks in encounter runner — player detail panel now always shows Melee Attacks section with roll buttons (irongollem/grimoire#104)

### Quests & Adventures

- [x] Quests — full CRUD with kanban + list view, objectives checklist, sub-quests
- [x] Quest giver/location linking with item & encounter reward references
- [x] Player quest visibility (DM shares individual quests to player portal; per-player visibility via `PlayerVisibilityToggle`)
- [x] Player quest notes table with private/shared toggles per entry
- [x] Adventure Journal — player personal journal with 6 categories, context linking, private/shared entries
- [x] Scriptorium formatter for quests (title, status, objectives, notes)

### Party & Character Management

- [x] Party class dropdown — all 13 standard classes (incl. Artificer) replace the free-text input; `PARTY_CLASSES` constant added to `party.types.ts`
- [x] Party Tracker (initiative, HP, conditions, curses, death saves, passive skills)
- [x] Companions system (familiar/animal_companion/mount/ally/sidekick with source linking)
- [x] Companion cards in Party Tracker (HP, AC, conditions, source links)
- [x] Companions in Encounter Runner initiative
- [x] Party inventory — shared table with DM + player item management
- [x] Player character sheet — interactive D&D Beyond-style sheet with ability/save/skill rolls → campaign chat
- [x] Character sheet inventory (My Items / Party Stash split, equip toggle, attack/damage rolls)
- [x] Art object loot type — inline name + value + optional image + description, droppable to chat like vault items; images stored in Supabase Storage; feels identical to item drops for players (irongollem/grimoire#16)
- [x] Loot drops in chat — items droppable as cards with Claim / To Stash actions (real-time sync)
- [x] Currency drops in chat — DM drops PP/GP/EP/SP/CP from quest rewards; players claim to purse (real-time sync)
- [x] Coin purse on party members — pp/gp/ep/sp/cp fields, incremented on currency claim
- [x] Paper doll inventory view in player portal — equipped slots, belt, backpack, containers, stored, party stash
- [x] Item detail panel in player inventory — click any item name to open a slide-in panel showing art, type, rarity, cost, weight, description; quantity +/− controls; charge tracking (spend / recharge) for magic items with `current_charges` in `party_inventory`
- [x] Portrait image swapping on paper doll — replaced SVG character placeholder with real portrait images; swaps between `/assets/dressed.webp` and `/assets/naked.webp` based on whether the clothes slot is equipped; smooth opacity transition on swap
- [x] Carry weight tracking — parses `Item.weight` strings ("3 lb.", "1/4 lb." etc.) into numbers; shows per-container weight in container headers; total carried vs. capacity bar with green/amber/red colouring; Powerful Build races (Goliath, Centaur, Firbolg, Bugbear, Orc) auto-detected from race field for ×2 capacity; capacity override accepts expressions (`*2`, `+30`, `150`) so adjustments stay meaningful as STR changes; override editable inline in inventory and via character sheet form; `carry_capacity_override text` column added to `party_members`
- [x] Drag-and-drop inventory sorting — grip handle on each item row; drag to reorder within backpack, belt, or any custom container; order persists via `sort_order` column on `party_inventory`; optimistic cache update prevents flicker
- [x] Container tag system — vault items tagged `"container"` (Backpack, Barrel, Basket, Bucket, Chest, Component Pouch, Pouch, Quiver, Sack) auto-set `is_container: true` when added to inventory; CONTAINER checkbox in item editor; containers filtered out of backpack/belt/stored lists; "Add container" replaces `prompt()` with inline inventory picker to promote any owned item to a container; re-import now refreshes tags on existing SRD items
- [x] Ammunition data — arrows, bolts, sling bullets, blowgun needles, darts; silvered + adamantine variants for arrows and bolts; silvered bullets; firearm bullets (standard + silvered); all wired into vault import
- [x] Item detail panel stats — armor class, damage dice, versatile damage, range, and properties now shown in the player item detail panel
- [x] Attunement toggle — Attune/Unattune button in item detail panel for items requiring it; capped at 3 with "Slots Full" label; 3-pip indicator next to paper doll shows attuned slot usage with per-pip item name tooltip; optimistic state flip on click; `✦` glyph on attuned items in all inventory rows
- [x] Item identification system — `mundane_description` field on vault items (physical appearance before magic is revealed); `is_identified` flag on `party_inventory` (default true); unidentified items show mundane description + mundane rarity, hide attunement/charges/magical stats; DM sees amber "Unidentified" banner with one-click Identify button in item detail panel; Dashboard shows foldable "Unidentified Items" block with carrier info and per-item Identify button; AI generator populates `mundane_description` with no magical hints
- [x] Mundane artwork — `mundane_image_url` + `mundane_image_focal_point` fields on items; vault editor shows Identified/Mundane art tabs; vault sheet shows tabbed art preview when both images present; item detail panel in player inventory shows mundane art (falling back to identified art) while unidentified
- [x] Inventory realtime sync — `useInventoryLive` subscribes to all `party_inventory` INSERT/UPDATE/DELETE events per campaign; all players (including DM dashboard unidentified-items panel) see changes instantly without reload
- [x] Party stash move dropdown — "Party Stash" option added to every item row's location select; moving to stash sets `carried_by = null`; moving from stash to a personal location assigns `carried_by` to the acting player; `InventoryLocation` type enforced through the emit chain
- [x] RLS: campaign members can read vault items in party inventory — without this players saw `vaultItem = null` causing every item to show as "Art Object" with no artwork

### Layout & UX

- [x] **Sticky page headers** — unified `PageHeader` layout component with sticky title/actions bar; `#sticky` named slot for search/filter bars (NPC list, Location list); scrollable body; `main` padding removed so headers sit flush at viewport top with no gap; all DM views converted to use `PageHeader` as root element
- [x] **Persistent filter state** — Quests, Factions, Encounters, NPCs, Monsters, and Vault filter state stored in `useUiStore` (Pinia), persists across navigation within a session; filter bars lifted into `#sticky` PageHeader slots; `hasActiveFilters` + "Clear" button on all six views
- [x] **Global cross-entity search** — Cmd/K search bar in sidebar (desktop) and search icon overlay (mobile); parallel ilike queries across NPCs, monsters, notes, spells, items, locations, and quests; results grouped by entity type with direct navigation links; 5 results per group max (irongollem/grimoire#37)
- [x] **Alter ego search** — NPC list filter and global search both match `disguise_name`; global search results show `Real Name (Alter Ego)` when an alter ego is set
- [x] **Hall of Heroes** — global admin-curated NPC roster at `/hall-of-heroes`; `hall_of_heroes` table with setting tag + admin-only RLS; any DM can browse and click "Add to Campaign" to clone a hero into their NPC list; campaign-setting heroes sorted to top; admin editor at `/hall-of-heroes/new` and `/:id/edit`; seeded with 10 iconic characters (Icewind Dale + Honor Among Thieves) with public-knowledge lore filled in (irongollem/grimoire#107)
- [x] **Hall of Heroes full seed** — bulk SQL migration (`20260411000003_seed_hall_of_heroes.sql`) seeds all 120 iconic heroes across all 9 D&D settings; upsert with unique index on `(setting, lower(name))` preserves existing art on re-run; "Sync All Settings" admin button (`usePopulateAllSettingHeroes`) handles future setting additions without requiring a new migration
- [x] **Mobile & tablet responsiveness overhaul** — full audit + fix across every list/editor view. Infrastructure: `useBreakpoint` composable (`useIsMobile`/`useBelow`/`useAbove` over `@vueuse/core` useMediaQuery), `pt-safe`/`pb-safe`/`pl-safe`/`pr-safe` Tailwind utilities, `viewport-fit=cover` + `h-dvh` on layouts, safe-area offsets on PlayerLayout toasts/nav/FAB. Shared primitives: `ListPageLayout` (title hidden on mobile since AppTopBar shows it; action row auto-scrolls on narrow screens; DiceRoller desktop-only), `ListActionButton` (primary/secondary/ghost variants with `max-sm:hidden` label collapse so + and icons stand on their own below `sm`), `ListFilterBar` (auto Clear button, `#above` slot for multi-row filter layouts), `ListSearchInput`, `ListFilterGroup` (segmented pills), `ListFilterSelect` (native OS picker). All 17 list views migrated — Dashboard, NPCs, Bestiary (Monsters), Hall of Heroes, Items, Notes, Locations, Quests, Rules, Scriptorium, Species, Spells, Traps, Puzzles, Factions, Encounters, Workshop (Crafting), Soundboard. Spot fixes: Tiptap toolbars scroll horizontally on mobile, Scriptorium editor/preview no longer nested-scroll, Atlas map supports pinch-zoom/pan/wheel-zoom with pins staying at natural size at any zoom, LocationEditor stacks sigil above identity on mobile + truncates child pills, Runner combatant list renders as stacked card on `<md` (HP controls never overlap name), EncounterRunner top bar collapses to icon-only, CampaignChat tab swallows synthetic click to prevent "flash-and-close". Publish nav group (Scriptorium / Card Forge / The Mint) hidden on mobile via new `desktopOnly` flag on `NavGroup` — these tools target A4/letter output and aren't usable on a phone. (irongollem/grimoire#132, #134, #135, #136, #137, #138)

### Images & Artwork

- [x] Smart image cropping — `FocalImage` component with smartcrop.js content-aware analysis + localStorage cache; three canonical formats: `portrait` (2:3), `landscape` (9:4), `token` (1:1 circle)
- [x] Manual focal point override — `FocalPointPicker` component; click-to-set stored per entity in DB (`portrait_focal_point` on NPCs, monsters, companions)
- [x] Companion portraits — upload, focal point, auto-fill from linked monster/NPC source; token avatar in DM companion card
- [x] Standardised image displays — NpcList, MonsterList, CardForge (all 8 card types), PartyTracker, TokenForge, and player portal all use FocalImage with the correct format
- [x] Shared `ImageUpload` component — unified dashed drop zone, drag-and-drop, optional focal point picker, bucket cleanup on replace/remove; used across all 8 upload locations (NPCs, monsters, items, spells, party members, locations, traps); `card_art_focal_point` added to monsters table + SRD art overlay
- [x] Egress optimisation — WebP conversion on upload (canvas, max 1920px, 85% quality); `FocalImage` lazy-loads all images (`loading="lazy"`); Supabase Pro image transforms (resize + WebP at CDN edge) gated by `VITE_SUPABASE_TRANSFORMS=true`; client-side infinite scroll (48/page, IntersectionObserver) on Monster, NPC, and Item lists

### Printing & Export

- [x] Card Forge — MTG (63×88mm) and Tarot (70×120mm) print-ready cards with duplex alignment
- [x] Card Forge — 5mm gap between printed cards (3mm visible after 1mm bleed each side); padding recalculated to keep sheets perfectly centered on A4; duplex alignment unaffected
- [x] Card Library — localStorage save/load named collections across all card types

### Collaboration & Multi-Player

- [x] **Phase 1**: campaign_members + campaign_invites tables, DM auto-membership, invite link flow (/join/:token), role-based router guard, Campaign Settings UI
- [x] **Phase 2**: Player portal (/play/\* routes), presence indicators (online dots), notes/quest visibility flags, party inventory (players read), campaign broadcast system, campaign chat + dice roll log (Supabase Realtime)
- [x] **Phase 3**: encounter_state table, live encounter sync (DM "Go Live" button), PlayerEncounterView (initiative, HP, active combatant), live encounter indicators, state persists across navigation
- [x] **Phase 4**: Interactive player character sheet (ability/save/skill rolls in campaign chat, HP ±buttons, death save pips, condition toggles), inventory management (My Items, Party Stash, equipped weapons), RLS for player-owned updates, broadcast notifications
- [x] **Phase 4 QoL**: Death save "Roll d20" button (nat 1 = 2 failures, nat 20 = stabilize, auto-increments pips + posts to chat); condition-aware rolls — Poisoned/Blinded/Frightened/Prone/Restrained auto-apply disadvantage to attack rolls; Exhaustion applies disadvantage to ability checks; Dis indicator on conditions header + weapon/spell attack buttons (irongollem/grimoire#40)
- [x] **Encounter click-to-roll**: Monster action attack/damage buttons auto-parsed from description ("X to hit", "(XdY+Z)" parenthetical); player prepared/known spells shown in detail panel with 🎲 roll + DC badge; all results post to campaign chat via correct message/type schema
- [x] **Immersive Rolls**: Campaign-level toggle in World Settings. When on, certain player skill checks (stealth, knowledge, insight, investigation, medicine, survival) post only flavor text to public chat; DM receives the full result via private whisper; player does not see their own dice result — promoting immersion for hidden info scenarios
- [x] **Stability**: Replaced `getUser()` (navigator.locks + network) with `getSession()` across all mutations — eliminated multi-tab save failures and lock contention
- [x] **Turn notifications**: Screen shake + optional audio chime when it becomes the player's turn in a live encounter; audio toggle in player Settings → Combat Notifications (irongollem/grimoire#105)
- [x] **Realtime fix**: Added `REPLICA IDENTITY FULL` to `campaign_messages` — silently-dropped Realtime events with RLS now deliver correctly
- [x] **Themed dialogs**: Replaced all browser `confirm()`/`alert()` calls with a styled `ConfirmDialog` component (`useConfirm` singleton)
- [x] **Theme system**: Campaign-level theme picker (Grimoire dark / Tome light) stored in DB, applied to all players on campaign switch. Canonical vars in `src/lib/themes.ts`
- [x] **Character sheet — Features tab**: Added "Features" tab to `PlayerCharacterView`; shows all class features grouped by level (derived from static class data), class choices (subclass, invocations, expertise, etc.) as chips, and resource pool current/max with rest-type badges — no new DB columns needed
- [x] **Resource & spell slot tracking**: Features tab now fully interactive — spend/restore buttons on class resources (Ki, Rage, Sorcery Points, etc.), pip buttons on spell slots, short rest (restores short-rest resources + Warlock pact slots) and long rest (restores all) buttons with confirm dialog; optimistic local state, persisted via useUpdatePartyMember
- [x] **Inline feature descriptions**: Added FeatureEntry type (string | {name, description}) to class data; annotated all 13 SRD classes at levels 1–5 with concise descriptions; Features tab shows expandable chevron for described features, inline description panel on tap
- [x] **Quest improvements**: Currency reward fields (PP/GP/EP/SP/CP) on quests with drop-to-chat; per-ref player visibility toggle (Eye/EyeOff); removed broken Gregorian date inputs
- [x] **Edit Campaign modal**: "Calendar" dropdown renamed to "Setting"; game world text field renamed "World"; theme picker added inline to Details tab
- [x] **NPC sharing**: DM marks NPC as shared; per-field visibility controls (portrait / name / status / race / occupation / relationship); party notes (shared) + personal player notes (private) on shared NPCs; per-player visibility (eye+popover on list cards, same UX as monster sharing — whole party or specific party members via `player_visible_to uuid[]`)
- [x] **Companion player portal**: Companions shown alongside party members in player portal; party notes (shared via RPC) + personal notes (private) per companion
- [x] **Unified player notes**: `PlayerNotesWidget` component backed by `entity_notes` table — consistent one-note-per-player + shared party notes UX across all player portal views (NPCs, quests, factions, companions)
- [x] **Migrate `npcs.party_notes`** — legacy per-column party notes migrated into `entity_notes`; column dropped; DM editor "Party Notes" field removed; all campaign members can see each other's shared notes via symmetric RLS policy
- [x] **Campaign delete hardening** — trash icon removed from campaign picker dropdown; delete moved to dedicated "Danger Zone" tab in Edit Campaign modal; requires typing campaign name to confirm (GitHub-style)
- [x] **Vendor offer chat message** — DM posts price propositions from chat toolbar (ShoppingBag button) or directly from store/inn/tavern location wares (ShoppingBag per item, pre-fills price from override/item.cost via parser); players see PAY button; auto-converts wallet across denominations (PP→GP→SP→CP greedy, EP preserved); item added to inventory if specified; insufficient funds shown inline
- [x] **Player-to-player item trading** — players list inventory items for sale from the item detail panel (price in any coin mix) or via the ShoppingBag shortcut on each inventory row; posted as `player_offer` chat message; other players see BUY button (affordability-checked); DM sees "Accept (DM)" to take the item for free from seller; on purchase: seller's wallet credited, buyer's wallet debited, item `carried_by` transferred; DM buy removes item outright
- [x] **DM "Talk As" NPC persona** — persistent "As:" combobox above the whisper selector in chat (DM only); when set, all messages, vendor offers, vendor claims, and trade purchases are sent under the NPC's name; chat bubbles reflect the NPC name rather than the DM account; clearing the selection reverts to normal DM identity
- [x] **Typography polish** — placeholder opacity globally dimmed (40%) so placeholders are clearly distinct from input text; body font migrated from IM Fell English (no bold variant) to Crimson Pro (weights 300–700, proper bold rendering); RTE heading sizes toned down (H1: 2xl→lg, H2: xl→base, H3: base→sm)
- [x] **Rest dialog with hit dice** — short rest: roll hit dice (class-appropriate die, CON bonus) to spend toward healing with live HP preview; long rest: full HP/resource/spell slot restore + half-level dice recovery; `hit_dice_remaining` column on `party_members`; `RestDialog` + `RestButtons` components; all rest types post via `useUpdatePartyMember`
- [x] **Player encounter panel** — "YOUR TURN!" pulsing banner in `PlayerEncounterView` when the active combatant matches the player's linked party member; "MY CHARACTER" section shows Features tab with rest buttons
- [x] **Player live encounter CTA** — green pulsing "Live" button in `PlayerLayout` top bar whenever an encounter is running; toast notification + auto-navigate to `/play/encounter` when the DM hits Go Live mid-session (skips initial data load via `runningLoaded` flag); `usePlayerEncounterLive` subscription moved to `PlayerLayout` so turn/HP/visibility/condition updates stay live regardless of which player page is open
- [x] **Character sheet header redesign** — inspiration star beside name; LevelUp/Edit as icon buttons in name row; HP tools row separate from readout; condition chips with compact `+` picker (search + click to add, × to remove, click chip title for tooltip); disadvantage badges inline beside HP; Rest/Sleep buttons in stats row; global `cursor: pointer` on all buttons via CSS base layer

---

## Planned (Backlog)

### Dungeon craft

- [x] **Traproom** — full CRUD for traps with image, type badge, trigger, detection/disarm DCs, CR+XP, save, attack bonus, damage dice (via DiceExprInput), damage type, reset type, rich description + DM notes; Assets group (no campaign scoping)
- [x] Trap HP/AC fields (physical destruction) + CR advisor (Suggest button → modal grades CR from effect category, targeting, DC tier, reset, HP/AC, secondary effects)
- [x] Add traps (created in the traproom) as elements of an encounter so their CR contributes to the total — `EncounterTraps` component in encounter builder; trap XP added flat (no multiplier) to difficulty; hazard XP shown separately in Difficulty Analysis panel
- [x] Trap detail panel in encounter runner — click a trap to inspect it; roll Detect/Disarm DCs, attack bonus, save DC, and damage dice; effect description and notes shown inline
- [x] Traproom prepopulation — "Populate Traproom" button bulk-inserts 14 classic DMG/PHB trap archetypes (pit, needle, darts, rolling sphere, collapsing roof, net, fire statue, sphere of annihilation, flooding room, glyph, alarm, mushrooms, swinging log); skips traps that already exist by name
- [x] **Multiple damage types per trap** — refactored from single `damage_type`/`damage_dice` fields to `damage_entries` array (`DamageEntry` interface with `dice` + `type`); trap editor has "+ Add" button to add multiple damage entries (e.g. 1d6 bludgeoning + 1d10 piercing); all trap templates updated to support split damage
- [x] **Enigmarium (puzzle room builder)** — full CRUD for puzzle rooms: type (Logic/Physical/Arcane/Social/Environmental), difficulty (Trivial→Deadly), setup description, ordered hints (add/reorder/remove), solution field, skill checks with DCs, success outcome + failure consequence, image with focal point, tags, DM notes; "Populate Examples" button inserts 3 curated examples (The Three Doors, The Celestial Orrery, The Waterway Vault); Assets group in nav

### Encounters

- [x] **Health info visibility** — campaign-level setting (strategic/immersive/unknown); strategic: PCs exact HP + bar, non-PCs bar + label; immersive: PCs exact, others label only; unknown: PCs exact, others nothing
- [x] **Monster reveal system** — monsters start hidden; DM cycles hidden→unseen→revealed per monster; unseen shows mystery slot to players; revealed shows full info; hidden completely absent from player view
- [x] **Encounter Events** - timed bombs, reinforcements, dynamic changes based on triggers (e.g. "when Goblin King hits 50% HP, spawn 3 Goblin minions") all need initiative positions, tracking, and triggers.

### Monster Discovery & Player Bestiary

- [x] **Phase 1 — `discovered_monsters` table** — campaign-scoped discovery records for both SRD (by `srd_slug`) and custom monsters (by `monster_id` FK); `visible_to uuid[]` field: null = whole party, array of `party_member_ids` = specific players (supports druid backstory knowledge, per-encounter reveals). RLS: DM full CRUD; players SELECT only records visible to them.
- [x] **Phase 2 — Player Bestiary** (`/play/bestiary`) — resolves discoveries against in-memory SRD + DB monsters; portrait grid with CR colour bars; lightbox with artwork banner, AC/HP/Speed, AbilityScoreTable, PlayerNotesWidget (lore, weaknesses, how to defeat). "Bestiary" in player nav (Skull icon). Eye/EyeOff toggle on **all** DM bestiary cards (SRD + custom); lit when shared, hover-reveal when hidden; per-player visibility popover (whole party or specific party members via `visible_to uuid[]`); optimistic updates for instant UI feedback; DM preview respects per-player visibility client-side; focal point passed to bestiary lightbox and card thumbnails; cursor-pointer on eye buttons.
- [x] **Phase 3 — Auto-discovery on end combat** — when DM clicks "End Combat", any monster combatants that reached `revealed` state are automatically inserted into `discovered_monsters` (deduped). DM sees a toast listing what was auto-shared.
- [x] **Phase 4 — Shapeshifter browser** — "Available Forms" tab in `/play/bestiary` (shown only for Druids, Rangers, Summoners). Druids: filters discovered + SRD beasts by CR ≤ ⌊level/2⌋, Beast type, no fly/swim speed (until level 8). Summoners/Rangers: shows linked companion templates. Full stat block viewable per form. DM can pin extra forms to a player regardless of filter rules. (Note that circle of the moon druids have more flexible rules with regards to available forms)
- [x] **Phase 5 — Wildshape in encounter** — Druid player panel in encounter runner gets a "Wildshape" button. Opens a picker showing available beast forms. Selecting a form temporarily overlays that combatant's HP/AC/speed with the beast's stats (HP tracked separately, reverts to original when beast HP hits 0 or "Revert Form" is clicked). Beast's actions/abilities shown in detail panel during wildshape.

### NPCs & Companions

- [x] **Companion stat block** — optional full stat block on companions; auto-populated when picking a monster source; ability scores, actions, reactions stored in `stat_block` JSONB
- [x] **Monstrous NPCs** — `linked_monster_id` FK on NPCs; dropdown to link to existing monster; "Promote to Monster" button creates a Bestiary entry from NPC data and links back
- [x] **NPC relationship data** — `npc_relationships` table; NPC editor "Relationships" section with add/remove; type badges (Family, Ally, Rival, Enemy, Mentor, etc.); bidirectional display
- [x] **Faction member status** — Active / Retired / Defected / Expelled / Deceased per membership; former members shown in collapsible "Former Members" section; status badge on NPC faction chips
- [x] **NPC inventory** — `npc_inventory` table; per-NPC item management with quantity; "Drop to Chat" sends items as loot; DM can claim chat loot directly into an NPC's inventory via "To NPC" picker
- [x] **SRD monster art upload** — `srd_monster_art` table stores per-user art overlays (portrait + card art) keyed by stable `srd_id`; merged into in-memory SRD monsters at query time; long-cached (30 min stale); no duplicate bestiary entries

### Spells

- [x] Server-side pagination for Spellbook — 50 per page, Supabase-filtered by level/school/class/name, debounced search, keepPreviousData for smooth transitions
- [x] Add the artificer as class to the list of "who this spell is for" — Artificer was already in SPELL_CLASSES; existing DB rows lacked it because the old importer filtered it out. Fixed via re-import update pass.
- [x] Track the actual book source from open5e — `document__slug` now stored as `source`; `OPEN5E_SOURCE_LABELS` map provides human-readable names; `spellSourceLabel()` helper used in UI
- [x] Source filter in spell list view — dropdown populated from distinct sources present in DB; labels resolved via `spellSourceLabel()` (human-readable: "D&D SRD 5.1", "Xanathar's Guide to Everything", etc.)
- [x] Re-import updates existing spells — "Sync from Open5e" button now updates `source` + `classes` for all `open5e_import = true` spells without touching images or user-edited fields; `open5e_import` boolean flag added (migration `20260328000053`); status label shows added/updated counts
- [x] Human-readable source labels everywhere — `source_title` + `source_url` stored from `document__title`/`document__url`; source line in spell detail and editor is a clickable link to the product page; filter dropdown queries on slug, displays title; `spellSourceLabel(slug, title)` used throughout with hardcoded map as fallback

#### Player Spells — Phase 1: Browse

- [x] `/play/spells` — full spell browser in the player portal, pre-filtered to the character's class; same server-side pagination/filters as DM spellbook; "Spells" added to player nav

#### Player Spells — Phase 2: Spellbook & Known Spells

- [x] `character_spells` DB table — `party_member_id`, `spell_id`, `is_known`, `is_prepared`; RLS: player owns, DM reads; migration `20260328000055`
- [x] Caster type logic per class: **prepared** (Cleric, Druid, Paladin, Artificer — access full class list, no learning needed), **known** (Sorcerer, Warlock, Bard, Ranger — learn a fixed list, always prepared), **spellbook** (Wizard — add spells to spellbook, then prepare a subset); `getCasterType()` in `spell.types.ts`
- [x] "Add to Spellbook" / "Learn Spell" button on spell browser cards (spellbook + known casters); hidden for prepared casters
- [x] "My Spells" tab in `/play/spells` — learned spells grouped by level with remove button; prepared casters see a "browse All Spells" prompt; `PlayerMySpells.vue`

#### Player Spells — Phase 3: Preparation

- [x] 3-tab layout for Wizard: Prepared | Spellbook | All Spells
- [x] 2-tab layout for prepared casters (Cleric/Druid/etc.): Prepared | All [Class] Spells; "Prepare"/"Unprepare" button in browse tab
- [x] 2-tab layout for known casters (Sorcerer/etc.): Known | All [Class] Spells
- [x] Prepare toggle in Spellbook tab (Wizard only) — Flame icon when prepared, Circle when not
- [x] Cantrips always shown as prepared (level 0), no toggle
- [x] Prepared count vs. max displayed — `getMaxPrepared()` helper in `spell.types.ts`; Cleric/Druid: WIS mod + level; Paladin: CHA mod + ⌊level/2⌋; Artificer: INT mod + ⌊level/2⌋; Wizard: INT mod + level; counter shows green/amber/red based on current vs. max

#### Player Spells — Phase 4: Click-to-Cast in Encounter

- [x] Prepared spells accessible from encounter runner player detail panel with 🎲 roll + DC badge

### Atlas / Locations

- [x] **NPC location filter includes child locations** — selecting a city shows NPCs in all sub-locations; `useLocationTree` composable (with `getDescendantIds` + tree-sorted combobox options) shared across modules
- [x] **NPC sort by location** — Name / Location toggle in NPC list; location sort uses DFS tree order so parent locations precede children; no-location NPCs go last; ties broken by NPC name
- [x] **Player NPC relevance rating (1–5)** — players rate NPCs 1–5 for personal relevance (stored in localStorage per device); rating pips on player portal card grid and detail lightbox; portal sorts by rating desc (unrated last), with search and relationship filter
- [x] **People in the Area** — "People in the Area" section on location pages shows NPCs assigned to this location or any descendant; sublocation badge shows which child the NPC belongs to; count reflects full tree depth
- [x] **Full ancestor breadcrumb** — location editor breadcrumb walks the entire parent chain (root → … → parent → current), all segments clickable; depth capped at 10 to prevent cycles
- [x] **Map upload & pinning** — upload a map image per location; interactive `LocationMap` component with drag-to-place child pins, per-pin player visibility toggle, hover labels, single-click navigation; `is_map_shared` toggle shares the map with players; pin positions stored as % in `map_pins` JSONB (child name/type denormalised for player reads)
- [x] **Player Atlas** — `/play/atlas` lists DM-shared maps; expandable cards show `LocationMap` in view mode (player-visible pins only); clicking a pin auto-expands that child's map if it's also shared
- [x] **Player location notes** — each Atlas card has a `PlayerNotesWidget` (private / shared party notes) using the generic `entity_notes` table with `entity_type="location"`
- [x] **Watch panel on atlas pins** — player can hover/click map pins to expand a pill showing pin actions; "Watch" button always available (shows location art + player summary + notes in a modal); "Go there" button gated on `sharedChildIds` (only navigates if child location is shared)
- [x] **Full location sharing** — DM can set a player summary (always visible), share the full Tiptap description, and share linked player-visible NPCs per location; three new DB columns + editor toggles; player atlas renders each section when enabled (issue #34)
- [x] **PlayerVisibilityToggle component** — reusable eye-icon button in action bars opening a popover with "All players" toggle + individual party member checkboxes; used in LocationEditor and NpcDetail (replacing the old Players foldout); locations get new `shared_with_players` + `player_visible_to` columns matching the NPC pattern
- [x] **Player notes UX overhaul** — `PlayerNotesWidget` now shows two independent boxes: "My Private Notes" (is_private=true, only author sees) and "My Party Notes" (is_private=false, full party sees); "From the Party" section shows all other members' shared notes; RLS updated so players can see each other's non-private notes (previously only DM↔player was symmetric)
- [x] **Populate Planes button** — "Populate Planes" button in Atlas header seeds the 21 standard D&D planes (transitive, inner, outer, and Sigil) via `usePopulatePlanarLocations`; two-pass insert resolves parent links (Avernus → Nine Hells); idempotent — skips already-existing planes
- [x] **Atlas type filter dropdown** — replaced pill-button type filters with a compact `<select>` dropdown in the Atlas header, matching the encounters view layout
- [x] **Pin through vague regions** — the map editor's Unplaced picker now recurses through container types (world / plane / continent / region / country) to surface concrete descendants, so a map of Icewind Dale can pin the individual Ten Towns without first flattening the hierarchy. Each surfaced entry shows a breadcrumb (`· Ten Towns`) so the DM can tell which region it came from. (issue #139)

### Rules reliquary

- [x] **Rules reference section** — three-tab Reliquary at `/rules`: DM Screen (hardcoded tables), Compendium (317 SRD rules from Open5e v2, tree-browsable + searchable), Custom Rules (CRUD with Tiptap + category + tags)
- [x] **Custom rules entries** — per-user CRUD with Tiptap editor, category dropdown, comma-separated tags, search; `sync-srd-rules` Edge Function upserts shared `srd_rules` table weekly

### Scriptorium

- [x] **Two-column layout** — Columns2 toolbar button toggles `column-count: 2` on both the editor and the Scriptorium preview; persisted per document in DB (`is_two_column`); H1/H2 span both columns in preview

### Tokens & VTT Integration

- [x] **The Mint** (formerly Token Forge) — circular VTT token generator at `/tokens`. Source tabs: Party / NPCs / Monsters / Custom. Ring colour presets + custom picker. Ring width options. Optional curved arc name label. Export 280px / 512px PNG + clipboard copy. Entities without art get an initial-letter placeholder.
- [x] **Token print sheet** — multi-select tokens into a print queue, choose physical size (25mm / 32mm / 50mm), back style (Mystery ? / Mirror front), prints duplex-aligned front + back A4 sheets with column-reversed backs.
- [x] **Coin designer** — SVG coin designer tab in The Mint. Metal selector (Copper/Silver/Electrum/Gold/Platinum) with auto-denomination (CP/SP/EP/GP/PP). Emblem picker (Crown/Cross/Fleur/Star/Anchor/Moon/Diamond/Omega/Knight). Centre value + denomination label. Curved rim inscription via SVG textPath. Live preview. Duplex-aligned A4 print sheet (Small 24mm ×70 / Standard 30mm ×48 / Large 38mm ×35 per sheet).

### Misc

- [x] **Campaign settings page** — Edit Campaign modal + `/campaign/settings` (Members, Invite Links, World Settings tabs)
- [x] **Crafting system** — allow players to craft items using gear proficiencies, crafting tools
- [x] **Crafting multi-output** — recipes can produce multiple output items (e.g. 4× leather strips + 1× tanning waste from raw hide)
- [x] **Crafting open to non-proficient players** — disciplines no longer fully locked; players without tool proficiency can still attempt (no proficiency bonus), with "NO PROF" badge on tab; standard workspace bonus and poor-ingredient penalty modifiers added to all attempt dialogs
- [x] **Recipe player visibility** — replaced dedicated GrantRecipeDialog with unified PlayerVisibilityToggle component; recipes now use `shared_with_players` + `player_visible_to` columns matching NPC/quest/location pattern

---

## AI Features

BYOK (Bring Your Own Key) — DM enters their OpenAI key in Campaign Settings → AI Assistant tab. Calls are made browser-side directly to OpenAI using the DM's key. No quota enforcement or Edge Functions needed at this stage.

**Infrastructure shipped:**

- `src/ai/` module: `types.ts`, `prompts.ts`, `useNpcGeneration.ts`, `NpcGenerateDialog.vue`
- `openai_api_key` + `ai_setting_prompt` columns on `campaigns` (migration `20260330100000`)
- Campaign Settings → "AI Assistant" tab in the Edit Campaign modal (`CampaignSwitcher.vue`): key input + campaign setting prompt textarea
- "Generate" button appears on the NPC form when an API key is configured
- Note: `CampaignSettingsView.vue` is dead code (never registered in the router) — all campaign config lives in the modal

**Security & Storage:**

- [x] **API key encryption** — AES-256-GCM via Supabase Edge Function (`api-key-vault`); keys stored as `enc:v1:<iv>:<ciphertext>` in DB; encryption secret held in Supabase env (not in code/DB); `decryptApiKey()` transparently handles legacy plaintext; backward compatible (irongollem/grimoire#51)
- [x] **Local-only storage option** — checkbox in AI tab; when enabled, key stored only in `localStorage`, DB set to `null`, warning shown that key is device-specific; when disabled, key encrypted to DB, localStorage cleared
- [x] **Storage bucket MIME + size limits** — `npc-portraits` and `asset-images` buckets restricted to image MIME types (jpeg/png/webp/gif/avif/svg) with a 10 MB cap; `sounds` bucket restricted to audio MIME types with a 20 MB cap; enforced at the Supabase storage layer (API-level, not just client-side); `SoundForm.vue` file input also restricted to explicit audio MIME types (no `.mp4` in picker) with a matching 20 MB client-side guard

### Text generation — OpenAI (gpt-4o-mini for structured output)

- [x] **NPC generation** — concept prompt → full NPC (name, race, alignment, age, occupation, appearance, personality, backstory, DM notes, status, relationship, tags) + portrait image prompt. Populates the NPC editor form. Personality uses D&D 5e sections (Personality Traits / Ideal / Bond / Flaw) as Tiptap h3 headings.
- [x] **Monster generation** — concept prompt → full stat block (name, type, size, alignment, habitat, tags, description, DM notes, and complete MonsterStatBlock: AC, HP, speed, ability scores, saving throws, skills, immunities/resistances, senses, languages, special abilities, actions, bonus actions, reactions, legendary). Optional CR/type/size constraints lock specific values while AI fills the rest. Populates the Bestiary editor form.
- [x] **Markdown paste support in RichTextEditor** — pasting text containing markdown block syntax (`## headings`, `- bullets`, `1. ordered lists`, `> blockquotes`, `**bold**`, `*italic*`) is auto-converted to Tiptap nodes. Plain text paste is unaffected.

### Image generation — OpenAI gpt-image-1.5

- [x] **NPC portrait generation** — auto-generated as part of NPC generation; uploaded to `npc-portraits` Supabase Storage bucket.
- [x] **AI provider abstraction** — extracted all hardcoded OpenAI fetch calls into `TextProvider`/`ImageProvider` interfaces with `getTextProvider()`/`getImageProvider()` factories in `src/ai/providers/`. Generators read API key and campaign setting from stores internally; zero params needed at call sites. `b64ToBlob` shared utility in `src/ai/utils.ts`. NPC generation gains alter ego toggle (disguise name + inpainted portrait), image-skip toggle, and always-present `disguise_name`/`disguise_image_prompt` schema fields (null when not requested).

**Cost estimates (approximate):**

| Feature                 | Model                    | Est. cost/call |
| ----------------------- | ------------------------ | -------------- |
| Monster/NPC generation  | claude-haiku-4-5         | ~$0.003        |
| Description enhancement | claude-haiku-4-5         | ~$0.001        |
| Portrait generation     | FLUX Schnell (Replicate) | ~$0.003        |
| Token art               | FLUX Schnell             | ~$0.003        |
| Scene art               | FLUX Dev                 | ~$0.025        |

**Free tier quota:** 10 AI calls/month. **Pro quota:** 200 calls/month included; additional packs purchasable.

---

## Monetization

Grimoire is currently a free, open-source DM toolkit. As the feature set matures (especially AI and collaboration), a sustainable monetization model is needed.

### Recommended Model: Open-Core Freemium

Keep the core DM tooling free forever (open source). Gate AI features, advanced collaboration, and higher limits behind a **Pro** subscription.

**Free tier (always free):**

- 1 active campaign
- All core DM tools (notes, calendar, bestiary, spellbook, item vault, encounters, quests, atlas, card forge, token forge)
- Up to 100 entities per type (NPCs, monsters, items, spells)
- Player portal (all collaboration features)
- 10 AI calls/month
- Scriptorium with PDF export (watermark-free)

**Pro tier (~$7/month or ~$60/year):**

- Unlimited campaigns
- Unlimited entities
- 200 AI calls/month included
- BYOK (Bring Your Own Key) — use your own Anthropic/OpenAI key, bypass quota
- Early access to new features
- Priority support

**AI Add-on (usage-based, available to all tiers):**

- Purchase packs of 100 AI calls for ~$2 (pro-rated cost + margin)
- Enables casual free users to access AI without full Pro commitment

### Payment Stack

| Tool                        | Role                                                   | Why                                                                                                              |
| --------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Stripe**                  | Payments, subscriptions, invoicing                     | Industry standard; excellent webhook support; Stripe Billing handles trials, upgrades, downgrades, cancellations |
| **Stripe Customer Portal**  | Self-serve subscription management                     | No custom billing UI needed                                                                                      |
| **Polar.sh**                | Optional: open-source sponsorship + one-time purchases | Developer-friendly; good for OSS projects; can run alongside Stripe                                              |
| **Supabase Edge Functions** | Stripe webhook handler                                 | `stripe-webhook` Edge Function updates a `subscriptions` table on Supabase                                       |

**Implementation steps:**

1. Add `subscription_tier` (`free` | `pro`) and `stripe_customer_id` to the `profiles` / `auth.users` metadata table.
2. Stripe webhook Edge Function: listen for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` → update `subscription_tier`.
3. Gate Pro features client-side (UX) AND server-side (Edge Function `check_quota` RLS/middleware).
4. Add `/settings/billing` page: current plan, upgrade/downgrade button (Stripe Customer Portal link), AI usage this month.
5. Free tier enforcement: enforced at Supabase Edge Function level for AI calls; campaign/entity limits enforced at DB level via a check constraint or application logic.

### Pricing Rationale

- $7/month is below the "impulse buy" threshold for hobbyist DMs; comparable to D&D Beyond Master Tier.
- Annual plan at $60 (~29% discount) improves cash flow and reduces churn.
- AI Add-on lets free users try AI without commitment, converting some to Pro.

---

## Ideas & Distant Future

- [x] **Open5e spells API** — "Import SRD Spells" button in Spellbook populates from open5e.com, deduplicates on re-run

## HIGH PRIORITY

- [x] Reduce egress — NPC/Bestiary/Item lists were loading full-size images for every card with no pagination:
  - [x] Lazy-load images via `loading="lazy"` on `FocalImage` — browser skips off-screen images entirely
  - [x] Infinite scroll (48/page, IntersectionObserver) on Monster, NPC, and Item lists — limits DOM + image requests on initial load
  - [x] Supabase Pro image transforms — CDN-edge resize + WebP conversion, gated by `VITE_SUPABASE_TRANSFORMS=true` (remove to revert to free plan behaviour)
  - [x] WebP conversion on upload — all new images stored as WebP (max 1920px, 85% quality) reducing source file size for all downstream use

- [x] Per-PC NPC relation notes — DM can write a short note per party member on any NPC describing how they know each other; the relevant PC sees only their own note in the People panel of the player portal (NPC lightbox)
- [x] **Workshop discipline consolidation** — leatherworking→leathercraft (+ Cobbler's Tools), woodcarving→woodcraft (+ Carpenter's + Shipwright's Tools), scribing now accepts Bookbinder's + Scribe's Supplies, jewelcrafting accepts Gemcutter's Tools; added Brewing (Brewer's Supplies, WIS) and Weaving (Weaver's + Tailor's Tools, DEX) disciplines; multi-tool proficiency/inventory checks use any-of logic

- [x] **Workshop filter improvements** — default tab changed to "All" (shows every recipe at once with discipline badge); tab selection persisted in Pinia ui store across navigation; player view only shows discipline tabs that have accessible recipes; attempt dialog uses per-recipe discipline instead of active tab

- [x] **Workshop tag-based ingredients** — recipe ingredients can now match any item with a given tag (e.g. "meat", "herb") instead of requiring a specific item; item_id is now nullable and a `tag` column added with a DB check constraint; RecipeEditor has a tag input alongside item search; CraftAttemptDialog and PlayerCraftingView match/consume by tag using item vault metadata

- [x] **Workshop combo tag ingredients** — tag-based ingredients now support AND combos: entering "glass, container" requires an item to have both tags (e.g. a glass bottle or vial); `tag text` column replaced by `tags text[]` across DB, types, and all matching logic; tag input accepts comma or `+` as separator; display shows `any "meat"` for singles and `any [glass + container]` for combos

- [x] **Workshop crafting time units** — crafting time now supports minutes, hours, or days (previously days-only); `crafting_time_days` renamed to `crafting_time` with a new `crafting_time_unit` column (check constraint: minutes/hours/days, default days); RecipeEditor shows a unit selector next to the number input; list views display the correct singular/plural label

- [x] **Workshop: Import Starter Recipes button** — one-click import button in Workshop header (same pattern as Vault's Import SRD Items); inserts missing output items into the vault automatically, then creates 35 starter recipes across all 12 disciplines; skips existing recipes by name so re-runs are idempotent

- [x] **Workshop starter crafting materials** — added 20+ crafting material and provision items to mundaneGear.ts (Raw Meat, Raw Fish, Dry Wood, Iron/Silver Ore, Iron/Silver Ingot, Healing Herb, Salt, Raw Hide, Grain, Flour, Honey, Plant Fiber, Poison Herb, Flint, Charcoal, Coarse Stone, Clay, Hardwood, Brimstone, plus food/drink outputs); tagged 7 existing SRD items for tag-based recipe matching; Glassblower's Tools added to tinkering discipline, Cartographer's Tools added to scribing

- [x] **Session scheduling** (irongollem/grimoire#4, #17, #18) — DM proposes candidate real-world dates via new "Scheduling" tab in Campaign Settings modal; players mark availability (yes/no) for each date from their Settings page; DM confirms a session, which appears in both the DM's agenda and the player's "Upcoming Sessions" section; confirmed sessions exportable as an iCal `.ics` file for Google Calendar / Apple Calendar import; backed by `session_proposals` + `session_availability` tables with campaign-scoped RLS

- [x] **Atlas: Stores** (irongollem/grimoire#60) — added `store`, `tavern`, and `inn` location types; new `store_items` table links items to store locations with per-item price overrides and visibility (visible / under the counter); DM UI in LocationEditor shows inventory panel for store-type locations with item search, price editing, and visibility toggles; Player Sharing section has an Share inventory toggle; players can browse visible wares in the Atlas portal when a location's inventory is shared

- [x] **Artificer spell delta** (irongollem/grimoire#68) — created `src/data/artificerSpellDelta.ts` with ~130 spells covering the full official Artificer list (TCoE + 2024 PHB), thematic additions (energy weapons, constructs, devices), and Deep Magic gnome/tinker/clockwork/steam spells; `open5eSpellImport.ts` now merges this delta during class normalisation so every SRD re-import correctly tags matching spells as Artificer

- [x] **AI generation UX** (irongollem/grimoire#14) — rotating flavor quotes replace static pulsing across all AI generators (NPC, Monster, Item); generators moved to DefaultLayout so they survive navigation; background dismiss sends generation to a persistent badge at the bottom of the screen; generic `aiGenerationState` factory + `aiGeneratorRegistry` pattern ensures all future generators get these features automatically

- [x] **Faction per-player visibility** (irongollem/grimoire#72) — factions support `shared_with_players` (all players) or `player_visible_to` (specific party member IDs) via `PlayerVisibilityToggle` in the DM detail view; RLS enforces visibility server-side for real players; fixed DM preview mode to also filter by `player_visible_to` so previewing as a specific character correctly mirrors what that player sees

- [x] **Chat item drop details** (irongollem/grimoire#25) — item drop cards in campaign chat now show a collapsible Show Details button for vault-linked items; expands inline to show type, subtype, rarity, weight/cost, attunement, weapon damage/range/properties, charges, and full description via RichTextViewer — no navigation away from chat required

- [x] **Spell import source filter** (irongollem/grimoire#29) — DM can select which Open5e source books to include/exclude before syncing; settings cog button next to "Sync from Open5e" opens a popover with checkboxes loaded from Open5e's /documents/ endpoint; selection defaults to SRD and persists in localStorage; import fetches only selected sources from the API, reducing bandwidth and stored data

- [x] **Vault: Provision item type** — added `provision` as a dedicated item type (with `UtensilsCrossed` icon) for all ready-to-consume food and drink; moved 10 items from `gear`/`trade_good` to `provision` (Rations, Ale, Mead, Fruit Brandy, Elven Ferment, Grilled Meat, Roast Meat, Smoked Meat, Grilled Fish, Pot of Stew); expanded crafting materials with sweetening agents (Syrup, Sugar), seasonal fruits (Summer Fruits, Autumn Fruits), and brewing bases (Wine Must, Neutral Spirit)

- [x] **People search & filters** (irongollem/grimoire#74) — added search input + relationship/status/location filter dropdowns above the People section in the player portal; filter state stored in `useUiStore`; Clear button appears when any filter is active; results show empty state when nothing matches

- [x] **Player nav customisation** — players can choose between Dynamic mode (log-tier scoring: needs ~2× visits to advance a tier, preventing jitter from small score differences) or Custom mode (drag-to-reorder list in Settings, pointer-events based so it works on mobile); mode + custom order persisted in localStorage via singleton `usePlayerNavPrefs` composable; nav item definitions and slot counts (`MOBILE_NAV_SLOTS=4`, `TABLET_NAV_SLOTS=7`) centralised in `src/lib/playerNav.ts`

- [x] **Chat tab: draggable vertical position** (irongollem/grimoire#78) — chat tab button is now draggable up/down the right edge; position saved in localStorage (`grimoire:chat-tab-top`); click still opens chat when not dragged (delta < 6px); grab cursor on hover

- [x] **Subscribable session calendar feed** (irongollem/grimoire#66) — each campaign gets a stable `ical_token` (UUID) stored on the `campaigns` table; a new Supabase edge function (`ical-feed`) serves confirmed session proposals as a standards-compliant iCal (.ics) feed without authentication — the token is the shared secret; Scheduling tab in campaign settings shows the subscription URL, a one-click copy button, a "Subscribe in Calendar App" link (webcal:// protocol), and a DM-only Regenerate URL button (with confirmation warning); feed supports ETag + Last-Modified for cache-friendly delivery; Google Calendar, Apple Calendar, and Outlook can subscribe via URL

- [x] **Traproom: multiple damage types** (irongollem/grimoire#79) — replaced single `damage_dice`/`damage_type` fields with a `damage_entries` array of `{ dice, type }` objects; each damage component has its own dice expression and type; UI shows a dynamic list editor with + Add / × remove per row; preview modal and encounter runner both render each entry; prefilled archetypes updated (Spiked Pit: 1d6 bludgeoning + 1d10 piercing, Poison Needle/Darts: piercing + poison)

- [x] **Player spell slot tracker** (irongollem/grimoire#30) — added `spell_slots` JSONB column to `party_members`; `getDefaultSpellSlots(cls, level)` computes correct max slots per 5e rules for all caster types (full/half/third-caster + Warlock pact magic); `getSlotRecovery(cls)` returns `'short'|'long'`; party member form Stats tab auto-seeds slot maxes from class rules on first open, with per-level override inputs and a "Reset to class defaults" button; player character sheet shows per-level dot tracker (filled = used, empty = available) with click-to-toggle; long rest resets all used slots to 0 for all classes; short rest resets Warlock pact magic slots (regain on short rest per 5e rules)

- [x] **Weapon mastery properties** — added all 8 2024 PHB weapon mastery properties (cleave, graze, nick, push, sap, slow, topple, vex) to `WEAPON_PROPERTIES` in `item.types.ts`; also fixed Combat tab to only show weapons (`item_type === "weapon"`), fixed equipping a stacked item (qty > 1) to split into an equipped qty-1 entry leaving the remainder in inventory, and added item detail access from the slot assignment modal

- [x] **Clone item** (irongollem/grimoire#80) — "Clone" button in the vault item editor duplicates the current item (appending " - Clone" to the name, clearing source fields) and navigates directly to the copy in edit mode via `router.replace`

- [x] **Inventory slot filtering & clothes slot** — added `clothes` equipment slot to the paper doll mannequin; slot candidates are filtered by type/tag per slot (body→armor type, ring→ring type, clothes/neck/hands/feet/head/shoulders/waist→tag or subtype match); custom items without a vault link are excluded from filtered slots (fall back to all items if nothing matches); mannequin silhouette turns pink and clothes slot button turns red when no clothes are equipped; DB migration adds `'clothes'` to the `inventory_slot` enum

- [x] **Coin purse UX improvements** — replaced per-coin +/- with an editable number input (optimistic, fire-and-forget save); added "Drop Coins to Chat" inline form that lets players enter a mixed-currency drop (validated against owned amounts, red border on over-limit), sends a single combined currency_drop chat message, and deducts the amounts from the wallet

- [x] **Travel events with party location tracking** — added `event_type='travel'` for calendar events with destination location picker and party member checkboxes; when saved, automatically updates each selected party member's `current_location_id` to the travel destination; `party_members` table gets new `current_location_id` column; `LocationEditor` shows "Currently Here" section listing party members at that location with quick remove buttons, plus "Add Member" combobox to move members from elsewhere

- [x] **Party Tracker card layout refactor** — removed per-member initiative input/roller from cards (not linked to encounter runner); left identity column redesigned with avatar + name in one row and race/class/player/location stacked below for consistency

- [x] **Player self-service character creation** (irongollem/grimoire#9) — players can now create their own character sheet from the player portal; `PlayerCharacterCreateView` at `/play/character/create` replicates the full party member form (Identity/Stats/Proficiencies tabs) without the DM-only player-assignment dropdown; on save, creates the party member and links it to the current player's campaign_members row via `useUpdateCampaignMember` then calls `auth.refreshMembership()`; the empty state on the character sheet now shows a "Create Character" button; PlayerSettings "My Character" section now offers "Create character" and "Claim existing" options side by side

- [x] **Level-up: Wizard** (irongollem/grimoire#96) — `src/levelup/classes/wizard.ts`: full 20-level feature table; all 8 SRD school subclasses (Abjuration/Conjuration/Divination/Enchantment/Evocation/Illusion/Necromancy/Transmutation) added to wizard (picker at level 2); no class steps or resources — Arcane Recovery restores spell slots (already tracked), Spell Mastery/Signature Spells need spell DB; also removed now-unused `buildLevels` helper and `STANDARD_ASI` constant from `classFeatures.ts`

- [x] **Level-up: Fighter** (irongollem/grimoire#92) — `src/levelup/classes/fighter.ts`: full 20-level feature table, extra ASI schedule (4/6/8/12/14/16/19); Fighting Style picker at level 1; `SECOND_WIND` (1 use, short rest), `ACTION_SURGE` (1→2 at level 17, short rest), `INDOMITABLE` (1→2→3 at levels 9/13/17, long rest) ClassResourceDefs; Champion/Battle Master/Eldritch Knight subclass at level 3; Battle Master maneuvers skipped (subclass-context unavailable); Eldritch Knight third-caster slots already in `spell.types.ts`

- [x] **Level-up: Warlock** (irongollem/grimoire#95) — `src/levelup/classes/warlock.ts`: full 20-level feature table, spells-known table; Pact Boon picker at level 3; Eldritch Invocations append step (count 2 at level 2, count 1 at levels 5/7/9/12/15/18); The Archfey/Fiend/Great Old One subclass at level 1; Mystic Arcanum (levels 11/13/15/17) noted in feature text — needs spell DB access; Pact Magic slots already handled by `WARLOCK_PACT_SLOTS` in `spell.types.ts`

- [x] **Level-up: Barbarian** (irongollem/grimoire#89) — `src/levelup/classes/barbarian.ts`: full 20-level feature table with Rage uses (2→3→4→5→6→∞) and Rage damage (+2/+3/+4) annotated; `RAGE` ClassResourceDef (long rest, 99 as sentinel for unlimited at level 20); Path of the Berserker & Totem Warrior subclass picker at level 3; Totem animal picks skipped (subclass-context not available at step-gen time)

- [x] **Level-up: Bard** (irongollem/grimoire#90) — `src/levelup/classes/bard.ts`: full 20-level feature table, spells-known table, Bardic Inspiration die milestones annotated; Expertise multi-pick (count 2) at levels 3 & 10; College of Lore & Valor subclass picker at level 3; Magical Secrets (levels 10/14/18) noted in feature text — requires all-class spell picker not yet built; Bardic Inspiration uses depend on CHA mod so skipped as ClassResourceDef

- [x] **Level-up: Cleric** (irongollem/grimoire#91) — `src/levelup/classes/cleric.ts`: full 20-level feature table (Destroy Undead CR milestones, Channel Divinity scaling annotated); `CHANNEL_DIVINITY` ClassResourceDef (1/rest at level 2, 2/rest at level 6, 3/rest at level 18); all 7 SRD domain subclasses added to wizard (Divine Domain picker shown at level 1 — earliest subclass in the game)

- [x] **Level-up: Monk** (irongollem/grimoire#93) — `src/levelup/classes/monk.ts`: full 20-level feature table with Martial Arts die and Unarmored Movement bonuses annotated per level; `KI_POINTS` ClassResourceDef (max = level, short rest) from level 2; Way of the Open Hand / Shadow / Four Elements subclass picker at level 3; Elemental Disciplines are subclass-specific and noted as future enhancement

- [x] **Level-up: Rogue** (irongollem/grimoire#94) — `src/levelup/classes/rogue.ts`: full 20-level feature table with Sneak Attack dice annotated per level, extra ASI schedule (4/8/10/12/16/19); Expertise multi-pick step (count 2) at levels 1 and 6; Thief/Assassin/Arcane Trickster subclass picker at level 3; third-caster slots for Arcane Trickster already handled by existing `THIRD_CASTER_SLOTS` in `spell.types.ts`

- [x] **Level-up: Druid** (irongollem/grimoire#84) — `src/levelup/classes/druid.ts`: full 20-level feature table (Wild Shape CR milestones at levels 2/4/8, Timeless Body/Beast Spells at 18, Archdruid at 20); Circle of the Land & Circle of the Moon subclass picker at level 2; no class-specific steps or resources (full-caster slots and prepared count are derived)

- [x] **Level-up: Paladin** (irongollem/grimoire#86) — `src/levelup/classes/paladin.ts`: full 20-level feature table, Fighting Style picker at level 2, Sacred Oath subclass picker (Devotion/Ancients/Vengeance/Oathbreaker) at level 3; `LAY_ON_HANDS` ClassResourceDef (5 × level, long rest) from level 1; `CHANNEL_DIVINITY` ClassResourceDef (1 use, short rest) from level 3; `getPaladinResources()` wired into `getClassResources()` dispatcher

- [x] **Level-up: Sorcerer** (irongollem/grimoire#85) — `src/levelup/classes/sorcerer.ts`: full 20-level feature table, spells-known table, Metamagic step (pick 2 at level 3, +1 at levels 10 & 17) with duplicate-prevention across sibling selects; `SORCERY_POINTS` ClassResourceDef (max = character level, long rest); `getClassResources()` dispatcher upserts into `class_resources` JSONB on confirm (preserves existing `current`); Draconic Bloodline & Wild Magic subclass picker added to wizard

- [x] **Level-up: Artificer** (irongollem/grimoire#88) — `src/levelup/classes/artificer.ts`: hand-coded 20-level feature table, infusions-known/items-infused tables, Alchemist/Armorer/Artillerist/Battle Smith subclass picker; fixed `ARTIFICER_SLOTS` in `spell.types.ts` (rounds up — 2nd-level slots at level 3, not 5); added `infusions_known` to `ClassLevelData`; infusions-gained notice in `LevelUpWizard`

- [x] **Level-up: Ranger** (irongollem/grimoire#87) — `src/levelup/classes/ranger.ts`: full feature names for all 20 levels, spells-known table, Favored Enemy / Natural Explorer / Fighting Style step definitions, Hunter & Beast Master subclass picker; `LevelUpWizard` extended with `ClassStep` generic rendering (select + append modes), spell-slot auto-sync on confirm (preserving used counts), spells-known gain notice, and slot change summary; `getClassSteps()` dispatcher in `classFeatures.ts` routes to per-class step functions

- [x] **Level-up management system — foundation** (irongollem/grimoire#83) — defined `ClassLevelData`/`ClassFeatureTable`/`ClassResources`/`ClassChoices` types; `src/data/classFeatures.ts` with ASI schedules and subclass-unlock levels for all 13 classes (feature name arrays stubbed for sub-tickets #84–#96); DB migration adds `class_resources` + `class_choices` JSONB columns to `party_members`; `LevelUpWizard` handles prof-bonus bump, ASI picker (+2/+1+1), and initial subclass text input; full-page view at `/play/character/levelup` with "Level Up" button on the character sheet

- [x] **NPC list: filter by party member connection** (irongollem/grimoire#109) — added "Connected to…" combobox filter to NPC list; `npc_pc_notes` rows are the connection signal; filter state in `useUiStore` (`npcsFilterPartyMember`); client-side filtering via new `useNpcPcNotesByPartyMember` composable

- [x] **Encounter runner: damage flash + debounced HP buttons** (irongollem/grimoire#106) — +/- buttons debounce 500ms and accumulate delta before calling `adjustHp`; a 10s CSS animation badge (red for damage, green for healing) floats above the HP cell showing the total delta; `setHp` (text input) cancels any pending debounce and shows delta immediately

- [x] **AI provider abstraction layer** (irongollem/grimoire#113) — extracted hardcoded OpenAI fetch calls into `src/ai/providers/` (`types.ts` with `TextProvider`/`ImageProvider` interfaces, `openai.ts` implementation, `index.ts` factories); all 4 generation composables now construct providers from the apiKey instead of calling fetch directly; `imageProvider.edit?` guards the NPC alter-ego disguise flow

- [x] **Dungeon Craft: secret door & hidden feature creator** (irongollem/grimoire#21) — new `dungeon_features` Supabase table + RLS; `src/types/dungeonFeature.types.ts` with 7 feature types (Secret Door, Hidden Passage, Treasure Chest, etc.) and 12 trigger types; `useDungeonFeatures` composable; list view with search + type filter at `/dungeon-features`; create/edit form with Discovery DCs (Perception / Investigation / Arcana), trigger mechanism, contents, description, image upload, and DM notes; "Dungeon Craft" nav entry in Assets group

- [x] **Dungeon Craft: unified tabbed interface** — consolidated `/dungeon-features`, `/traps`, and `/puzzles` into a single `/dungeon-craft` hub with three tabs (Features/Traps/Puzzles); old routes now redirect to tabbed view with query param; each tab has its own populate button and create action; `DungeonCraftView.vue` orchestrates tabbed navigation, action visibility, and API state per tab

- [x] **Soundboard** — per-campaign ambient sound & music library at `/soundboard`; `sounds` Supabase table with RLS + `sounds` storage bucket (public); supports both file uploads (stored in Supabase storage under `{user_id}/`) and external URLs; multi-track simultaneous playback with per-sound play/pause/stop/loop/volume controls; `HTMLAudioElement` instances kept in a module-level `Map` outside Vue reactivity to avoid proxy corruption; `useSoundboardStore` (Pinia) tracks serializable playback state only; persistent floating widget (`SoundboardWidget.vue`) always mounted in `DefaultLayout.vue` so sounds survive navigation; toggle button in sidebar + mobile top bar with playing-count badge; category filter (ambient/music/effects/misc) + search stored in `useUiStore`

- [x] **Encounter runner: quick Dmg/Heal/+Temp HP panel** — replaced tedious +/- single-step HP buttons with a "type amount → click action" panel; DM side appears below the selected combatant row in `RunnerCombatantList.vue` (Dmg, Heal, +Temp buttons with flash animation); player side tappable on own row in `PlayerEncounterView.vue`; `temp_hp` added to `RunCombatant` type and `encounterRun` store with 5e rules (absorbs damage first, takes higher value on set)

- [x] **Species manager with Open5e import** (irongollem/grimoire#130) — new `species` Supabase table with RLS + `updated_at` trigger; `src/types/species.types.ts`; `useSpecies` composable (full CRUD); list view at `/species` with search + size filter (state in `useUiStore`); create/edit form with name, size, speed (walk/fly/swim/climb/burrow), ASI description, traits (via TraitSection), languages, subraces (JSONB with per-subrace traits), rich-text description & DM notes, portrait via `ImageUpload`; `SpeciesOpen5ePanel` slide-out searches the Open5e `/v2/races/` endpoint and imports directly into a new species record; "Species" added to Assets nav group with `Dna` icon

- [x] **Player encounter view: Wild Shape picker and active form** (irongollem/grimoire#124) — druids see a Wild Shape card above the combatant list when an encounter is live; beast picker filtered by level/CR cap, Circle of Moon detection, no fly/swim before level 8, discovered+pinned beasts only; active form shows AC, speed, rollable trait sections; Revert Form restores original HP/AC via existing store action; non-druid players see nothing

- [x] **Dice roll feedback: animation + sound** (irongollem/grimoire#128) — synthesized Web Audio dice sounds (no audio files) with distinct crit/fumble effects; `DiceResult.vue` scramble animation (400–500ms cycling numbers that snap to result); crit/fumble CSS flash; toggle in Player Settings → Combat Notifications; wired into DiceRoller, encounter runner, party initiative, chat dice, combat/skill/death-save/hit-die rolls

- [x] **NPC Relationship Web** (irongollem/grimoire#23) — force-directed node graph at `/npcs/web` (accessible via "Web" button on NPC list); NPC nodes coloured by relationship stance (ally/neutral/enemy); party member nodes in amber; NPC↔NPC edges from `npc_relationships` (colour-coded by type); NPC↔PC edges from `npc_pc_notes` (dashed amber); click any node to open side panel with name, role, and "Open Sheet" link; filters for show/hide PCs and relationship type; uses `v-network-graph` + `d3-force` for layout

- [x] **Abilities: Class Features compendium** (irongollem/grimoire#141) — new `class_features` Supabase table with RLS + `updated_at` trigger; `src/types/feature.types.ts` (ClassFeature, FeatureType, FEATURE_TYPES, FEATURE_TYPE_LABELS); `useFeatures` composable (full CRUD + `useAllFeatures` for EntityCombobox use); list view at `/features` with search + type filter (state in `useUiStore`); editor with name, type (passive/active/reaction/bonus_action/legendary), source, tags, campaign scope, and RichTextEditor description; "Abilities" added to Assets nav group (Zap icon); foundation for custom subclasses (#98) and custom classes (#140) to reference real feature entities

- [x] **Abilities: Open5e SRD sync** — "Sync from Open5e" button on `/features` list; fetches all feats from `api.open5e.com/v1/feats/`, converts plain text descriptions to Tiptap JSON, heuristically detects feature_type (reaction/bonus_action/passive), stores prerequisite in dedicated `prerequisite text` column; UI editor includes "Prerequisite" text input field; `open5e_import boolean` column added to `class_features` for deduplication; idempotent — subsequent syncs only insert missing entries, never overwrite manual edits

- [x] **Archetypes: DM UI for custom subclasses** (irongollem/grimoire#98) — new `custom_subclasses` Supabase table; list + editor views at `/levelup/custom`; features per level now stored as Abilities-compendium UUIDs (EntityCombobox picker + chips, resolved to names in LevelUpWizard); wizard steps have `step_type` discriminator (feature_pick/spell_pick/text_pick) with feature picker for feature_pick steps; Gloom Stalker example seed creates real features first then links by ID; LevelUpWizard extended with custom subclass names, feature name resolution via `useAllFeatures`, custom steps, and resource pools

- [x] **Classes: DM UI for custom primary classes** (irongollem/grimoire#140) — new `custom_classes` Supabase table with RLS + `updated_at` trigger; `CustomClass`/`CustomClassInsert`/`CustomClassUpdate` types + `HitDie` in `customTypes.ts`; `useCustomClasses` composable (CRUD + `useCustomClassByName` for wizard lookup); list + editor at `/levelup/classes` with 6 sections (Identity, Proficiencies, Features per Level, ASI Levels, Wizard Steps, Resource Pools); "Classes" nav entry (BookOpen); LevelUpWizard extended: `useCustomClassByName` fallback when SRD lookup returns null, `grantsAsi` computed replaces `levelData?.asi` to honour custom ASI levels, custom class features/steps/resources merged alongside SRD and subclass data

- [x] **Classes: SRD system class seeds** (irongollem/grimoire#143) — new `system_classes` table (no user_id, RLS select-only for authenticated users); seeded with all 13 SRD classes including full 20×9 spell slot grids, spells_known arrays, resources (rage uses table, ki points, lay on hands, channel divinity, sorcery points), and Warlock pact-magic grid with slot_recovery='short'; `SystemClass` type in customTypes.ts; `useAllSystemClasses()` composable; CustomClassListView shows SRD section at bottom with "Duplicate" button that copies into custom_classes and opens editor

- [x] **Classes: SRD class feature seeds** (irongollem/grimoire#151) — made `class_features.user_id` nullable; partial unique index on `(name) where user_id is null` for idempotent re-runs; SELECT policy expanded to include `user_id is null` rows; ~170 SRD feature rows inserted across all 13 classes (`source='srd-5.1'`); 13 UPDATE CTEs populate `system_classes.features` JSONB with resolved UUIDs per level; LevelUpWizard `customFeaturesForLevel` now falls back to `systemClass.value?.features` so SRD class features appear in the level-up summary

- [x] **Classes: DB-driven caster_type** (irongollem/grimoire#152) — added `caster_type`, `prepared_ability`, `prepared_divisor` columns to `system_classes` and `custom_classes`; seeded all 13 SRD classes with correct values; `useClassByName()` composable returns system-or-custom class by name; replaced `getCasterType`/`getMaxPrepared`/`getSlotRecovery`/`getHitDie` static calls in PlayerSpellsView, PlayerCharacterView, RestButtons, RestDialog, PlayerFeaturesTab, RunnerEntityDetail with DB-driven fallbacks; CustomClassEditor gains caster_type + prepared_ability + prepared_divisor UI in Spellcasting section

- [x] **Classes: Delete static TS class files** (irongollem/grimoire#153) — removed all 13 `src/levelup/classes/*.ts` files and `classFeatures.ts`; LevelUpWizard now derives ASI levels, subclass level, spell slots, resources, and steps from `systemClass`/`customClass` DB data; `PARTY_CLASSES`/`PartyClass` removed from `party.types.ts`; PlayerCharacterCreateView and CustomSubclassEditorView now build class name lists from DB; PlayerFeaturesTab now resolves feature UUIDs via `useAllFeatures` instead of static table
