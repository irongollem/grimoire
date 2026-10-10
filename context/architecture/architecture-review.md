# Architecture Review: hubs, coupling, mounting and file structure (epic #999, story 5.2)

A graded review of the frontend's shape on 10 Oct 2026, in two layers: how the
modules depend on each other (hubs, coupling between domains, pages that mount
everything), and whether the file tree still fits a codebase of this size.
Numbers come from `npm run arch:graph` (dependency-cruiser over `src/`: 2,380
modules and 12,458 resolved edges, 184 of them dynamic; tests and
`*.generated.ts` excluded; type-only imports are invisible to it because the
config sets `tsPreCompilationDeps: false`) plus `rg` and `wc` over `src/`.

5.1 already holds the floor: no import cycles, and `lib` imports no composables
or stores, stores import no composables. Those are errors in CI, so nothing
below is a layering violation in that sense. The question here is the next one up.

## Grades

| # | Dimension | Grade | One-line reason |
| - | --------- | ----- | --------------- |
| 1 | Hubs | B+ | 15 of the top 25 importees are primitives (`AppButton` 668, `icons` 582, `supabase` 267); the domain hubs are entity data-access composables, as CLAUDE.md predicts. The one outlier is `stores/ui.ts` |
| 2 | Coupling between domains | B | Composables almost never import components (4 edges); the only mutual cluster is quests ↔ locations ↔ cartographer, which the design makes one model ("a room is a zoomed-in beat"). `components/common` reaches up into two domains |
| 3 | Mounting | B | Every one of the 141 routes is lazy, and so are the layouts; a few tab pages still mount every tab statically |
| 4 | Stores | C+ | Nine stores, seven of them fine; `ui.ts` is the largest file in `src` (1,515 lines, 166 refs, 43 `reset*Filters`, imported by 179 modules across 73 areas) and `soundboard.ts` the second (1,306) |
| 5 | Folder sizing | B- | `components/common` holds 134 components flat; `lib` root holds 77 modules, a third of them single-consumer; the rest of the tree is sized well |
| 6 | Naming and placement | B | One domain split across two spellings in `lib` (fixed here), the player portal under two names (`play`/`player`, merged here) |
| 7 | Dead code | B+ | 12 unreferenced modules found; all removed here |

## 1. Hubs

Top importees by distinct importers:

| Importers | Module | Reading |
| --------- | ------ | ------- |
| 668 | `components/common/AppButton.vue` | primitive |
| 582 | `lib/icons.ts` | primitive |
| 306 | `stores/campaign.ts` (357 lines) | the active campaign id; small and central, fine |
| 267 | `lib/supabase.ts` | primitive |
| 254 | `components/common/AppInput.vue` | primitive |
| 179 | `stores/ui.ts` (1,515 lines) | the outlier, section 4 |
| 128 | `stores/auth.ts` (679 lines) | expected |
| 94 / 90 / 83 / 64 | `useRuleset`, `useParty`, `useLocations`, `useNpcs` | entity data access, read by everything, as the composables rule expects |
| 41 | `composables/quests/useQuestFlow.ts` (1,169 lines) | one composable carrying the quest flow for 9 areas |

The fan-out leaders are the routes table (113, all lazy) and the entity detail
sheets (`EncounterDetail` 47, `MonsterDetail` 44, `NpcDetail` 44). A detail
sheet that composes many small sections is what the component-granularity rule
asks for, so a high fan-out there is a good sign rather than a bad one.

## 2. Coupling between domains

Excluding `common` (the primitive layer), the heaviest edges are
play → party 67, quests → locations 47, campaign → documentImport 36,
player → party 33, encounters → party 30. All of them follow the product:
the player portal reads the character, the quest runtime walks sites.

Pairs that import each other in both directions with at least 8 edges each way:
quests ↔ locations (47 / 19), cartographer ↔ locations (29 / 8),
play ↔ player (22 / 10), campaign ↔ party (10 / 10). The first two are the
#850/#868/#884 model working as drawn: a site is a place in the Atlas, a room
is a zoomed-in beat, the Cartographer runs inside Build. They are one model
with three surfaces, and a boundary between them would be invented.

`play` (the portal's views) and `player` (its components) were one domain under
two names; see 6.

Two upward reaches out of `components/common`:

- `AiGeneratorPanels.vue` imports 23 components from 20 domains. It is a
  registry of every generator panel, already lazy through
  `defineAsyncComponent`, filed under "common" because everything uses it. It
  belongs with the generators in `src/ai/`.
- 8 edges from `common` into `campaign` and 5 into `spells`.

## 3. Mounting

All 141 route components are `() => import(...)`; the layouts load through
`preloadLayout`; `defineAsyncComponent` is already used in 18 files for closed
sheets and dialogs. 1.3 decided the dashboard widgets stay static (34 kB
gzip). What is left is pages that mount children nobody can see at once:

| Static `.vue` imports | Page | Shown how |
| --------------------- | ---- | --------- |
| 18 | `views/campaign/CampaignSettingsView.vue` | 14 tabs, one `v-if` branch each |
| 20 | `views/player/PlayerCharacterView.vue` | 6 tabs behind `activeTab`, a dialog |
| 23 | `components/quests/QuestRunCockpit.vue` | sheets, drawers and dialogs on toggles; one already async |
| 20 | `views/soundboard/SoundboardView.vue` | playlists panel per view mode, paywall and settings dialogs |

MapWorkbench and the Atlas map panes mount many children too, but nearly all
are on screen together in Build, so splitting them would buy little.

## 4. Stores

| Store | Importers | Lines |
| ----- | --------- | ----- |
| `ui.ts` | 179 | 1,515 |
| `soundboard.ts` | 24 | 1,306 |
| `auth.ts` | 128 | 679 |
| `encounterRun.ts` | 22 | 664 |
| `spotify.ts` | 10 | 448 |
| `campaign.ts` | 306 | 357 |
| `cardForge.ts`, `calendar.ts`, `scratchpad.ts` | | under 250 |

`ui.ts` is the Filter State Pattern doing what it says: every list's filters in
one store. At 43 filter sets that one store is the whole app's session UI: it
ships in the boot bundle whichever page loads, and a list's state sits among
284 unrelated members. (It does not cost re-renders: Pinia tracks each member
separately, so a component only reacts to what it reads. The first draft of
this review said otherwise.) The pattern's intent (filters survive navigation
in the session, not in localStorage) does not need one store; one Pinia store
per domain under `stores/ui/` keeps the same intent and lets a list import only
its own.

**Done (5.2.5, the maintainer's call):** 29 domain stores plus `app.ts` for
the shell state, storage keys unchanged; 238 consumers rewritten; the Filter
State Pattern in CLAUDE.md names the domain stores. Boot payload 420.1 →
415.9 kB gzip.

## 5. Folder sizing

| Directory | Direct files | Reading |
| --------- | ------------ | ------- |
| `components/common` | 134 `.vue` | flat bucket: primitives (`App*`, 5), the entity pickers (`Entity*`, 14), stat display (`Stat*`, 8), list scaffolding (`List*`, 7), AI chrome (`Ai*`, 6), rich text, images, dice, plus some 80 more |
| `lib` root | 77 modules | a third of them have one consumer area (below) |
| `components/quests` | 110 | one domain, large; subfolders by surface (design, run, advance) would follow the eight frames |
| `components/locations` | 81 | same, by surface (Atlas, site, plan) |
| `src/ai` | 81 | generator dialogs, logic and tests in one folder |
| `types` | 64 | one file per entity, fine |

`lib` root modules with a single consumer area, which the Module Placement
rule says belong in a folder:

| Module | Its only consumer | Home |
| ------ | ----------------- | ---- |
| `realtimeChannel` | `useCampaignLiveSync`, `useCampaignPresence` | `lib/campaignLiveSync/` |
| `manualLoader` | `components/rules/ManualTab.vue` | `lib/rules/` |
| `classChoices` | `components/player/PlayerChoicesCard.vue` | `lib/codex/` or `rules/` |
| `focalZoom` | `components/common/FocalImage.vue` | beside it, or `lib/image/` |
| `authSnapshot`, `authIdentityChange`, `sessionRecovery`, `persistedSession`, `authAwareFetch`, `requestDeadline` | the auth store, `main.ts`, each other | `lib/auth/` (already exists, holds `captcha`) |
| `pendingImages`, `floatingPosition` | one root composable each | stay: they serve a root composable that has no domain either |

## 6. Naming and placement

- `lib/dungeonFeatures/featureAi.ts` beside `lib/dungeon-features/` (one domain,
  two spellings). **Fixed here**: moved into `lib/dungeon-features/`.
- `components/play`, `views/play` and `composables/play` beside
  `components/player`: the player portal under two names. **Merged into
  `player`** (5.2.6, the maintainer's call); the route stays `/play`.
- `pantheons` and `deities` are not a duplicate: a pantheon is a group of
  deities, its own entity with its own list and sheet. Pantheon data access
  lives in `composables/deities/` because it is about deities.
- `views/spike/SpikePagedJsView.vue` (the Paged.js harness from #330, closed
  June 2026) is registered only in dev and Vercel preview builds
  (`routes.ts`, behind `import.meta.env.DEV || __PREVIEW_BUILD__`), not in
  production. The first draft of this review said otherwise.
- `calendars/` (2 files, its own barrel) beside `lib/calendar`,
  `components/calendar` and `settings/*.calendar.ts`.
- `composables/` root held 26 modules against CLAUDE.md's list of 25:
  `usePrefetchOnIntent` (the `v-prefetch` directive) has no domain, so it stays
  and **the list now names it**.
- `src/__tests__/crossArtifactInvariants.test.ts` was the one `__tests__`
  directory, kept as a documented exception (the convention hooks named it)
  because it covers no single module. Re-tested rather than trusted: it is a
  Node scan of the repo's text, and its placement in `src/` was what forced
  node types into the browser config. **Moved** to
  `scripts/crossArtifactInvariants.test.ts`, where `tsconfig.node.json` and the
  node test project own it, and the exception is gone from both hooks.
- Barrels: 8 `index.ts` plus the router entry, matching CLAUDE.md.
- Fifteen exported type names are defined twice with different shapes
  (`RevealState` three times: `lib/reveal.ts`, `lib/tokenRenderer.ts`,
  `types/encounter.types.ts`; `Viewport`, `TiptapDoc`, `CellKey`, `CoinKey` and
  others). The core entities (`Npc`, `Monster`, `Quest`, `Item`, `Location`,
  `Spell`, `PartyMember`) are each defined once in `src/types`.

## 7. Dead code

Removed here, each with no importer in `src/`, `scripts/`, `supabase/` or the
Vite config (checked by name, not only by the graph):
`CrossEntityReferencePanel`, `DistanceInput`, `LockedContentOverlay`,
`RewardCurrencyPoolsEditor`, `StatCard` (common); `PlayerPartyCompanionCard`,
`PlayerPartyMemberCard` (play); `DungeonFeaturesView` (the route redirects to
`/dungeon-craft`); `DMAnnounceButton`; `AppInvitePanel` (superseded by
`AdminInvitesTab`); `cardforge/styles/LootBack.vue` (the live one is
`styles/loot/LootBack.vue`); `lib/locations/siteMap.ts` and its test (only the
test called it). The feature docs that named them are updated.

## Files over 1,000 lines

`stores/ui.ts` 1,515, `stores/soundboard.ts` 1,306, `useCampaignBackup` 1,243,
`useMapCanvasEditor` 1,228, `useQuestFlow` 1,169, `scriptoriumImport` 1,166,
`types/quest.types.ts` 1,147, `RichTextEditor.vue` 1,125, `useWorldBundle`
1,122, `router/routes.ts` 1,095, `NpcWebView.vue` 1,074,
`useCharacterCreationForm` 1,049, `copyToCampaign` 1,027. CLAUDE.md treats
600-800 as ordinary accumulation; these thirteen are where the number is meant
to catch something. The routes table and the types file are intrinsic; the
others are candidates only when work next touches them.

## Follow-up candidates

| Rank | Story | Candidate | Benefit | Risk | Size | Decision needed |
| ---- | ----- | --------- | ------- | ---- | ---- | --------------- |
| 1 | 5.2.1 | Async tabs: `CampaignSettingsView` (14), `PlayerCharacterView` (6), `QuestRunCockpit` sheets, `SoundboardView` dialogs | Smaller route chunks on four heavy pages | Low; one serial chunk wave on tab open, prefetchable | S | No |
| 2 | 5.2.2 | Move the single-consumer `lib` root modules into their folders (table in section 5) | The placement rule holds again; `lib` root down to ~67 | Low; import paths only | S | No |
| 3 | 5.2.3 | `AiGeneratorPanels.vue` to `src/ai/`; the 13 `common` → `campaign`/`spells` edges resolved | `common` imports no domain; a depcruise rule can then hold it | Low | S | No |
| 4 | 5.2.4 | Subfolders for `components/common` (primitives, entity pickers, stat display, list scaffolding, rich text, images) | A 134-file bucket becomes navigable | Low, but touches ~600 import sites | M | Decided: the grouping in the 10 Oct proposal |
| 5 | 5.2.5 | ~~Split `stores/ui.ts` into one filter store per domain under `stores/ui/`~~ Done | A list imports only its own filters; the largest file in `src` goes | Medium; 179 importers, and the Filter State Pattern rule in CLAUDE.md changes | M | Done |
| 6 | 5.2.6 | ~~One name per domain: `play`/`player`, `pantheons`/`deities`~~ `play` merged into `player`; pantheons are their own entity, not a duplicate. Left: `calendars/` into `lib/calendar` | The tree reads as one map | Low; renames | S | Decided |
| 7 | 5.2.7 | Subfolders by surface for `components/quests` (110) and `components/locations` (81), following the design frames | Navigable domain folders | Low | M | No |
| 8 | 5.2.8 | ~~Remove the #330 Paged.js harness (`views/spike/`, `lib/scriptorium/spike/`)~~ Removed, the maintainer's call: Scriptorium ships Paged.js itself | Less dev-only code | None | XS | Done |
| 9 | 5.2.9 | The fifteen twice-defined exported type names: rename the local ones | No two meanings for one name | Low | S | No |
