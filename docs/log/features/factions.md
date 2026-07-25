# Features — Factions

Shipped features in the **Factions** area, newest first. Part of the Grimoire feature log — see the [log index](../index.md).

- [x] **Factions system** — full CRUD for guilds, governments, religions, cults, etc. with emblem upload, type, alignment, player visibility toggle (per-player via `PlayerVisibilityToggle`), tags, rich-text description

- [x] **Faction members** — NPC multi-faction membership with roles (Leader, Officer, Member, etc.); replaces free-text affiliation field on NPCs

- [x] **Faction associations** — link locations and items to factions from the faction detail board

- [x] **Directional faction relations** — outgoing stance + incoming (how others view this faction); 8 relation types (Allied → Hostile + secret variants)

- [x] Story faction membership for players — party members can join campaign factions (`faction_party_members` table, same role/status system as NPCs); faction detail page shows both NPC and player members; player portal faction panel shows fellow NPC members + the player's own rank when they share a faction (irongollem/grimoire#5)

- [x] **NPC inventory** — `npc_inventory` table; per-NPC item management with quantity; "Drop to Chat" sends items as loot; DM can claim chat loot directly into an NPC's inventory via "To NPC" picker

- [x] **FactionDetailView — view/edit split** (irongollem/grimoire#168) — extracted the monolithic `FactionDetailView` into `FactionEditor` (form) + `FactionSheet` (read-only DM view: emblem via `FocalImage`, name, type / alignment / tags blocks, Tiptap description via `RichTextViewer`) with a `?edit=true` toggle. Shared sub-sections (members / party members / relations / locations / items / notes) stay rendered once in the view wrapper below the sheet/editor — they're self-managing CRUD panels equally useful in both modes. Editor gains a **Cancel** button that strips the flag.

- [x] **Faction per-player visibility** (irongollem/grimoire#72) — factions support `shared_with_players` (all players) or `player_visible_to` (specific party member IDs) via `PlayerVisibilityToggle` in the DM detail view; RLS enforces visibility server-side for real players; fixed DM preview mode to also filter by `player_visible_to` so previewing as a specific character correctly mirrors what that player sees

- [x] **Religion / Pantheons module** (irongollem/grimoire#294) — `pantheons` table (name, description, emblem, tags, player_visible_to) + `deities` table (name, titles, alternate_names, pantheon_id FK, alignment, symbol text + symbol_image_url, portrait_url + portrait_focal_point, domains[], portfolio, description, dm_notes, tags, player_visible_to); DM views: `/deities` card grid + `/deities/:id` detail (editor + read-only sheet), `/pantheons` list + `/pantheons/:id` detail (shows member deities); "Pantheon" nav item added to Campaign group; player portal: `/play/deities` with visibility filter + expandable detail card; composables: `useAllDeities`, `useDeity`, `useCreateDeity`, `useUpdateDeity`, `useDeleteDeity`, `useAllPantheons`, `usePantheon`, `useCreatePantheon`, `useUpdatePantheon`, `useDeletePantheon`; deity filter state in `useUiStore`. Deferred: pantheon relationship graph, faction two-way binding, calendar holy day linking, seeding.

- [x] **Player lightbox: FocalImage `lightbox` prop** (irongollem/grimoire#308) — `FocalImage` now accepts `lightbox?: boolean`; when true, clicking the image opens a full-resolution `ImageLightbox` overlay internally (no parent boilerplate needed). `defineOptions({ inheritAttrs: false })` + `v-bind="$attrs"` preserves class pass-through with the new fragment root. Applied to all DM entity sheets (NPC, Monster, Faction, Location, Item, Spell, Trap, Species, Background, DungeonFeature, Deity, Pantheon) and to player portal: character header portrait, beast preview, champion cards, puzzle detail, quest NPC panel, and party NPC/companion panels (skipped card thumbnails whose parent is already a navigation click target).
