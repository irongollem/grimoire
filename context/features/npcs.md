# NPC Tracker

## Overview

The NPC Tracker is the DM's central registry for every person the party might encounter — allies, enemies, merchants, sages, mysterious strangers. Each NPC is a rich record combining identity fields, roleplaying content (appearance, personality, backstory), an optional full D&D 5e stat block, faction memberships, inter-NPC relationships, PC-specific connection notes, a portrait with adjustable focal point, and an AI Voice Coach for improvising in-character dialogue at the table.

The feature comprises four main surfaces:

- **NPC List** (`/npcs`) — filterable card grid
- **NPC Detail Sheet** (`/npcs/:id`) — the sheet as a modal over the grid on tablet and up, a full-screen takeover on phones; `?edit=true` is the full editor at every width
- **World web** (`/web`) — every tie in the campaign as a graph, focus on one node, group by faction, place or deity; the Relationship Web it replaced drew only people
- **NPC Generator** — slide-in panel (accessible from the list header) for quick-create and AI generation

Players access shared NPCs through the **Player Portal** at `/play/party` under the "People" section.

Every NPC create/update also queues a fire-and-forget semantic-search embedding (`queueNpcEmbedding` in `useNpcs.ts` → `embed-content` edge function, #600) so retrieval-grounded generators — currently the quest-hook generator — can find the NPC by meaning. The embed text format and the full retrieval mechanism are documented in world-building.md's "Retrieval grounding" section; NPC `notes` is deliberately excluded from the embed text there.

---

## NPC List (DM)

Route: `/npcs`

### Layout

NPCs render as a responsive card grid: 1 column on mobile, 2 on sm, 3 on lg, 4 on xl. Each card shows:

- A landscape-format portrait thumbnail (`FocalImage`, 144 px tall) with a hover scale animation. Falls back to coloured initials (first two letters) in the relationship colour if no portrait.
- A relationship badge overlaid top-right on the portrait, coloured from the `--relationship-*` ramp: hostile=red, unfriendly=orange, indifferent=grey, friendly=teal, helpful=green, unknown=purple.
- NPC name (truncated), species + occupation line, location (with pin emoji if present), and up to 3 tag chips ("+N more" if overflow).
- A status dot (top-right of name row): green=alive, red=dead, amber=missing, grey=unknown.
- Two always-visible icon chips over the portrait's top-left corner, on the same scrim and at the same size: **Edit** (straight to `?edit=true`) and the **reveal** control. Clicking anywhere else on the card opens the sheet.

The list is windowed (`VirtualGrid`): only the rows near the viewport are mounted, so a long NPC list never holds every portrait decoded at once, and `useScrollRestore` brings the scroll position back on return from a detail. A count line at the bottom shows "N of M NPCs" when filters are active.

### Filtering and Sorting

All filter state is stored in `useNpcsUiStore` and survives navigation within the session.

| Filter       | Type         | Options                                                                      |
| ------------ | ------------ | ---------------------------------------------------------------------------- |
| Search       | Full-text    | Name, disguise name, species, occupation, location name, tags                |
| Status       | Toggle group | All / Alive / Dead / Missing / ?                                             |
| Relationship | Toggle group | All / Helpful / Friendly / Indifferent / Unfriendly / Hostile / Unknown (warmest first) |
| Location     | Combobox     | Hierarchical location tree; selecting a parent includes all descendants      |
| Connected to | Combobox     | Any party member — shows only NPCs with a PC-connection note for that player |
| Sort         | Toggle group | Name (alphabetical) / Location (tree order, then alphabetical)               |

A **Clear** button appears when any filter is active, calling `resetNpcsFilters()`.

### Sharing (player visibility) — quick popover

Every card has an eye/eye-off button that opens an inline popover (Teleported to `body` to avoid overflow clipping). The popover lets the DM:

- Share to the **whole party** in one click.
- Toggle visibility per individual party member.
- Remove from all players ("Hide from all players").

When an NPC becomes visible to a player for the first time while a **session is running** (#758), a narrative event fires to the campaign chat: _"The party encounters [name]."_ or _"[Player] encounters [name]."_ [name] is the **player-facing** name — see "Names in chat" below; it is never `npc.name`.

### Header Actions

- **Web** — navigates to the World web (`/web`)
- **Populate Setting** — shown only when the active campaign has a recognised setting (e.g. Faerûn). Bulk-inserts seed NPCs from the setting's Hall of Heroes list, deduplicating by name. Reports how many were added or whether already up to date. Also back-fills portrait URLs for existing NPCs that previously had none.
- **Generate** — opens the NPC Generator panel
- **Select** (#885) — toggles bulk-selection mode (`NpcList.vue` owns `useBulkSelection`, mirroring `MonsterList.vue`; `NpcsView.vue` only holds a template ref and toggles it, same split as monsters). Selecting shows `BulkScopeBar` with "Move to campaign" and "Copy to campaign…" — every NPC row is selectable (no library/shared-content concept for NPCs, unlike monsters). `npcs` carries the `enforce_quota` trigger, so a copy past quota reopens the same `showPaywall` the list already mounts for its own create-gate. **"Make available in all campaigns" is not offered here** (`bulkScopeAllowsGeneral("npcs")` is false, `useBulkCampaignScope.ts`): `npc_inventory.campaign_id` is NOT NULL, so a general move could never carry an NPC's inventory. A move to a specific campaign carries an NPC's `npc_relationships` and `npc_inventory` rows along with it (matched on the owning `npc_id` only — a relationship's `related_npc_id` end is left wherever it already was, same as the Atlas already tolerates for a cross-campaign parent).
- **New NPC** — navigates to `/npcs/new`; blocked by paywall if the campaign's NPC quota is exceeded.

---

## NPC Detail Sheet (DM)

Route: `/npcs/:id` (also `/npcs/new`)

`?edit=true` in the URL is the mode switch, and the two modes are not two versions of one screen — they are deliberately different surfaces.

**Reading** (`/npcs/:id`) is a modal over the grid on tablet and up. The route is a **child** of `/npcs`, so `NpcsView` stays mounted behind it and keeps its scroll position and the revealed page of its infinite scroll — that is the whole reason for the nesting. Deep links from elsewhere in the app (global search, party tracker, faction members, chat, quest attachments) point at the same unchanged URL and land on grid-plus-modal; the grid costs nothing extra to draw, because `useNpcs` is one campaign-scoped query that many files already share.

**List rows are slim; records are read by id (#999).** `useNpcs` selects `NPC_LIST_COLUMNS` (`src/types/npc.types.ts`): everything a list, card, encounter or reveal needs, including `stat_block`, but not the four prose columns (`appearance`, `personality`, `backstory`, `notes`), which were most of the payload (a 300-NPC campaign's list went from about 2.2 MB to 223 kB). List readers are typed `NpcListRow`, so the compiler stops one from reaching for prose. `useNpc(id)` reads the whole record and is deliberately **not** seeded from the list: a seeded sheet or editor would hold a record without prose, and an edit could save it back blank. Code that needs prose for many NPCs at once (scene appearances, Chronicler, sound prompts, paint prompts) reads it by id through `useNpcFields` / `useFetchNpc`. Live sync keeps the split for free: an `npcs` ring refetches the list and the open record through their own reads, so neither ever holds the other's shape. Counts on the dashboard come from `useCampaignCounts` (head counts), not from loading the list. Closing is `router.replace("/npcs")`, so Back still returns to wherever the reader came from. On phones the same route is the full-screen `NpcDetailMobile` takeover, and the grid is not rendered at all.

**Opening an NPC paints from the list row, but the editor never sees it (#999).** The read views (`NpcDetailModal`, `NpcDetailMobile`, `NpcSheet`) take two values from `useNpcOpening`: `preview` (the cached list row, then the full record) and `npc` (the full record, `undefined` until the by-id read lands). Header, portrait, badges, stat block, DM note and "Mentioned in" draw from `preview`; the prose (`NpcLoreSections`) and the Voice Coach take `npc` and show a `BannerLoader` until it exists. This is a typed split rather than `placeholderData`/`isPlaceholderData`: `NpcListRow` has no prose fields, so a reader of `preview` cannot reach them, and every edit path (`NpcDetail`, `NpcEditMobile`) keeps using `useNpc`, which is not seeded and shows its loading state, so no editor can initialise from or save back a record without prose. `useNpcs.opening.test.ts` pins this (nothing written, `npc` undefined while only the row is known), and `useDmNote.test.ts` pins that the DM note column cannot be saved over a read that has not landed. The edit form is a separate chunk (`defineAsyncComponent`), since read paths never mount it.

**Intent prefetch reaches NPCs through `v-prefetch`.** `NpcList` puts `v-prefetch="/npcs/:id"` on the grid cards and rows. `routeDataPrefetch.ts` maps `/npcs/:id` (not `new`, `web`, `sets`) to `npcQuery(id)`, `dmNoteColumnQuery("npc", id)` and `entityBacklinksQuery(campaignId, id)`, all keyed by the id alone, so the record, the note and the backlinks start together at hover instead of in series behind the by-id read. Those builders are exported from their composables and used by the hooks themselves, so key and fetcher cannot drift. DM only. Measured with `dm-npc-detail` (4x CPU, +150 ms/request): settled at 350 ms with serial depth 1, against 776 ms and depth 2 before.

**Editing** (`?edit=true`) keeps the full page at every width. Reading is a glance, editing is a commitment, and a modal's best property — that it is cheap to dismiss — is the wrong property for a form with unsaved work: backdrop and Escape would become a data-loss surface, `NpcDetail` already opens three overlays of its own (`NpcGenerateDialog`, `PaywallModal`, delete confirm), and its header actions need a page header rather than a dialog's title bar. Saving an existing NPC returns to the bare `/npcs` list at every width, not to the sheet it was opened from (see the Sanctioned Exceptions entry in CLAUDE.md).

`useDetailModal` (`src/composables/useDetailModal.ts`) owns the decision, and both halves ask it the same question: `NpcsView` asks `showList`, `NpcDetailView` asks `asModal`, so the two can never disagree about which one the user is looking at.

The shell is generic — `AppModal` (backdrop, blur, focus trap, Escape via the `overlay` hotkey layer, the open animation) and `EntityDetailModal` (name, identity line, actions row, scrolling body). `EntityGridCard` records the clicked card's rect via `lib/modalOrigin`, so the panel grows out of that card; a deep link finds no origin and fades in instead. Adopting all of this for monsters is a route change and a different body slot.

`AppModal` is no longer NPC-specific: #746 moved twelve of the app's hand-rolled dialogs onto it, including the app-wide `ConfirmDialog`. Two knobs came out of that. `dismissable` is the master switch, and `backdropDismiss` narrows it to the keyboard — Escape still closes, a click beside the panel does not. That second one exists because dismissal is the right answer for a panel you are _reading_ and the wrong one for a dialog that asked a **question**: `ConfirmDialog` and `ManualRollPrompt` both set it false, while keeping Escape, which is the only keyboard way out of a dialog. Escape is also registered per _open_ rather than per mount, so of two modals mounted side by side the one opened last is the one Escape reaches.

The dialog's title bar is `ModalHeader` (#753) — icon, name, optional "what this is" line, close control — with its tints drawn from `modalHeaderVariants` in the semantic `AppButton` tone vocabulary. It matters for more than markup: the header registers its heading's id upward through `modalAria`, so `AppModal` gets `aria-labelledby` (and `aria-describedby` from the subtitle) **without the call site passing anything**. A dialog with no accessible name is invisible as a bug — it looks perfect and a screen reader announces an anonymous "dialog" — so that wiring had to be something you get by default rather than remember. `EntityDetailModal` predates it and still draws its own entity-shaped header; reconciling the two is open.

Toggling between modes does not lose unsaved work because edit mode is URL-driven (the form re-mounts on the keyed `:id`).

### Header Actions (edit mode)

| Button                   | Condition          | Behaviour                                                                 |
| ------------------------ | ------------------ | ------------------------------------------------------------------------- |
| Cancel                   | Always             | Leaves without saving: drops `?edit=true` for an existing NPC (the sheet over the grid, exactly where Save lands), `/npcs` for a new one. The desktop twin of `NpcEditMobile`'s Cancel. |
| Delete                   | Existing NPC       | Confirms, deletes NPC + storage images, navigates to `/npcs`              |
| Send to… ▾               | Existing NPC       | `EntitySendMenu` — **Send to Scriptorium** (formats the NPC as a Scriptorium document and pushes to `/scriptorium/:docId`) and **Copy to campaign…** (#885, opens `CopyToCampaignDialog`). `NpcDetail.vue` owns both flows and mounts the copy dialog on both layouts; the desktop menu calls the exposed `sendToScriptorium()` / `openCopy()`, and the mobile twin is the same pair of rows in `NpcEditMobile.vue`'s overflow sheet. Neither is offered from the read-only sheet (`NpcSheet.vue`/`NpcDetailModal.vue`), matching `ItemDetail`'s edit-only placement. A quota-exceeded copy reuses the file's existing `showPaywall`. |
| Generate (AI)            | API key configured | Opens `NpcGenerateDialog`                                                 |
| Reveal                   | Existing NPC       | `AudienceRevealControl` — the face in `#identity`, who sees it, and the field list in `#what` |
| Save / Create NPC        | Always             | Submits the `#npc-detail-form`                                            |

Six controls, and the count is the point. There were eight, and the row never
wrapped: `PageHeader`'s actions column was `shrink-0`, so at around 1100px it
held its single line and the title column beside it — which could shrink to
zero — collapsed to one letter per line. Both halves were fixed: the header now
lets the buttons wrap and keeps the page's own name (see the note in
`PageHeader.vue`), and the row itself was thinned —

- **View → Cancel.** View dropped `?edit=true` and landed on the sheet over the
  grid, which is where Save already lands; what desktop actually lacked was an
  honest way to leave without saving.
- **Scriptorium + Copy to campaign… → one "Send to…" menu.** Two destinations,
  one verb, and the same two labels the phone's overflow sheet already used.
- **Revealed / Concealed → the reveal control's "SEEN AS" section**, next to the
  audience it decides the face for. See [Reveal](#reveal-741) below.

### Left Column — Portrait + Meta

**Portrait tabs**: "True Form", "Cutout" and "Alter Ego" (#917 story 4) — the tab ids/labels are shared between the desktop sidebar (`NpcSidebar.vue`) and the phone editor (`NpcEditMobile.vue`) via `npcArtTabs.ts` so the two cannot drift. True Form and Alter Ego each have a separate `ImageUpload` with focal-point setter. The Cutout tab edits `cutout_url` — the true form alone on a transparent background, always of the true form (a disguise has no cutout of its own) — with no focal point and no Simulacrum "Mini" entry point; in place of "Generate with AI" it offers "Cut out from picture", which makes the cutout from the saved portrait through the `generate-cutout` edge function (platform credits, `entity_cutout`); and `expect-transparency` is set so `EntityImageBlock` warns if the uploaded image has no transparent background. The alter-ego tab is pre-selected if the NPC already has `disguise_name` or `disguise_portrait_url`.

**Party Stance** (relationship): `RelationshipWheel` (`components/common/entity/`, also the faction editor's Party standing control, #1011): the five 5e attitudes (Hostile, Unfriendly, Indifferent, Friendly, Helpful), each coloured from its `--relationship-*` token. `unknown` is the unset state rather than a sixth choice.

**Status**: four coloured toggle buttons — Alive (green), Dead (red), Missing (amber), Unknown (grey).

**Tags**: `TagInput` component for freeform comma-separated tags.

### Right Column — Identity Section

| Field         | Type                  | Notes                                                               |
| ------------- | --------------------- | ------------------------------------------------------------------- |
| Name          | Text input (required) |                                                                     |
| Disguise Name | Text input            | The alter-ego name shown to players when concealed                  |
| Species       | Text input            | Free-text, e.g. "Half-Elf", "Tiefling"                              |
| Alignment     | Select                | 10 D&D alignments + Unaligned                                       |
| Age (description) | Text input        | What a date cannot say ("Ancient"); replaced on the sheet by a birth date |
| Born          | `CalendarDateInput`   | Year, then optional month and day in the campaign calendar (#1086)  |
| Died          | `CalendarDateInput`   | Shown only while status is Dead; hiding it keeps what was typed     |
| Occupation    | Text input            |                                                                     |
| Location      | EntityCombobox        | Hierarchical location tree                                          |

**Birth dates and ages** (#1086): `npcs.born_year` / `born_month` / `born_day` (all nullable; a month always comes with a day, and a year with it) hold a birth date in the campaign's calendar. `src/lib/calendar/age.ts` derives whole years against the campaign's today (`ageOn`), so the age moves when the DM advances the date, and `displayAge` is the one rule every surface uses: a birth year the calendar can place wins over the free-text `age`, which stays for "ancient" and the like. The phone sheet and the detail modal show the computed age, with the full birth date in a tooltip. Age is DM-only in `get_player_visible_npcs` (returned as null), and the birth columns are not in the projection either, so players see neither.

**Death dates** (24 Oct 2026, migration `20261024062101`): `npcs.died_year` / `died_month` / `died_day`, the same shape as the birth date, plus a check that a death is not before the birth year. Status `dead` still decides whether someone is dead; the date only says when, so a date left on a living NPC is ignored. A dead NPC is never aged against today: `displayAge` measures to the death date, or falls back to the free-text age. The modal reads "Died 12 Ches 1491, aged 63", the phone quick fact "Age at death", and a family tree card "1428 – 1491". DM-only, like the birth date.

**Connections** (`ConnectionsSection`, `src/components/connections/`) is embedded between Identity and the tab bar of the edit form (and in the phone edit form's Connections card). It is the same block as the Relations tab's, below; factions are in it, so the Identity section has no Factions field any more.

### Tab Bar

Three tabs in edit mode, five tabs in view mode:

#### Lore Tab

| Field       | Type           |
| ----------- | -------------- |
| Appearance  | RichTextEditor |
| Personality | RichTextEditor |
| Backstory   | RichTextEditor |

All fields are nullable; empty fields are hidden in view mode.

**DM notes are not a Lore field.** The NPC's private note (`npcs.notes`) is the always-open, autosaving `DmNoteBox` on the NPC page, in view and edit modes and on phone layouts, and in the docked scratchpad. NPC Quick Create still saves its Concept box as that note. See [dm-notes.md](dm-notes.md).

#### Inventory Tab

`NpcInventorySection` — lets the DM add items from the vault to this NPC's carry list. Items show quantity, optional notes, and a "Vault" link. A **Drop to Chat** button (gift icon) sends the item as a chat message drop event and removes it from the NPC's inventory in one click (for loot hand-outs during play).

#### Relations Tab (view mode only)

`NpcRelationsTab.vue`, rendered by both hosts (the desktop sheet's Relations tab and the mobile sheet's Relations accordion) so the two cannot drift. Three parts, each owning its own CRUD so nothing needs the edit form: the **Family** block (kin, above), the **Connections** block (`ConnectionsSection`) and **Favours owed** (`NpcFavorsSection`). Connections to the party's characters are not here: they are on **With the party** (below), where the player who reads them is named. See the Web section for the graph alternative.

**The Connections block** (#1084) is one component, mounted in the same place on every sheet (an NPC's Relations tab, a character's page, a faction, a place, a deity, an item), props `{ subject: WorldRef; subjectName }`. It reads `useConnections(kind, id)` and groups the rows by the other end's kind in one order everywhere: people, factions, places, deities, items, quests; an empty group is not drawn. Each row is a `ConnectionSlip`: thumbnail (the initial stands in when there is no picture), the name (an NPC opens in place, the rest link to their sheet), the **type word as an in-place picker** (`ConnectionTypePicker`: common types first, the rest behind "more..." with a filter, a record type labelled with where choosing it moves the tie, a one-valued record saying what it replaces; choosing calls `useRetypeConnection`, so nothing is re-added), a dashed marker naming a record's home (membership, home, inventory, store, seat, patron, quest), the DM note, the told line, and a "who knows" eye (`AudienceRevealControl`, links only; a record is known as its record already is). A membership keeps its role as a select in the row, without Leader and Head of house when the faction already has a head (`useFactionHeaded`), and a status that is not Active is badged and dims the row. The `...` menu edits a link's note and told line in place (`ConnectionNotesEditor`, autosaving), opens a record's home when it is another page, and removes. A long list of records that a section already lists (a place's residents, a faction's roster, past five) folds into one line pointing at that section ("14 people live here, People in the Area"). The header holds Suggest (`ConnectionSuggestions`), "In the web" (`/web?focus=<kind>:<id>`) and "Add connection".

**Add a connection** (`AddConnectionDialog`): the left side is `WorldEntityPicker` (the global search), the right side offers the types the two kinds can hold as chips (`typeChoices`), the sentence read both ways ("Brenna owes Harl", "on Harl's sheet: creditor of Brenna"), and either a link's note, told line and who knows (nobody by default) or a record's own fields (a membership's role; "Moves Brenna's home from X to Y" for a one-valued record). Kin is not written here: choosing a kin type opens the existing Add relative dialog at that relation, and `AddConnectionKinNote` says "X is already Y's sister" when the two are kin. The retired pieces are `NpcRelationsSection`, `NpcFactionsSection`, `useNpcRelations` and the `npc_relationships` table's types; Family stays its own block.

**Directed bonds read like parent and child** (25 Oct 2026). Superior and subordinate, and mentor and apprentice, are one relation read from either end. The catalogue now carries both words ("mentor of" / "apprentice of", `connectionWord(row, subjectKind)`), the picker offers each direction from the sheet on screen, each pair shares one colour, and the web draws one arrow from the leading end. The maintainer's ask: "it's 1 relation with a direction but it feels like 2 without a direction".

**One slip for every connection** (24 Oct 2026). Family rows (`KinRow`), every row of the Connections block (links and records alike) and the AI's suggestions all render through `ConnectionSlip` (`components/common/entity/`): a thumbnail, a torn paper slip, the name, tags, notes, and a `...` menu. Only the tags and details differ (a relationship type's coloured tag, a faction role picker, a family meta line). The maintainer asked for this after seeing the four designs side by side on a phone; do not give one kind its own card again.

**Family trees** (#1083). Kin lives in `kin_links`, separate from bonds. The NPC sheet's Family block lists it; `/family/:key` draws the tree (`FamilyTree.vue`, laid out by `lib/kinship/layout.ts`) at every width. The phone draws the same tree with smaller cards (`PHONE_GEOMETRY` in `treeGeometry.ts`) and opens on the centred person at no smaller than 0.8 scale; a finger drag pans even when it starts on a card. It used to show one strip per generation with no lines, which the maintainer found did not read as a tree (24 Oct 2026). A House faction has a Lineage tab, a descent rule, a line of succession, a succession custom and a **seat** (`factions.seat_location_id`, a place in the Atlas, shown in the house header and facts; a player sees it only when they can already see that place).

#### Suggested connections (#910, widened by #1084)

The suggester is not NPC-only any more: **Suggest** sits on the Connections block of any sheet (NPC, character, faction, place, deity, item) and is `src/components/connections/ConnectionSuggestions.vue`, props `{ subject: WorldRef; subjectName }`. It shows only when AI is enabled for the campaign, opens a steer box ("Steer the suggestions"), and lists proposals one by one as connection slips with Accept and Dismiss, plus Dismiss all and one muted "Set aside" line per refused claim. **Nothing is written until the DM accepts a proposal.**

_Server path only:_ `supabase/functions/suggest-connections/index.ts` (candidate reads in `gather.ts`; client: `src/ai/useConnectionSuggestions.ts`). Body `{ campaign_id, subject_kind, subject_id, prompt? }`. It is not a `generate-entity-text` key because the candidate blocks come from service-role reads the browser cannot make. Flow: auth, frozen/child gate, **DM-role gate via `isCampaignDm` (`_shared/campaignAccess.ts`)**, rate limit, `reserveCredits`, candidate gathering, model call, `sanitizeSuggestions`, `recordGeneration` (refunds with `releaseCredits` on any failure). Ledger reason and price row `npc_relationship_suggestion` (1 credit, kept from the NPC-only days so the calibration history stays in one piece); prompt row `connections`. The prompt row holds the editorial rules; the output shape and the list of valid types per kind are built in code (`outputShape`, `typeGuide`) from the catalogue, so the model is offered exactly what the check accepts.

_The DM-role gate is the point:_ the function reads the campaign with the admin client, so whatever reaches the prompt can come back in the answer. A campaign member who is a player must not get DM-only material, so membership is not enough; `isCampaignDm` admits the owner and `campaign_members.role = 'dm'` only, and fails closed on a read error. Every other DM tool that reads campaign content with the admin client (`generate-quest`, `generate-roll-table`, `generate-complication`, `generate-npc-voice`, `generate-chronicle-text`, `quest-designer-turn`, `draft-scriptorium-document`) uses the same helper, tested in `campaignAccess.test.ts`.

_Candidates come from two places on purpose._ Semantic retrieval (`retrieveCampaignEntities`) ranks NPCs, places and factions against the subject, but it is an enhancement that can be down or empty (nothing embedded yet), so a bounded direct read of every kind the subject can be tied to always rides along: NPCs 40, factions 30, places 30, deities 20, items 30, characters 30 (name and birth year only). The response reports `grounded` so the client knows which it got. The model may only name candidates. Each candidate line carries what grounds a tie: an NPC's place and memberships with role and status, a faction's head and seat, a place's controlling factions (`controls`, `based_in`, `operates_in` links), an item's carrier. The subject's existing ties (its `world_links` both ways, memberships, kin, and the records in its own columns: home, seat, keeper, patron deity) are serialised from its side so the model does not repeat them.

_Output_ (`_shared/connectionSuggestions.ts`): `{ suggestions, setAside, grounded, ai_provenance }`. A suggestion is one of `link { target_kind, target_name, type, subject_is_from, notes }` (`type` a catalogue key for that pair; `subject_is_from` says which end the subject is stored as), `membership { target_kind, target_name, role, notes }` (person and faction, either as the subject; role from `SUGGESTED_FACTION_ROLES`, mirror of `NPC_FACTION_ROLES`, held equal by `src/types/factionRoleMirror.test.ts`) or `kin { target_name, target_type, relation, parent_role, notes }` (a person subject only; `relation` is what the target is to the subject; mirror of `KIN_RELATIONS`, held equal by `src/types/kinshipEnumMirror.test.ts`). The server attaches `target_id` to each, from the candidates it showed, so the client writes by id.

_Validation_ (`sanitizeSuggestions`): drops names that are not candidates, the subject itself, types the catalogue does not hold for that pair or direction (two possible directions must be stated; one is implied and a contradicting statement drops the suggestion; a faction's stance is always the subject's own), ties that already exist, duplicates, and a membership to a faction the person already belongs to; caps at twelve and bounds notes (300). A role outside the list becomes Associate; a Leader or Head of house is dropped for a faction that already has one. _Set aside_ (muted lines, charged nothing if they are all there is): a parent claim whose birth years contradict it ("Pip was born five years after Wren"), a sibling the shared parents already imply, an item someone carries said to be "kept at" or "hidden at" a place ("Brenna carries it"), and a symmetric tie that already exists the other way. A set-aside line reads `Set aside: "<claim>". <Reason>.`

_Accepting_ maps the suggestion to the picker's `TypeChoice` for the pair, read from the subject (`typeChoices`), and calls `useCreateConnection` with the suggestion's `ai_provenance`, so a link, a membership with a role or a kin link each land in their own home. The composable is deliberately not registered with `registerAiGenerator`: it produces no entity to navigate to, so the floating badge would have nothing to offer. It still respects `isAnyAiGenerating`. A new NPC's "known associate" in the NPC generator is written the same way, from the new NPC's side.

#### Combat Tab

**Two ways to populate the stat block:**

1. **From template**: a grouped `<select>` backed by `NPC_TEMPLATES` / `NPC_TEMPLATE_CATEGORIES` in `src/data/npcTemplates.ts`. Applying a template fills all numeric fields and trait lists.
2. **From Bestiary**: searches all campaign monsters via `EntityCombobox`. Selecting one imports its full stat block, portrait, alignment, and tags. If the monster is SRD-only (no UUID), data is imported as a template without a stored link. Non-SRD monsters store a `linked_monster_id` FK; a "View in Bestiary →" link appears. A **Promote to Monster** button (visible when no link exists) creates a new Bestiary entry from the NPC's current data and immediately navigates there.

**"Include stat block" checkbox** controls whether a stat block is attached on save.

**Stat block fields:**

| Section            | Fields                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core               | Armor Class, Hit Points (dice expression via `DiceExprInput`), Speed (structured: Walk / Fly with Hover toggle / Swim / Climb / Burrow, each in ft.) |
| Abilities          | STR / DEX / CON / INT / WIS / CHA (shows computed modifier below each input)                                                                         |
| Derived            | Challenge Rating, Proficiency Bonus, Saving Throws, Skills                                                                                           |
| Defenses           | Damage Resistances, Damage Immunities, Condition Immunities                                                                                          |
| Senses & Languages | Senses (string), Languages (string)                                                                                                                  |
| Traits             | Special Abilities (`TraitSection`) — repeating name + RichTextEditor pairs                                                                           |
| Spellcasting       | `SpellcastingSection` — ability (INT/WIS/CHA), save DC, attack bonus, spell entries by frequency                                                     |
| Actions            | Actions (`TraitSection`)                                                                                                                             |
| Legendary          | Legendary Actions (`TraitSection`)                                                                                                                   |

#### Voice Tab (view mode only)

At the table, a player asks the NPC something the DM didn't prep for. The Voice Coach turns a one-line description of the situation into 2–3 short, in-character replies the DM can read aloud immediately (issue #336). The situation text and the returned lines live only in the component's local state and vanish the moment the DM navigates away, with one exception: **Said it** on a line writes it to the NPC's memory ledger (below) as a `revealed` line, DM-only, filed under the default session, carrying `ai_provenance` (`npc_voice`). A line the DM actually spoke is then something the next suggestion must stay consistent with.

**One shared component, not two surfaces.** The tab renders `NpcVoiceCoach.vue` directly, and it is the exact same component instance on desktop (`NpcTabContent.vue`'s "Voice" tab) and on mobile (`NpcDetailMobile.vue`'s "Voice Coach" accordion section, closed by default like the other sections). There is one implementation to keep correct, not two that can silently diverge — this repo has been bitten by that failure mode before, so it's worth stating explicitly rather than leaving it implicit.

**What the AI receives.** The DM types the situation (capped at `AI_PROMPT_LIMIT_SHORT`, 500 characters). The edge function (`generate-npc-voice/index.ts`) loads the NPC row from the database itself by `npc_id` rather than trusting any client-supplied NPC facts, then builds a profile (`buildNpcProfile()`) containing: name, race, alignment, age, occupation, status, relationship toward the party, and Tiptap-flattened (`toPlainText()`) personality (≤800 chars), backstory (≤600 chars), and DM notes (≤600 chars) — each field omitted entirely, never emitted as an empty label, when absent. A campaign-setting context block is appended when the campaign has one configured. After the profile come the NPC's newest `MEMORY_PROMPT_LIMIT` (12) memory lines, oldest first, each with its session label and who was present, formatted by `formatNpcMemories` in `_shared/npcMemories.ts` (bodies capped at 280 characters). Both paths read the rows through the same `loadPromptMemories` (the edge function with its service-role client, the BYOK path with the user's), so the two cannot drift; a failed memory read on either path logs and generates without memories. No other party query, no monster index, and no ruleset-context fetch — this is pure dialogue with no rules content, so that context would be dead prompt weight on a call felt live at the table.

**The disguise rule.** When the NPC has a `disguise_name` and `is_revealed` is `false`, the true name is not sent to the model at all — not masked, not flagged "do not reveal," simply absent from the profile. The model receives only the disguise name, plus an explicit instruction to stay in that persona. Handing a model a secret behind a "don't say this" instruction is a strictly weaker guarantee than withholding the secret outright, and the true name adds nothing to voice quality that personality, occupation, and backstory don't already supply — while the failure mode of getting it wrong is a DM reading a suggested line aloud at speed and blowing a reveal that's been built for months. The backstory is still sent even while disguised, since it's what makes the persona sound like a person, paired with an instruction not to surface any detail that would expose the cover. `buildNpcVoiceProfile.test.ts` carries a load-bearing `expect(profile).not.toContain(npc.name)` assertion guarding exactly this.

**Three deliberate deviations from every other AI generator** (`useNpcVoiceCoach.ts`):

- Not registered via `registerAiGenerator()` — this is ephemeral at-table assistance with no entity to route to, and nothing for the AI-generation badge to track.
- Never gated on, and never sets, `isAnyAiGenerating` — a DM mid-session may have a portrait rendering in the background at the same time, and blocking the voice coach behind that flag would defeat the point of a feature whose whole value is speed.
- Does not call `startAiQuotes()` / `stopAiQuotes()` — that loading-text carousel is a single global instance, and hijacking it would stomp the loading text of a concurrent real generation running elsewhere in the app. The component shows its own plain "Finding the words…" state instead.

**Latency.** The feature is non-streaming — like every other AI generator in this codebase, it calls the shared `callText()` (`_shared/textGen.ts`), a single request/response round trip rather than a stream. Output is capped at 350 tokens, generous relative to the 2–3 short lines the prompt actually asks for; the cap exists to guard against runaway cost rather than to bound useful output, since OpenAI is called with `response_format: json_object` and a response truncated at the cap would come back as invalid JSON rather than merely a short answer. Streaming was not implemented here: fixed per-call overhead (cold start, auth, the NPC row read) makes up a meaningful share of the total round trip on a response this short, so the perceived-latency benefit of streaming would be modest set against the cost of reworking the credit ledger (`reserveCredits`/`recordGeneration` in `_shared/credits.ts`) to account for usage arriving with a streamed response instead of one synchronous one.

**Credit cost.** 1 credit, `npc_voice_generation` in `ai_generation_credit_costs`, multiplied by the active text provider's `text_multiplier` — the same convention as every other text generator. The system prompt lives in `ai_system_prompts` under `generator_type = 'npc_voice'`. Both rows are seeded by migration `20260802000001_npc_voice_coach_ai.sql`. BYOK generations are charged 0 credits but still recorded via `recordGeneration` (server) / `logUsage` (client), so generation history stays complete even when nothing was spent.

**Over MCP too (29 Sep 2026).** The MCP server's `voice_coach` tool (`supabase/functions/_shared/mcp/tools.ts`) invokes `generate-npc-voice` under the connection's own OAuth token, so the credit charge, rate limit, campaign `ai_enabled` switch and the disguise rule apply unchanged, and refusals read the same as in the app via the shared `_shared/edgeError.ts`. It reads the campaign off the NPC row rather than taking one as an argument. Keep new voice-coach behaviour in the edge function, not in either caller, or the two drift.

**The disguise rule covers memories.** A DM writes "Bram admitted he sold the map" without thinking about the cover, so while the NPC is disguised and unrevealed `formatNpcMemories` replaces the true name with the disguise name: the full name in any case, and each other part of it ("Bram" of "Bram Ashford") where written as a name (capitalised or in capitals), on word boundaries. Particles and titles ("the", "Lord") are never masked on their own, or "Bram the Bold" would rewrite every "the" in the prompt, and the disguise name is inserted literally (a "$&" in it is text). `_shared/npcMemories.test.ts` asserts both.

**Client-side (BYOK/local) mirror.** `src/lib/npcs/buildNpcVoiceProfile.ts` is a hand-kept client copy of the edge function's `buildNpcProfile()`, used when the DM is in local-vault BYOK mode (`grimoire_key_local_mode === "local"` in `localStorage`) so the NPC profile can be built in-browser without a server round trip that would leak the local key. Same precedent as `_shared/ai-prompt.ts` mirroring `src/ai/utils.ts` — there is no shared source of truth between edge and client for this logic, so the two must be changed together by hand.

### Reveal (#741)

NPCs were the worst case the unified reveal control was built to fix: **four** separate UIs for one action — a header popover, a list-card popover, a mobile bottom sheet, and a fields panel bolted to the top of the edit form. Three knew about the first-reveal defaults, two announced the encounter in play mode, only one did both. Which one a DM got depended on where they were standing.

`NpcRevealControl` (`src/components/npcs/NpcRevealControl.vue`) now owns all three behaviours and is mounted on every NPC surface — list card (`overlay` form), mobile app bar and action bar, detail header. It carries:

- **Which face** — `NpcAlterEgoControl` in `RevealBody`'s `#identity` slot, shown only when the NPC has a `disguise_name` or `disguise_portrait_url`. See below.
- **Who** — party members, written to `player_visible_to`
- **What** — `RevealedFieldsPanel` over `NPC_PLAYER_FIELDS`: Portrait, Name, Species, Occupation, Location
- **First-reveal defaults** — `fieldsForFirstReveal` (`lib/npcDisplay.ts`) seeds name + portrait when the DM has never picked any, so a reveal is not a blank card. Only when empty: re-revealing must not re-add a field they removed.
- **Play-mode narration** — `sendNarrativeEvent` on a first reveal, and again when the true form is revealed

The **editor** is the exception, and deliberately: `NpcDetailView` binds `AudienceRevealControl` to the draft rather than the row, because the editor owns its Save and writing through on every checkbox would commit changes the DM has not agreed to and fight the form's dirty tracking. That includes the face: the editor's "SEEN AS" writes `form.is_revealed` and lands with Save, while every read surface writes it through immediately.

#### The identity half — "SEEN AS"

`RevealBody`'s section order is **identity → who → what**. Identity comes first because it decides _which_ entity the rest of the popover is about; "what" comes last because choosing fields for an entity nobody can see is meaningless.

That last point is why the `#identity` slot is **not** dimmed with the `#what` slot at `state === 'private'`. Which face an NPC is wearing changes what the **DM's own** grid card and page title render (`getNpcDisplayName` and friends key off `is_revealed`), whether or not a single player can see the NPC — so it stays live for a completely hidden NPC. Do not "fix" it into the dimmed block.

`NpcAlterEgoControl` is presentation only — a `SegmentedControl` over **Alter ego** / **True form**, no state and no mutation — so the write-through read surfaces and the draft-bound editor can share one control. The two labels are the same pair the editor's portrait tabs already use (`artTab` in `NpcDetail.vue`); the options carry no icons on purpose, because the only ones that fit are this control's own eye/eye-off, which mean "players can see this" everywhere else in the popover.

### Shared-NPC notes panel

When an NPC is shared with at least one player, a panel appears at the top of the edit form. The per-field checkboxes used to live here; they are now the reveal control's "what", next to the audience they apply to. What remains is prose, which does not belong in a popover:

**Party Notes** (`PlayerNotesWidget`) — the same notes widget players have: the viewer's own private note and party note on this NPC, both saving as they type, plus what the party has written.

### With the party (#986)

`NpcPartyTab.vue`: what each player character knows about this NPC, in one place. A tab on the desktop sheet (second, after Lore) and an accordion on the phone (`NpcDetailMobile`), so both hosts render the same component.

- One row per character (`NpcPartyRow.vue`): portrait, class and level, **when they met** (`npc_reveals`, read by `useNpcReveals`, "Met · 4 October" or "Not met"), and the share toggle. The toggle is `useNpcReveal`'s adapter, the same one the header's reveal popover uses, so a share here seeds the visible fields and announces in a running session exactly as the popover does.
- **Their connection** (the `world_links` row between this NPC and that character, read by `useConnections("npc", id)`): a type picked in place and a line labelled "Wren reads this", because that player sees it on their People page as "Your connection". The type picker offers every link type two people can hold (`typeChoices("npc", "party_member")`, kin excluded): a symmetric type once, a directed one both ways. The first type chosen creates the link (`useCreateConnection`), later ones retype it (`useRetypeConnection`). The line is the link's `told`, saved by `useAutosave`; a line written before any type files under "contact". Choosing a type or writing a line adds that character to the link's `player_visible_to`. Clearing the line keeps the link; removing it is the row menu's "Remove connection". The old `npc_pc_notes` table is gone.
- Beside the rows: the disguise (`NpcDisguisePanel`, cover face and "Reveal true self" / "Put the disguise back on", through `useNpcReveal.setRevealed`) and the fields a share shows (`RevealedFieldsPanel`).

Connection notes used to live twice over, a box at the top of the edit form that only appeared once the NPC was already shared and "Party connections" in the Relations tab, and neither said the player reads them; the maintainer had never used them. Both homes and `NpcPcNotesSection` are gone, so this is the only one. `npc_reveals` rows are written by triggers in the same transaction as `npcs` / `locations` updates, and `npc_reveals` rings the campaign doorbell itself, so the DM's "when they met" refetches on that ring.

### Memory (#1019)

`NpcMemoryTab.vue`: what this NPC and the party have told each other, as a ledger of short lines. A tab on the desktop sheet (after With the party) and an accordion on the phone (`NpcDetailMobile`), one component in both. It answers "what did Bram already admit last session?", which nothing else recorded: `npc_reveals` says when they met, the NPC to character link's `told` is the player-readable connection line, and the DM note is free prose.

- **Table** `npc_memories` (migration `20261012105632`): `kind` (`revealed` NPC to party, `learned` party to NPC, `promise`, `deceived` a lie told and believed either way, `attitude`, `event`; the list lives in `_shared/npcMemories.ts` because the edge function formats them too), `body` (1 to 1000 characters, trimmed), `session_id`, `party_member_ids` (who was there; empty means not recorded), `player_visible_to`, `user_id` (the writer, `on delete set null` so a co-DM leaving does not take the history), `ai_provenance`. Editable by the DM (typos, re-filing), so it has `updated_at`.
- **The campaign comes from the NPC.** `private.normalize_npc_memory()` (before insert or update) sets `campaign_id` from `npc_id`, keeps only ids of that campaign's party members in both arrays (so a stale or foreign id can never let another campaign's player read a line) and keeps the original author on an update. It is `SECURITY DEFINER` because `npcs` is readable by its owner only, which would otherwise refuse a co-DM writing about another DM's NPC; it decides nothing, and RLS judges the row against the campaign it derived.
- **RLS**: the table is the DM's. The campaign's DMs read and write everything; a player cannot select it at all (#1056, migration `20261013141245`), because three of its columns name the entity a disclosed secret lives in (below). A player reads through `get_player_npc_memories(npc, party member)`, a definer that returns `id`, `npc_id`, `kind`, `body`, `session_id` and `created_at` of the lines whose `player_visible_to` holds that member, for a player seated as that member or a DM of the NPC's campaign (the DM preview), and raises for anyone else. Covered by `supabase/tests/npc_memories.test.sql`.
- **Sessions.** The add form files a line under the running session, else the last one played (`defaultMemorySessionId`), because a line written between sessions is usually a recap of the last one. A null `session_id` means "outside any session", which is why the table has no `stamp_open_session()` trigger: a trigger cannot tell the DM's null from a column left out, and would file the line under the running session. MCP, the one writer that may leave it out, fills the running session itself (the `npc_memory_session` create step). Unlike the reveal tables, `start_campaign_session` does not sweep unfiled memories into the next session. `merge_campaign_sessions` moves them.
- **Sharing**: "Players see this" shares the line with the members marked present, or the whole party when none is. Players read shared lines in `PlayerNpcMemories.vue` on their People page ("What we know"), grouped by session as the People ledger labels them (`useMyNpcMemories`, through `get_player_npc_memories` for the viewer's member: the linked one, or the previewed one in DM preview).
- **Touched this session**: adding a line records a `dm_note_touches` row (`recordDmNoteTouch` in `useDmNote.ts`), so the NPC joins the scratchpad's "This session" list.
- **Live sync**: the table rings the campaign doorbell under its own name; `SIGNAL_KEYS` maps it to the `npc-memories` root, which both the DM's and the player's reads sit under.
- **Elsewhere**: the Voice Coach reads the newest twelve lines (above); MCP exposes an `npc_memory` type for `get`/`list`/`search`/`create`/`update` (an AI DM keeping an NPC consistent across a solo campaign); campaign backup carries the table, remapping both member arrays. Play state: not copied into a demo (`demo_campaign_tables`).
- **Disclosing a secret (#1053, migration `20261012233859`)**: a line may name the `[secret]` block it gives away, through three columns, `secret_entity_type` (`location` | `item` | `puzzle` | `note` | `faction`, `SECRET_ENTITY_TYPES` in `_shared/npcMemories.ts`), `secret_entity_id` and `secret_id` (the block's `attrs.secretId`): all three or none (a check), and the entity must be in the memory's campaign (the normalize trigger). The block itself is not checked, so a DM may rewrite or delete it later and the line then reads "a secret that is no longer there". The form's **Discloses a secret…** picker (`NpcMemorySecretPicker`) lists the campaign's blocks through `list_campaign_secrets(campaign)` (`useCampaignSecrets`, DM only, refreshed by the rings of the five tables); the row shows the excerpt and links to the entity (`NpcMemoryDisclosure`, `src/lib/npcs/secretEntityRoute.ts`). Wherever the DM reads that text, the block's label becomes "known since Session 14 (Bram)": see "DM-only secret blocks" in campaign-notes-calendar.md. A player reading a shared line receives none of the three ids, and never the secret's text: until #1056 the table's player policy handed a direct PostgREST caller the ids, which proved a hidden block existed in a place the party had not found. Backup remaps the entity id; the block id travels inside the copied text.

### View Mode (NpcSheet)

The read-only sheet uses a two-column layout (portrait column fixed 208 px, content column scrolls).

Left column: portrait (portrait format), status + relationship badges, tags, and an alter-ego line stating which face is showing. The toggle itself is not repeated here — it is the "SEEN AS" section of the reveal control in `NpcDetailModal`'s own header, which saves immediately and fires the chat event while a session is running.

Right column: `NpcTabContent` with identity line (species · occupation · alignment · age), then Lore / With the party / Inventory / Relations / Combat / Voice tabs. With the party is described above. The Relations tab is `NpcRelationsTab` (see above): Family, the Connections block and favours, all visible — and editable, since the sections own their CRUD — from view mode without flipping into the edit form (#168/#169).

### Alter Ego / Disguise System

An NPC can have a parallel identity:

- `disguise_name` — the name shown to players while concealed
- `disguise_portrait_url` / `disguise_portrait_focal_point` — separate portrait for the false identity
- The disguise portrait has its own AI provenance, because provenance is recorded per stored image (`image_provenance`, #935) and not on the NPC row. `npcs.ai_provenance` only says the NPC's prose was drafted with AI.
- `is_revealed` — DM-controlled flag; when `false` the disguise name/portrait is shown to players instead of the true form

The DM always sees both identities. The page title and list card show the disguise name when `is_revealed` is `false`. The `getNpcDisplayName`, `getNpcDisplayPortrait`, and `getNpcDisplayFocalPoint` helpers in `src/lib/npcDisplay.ts` centralise this logic.

#### Names in chat

A chat message is plain prose in `campaign_messages.message`, readable by the whole
campaign forever. No projection gates it after the fact, so the only place the
disguise and field rules can be applied is **at write time** — which is exactly
where they were missing. Four announcements and two attributions interpolated
`npc.name` directly, so an NPC with an unrevealed alter ego, or one whose "Name"
field the DM had not ticked, had their true name posted the moment they were
(partially) revealed. The portal card beside it still said "???".

Two helpers, and the choice between them is not stylistic:

| Writing | Use | Because |
| ------- | --- | ------- |
| Prose the **app** narrates — reveal announcements | `getNpcPlayerFacingName` | The app must say no more than the portal card does: it applies the disguise rule **and** the `player_visible_fields` name gate, returning `null` when no name has been shared. |
| An attribution the **DM** chose — `sender_name` on a "talk as" line or an inventory drop | `getNpcDisplayName` | Naming the speaker is the DM's deliberate act; rewriting it to "???" would fight an explicit instruction. `is_revealed: false` is different — that is the DM's own flag saying this identity is a secret, so the cover name is used. |

`getNpcPlayerFacingName` reproduces the `name` column of
`get_player_visible_npcs` (migration `20260711000021`) exactly, including the
detail that a **portrait-only** disguise leaves the name alone — a purely visual
mask does not change what the party calls you. Chat and the portal card have to
agree or they contradict each other in front of the players.

Two traps the fix had to step around:

- **The reveal control announces against the fields it is about to write**, not
  the ones on the row. Sharing an NPC for the first time seeds `name` + `portrait`
  in the same breath (`fieldsForFirstReveal`), so the row still says the name is
  hidden while that write is in flight. Reading the row would say "someone" for
  every first reveal.
- **The "As:" persona name is a snapshot** taken when the DM picks it.
  `CampaignChat` re-syncs it whenever the NPC list changes, or revealing — or
  re-concealing — mid-session would leave the stale identity on every later line.

When no name has been shared, prose says "someone" (`NPC_UNNAMED_IN_PROSE`) and an
inventory drop falls back to the DM's own sender name. Never the true name.

---

## World Web

Routes: `/web` (DM) and `/play/web` (player). It replaced the Relationship Web at `/npcs/web` (#1084), which drew only the ties between people. The NPC list's **Web** button and overflow entry go to `/web`. The full feature is a manual page, `src/manual/worldbuilding-web.md`; this section keeps the decisions the code does not say.

**Data.** One read, `get_world_ties(p_campaign_id)` (DM) or `get_player_world_ties(p_campaign_id, p_preview_member_id)` (player), through `composables/world/useWorldTies.ts`. Both return one row per tie, `from` end to `to` end, whatever its home (`source`: link, kin, membership, npc_home, pc_place, keeper, seat, patron_deity, inventory, store, quest). The words come from the catalogue (`connectionWord`, `connectionFamily`); a tie read from its `from` end is the catalogue's `forward`, from its `to` end `reverse`. The player read never returns the DM's note. People with no ties are still drawn for the DM, from `useNpcs` and `useParty`.

**Links are lines, records group.** At rest the web draws links and kin. Records (membership, homes, patron deity, carries, seat, stores, quests) are never lines at rest, for the reason the old web gave for leaving factions out: a twelve-member guild drawn as a hub is a twelve-spoke star, force layouts give hubs enormous influence, and the stars push the real relationships to the rim. It is also a category error: "rival of" is a relation, "member of" is an attribute. So a faction, place, deity, item or quest is a node only when it has a link (`lib/worldWeb/model.ts`), and a person is always a node. At production volume a campaign has hundreds of places; none is drawn unless it has a link.

**Group by** (`lib/worldWeb/groups.ts`) gathers a faction's members, a place's residents (NPC homes and PCs there) or a deity's faithful (patron deity, or a person or faction tied in faith) in a hull and pulls them together, one group at a time. The hull is `lib/worldWeb/hull.ts` unchanged: one shape per run of members who sit near each other, a lone member gets none, fill plus a thick round-joined stroke so two members are a capsule and one a disc. The pull is `groupClusteringForce`, and it keeps the rest-distance rule that was measured on the old web: only members further than `GROUP_GATHER_RADIUS` (190) from the centre are pulled, and only by the excess. Without a rest length the force collapses members until `forceCollide` stops it, which put co-members closer than people with an actual relationship (118 against 147). The ordering it has to produce is people who know each other, then the same group, then unrelated. The group's own node is held on the hull's outline by `groupFenceForce`, straight above the members, so its links leave from the fence.

**Faction badges** (`lib/worldWeb/badges.ts`) stay: up to three emblems on a person, then `+N`, active memberships first, former ones faded. They are built from the membership ties, so no separate faction query is needed.

**Focus** (`lib/worldWeb/focus.ts`, `WorldWebFocus.vue`) is not the force layout. It is laid out by hand in rings: the centre, everything one step away with the reason read from that node's own end ("worships", "patron deity"), and with 2 steps a faded second ring. Records draw as dashed spokes here, so "who worships her" has an answer. Ring one is capped at 48 and ring two at 72, and the picture says when ties are left out; the panel lists all of them (`groupTies`, which words each group as "Worships The Drowned Lady"). A tap on a node moves the focus and extends the trail. Ties between two first-ring nodes are not drawn, so the picture reads as a sentence. A phone and a player open focus-first: the ring plus the same ties as a list of 44px rows, with **Whole web** for the pan-and-zoom graph. `?focus=<kind>:<id>` opens on a node.

**Connect…** replaces shift-click, which a tablet cannot do: choose Connect… on a node, tap another node or find anyone (`WorldEntityPicker`), then pick the type from `typeChoices(subjectKind, otherKind)`, common types first. Writes go through `useCreateConnection`, retyping through `useRetypeConnection`, removal through `useRemoveConnection` and the player-facing line through `useUpdateLink`, so a membership or a home is written to the record that already holds it. A quest's ties are edited on the quest.

**Colour.** A line is coloured by the catalogue family of its type, `--link-bond`, `--link-enmity`, `--link-faith`, `--link-place`, `--link-holding`, `--link-stance`, `--link-record`, defined in `theme.css` and both Vellum themes with lightness differences, not hue alone. Kin keeps `--relation-family`. NPC nodes are still coloured by attitude to the party through `npcRelationshipCanvasColor`.

**Filters** live in `stores/ui/world.ts` (`useWorldUiStore`): search, the kinds switched off, the group, and the tie family. A graph is not a list, but its filters are filters: opening a sheet from the web and coming back keeps them.


## NPC Generator

The Generator is a right-side slide-in panel (`max-w-md`), opened from the list page header. It supports two create paths: AI generation and quick create.

### Quick Create

Fills a minimal NPC with:

- Name (optional — auto-generates from `FIRST_NAMES` + `LAST_NAMES` tables if left blank)
- Species (from a preset list of 15 common races)
- Alignment
- Relationship (party stance)
- Faction (any campaign faction) + Role in faction
- Location (location tree combobox)
- Stat block template (grouped by category from `NPC_TEMPLATE_CATEGORIES`)
- Known associate (any existing NPC) + relationship to them: a bond, or a family tie (Child of, Parent of, Spouse of, Sibling of; a child may name a second parent, defaulting to the associate's only current spouse). A family tie is told to the model as one directional sentence with birth years and ages, and written as `kin_links` after creation. `/npcs?kin=<child|parent|spouse|sibling>&of=<npc:id|pc:id>&also=<npc:id|pc:id>` opens the panel with the tie filled in (`kin` is what the new NPC is to `of`; `also` is the second parent); the panel clears the query once read.

After creation, faction membership and the associate relationship are added automatically.

### AI Generation (requires OpenAI API key in Campaign Settings)

An additional **Concept** textarea (required) prompts the AI with a free-text description. Quick option fields (name, species, alignment, relationship, faction, location, associate) are injected as constraints into the prompt.

Additional AI options:

- **Generate portrait art** toggle (on by default) — generates an image via OpenAI
- **Generate Alter Ego** toggle (requires portrait toggle on) — generates both a true-form portrait and a disguise portrait (uses 2× image generation credits)

Generation can be **dismissed to background**: the panel closes while the AI call continues. A badge in the nav or list indicates when generation finishes.

On completion, all AI-returned fields are applied to the NPC form (name, species, alignment, age, occupation, status, relationship, tags, appearance, personality, backstory, notes, portrait URL, disguise name, disguise portrait URL) and the user is taken to the new NPC's detail page.

A **Generate** button is also available from within an existing NPC's edit form (header action) via `NpcGenerateDialog`, which applies results to the current NPC rather than creating a new one.

---

## Player Portal

Players access shared NPCs through `/play/party` under the **"People"** section, which appears when at least one NPC has been shared with them.

### What Players See

Each player sees only the NPCs where their party member ID is in `player_visible_to`, plus those living at a location that shares its linked NPCs with them (`is_npcs_shared`). The content of each card and lightbox is further restricted by `player_visible_fields` — the DM selects a subset of: Portrait, Name, Status, Species, Occupation, Relationship, Location.

Fields not in `player_visible_fields` are silently omitted or replaced:

- If portrait is hidden but one exists, a mystery-figure placeholder image is shown instead.
- If name is hidden, "???" is displayed.

The alter-ego system integrates transparently: if the NPC is not yet revealed (`is_revealed: false`) and has a disguise, players see the disguise name and disguise portrait automatically. The DM's true-form data is never sent for unrevealed NPCs.

### The People ledger (#987)

`PlayerPartyView` wires it; the parts are in `src/components/player/people/` and the rules are pure functions in `src/lib/npcs/peopleLedger.ts` (tested).

**New to you** (`NewToYouStrip`, `NewToYouCard`, `useNewToYou`). `classifyPeople` splits the player's NPCs three ways:

- **face down**: shared with them after `NEW_TO_YOU_SINCE` (release day, so nothing a player already had lands face down) and never opened. The card back is a generated image (`public/assets/cards/npc-card-back.webp`, through `artUrl`; source and prompt in `docs/art/npc-card-back.md`) with "Someone new" and where they were met layered into its blank panel.
- **unmasked**: a disguised NPC whose true self was revealed (`unmasked_at`) after this character met them, not opened since. It waits face up as the cover the party knew and turns to the true face, "You knew them as …". The projection hands the cover name and portrait only once the disguise has fallen (migration `20261005220516`).
- **ledger**: everyone else. People waiting to be turned stay out of the ledger, so it cannot spoil the turn.

A card turns once (`cardTurnStyle`, 520 ms, instant under reduced motion), then the NPC is marked read and the card stays turned in the strip for the rest of the visit. Nothing is classified until the read map has loaded, or every NPC would flash face down. The unread dot survives on ledger rows for an NPC the DM edited since the player last looked.

**The ledger** (`PeopleLedger`, `PeopleLedgerRow`, `usePlayerPeople`). `buildPeopleGroups` groups by the sort: **Place** (one rubric per place, "in {parent}" when the parent is shared too, "Whereabouts unknown" last, rating then name inside), **Met** (one group per session: "Session 14" with its title and date, newest first, two sessions sharing a number kept apart; people met outside any session under "Before the log", last), or flat for **Rating** (default) and **Name**. Every order ends on the name. A row: portrait plate, name ("???" when not shared), species · occupation, the relationship mark (`RelationshipMark`, `components/common/entity/`, shared with the faction list and sheet), `statusWord` (nothing for "alive"; dead also strikes the name through and greys the portrait), and the player's stars. **Portraits** (`ui.playerPeopleView`) shows the same groups as `PlayerNpcCard`s.

Sort, view and filters live in `usePlayerUiStore` (`playerPeopleSortBy` / `SortDir` / `View`, `playerPeopleFilter*`); sort and view are not part of Clear. Place is offered only when some NPC shows a location, and every place comparison reads only a location the player may see.

`npc_reveals` (migration `20261005220422`) holds one row per (NPC, party member): the first moment that member could see the NPC, whether it was shared with them directly or through its location's "share linked NPCs". Since `20261006072853` each row also carries `session_id` (the session open when it was written, else the next one started; see [`sessions.md`](sessions.md)) and `approximate`, and the DM may move a reveal to another session (`update` of `session_id` alone). The player's ledger labels sessions through `get_player_sessions`. Triggers on `npcs` and `locations` are its only writers; `on conflict do nothing` keeps the first moment, so unsharing and sharing again does not move it. A player reads only their own rows, the DM the whole campaign's (for preview). Reveals that existed before the table were backfilled with the NPC's `created_at`, the closest evidence left. `useSharedNpcs` is the projection alone, one request. Only the People page needs the moments, so `useMyNpcRevealMoments` (in `useNpcReveals.ts`) reads them separately, scoped to the campaign and the viewer's member (the previewed one in DM preview, the linked one otherwise), and `PlayerPartyView` sets `revealed_at` on its NPCs via `withRevealMoments`. The query key sits under `player-npcs`, so the `npcs_player` and `locations_player` doorbells refresh it with the projection. Other surfaces that render `PlayerNpcProfile` (lightboxes) get no `revealed_at`, so they show no "met" date.

**Opening a person** (`PlayerNpcProfile`, shared by the lightbox and the pane): name and stars, relationship mark and status word, species · occupation, Met and Where, **Your connection** (the revealed link between this NPC and the viewer's own character, found in `get_player_connections` by `findMyConnection`: the linked party member, or the previewed one; shown as a `ConnectionSlip` with the catalogue word and the `told` line, only when one is revealed to them; the DM writes it on **With the party**), **Connections you know of** (`PlayerConnectionsList`, the other revealed ties grouped people, factions, places, deities, items, quests; never a count of hidden ones), an **In the web** link to `/play/web?focus=npc:<id>`, and the player's notes (`PlayerNotesWidget`). Below `lg` it opens in `PlayerNpcLightbox`; from `lg` the ledger sits beside `PeopleDetailPane`, a plate plus the profile. The selection sticks once made and falls back to the first visible person only when the selected one leaves the list. `?npc=<id>` opens a person.

### NPCs in Other Player Portal Views

- **Player Locations (Atlas)** — `useSharedNpcsByLocations` surfaces shared NPCs at visible locations on the atlas.
- **Player Journal** — shared NPC names appear as @mention options in journal entries.
- **Player Quests** — NPC names appear in quest detail when linked.
- **Player Factions** — shared NPCs listed as faction members when the faction is visible.

---

## Key Capabilities / USPs

- **Players read NPCs only through the projection.** `get_player_visible_npcs` is the one door: it blanks the name unless `name` is in `player_visible_fields`, returns the cover name while a disguise is unrevealed, and never returns backstory, DM notes or stat blocks. Until `20260928233302` the `npcs_player_select` policy also let a player select the whole row of any NPC shared with them, true name and DM notes included, over plain REST and in every realtime payload; the app never asked for it, but the database handed it out. That policy is gone, `npc_rows_withheld_from_players.test.sql` pins it gone, and `live_sync_registry.test.sql` fails if any non-owner select policy reappears on `npcs`. Player caches refresh from the `npcs_player` doorbell signal (see collaboration.md). Anything a player sees about an NPC, including an @mention chip, must come from the projection.
- **Field-level player visibility**: rather than showing all-or-nothing, the DM controls exactly which of 7 fields are visible per NPC (portrait, name, status, species, occupation, relationship, location). This allows mysteries — an NPC can be "known" (portrait shown, location shown) but still anonymous (name hidden).
- **Alter-ego / disguise system**: NPCs can have a parallel identity (separate name, portrait, focal point). The DM toggles `is_revealed` from the "SEEN AS" section of the reveal control, which is on every NPC surface — list card, sheet header, mobile bars, editor; a chat event fires automatically when the reveal happens during a session.
- **Per-PC connection notes**: the DM can write individual notes for each party member's relationship with an NPC. Each player sees only their own note in the portal lightbox, creating personalised backstory.
- **World web with inline editing**: a force-directed graph of every tie in the campaign. Lines are clickable to retype or remove; Connect… on a node ties it to another without leaving the view.
- **13-type directional relationship taxonomy** with automatic inverse type: storing "Mentor" from NPC A's side automatically reads as "Apprentice" from NPC B's side.
- **AI NPC generation with alter-ego support**: one generation call can produce both a true-form portrait and a disguise portrait. Generation runs in background so the DM can dismiss the panel and continue working.
- **Setting population**: Faerûn campaigns can bulk-insert canonical NPCs (Hall of Heroes) in one click, with name-based deduplication and portrait back-fill.
- **Bestiary bridge**: an NPC can link to a Bestiary monster (import stat block), or be promoted to a full Bestiary entry. Dual-direction linking: NPCs can also be exported to the Scriptorium as formatted documents.
- **Player relevance ratings**: players can star-rate NPCs 1–5 in their portal to surface important characters; starred NPCs sort first and persist across browsers/devices via `player_npc_ratings`.
- **AI Voice Coach for at-the-table dialogue**: a one-line situation prompt returns 2–3 short, ready-to-read in-character replies (issue #336), ephemeral and never persisted. One shared component renders identically on the desktop "Voice" tab and the mobile "Voice Coach" accordion. A disguised, unrevealed NPC's true name is withheld from the model entirely rather than merely instructed not to reveal it — a stronger guarantee against an accidental spoiler read aloud mid-session.

---

## Data Fields

### Npc (core table)

| Field                           | Type                                        | Description                                                              |
| ------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| `id`                            | uuid                                        |                                                                          |
| `campaign_id`                   | uuid                                        | FK to campaigns                                                          |
| `name`                          | string                                      | True name                                                                |
| `disguise_name`                 | string \| null                              | Alter-ego name                                                           |
| `race`                          | string \| null                              | Free-text species                                                        |
| `alignment`                     | string \| null                              | e.g. "Lawful Good"                                                       |
| `age`                           | string \| null                              | Descriptive or numeric                                                   |
| `occupation`                    | string \| null                              |                                                                          |
| `location_id`                   | uuid \| null                                | FK to locations                                                          |
| `appearance`                    | Tiptap JSON \| null                         | Rich text                                                                |
| `personality`                   | Tiptap JSON \| null                         | Rich text                                                                |
| `backstory`                     | Tiptap JSON \| null                         | Rich text                                                                |
| `notes`                         | Tiptap JSON \| null                         | DM-private notes (rich text)                                             |
| `status`                        | `alive` \| `dead` \| `missing` \| `unknown` |                                                                          |
| `relationship`                  | `ally` \| `neutral` \| `enemy` \| `unknown` | Party stance                                                             |
| `portrait_url`                  | string \| null                              | Storage URL                                                              |
| `portrait_focal_point`          | `{x,y}` \| null                             | 0–100 percentages                                                        |
| `cutout_url`                    | string \| null                              | True form alone on a transparent background (#917); never shown to players while concealed |
| `disguise_portrait_url`         | string \| null                              | Alter-ego portrait                                                       |
| `disguise_portrait_focal_point` | `{x,y}` \| null                             |                                                                          |
| `is_revealed`                   | boolean                                     | Whether true identity is shown                                           |
| `tags`                          | string[]                                    | Freeform                                                                 |
| `stat_block`                    | StatBlock JSONB \| null                     | Full D&D 5e stat block                                                   |
| `linked_monster_id`             | uuid \| null                                | FK to monsters table                                                     |
| `scriptorium_doc_id`            | uuid \| null                                | FK to scriptorium_documents                                              |
| `player_visible_to`             | uuid[]                                      | Party member IDs who can see this NPC                                    |
| `player_visible_fields`         | string[]                                    | Subset: portrait, name, status, race, occupation, relationship, location |

### StatBlock (JSONB sub-document)

AC, HP (dice expression string), Speed (string), STR/DEX/CON/INT/WIS/CHA, Challenge Rating, Proficiency Bonus, Saving Throws, Skills (record), Damage Resistances/Immunities, Condition Immunities, Senses, Languages, Special Abilities (name+description array), Actions (name+description array), Legendary Actions (name+description array), Spellcasting (ability/save DC/attack bonus/entries).

### NpcRelation (separate table)

`npc_id`, `related_npc_id`, `relationship_type` (13-type enum), `notes` — directional; the inverse type is computed on read.

### NpcPcNote (separate table)

`npc_id`, `party_member_id`, `relationship_type`, `notes` (Tiptap JSON) — one row per (NPC, party member) pair.
