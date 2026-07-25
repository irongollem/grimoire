# Features — NPCs & Companions

Shipped features in the **NPCs & Companions** area, newest first. Part of the Grimoire feature log — see the [log index](../index.md).

- [x] NPC tracker with full stat blocks, portrait upload, TraitSection editor

- [x] Spellcasting block on NPC/Monster stat blocks — structured `SpellcastingBlock` (ability, DC, attack bonus, spell groups with freeform frequency labels); spell picker in edit UI searches the Spellbook and renders selected spells as chip badges; display view renders each spell as a clickable link to `/spells/:id`; no migration needed (stored in existing `stat_block` JSONB column)

- [x] NPC Alter Ego — disguise name + portrait for NPCs with hidden true identities (hags, shapeshifters, spies); DM sets disguise name/portrait in the editor; when concealed the list/sheet/title all show the disguise identity; one-click Reveal/Conceal toggle in the sheet view saves instantly without entering edit mode; `is_revealed`, `disguise_name`, `disguise_portrait_url`, `disguise_portrait_focal_point` columns added to npcs table

- [x] Saving Throws and Proficiency Bonus added to NPC and Monster stat block types and editors

- [x] NPC detail reorganized: Lore/Inventory/Combat tabs, monster link + template unified on Combat tab, player sharing moved to action bar foldout, NPC Connections below Identity, Party Stance renamed from Relationship; Class/Role field removed (use Occupation); DM Secret merged into DM Notes; old affiliation column dropped

- [x] **Hall of Heroes** — global admin-curated NPC roster at `/hall-of-heroes`; `hall_of_heroes` table with setting tag + admin-only RLS; any DM can browse and click "Add to Campaign" to clone a hero into their NPC list; campaign-setting heroes sorted to top; admin editor at `/hall-of-heroes/new` and `/:id/edit`; seeded with 10 iconic characters (Icewind Dale + Honor Among Thieves) with public-knowledge lore filled in (irongollem/grimoire#107)

- [x] **Hall of Heroes full seed** — bulk SQL migration (`20260411000003_seed_hall_of_heroes.sql`) seeds all 120 iconic heroes across all 9 D&D settings; upsert with unique index on `(setting, lower(name))` preserves existing art on re-run; "Sync All Settings" admin button (`usePopulateAllSettingHeroes`) handles future setting additions without requiring a new migration

- [x] **NPC sharing**: DM marks NPC as shared; per-field visibility controls (portrait / name / status / race / occupation / relationship); party notes (shared) + personal player notes (private) on shared NPCs; per-player visibility (eye+popover on list cards, same UX as monster sharing — whole party or specific party members via `player_visible_to uuid[]`)

- [x] **Migrate `npcs.party_notes`** — legacy per-column party notes migrated into `entity_notes`; column dropped; DM editor "Party Notes" field removed; all campaign members can see each other's shared notes via symmetric RLS policy

- [x] **NPC relationship data** — `npc_relationships` table; NPC editor "Relationships" section with add/remove; type badges (Family, Ally, Rival, Enemy, Mentor, etc.); bidirectional display

- [x] **Faction member status** — Active / Retired / Defected / Expelled / Deceased per membership; former members shown in collapsible "Former Members" section; status badge on NPC faction chips

- [x] **SRD monster art upload** — `srd_monster_art` table stores per-user art overlays (portrait + card art) keyed by stable `srd_id`; merged into in-memory SRD monsters at query time; long-cached (30 min stale); no duplicate bestiary entries

- [x] **NPC location filter includes child locations** — selecting a city shows NPCs in all sub-locations; `useLocationTree` composable (with `getDescendantIds` + tree-sorted combobox options) shared across modules

- [x] **NPC sort by location** — Name / Location toggle in NPC list; location sort uses DFS tree order so parent locations precede children; no-location NPCs go last; ties broken by NPC name

- [x] **NpcSheet — party-member connections in view mode** (irongollem/grimoire#168) — the proposed `linked_npc_id` FK on `party_members` was unnecessary: `npc_pc_notes` (NPC↔party-member with typed relationship + notes) already models this. The gap was purely that `NpcPcNotesSection` was mounted only in the edit form; it's now embedded in the sheet's Relations tab alongside `NpcRelationsSection`, same reasoning as #169.

- [x] Per-PC NPC relation notes — DM can write a short note per party member on any NPC describing how they know each other; the relevant PC sees only their own note in the People panel of the player portal (NPC lightbox)

- [x] **NPC list: filter by party member connection** (irongollem/grimoire#109) — added "Connected to…" combobox filter to NPC list; `npc_pc_notes` rows are the connection signal; filter state in `useUiStore` (`npcsFilterPartyMember`); client-side filtering via new `useNpcPcNotesByPartyMember` composable

- [x] **NPC Relationship Web** (irongollem/grimoire#23) — force-directed node graph at `/npcs/web` (accessible via "Web" button on NPC list); NPC nodes coloured by relationship stance (ally/neutral/enemy); party member nodes in amber; NPC↔NPC edges from `npc_relationships` (colour-coded by type); NPC↔PC edges from `npc_pc_notes` (dashed amber); click any node to open side panel with name, role, and "Open Sheet" link; filters for show/hide PCs and relationship type; uses `v-network-graph` + `d3-force` for layout

- [x] **Player "Share with DM" on private NPC notes** (irongollem/grimoire#301) — Added `shared_with_dm boolean default false` to `entity_notes`; players can toggle "Share with DM" in the private note header of `PlayerNotesWidget`; a new RLS policy lets campaign DMs read those notes; DMs see a "Player Insights" amber section in the widget showing notes players shared privately with them.
