# Items, Spells & Workshop (Crafting)

## Overview

Three interconnected feature groups let the DM build a campaign-specific item and spell compendium, define crafting recipes, and surface the right subset to each player. Items feed the inventory system, spells feed the per-character spellbook, and crafting recipes consume items and produce items.

Routes:

- `/vault` — Item Vault list
- `/vault/:id` — Item detail / editor
- `/vault/new` — New item
- `/spells` — Spellbook list
- `/spells/:id` — a modal over the Spellbook on tablet and up, a full-screen takeover on phones; `?edit=true` is the full editor at every width
- `/spells/new` — New spell (flat, the full editor at every width)
- `/crafting` — Workshop (recipe list)
- `/crafting/:id` — Recipe detail / editor
- `/crafting/new` — New recipe
- `/play/inventory` — Player Inventory (player portal)
- `/play/crafting` — Player Crafting (player portal)
- `/play/spells` — Player Spells (player portal)

---

## Item Vault

### DM View (`/vault`)

The Vault is the DM's master catalog of all equipment and magic items available in the campaign.

**List view** — filterable by:

- Free-text name search
- Item type (weapon, armor, shield, ring, wand, staff, scroll, potion, gear, ammunition, art object, other)
- Rarity (mundane, common, uncommon, rare, very rare, legendary)
- Source (dynamically populated from items in the DB)
- Scope: "Usable here" (default), "This campaign", "General", "Library", "Other campaigns". Classification is `itemScopeOf()` (`src/lib/items/itemScope.ts`): a non-UUID id is always `library` regardless of its stamped `campaign_id` (`normalizeLibraryItem` stamps `campaign_id: null`, the same value a real `general` row carries, so id shape, not scope, tells them apart); a UUID row is `general` (`campaign_id IS NULL`), `campaign` (`campaign_id` = active), or `other_campaign`. "Usable here" is this campaign, general and library items; other campaigns' rows are only fetched (the `scope` filter of `browse_items`) when "Other campaigns" is chosen, so a busy multi-campaign account's list is not drowned in unrelated homebrew. This replaced a separate "Show items from all campaigns" checkbox (26 Sep 2026): a dropdown and a checkbox for one question.

Each card is the shared `EntityGridCard`. The item card is deliberately the leanest of the entity cards: the name rides the artwork through the `#image-footer` slot (a gradient strip along the bottom, added for this), and `#body` carries only a quick stat line — damage / AC / charges — and up to four tags. An item has far less to say at a glance than an NPC or a monster, and filling the body to match them would be padding. Rarity goes through the card's own `badgeText`/`badgeClass`, so it wears the same treatment as a monster's CR; `#actions-start` holds either the hover-revealed **Edit** button (owned rows) or a **Reference** chip (shared rows, read-only — they link through to the detail view's Clone action).

**Shared SRD items (#303)** — the per-user "Import SRD Items" button is retired. SRD items live in the shared `library_items` table (public read, admin write; seeded by `npm run seed-library-items` from Open5e v2 weapons/armor/magic items plus the built-in local datasets `data/gear.ts`/`provisions.ts`/`services.ts`/`ammunition.ts`, which are stamped edition-neutral so 2024 campaigns get mundane gear too, except an entry the SRD covers in one edition, which names the other; see #957 below). `browse_items` (the Vault page, one server page at a time through `useItemBrowse`) and the slim `useItemIndex` (pickers) merge shared rows (slug ids, `user_id: ""`) with the user's own; a per-user row shadows its shared counterpart by source identity — or by lowercase name for pre-versioning imports — so legacy vaults look unchanged. Shared rows are read-only in the vault ("Clone to customize" in the detail view, `useCustomizeLibraryItem`, the only path that copies one). Every picker stores a *reference* to a picked shared row (#954): stores, inventories, recipes, loot placements, beat attachments, loot tables, encounter loot, downtime deck backs and chat drops/vendor offers each hold the library id (`library_item_id`, a text column, or a text/jsonb id field), never a clone. A stored reference resolves even after the campaign disables that book (`useResolvedItem`, `useStoredItemRefs`); only pickers respect enabled sources. Per-campaign gating rides `campaign_enabled_sources` (the Vault has the same Sources panel as Monsters/Spells, backed by `get_library_item_sources`; grimoire-bundled rows are always available).

**Library items carry their doll slot as a tag, and base gear carries a weight (#973).** Open5e files every worn wondrous item as "Wondrous Item" with no tags, so no cloak, boots, belt or amulet ever fitted a paper-doll slot. `src/lib/library/slotTags.ts` reads the slot from the item's name and the tag is the slot id itself ("neck", "shoulders", "feet", "hands", "waist", "head", "clothes"), so one tag means exactly one slot; rings and body armour are already covered by `item_type`. The seed script applies it, and migration `20261005081612` applied it to existing rows from the same word lists (`slotTagPatterns()`), idempotently; `useInventorySlots` matches on the tag. Open5e v2 also carries no weight for weapons and armour, so `baseGearWeights.ts` holds the PHB table (identical in both editions) and fills null weights in the importer and, by the same migration, in existing rows.

**Open5e import layer (#554)** — every v2 fetch across items/spells/monsters/etc. goes through shared helpers in `src/lib/library/open5eApi.ts`: `rulesetForDocument()` maps a document's gamesystem to `2014`/`2024`/`null`, `fetchSupported5eDocumentKeys()` lists every 5e-gamesystem document (excluding non-5e gamesystems like a5e), and `fetchAllFromDocuments()` scopes a list fetch to those keys via `document__key__in`. Plain `document__key` is silently ignored on `/v2/items`, `/v2/weapons`, and `/v2/magicitems` — those endpoints otherwise return the full unfiltered cross-publisher set with no error — so `document__key__in` is the only filter used against any v2 endpoint, with a stray-document assertion (`fetchAllFromDocuments` throws if a returned record's document key isn't in the requested set) guarding against that failure mode recurring.

**AI Generator** — "Generate" button opens `ItemGeneratorPanel`, an AI-assisted item creation wizard. Also stamps the active campaign onto the generated item (#596) — this path built its own insert payload rather than going through `ItemDetail`'s form, so it had kept minting general items after #597 flipped the manual editor's default.

**Item Detail editor** (`/vault/:id?edit=true`) — a two-column form:

- **Portrait upload** — tabbed "Identified / Mundane" views; each has an independent image with focal-point control. The mundane image is shown to players before identification; the identified image is shown after.
- **Tags** — free-form tag array via `TagInput`.
- **Name, Type, Subtype, Rarity** — type drives which conditional panels appear below.
- **Weight + Cost** — weight uses `WeightInput` (supports lb/kg). Cost is a freeform string (e.g. "50 gp"). A rarity-based price hint is shown as a hint below the cost field for magic items.
- **Weapon section** (appears for weapon types) — damage rolls (multi-roll via `DamageRollsInput`), versatile damage (dice expression), range (e.g. "80/320 ft."), weapon properties checkboxes (finesse, light, thrown, two-handed, reach, heavy, loading, silvered, adamantine, etc.), and (2024 campaigns only, #557) a **Mastery** dropdown — one of the eight 2024 PHB mastery properties (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex), stored in `items.mastery`. Definitions (label + full rules text, SRD 5.2, CC-BY-4.0) live in `src/data/weaponMastery.ts`; on import, mastery is extracted from the Open5e v2 `properties[]` array (`property.type === "Mastery"`). Shown on item views (`ItemSheet`, `ItemStatBlock`) only in 2024 campaigns.
- **Armor section** (appears for armor types) — Armor Class text field (supports formulas like "13 + DEX modifier (max 2)").
- **Magic Properties** (non-mundane items only) — "Requires Attunement" toggle + optional attunement-by text.
- **Charges / Quantity** — max charges, recharge roll (dice expression), recharge trigger (dawn/short rest/long rest). For ammunition items the section relabels to "Quantity / Count". Also: "Arcane Focus" and "Container" checkboxes.
- **Bundle Contents** (pack items) — ordered list of sub-items with quantities; when a pack is added to a player's inventory it auto-expands into individual rows inside a container.
- **Linked Spells** (non-mundane items only) — search and multi-select spells from the Spellbook to associate with this item (e.g. a staff that can cast specific spells).
- **Mundane Description** (non-mundane items only) — rich text field shown to players before identification.
- **Description** — rich text full item description shown after identification.
- **Written Contents** (`ItemWrittenContentsCard`) — optional in-world text the item itself carries (a ledger's pages, a contract's clauses, a scroll's text), distinct from Description, which is meta text *about* the item. The card is folded closed behind a "HAS WRITING" toggle (the Curse card's pattern): non-null content is a real signal (feather badge, tome tab in player journals), so the editor only opens once the DM declares the item carries writing. Inside the fold sit the editor, a caption stating what players will see, the "PLAYER WRITABLE" checkbox (campaign members may append their own writing at the table), and — on existing items — the entries journal itself (`ItemDocumentSection` with `hideContent`, since the content already sits above it in an editable box), so the DM can read, add and moderate entries without switching to the view sheet. Entries mutate immediately; they are not part of the form's Save. The parent `ItemDetail` keeps persistence: it derives `effectiveContent` from the card's models and writes NULL/false when the fold is closed. See "Document Items" below.
- **DM notes** — not a field on the editor any more. Your own items carry the always-open, autosaving `DmNoteBox` on the item page (column `items.dm_notes`), **never shown to players**, for GM-side asides, structural beats and foreshadowing; also in the docked scratchpad. Library items have none. See [dm-notes.md](dm-notes.md).
- **Curse** (non-mundane items only) — toggle + rich text curse description. The hint reminds the DM to reveal the curse via the party inventory panel once triggered.
- **Scope** — two-button toggle: "General — all campaigns" (`campaign_id IS NULL`) vs "Campaign — *active campaign name*" (`campaign_id = active`). New items default to the active campaign; SRD imports stay general. The Vault list and every downstream picker (`useItemIndex`: chat search, store inventory, crafting recipes, NPC inventory, encounters, loot tables, quests, party inventory) filter by this scope; a stored item id resolves through `useItemsByIds`, which does not.
- **Source** — freeform text for custom items; read-only link for Open5e imports.

**Re-scoping in bulk (#875).** The single-row control above cannot sort a
backlog, so every list that owns re-scopable content — the Vault, the
Spellbook, the Bestiary, Species, and all four Dungeon Craft tabs — carries a
**Select** action that turns the grid into a selection surface:
`BulkSelectableCard` puts a checkbox in whichever corner that list's card
leaves free, `BulkScopeBar` docks above the grid, and `useBulkCampaignScope`
issues one `update({campaign_id}).in("id", …)` per 200 ids. Three rules the
implementation turns on, each with a reason worth keeping:

- **The bar offers exactly the two scopes `CampaignScopeField` offers** — the
  active campaign, or every campaign — and no campaign picker, so the bulk and
  single-row controls can never come to mean different things. Filing into
  another campaign means switching to it, as it already did for one row.
- **"Select all shown" means every row passing the current filters**, not the
  48 the virtualiser has painted, and never a shared-library row (`isUuid` for
  items and species, `isSharedContent` for spells, `is_shared` for monsters).
  Where a list holds *only* library rows the bar says so rather than offering
  moves that cannot apply.
- **The selection is pruned to what is still shown, at move time.** Without
  that, selecting forty rows and then editing the search box left the batched
  write pointing at rows the DM could no longer see — the one way this feature
  could have silently re-scoped something nobody chose.

`src/composables/campaign/useMoveToCampaignFlow.ts` is the one place the
prune/mutate/toast/stop sequence above lives — all five surfaces (Vault,
Spellbook, Bestiary, Species, and `DungeonCraftEntityGrid` for all four
Dungeon Craft tabs) call it rather than hand-rolling their own block. The
toast wording is canonical from there: `Moved 3 items to Curse of Strahd.` /
`3 items are now available in all campaigns.` (singular: `1 item is now
available in all campaigns.`). Before this consolidation the five had drifted
three ways on punctuation and phrasing, and `DungeonCraftEntityGrid` never
branched on the destination at all — it always reported "Moved N entries.",
even when the destination was "all campaigns."

**Copying to another campaign (#598) — the canonical description; the other
feature docs point here.** Re-scoping *moves* a row: one row, somewhere else.
The other half of the need is a second, independent row the DM can then let
diverge — the whimsical campaign's Ashen Warden gets a silly hat and the
serious one does not. That is a different feature from the global flag, which
shares one row so an edit for one table changes it at the other.

The mechanism is `src/lib/campaign/copyToCampaign.ts` (pure planner),
`src/composables/campaign/useCopyToCampaign.ts` (reads, plans, inserts) and
`CopyToCampaignDialog.vue`, over the same eight tables `BulkScopeTable` already
names. **No migration backs it**: every one of those tables' INSERT policy is
already `auth.uid() = user_id AND (campaign_id IS NULL OR
private.is_campaign_dm(campaign_id))`, so inserting into another campaign the
account DMs has always been permitted. It reaches the DM two ways — the Select
surface's bar (so a shelf of homebrew travels in one action) and a
"Copy to campaign…" action on each detail editor.

Seven decisions worth keeping:

- **The target picker exists here and deliberately does not on the Move
  buttons.** The no-picker rule above keeps the bulk and single-row *scope*
  controls from diverging; both answer "where does this row live", and
  `CampaignScopeField` can only say "here" or "everywhere". A copy answers a
  different question — it creates a row where the original is not — so there is
  no single-row control for it to diverge from, and the active campaign is
  precisely the one destination a copy never wants. The picker therefore
  excludes every scope the selection already occupies.
- **The excluded scopes come from the selected rows themselves, not a
  caller-supplied campaign id (#875).** Every caller used to pass one
  `sourceCampaignId` — always the active campaign — but a bulk selection
  routinely mixes general rows (`campaign_id: null`) with campaign rows, and
  with ItemsView's "show all scopes" toggle, rows from other campaigns too. A
  caller-supplied scope could offer "All campaigns (general)" while a
  selected row was already general, or offer a selected row's own campaign as
  a target — both the exact same-scope duplicate the "no dangling reference"
  rule above says cannot happen. So the dialog fetches the source rows itself
  on open (`loadCopySources`) and excludes the union of every row's own
  `campaign_id`: a mixed selection (one general row, one from Curse of
  Strahd) excludes both "general" and Curse of Strahd, leaving every other
  campaign as a valid target. The same load also lets the target picker
  re-plan synchronously (`planCopyFor`, pure) each time the DM tries a
  different target, instead of re-fetching per pick.
- **A reference is dropped only when it would actually dangle.** The ticket
  said to drop cross-entity references; the rule that ships is narrower. A
  referenced row travels when the target can see it — `campaign_id IS NULL`
  (general, visible everywhere) or equal to the target. Only a row scoped to
  some *other* campaign is dropped, and the DM is told which by name **before**
  confirming, never after. Measured against production the day it was built,
  nothing would be dropped at all: 5 items carry `spell_ids`, 4 species carry
  `granted_spells`, and zero spells are campaign-scoped. So the report renders
  only when it has something to say — an empty "nothing will be dropped" panel
  on every copy would be ceremony.
- **Two references cannot be nulled, and are removed instead.** A loot entry
  without `item_id` fails `validateEntries`, so a dangling item entry goes
  whole. A species grant is the sharper case: `SpeciesSpellGrant` documents
  `spell_id: null` as *free player pick*, so nulling a dropped grant would
  silently turn "grants Chill Touch" into "picks any spell" — a materially more
  generous rule that reads as deliberate on the copy and would surface at a
  table, mid-level-up. A `RollTableEntry` keeps its `label` without its
  encounter, so there only the link clears. The test: when a field's absence
  already means something else, the entry goes rather than the field.
- **Shared-library content is reported, never dropped.** A library row belongs
  to no campaign and cannot dangle — but a campaign sees a library source only
  once it is in `campaign_enabled_sources`, so a species copied into a campaign
  that has not enabled, say, Tome of Heroes arrives granting a spell it cannot
  look up. That gets its own panel, toned as a note rather than a loss, because
  the fix is one toggle in the target campaign and losing the grant would be
  worse. Only `species.granted_spells[].spell_id` can hold a library slug among
  the eight; `items.spell_ids` and `loot_tables.monster_ids` are `uuid[]` and
  cannot. The question is not asked at all when the target is "all campaigns",
  since there is no one campaign whose enabled sources could answer it.
- **The copy clears `source_document_key`, `source_record_key` and
  `source_revision`, and keeps everything else about where the content came
  from.** `items`, `spells`, `monsters` and `species` each carry a
  `<table>_source_identity_unique` index on
  `(user_id, source_document_key, source_record_key)` that is **not** scoped by
  campaign, so carrying those onto a copy of an imported row raises 23505. The
  copy is a fork of the import, not the import; `source_title`, `source_url`,
  `source_license`, `provenance` and `ai_provenance` all travel, because it is
  the same content and carries the same attribution obligation.
- **No "(copy)" suffix.** The three same-scope duplicate actions beside it —
  `ItemDetail`'s `cloneItem()`, `MonsterDetail`'s `duplicate()`, `ClassList`'s
  `duplicate()` — each append one, and they are right to: their copy sits
  beside its original and needs telling apart. A cross-campaign copy lands
  where the original is not, so the name is free.
- **Art is referenced, not duplicated, and quota is the database's job.**
  `image_url` and friends travel unchanged: both campaigns belong to the same
  account, so the copy points at the same object and nothing is ever written
  under `srd/`. That is sound only while campaigns share an owner — if they
  ever become shareable across accounts a copy must duplicate the object, since
  the original owner deleting it would break the copy, and there is a comment
  saying so at the spread. Quota needs no client check: `enforce_quota` sits on
  `monsters` and `puzzle_rooms` (and no other of the eight), so an over-limit
  copy raises `quota_exceeded` and the caller's existing `PaywallModal` catches
  it through `isQuotaExceeded`.

Two departures from the ticket, both stated out loud. Its acceptance criteria
ask for the action "from the list row": no card in any of the eight lists has
an overflow menu, and `BulkSelectableCard` intercepts card clicks while
selecting, so eight new kebab menus would have been a bigger and riskier change
than the feature. The Select surface is the list-side route instead. And the
copy does **not** navigate afterwards — see the Sanctioned Exception in
CLAUDE.md; the new rows are in another campaign, which neither the page nor its
list can show, so the toast naming the destination is the only confirmation
available.

**The backlog this exists for is smaller than it looks, and deliberately not
migrated.** Of 1,919 globally-scoped items, 1,644 are published-source
catalogue loaded in a single day in March 2026 (`vom`, `a5e`, `wotc-srd`,
`srd`, `toh`) — global is the right scope for those forever, and 441 of them
duplicate `library_items` rows outright (#876). Roughly 275 are authored. So
nothing mass-assigns existing rows, the selection is never defaulted to
"everything global" (that would pre-tick the entire SRD), and the DM sorts what
they actually wrote.

**View mode** (`/vault/:id` without `?edit=true`) — renders `ItemSheet`, a clean reading layout with tabbed identified/mundane art, a stat block panel (type, rarity, weight, cost, damage, armor class, attunement, charges, properties), linked spells list, and the rich text description.

**Header actions on existing items:**

- View mode — "Hand out…" dropdown (`ItemSendMenu`) — "Add to Party Stash" (party-wide shared inventory), "Assign to Player" (sends directly to a player character's backpack) or "Drop in Chat" (posts it to the campaign feed as a drop the party can claim) — and "Edit", which enters edit mode. Labelled "Hand out…" rather than "Send to…" since #895: this menu puts the item in front of the table, while "Send to…" means sending the record elsewhere everywhere else in the app.
- Edit mode — "Send to…" dropdown (`EntitySendMenu`, shared with the NPC/monster/spell editors, #895) holding Scriptorium export and Copy to campaign, plus separate "Clone" and "Delete" actions.

**Filter state** — search, type, rarity, source, and the "show all scopes" toggle are persisted in `useUiStore` (`vaultSearch`, `vaultFilterType`, `vaultFilterRarity`, `vaultFilterSource`, `vaultShowAllScopes`) so they survive navigation within a session.

---

### Document Items

Any item can carry `items.content` — the object's own in-world writing (a ledger's pages, a contract's clauses, a scroll's text), Tiptap JSON like every other rich text field. It is NULL for an ordinary item, and distinct from `description`, which is meta text *about* the item rather than words the item itself carries. The editor persists NULL rather than an empty Tiptap doc when the field is blank, so "has content" stays a real signal rather than a presence check on an empty string. Document-ness is also an explicit declaration, not a side effect of typing: the editor card is folded behind a "HAS WRITING" toggle, and unfolding it off persists `content: NULL` and `content_player_writable: false` (drafted text survives in the session until save, mirroring the Curse card). Unsaying "has writing" therefore also locks the player composer, since the `item_entries` INSERT policy gates on `content_player_writable`.

- **`content_player_writable`** — the "PLAYER WRITABLE" toggle in the editor. When on, campaign members may append their own writing to the item; the DM can always write regardless of the flag.
- **`content_updated_at`** — stamped by a server-side trigger (`items_touch_content_updated_at`) whenever `content` changes, never by the client, so the unread signal cannot be skipped by a client code path. Player unread dots key on this column rather than `updated_at`, so an unrelated item edit (renaming it, reweighing it) does not re-flag a tome a player has already read.
- **Identification gating** — `content` is masked by `get_player_visible_items()` exactly like `description`: hidden (returned NULL) while any of the player's copies of the item is unidentified. That projection is `returns setof items` with a hand-maintained positional column list, so widening `items` with these three columns required recreating the function in the same migration (see `20260724000005` for the outage this pattern guards against).
- **`library_items` rows are never documents** — the shared catalog table has no document columns. `normalizeLibraryItem` in `useItems.ts` patches `content`/`content_player_writable`/`content_updated_at` to `null`/`false`/`null` at the fetch seam (`useItemsByIds`, `useResolvedItem`) for every shared row; leaving them `undefined` on the raw row would read as "has content" to a `!== null` check, putting the feather badge on every SRD item.

**Player writing (`item_entries` table)** — append-only, never a shared column, so entries survive concurrent writers without clobbering and carry their own authorship:

- Each row carries `item_id`, `campaign_id`, `user_id` (author), `party_member_id` (the in-fiction hand — null for the DM, or for a departed character), and `content` (Tiptap JSON, capped at 50,000 characters — the app's first player-writable long-text column).
- **Soft ink** — authors may revise their own entries while still in the campaign (`item_entries_update` policy). Dropping that policy would make entries immutable ("hard ink") if that is ever wanted.
- **DM moderation** — the DM can delete any entry at their table regardless of authorship; an author can also delete their own. Nobody else can touch another author's entry — "nobody rewrites someone else's ink" is RLS structure, not an app-level rule.
- **The anchor guard trigger** (`guard_item_entry_anchors`) — `item_id`, `campaign_id` and `user_id` are immutable after insert, and `party_member_id` may only ever fall to `null`, never retarget to a different character. It exists because an `UPDATE ... WITH CHECK` policy cannot see the row's pre-update (`OLD`) values — only a trigger can — so without it an author could retarget their own already-`USING`-approved row onto a locked item (bypassing `content_player_writable`, which only the INSERT policy enforces) or into a different campaign they happen to belong to. The one legal transition — `party_member_id` falling to `null` — has to stay legal, because deleting a character (`ON DELETE SET NULL`) performs a real `UPDATE` that fires this same trigger.
- Reading follows campaign membership alone (`private.is_campaign_member`), deliberately with no item-visibility gate: entries are the table's own writing, not a DM secret. Anything players must not read yet belongs in `items.content` (masked by the projection until identified), never in an entry.
- Realtime: `item_entries` is on `supabase_realtime` and wired into `useCampaignLiveSync` under the `item-entries` key — the object is a prop passed around the table, so a new entry has to reach everyone, not just refetch for whoever wrote it.

**Rendering** — one shared component, `ItemDocumentSection`, mounts in the DM's `ItemSheet`, the DM's `ItemDetail` editor (with `hideContent`, thread-only, below the content editor box), the player's inventory `ItemDetailPanel`, and the player journal's `PlayerJournalTomeTab` (see `player-portal.md`). It renders `content` read-only (unless `hideContent`), then the `item_entries` thread with a composer shown only when `canWriteEntries`; every parent decides who can write, who can moderate, and which party member id to stamp via props — the component itself has no DM/player branching.

---

### Player Inventory (`/play/inventory`)

The Player Inventory is the richest player-facing view in the portal. It is specific to the authenticated player's linked party member (or the DM's preview target in preview mode).

#### Paper Doll

The character's own doll (7.5rem × 15rem, one 512×1024 cell) is shown on the left (#975). It is drawn from the character's portrait ("Make my doll", 100 credits, about 75 s; a player without credits taps "Ask my DM" and the DM draws it from their own credits, from the party page row or the character's inventory; see player-portal.md), else the species' doll, else a size template. The figure shows one outfit (underclothes, clothes, robes, light/medium/heavy armour) chosen from what is worn. Worn items are shown in labelled slot wells in a column either side of the figure (Head, Neck, Shoulders, Body, Clothes on the left; Gloves, Ring, Waist, Boots on the right), never drawn on the figure. The doll is three picture sets drawn once, then swapped by what is worn and carried: a garb sheet (underclothes, clothes, robes), an armour sheet (light, medium, heavy) and a burden sheet (encumbered, heavily encumbered, over encumbered). Each sheet is 1536x1024 with three 512x1024 cells, one figure per cell. "Make my doll" costs 100 credits and takes about 75 seconds. Layout is measured from the transparent alpha, not asked of the model: the anatomy (head, shoulders, soles, crown centre) comes from the underclothes cell, a per-outfit `figureShift` moves each outfit's figure into that frame (the model drifts figures sideways per cell), and the cuts between cells are found algorithmically in the empty transparent gap between figures (`sheetCuts`), not at a fixed 512 and 1024, because a laden figure's pile can spill into its neighbour's cell. A sheet whose figures touch has no gap to cut in, so it is redrawn once. A hairline runs from each well to its place on the measured body (`slotAnchors(art.layout.anatomy)`, geometry in `legendLine`, measured from the DOM by `useDollLegend`), not at fixed offsets:

| Slot      | Label     | Matching logic                          |
| --------- | --------- | --------------------------------------- |
| head      | Head      | tags: helmet, hat, hood, circlet, crown |
| neck      | Neck      | tags: amulet, necklace, pendant         |
| shoulders | Shoulders | tags: cloak, cape, mantle, pauldrons    |
| body      | Body      | item_type === "armor"                   |
| hands     | Gloves    | tags: gloves, gauntlets, bracers        |
| ring      | Ring      | item_type === "ring"                    |
| waist     | Waist     | tags: belt, girdle, sash                |
| clothes   | Clothes   | tags: clothes, clothing                 |
| feet      | Boots     | tags: boots, shoes, sandals, footwear   |
| main_hand | Main Hand | all items (no type restriction)         |
| off_hand  | Off Hand  | all items (no type restriction)         |

The "Clothes" slot has a warning state (amber outline) when empty and equippable. Clicking a slot that has an item opens `ItemDetailPanel`. Clicking an empty slot opens a modal listing inventory items eligible for that slot; selecting one equips it. Equipping a stacked item automatically splits off qty 1 into a new equipped row.

To the right of the silhouette, weapon slots (main hand / off hand) and an "Other" section for catch-all equipped items are shown as `EquipSlotRow` rows.

#### Attunement Tracker

Below the doll: three pip dots. Filled pips are colored `bg-primary`; empty pips are `bg-muted`. Counter shows `n/3`. Hovering a filled pip shows the item name.

#### Coin Purse

Five currency columns (PP, GP, EP, SP, CP) shown as a compact grid. Each coin denomination is editable inline via `CoinRow`. A "Drop Coins to Chat" button opens a form for selecting amounts to drop; confirmed drops deduct from the player's wallet and post a campaign chat message.

#### Carry Weight Bar

A horizontal progress bar below the paper doll / coin purse row shows carry load:

- **Burden portrait** — 60×84px picture of the character's own doll: the outfit figure when unencumbered, otherwise the matching cell of the doll's burden sheet (`burdenPicture()` in `src/lib/paperDoll/dollStack.ts`, passed to `PlayerCarryWeight` as `burdenPicture`). Burden pictures stand alone and are never shifted.
- **Burden levels** — Unencumbered (≤STR×5 lb), Encumbered (≤STR×10 lb), Heavily Encumbered (≤STR×15 lb), Over Encumbered (>STR×15 lb). All thresholds double for characters with **Powerful Build** (detected from species name).
- **Bar color** — primary (green) → amber/70 → amber-500 → destructive (red) as load increases.
- **Capacity override** — clicking the capacity figure opens an inline edit input. Accepts absolute values (`150`), multipliers (`*2`), or additions (`+30`). An amber color and override expression are shown when a custom value is active. A reset button restores STR×15.
- **Extradimensional containers** — items inside a container tagged `extradimensional` contribute 0 weight to the total.

#### Container Sections

All containers are rendered as `ContainerSection` components with drag-and-drop reordering (via `vue-draggable-plus`, persisted as `sort_order` integers):

1. **Backpack** — always present, default location for newly added items.
2. **Belt** — always present, a quick-access slot.
3. **Custom containers** — inventory items that have `is_container = true`. Created by promoting an existing inventory item via the "Add container" picker. Items tagged `container` in the Vault auto-set `is_container` on add. Each custom container section shows its label (item name) and a summary: the item count, the weight **including the container itself** (its own weight is in no row, so the header is the only place a player can read it), what it weighs empty once the contents add anything, "contents weigh nothing" for an extradimensional one, and where it sits when that is not the backpack ("on belt", "stored elsewhere", "in Pack"). Its `⋯` menu (`ItemRowMenu` with `asContainer`) moves it between backpack, belt and storage, removes it, or makes it **a plain item again**.

**The container switch goes both ways, at any time.** Auto-promotion on add is a guess, and sometimes a player just wants the sack in their pack. "Use as a plain item" (`makePlainItem`) tips whatever the container holds out into the place the container itself sits (the backpack, belt, storage, or the container it is nested in; a worn one empties into the backpack), asking first when it holds anything, then clears `is_container`. The plain row's menu offers "Use as a container" back for any carried item that can hold things (`holderItemIds`: tagged `container`, or a pack with bundle contents); the "Add container" picker still promotes anything else. A container is never offered the stash or another container as a destination: the first would strand its contents with the character, the second could make two containers hold each other.

Within each container, items are shown as `ItemRow` rows supporting:

- Quantity adjustment (+/− buttons)
- Move to another container or location via the row's `⋯` menu (shown at every width). Where drop, split, sell and remove are inline, the menu holds only the move targets and the container switch; on a phone those secondary actions all move into the one menu (`ItemRowMenu`, with "Move to"), so the name has room and moving does not depend on drag
- "Drop to chat" — removes from inventory and posts an item-drop chat message
- Split stack (prompts for qty, creates a second row)
- Open detail panel
- Sell (opens detail panel pre-scrolled to sell form)

#### Stored Elsewhere

Items with `location === "stored"` (not on the character's person) are listed in a separate section. No carry-weight contribution.

#### Party Stash

Items with `carried_by === null` (shared party inventory) are shown in a read-only-ish section. "Show carrier" label is displayed. Party stash items can be moved to the character's own locations.

#### Add Item Form

A sticky form at the bottom of the page: a combobox searches the full Vault by name, a quantity field, and an "Add" button. If a Vault item has `bundle_items` (pack), adding it auto-creates the pack container and expands sub-items inside it. An item the player adds themselves arrives identified, whatever its rarity (a self-added Cloak of Protection otherwise read "Art Object / Mundane" with no way to attune it); only an item the DM hands out arrives unidentified (`is_identified = false`) when it is magic. Mundane items are always identified.

#### Item Detail Panel (`ItemDetailPanel`)

Slides in when any item row or slot button is clicked. It leads with what you can do with the item (#973): the art is a thumbnail that opens the lightbox, a one-line summary (`itemDetailSummary.ts`) says what the item is, then the applicable actions as touch-sized buttons (Equip or Unequip straight into its natural slot and asking only when there is a real choice, Attune or End attunement with the three-item limit said plainly, Spend a charge, Consume, Drop to chat); rules text, notes and selling follow. Shows the linked Vault item's full data (identified or unidentified depending on `is_identified` flag) plus inventory-instance data:

- Notes field (per-instance notes)
- Attunement toggle with 3-slot guard (disabled when 3 already attuned and item is not yet attuned)
- Charge tracker (optimistic local state, synced via watch on `[props.inv?.id, props.inv?.charges]`)
- Identification — DM-only "Identify" button (hidden in player view / DM preview mode)
- Equip / Unequip button
- Consume button (removes the item row)
- Sell form (posts a player offer to campaign chat)
- Written Contents section (document items only) — see "Document Items" above

#### Live Sync

The inventory subscribes to real-time Supabase changes via `useInventoryLive()`, so inventory updates from the DM (e.g. sending an item to a player) appear immediately without page refresh.

---

## Spellbook

### DM View (`/spells`)

The Spellbook is the DM's master spell compendium, holding both imported SRD spells and custom homebrew spells.

**List view** — paginated (50 per page, `keepPreviousData`), filterable by:

- Name search (debounced 400 ms)
- Level (0–9 button group; 0 = Cantrips labeled "C")
- School (all 8 schools)
- Class (Barbarian, Bard, Cleric, Druid, Fighter, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard, etc.)
- Source (dynamically populated)

**Shared library spells** — the per-user "Sync from Open5e" button is gone. Spells use the same per-campaign Sources panel as items (`SourcesPickerPanel.vue`, backed by `get_library_spell_sources`) — `SpellsView.vue` gates its list through `campaign_enabled_sources`, exactly like the Vault and Monsters. Open5e imports living in the `spells` table are legacy; the shared catalogue now comes from `library_spells`, merged with the user's own rows by `browse_spells` (the Spellbook page) and the slim `useSpellIndex` (pickers); a spell opens in full through `useSpellsByIds`.

**Library art (#947).** Spell art has one source: `library_spell_art_canonical`, whose files sit under `spell-images/srd/`. `sync_library_spell_art()` (admin-only, `SECURITY INVOKER`) stamps it onto `library_spells` in two steps: a spell's own canonical row first, then, for a spell with no row of its own, the canonical art of a same-named spell (the other ruleset's copy; the lowest `entry_id` decides when several share a name). A spell's own art is never overwritten by a namesake's. `scripts/seed-library-spells.ts` applies the same rule through `resolveSpellArt()`. `library_art_defaults` no longer holds spells (its check constraint allows `'item'` only); it is the source of item art, keyed by lowercased name and applied by `sync_library_item_art()`. Canonical item art goes under `item-images/srd/`, admin-write-only like the other two art buckets. History: spell defaults pointed at files in the admin's own folder, a bulk delete removed them, and the old sync's "legacy path" kept re-applying the dead URLs to every spell with a default by name.

**An admin's spell art edit is the library's art (#965).** For any other DM, a picture or focal-point edit on a shared spell is a personal override in `library_spell_art`. For the app admin it writes `library_spell_art_canonical` and every `library_spells` row showing the same picture, namesakes included (found by `image_url`, since a namesake has no canonical row of its own), and the upload goes under `spell-images/srd/` (`writeCanonicalLibraryArt`).

**Canonical art stays under `srd/` (#952, #978).** Library art never lives under a user uuid. `npm run library:move-art` moves what still does (`library_art_defaults`, `library_monster_art_canonical` and `library_backgrounds` rows, plus the `library_items` and `library_monsters` copies of the same URL) to `srd/` of the kind's bucket (`item-images`, `monster-images`, `background-images`): dry run by default, `--write` to apply, old files and per-user rows left untouched, `--out` keeps the old-to-new URL record. `npm run check:images` scans every stored image URL and exits 1 when one no longer resolves, naming the bucket, the file and the columns that point at it; an original that is gone while its `_w600.webp` variant survives is reported apart as restorable.

**Regenerating canonical art.** `npm run library:art` (`scripts/generate-library-art.ts`) makes canonical art for a library spell or item with the app's own pipeline: the text model writes the subject, the image base prompt and the platform image model render it at the entity image size, and the result is stored as WebP with the AI mark in the original and every variant. `generate` writes candidates and a manifest to a folder and spends money only with `--yes-spend`; a person looks at them and marks the keepers `approved`; `publish` is a dry run unless given `--write` (and `--yes-production` for the hosted project), and then stores the files under the bucket's `srd/` folder, writes the canonical row or item default, updates the library rows and registers image provenance.

**How library item art is staged (#955).** Library art belongs to no campaign, so the tool supplies the setting the app would take from a campaign's `ai_setting_prompt` (`itemSetting`). Without it the model invented its own backdrops (sunlit castles, concept sheets with lettering, studio shots). Every item shares one thread (a painted still life in a cold northern world: frost, a cold palette, one warm light, no people or writing), but the scene varies with the item's type, so a thousand items do not share one backdrop. Long things (staffs, rods, polearms, bows, swords, a 10-foot pole) stand upright in a rack or against a wall or tree. Body armor goes on a stand. Wands stand in a small wand stand. Everything else rests on a surface that suits it. Each item keeps its scene from run to run. The subject writer is told the scene is fixed, because the prompt lets the subject override the setting, and a subject that adds "against a plain grey background" otherwise wins. A library row with no description gives the text model nothing to stage, so write that item's subject with `--subject`. Variants of one item share one picture through `--also` ("Holy Avenger (Dagger)" and the other 38 Holy Avenger rows show the Holy Avenger's). `--image-model gpt-image-2.5-sunburst` renders on the stronger model at the same token cost as the platform's flare. The OpenAI organization allows 5 images a minute (#962); the tool waits out a 429 itself.

**Focal points of library art (#965).** `publish` asks the platform text model where the new picture's focus is (the creature's face, the centre of the item, the heart of the spell; it is shown the 400px variant) and writes that point with `focal_point_checked_at` null, on the canonical or default row and every library row the picture lands on. A new picture always replaces the old point, because that point belonged to the picture it replaces; a failed guess clears it rather than keeping it. The admin focal-point queue lists every picture whose point no person has confirmed. The same model filled every library picture that had no point on 4 Oct 2026 (1,882 pictures); image saliency (`sharp`'s attention crop) was tried first and put a magmin's point on its feet.

**A focal point is a percentage of the picture, never of a frame (#966).** From 28 Apr to 4 Oct 2026 `FocalPointPicker` showed the picture cropped into a 3:4 box and stored clicks relative to the box, so points set by hand in that window sat too close to the middle on any picture that is not 3:4. On 5 Oct 2026 `scripts/convert-box-focal-points.ts` converted the 160 user-owned points that this moved (median 1 percentage point, largest 15 on a 3:2 picture). Library art needed nothing, because every library point was written by a script or re-checked in the fixed queue. The script refuses to convert production again, because a second run would move the same points twice; its `--restore` mode takes the undo record of that run.

**Reading one spell is the Bestiary's journey.** The maintainer asked for spells to "have the same UX journey feel as monsters and NPCs", so `/spells/:id` is a child route of `/spells` exactly like `/monsters/:id` (see [combat-encounters.md](combat-encounters.md), "Reading one monster"): `useDetailModal("/spells")` keeps the grid mounted under `SpellDetailModal` on md and up, and below md the route is a `fullscreenMobile` takeover drawn by `SpellSheetMobile` on the shared `EntitySheetMobile` shell (the monster and NPC phone sheets run on it too). The grid is art-led like the Bestiary's: `SpellGridCard` over `EntityGridCard`, the school colour as the accent bar and the level ordinal as the badge on the art. `browse_spells` returns each row's art (`20261008231958`), resolved the way the detail page resolves it (the caller's override, then canonical art, then the row's own); `useSpellWithArt` is that merge for the modal and the page. In the read sheet the description and higher levels sit in titled torn panels (`TraitList`'s free-text slot), the description with the drop cap. A custom spell the DM can edit carries the DM note (`DmNoteBox type="spell"`, a private `entity_notes` row, see [dm-notes.md](dm-notes.md)); a library spell never does. Saving returns to `/spells/:id` on desktop and `/spells` on phones, the sanctioned exception in CLAUDE.md. Editing on a phone keeps a slim bar (View · name) because the takeover hides the app's bars. The player portal's Spellbook keeps its own click behaviour (`EntityGridCard`'s `activates` mode emits instead of navigating). "At Higher Levels" stays a plain-text field: the Cardforge spell backs and the Scriptorium import print it as text.

**AI Generator** — "Generate" button opens `SpellGeneratorPanel`. Stamps the active campaign onto the generated spell (#596) via the same fix as the item generator — `spellInsertFromAi()` is a pure AI-output adapter with no campaign awareness, so the panel adds `campaign_id` itself rather than teaching the adapter about campaigns.

**Spell Detail editor** (`/spells/:id?edit=true`) — a three-column layout on wide screens:

- **Left column** — portrait upload with focal-point, source field (read-only link for Open5e imports, editable for custom spells).
- **Center column** — core mechanical fields:
  - Name
  - Level (Cantrip through 9th) + School (Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, Transmutation)
  - Casting Time (standard options: Action, Bonus Action, Reaction, 1 Minute, 10 Minutes, 1 Hour, 8 Hours, Special) + optional custom text for Reaction/Special
  - Range (Touch, Self, 5/10/30/60/90/120/150/300/500 ft., 1 Mile, Sight, Unlimited, Special)
  - Duration (standard options including instantaneous, 1 round, up to 1/10 minutes, 1/8/24 hours, Special, Until Dispelled) + Concentration and Ritual toggles
  - Components (V/S/M checkboxes) + material component text field
  - **Mechanics block**: Attack/Targeting type (Melee Spell Attack, Ranged Spell Attack, Saving Throw, Utility/No Attack), save attribute and "effect on successful save" (for saving throws); damage rolls (multi-roll `DiceInput`); area of effect (shape + size)
  - Spell description — rich text editor
  - Higher level effects — rich text editor
  - **Scope** (`CampaignScopeField`, #596) — "General — all campaigns" (`campaign_id IS NULL`) vs "Campaign — *active campaign name*" (`campaign_id = active`). New spells default to the active campaign; editing an existing spell never moves it off its stored scope, even a general one. The spell index and `browse_spells` filter custom rows to `!campaign_id || campaign_id === activeCampaignId` — SRD/library spells are always general.
- **Right column** — class list (multi-select checkboxes for all spellcasting classes)
- **Spell Level Advisor modal** — wizard that appears for new spells. Asks school, effect type, intensity/damage dice, target count, and save type; outputs a suggested spell level and pre-fills mechanical fields.

**View mode** (`SpellSheet`) — a clean stat-block style layout with all spell stats in a compact summary line (level, school, ritual, concentration), then the rich text description and higher-level text. Below the source line it renders two reverse-lookup sections (#168): **Known By** — party members with the spell in `character_spells` (prepared marker included, via `useSpellKnowers`) — and **Cast By** — NPC pills linking to `/npcs/:id` for every active-campaign NPC whose `stat_block.spellcasting.entries[].spell_ids` contains the spell (via `useNpcSpellCasters`, a JSONB containment query in `useNpcs.ts`).

**DM-only edit guard** — edit controls are hidden when `!auth.isDM || ui.dmPreviewMode`.

**Actions on existing spells:**

- "Send to Scriptorium" — creates a formatted Scriptorium document.
- "Delete" — confirmation + image storage cleanup.

---

### Player Spells (`/play/spells`)

The player spell view adapts entirely to the character's caster type. The view resolves the current party member (or DM preview target).

**Caster types:**

- `spellbook` — Wizard-style: spells are learned into a spellbook then a subset prepared daily
- `prepared` — Cleric/Druid-style: all class spells are available to prepare, no separate spellbook
- `known` — Sorcerer/Bard/Warlock-style: a fixed number of spells known
- `none` — non-caster: only innate + browse tabs shown

**Tab layout per caster type:**

| Type      | Tabs                                        |
| --------- | ------------------------------------------- |
| spellbook | Prepared · Spellbook · Innate · All Spells  |
| prepared  | Prepared · Innate · All [Class] Spells      |
| known     | Known [Class] · Innate · All [Class] Spells |
| none      | Innate · All Spells                         |

Tab badges show counts (and max where applicable). "Known" badge shows `N/maxKnown + Nc/maxCantrips` for known-type casters. If counts exceed max, badge turns destructive red.

**Prepared tab / Known tab** — rendered by `PlayerMySpells`. Displays the character's prepared/known spells grouped by level. Each spell row shows name, school, components, and roll buttons for spell attack and damage. Spell slots are tracked per level (including multiclass-aware slot table) in one strip above the list (`PlayerSpellSlotStrip`, `spellSlotPips.ts`) that shows every slot level whether or not a prepared spell sits at it, labels Pact Magic and other pools apart, and counts filled as still available. The Prepared badge and the banner count the same thing, what the preparation limit counts (`preparedSpellCount.ts`), and the limit shows from the start ("4 / 10"). Badges say Ritual and Concentration in words, and a manual roll reads "Roll by hand". Clicking a spell opens a detail modal; on a phone the player's sheet (`SpellSheet` compact mode, DM pages unchanged) leads with casting time, range, components spelled out and duration, the art is a thumbnail, and Cast and Prepare sit in its footer. The upcast picker says how many slots of each level are left. Spells can be un-prepared/removed from this tab.

**Spellbook tab** (spellbook casters) — also `PlayerMySpells` in `view-mode="spellbook"`. Shows all spells learned into the character's spellbook. Spells can be prepared from here (up to the daily preparation limit).

**Innate tab** — rendered by `PlayerInnateSpells`. Shows racial, feat, and item-sourced spells (source_type != "class"). An "Add Innate Spell" button opens `AddInnateSpellDialog`, which searches the full Spellbook and adds a spell with a custom source label.

**Browse tab** — full paginated Spellbook with name search, level filter, school filter, and class filter (pre-filtered to the character's class). Spell rows show "Prepared", "Known", or an "Add to Spellbook / Prepare" button depending on caster type and current state. Clicking a spell row opens `PlayerSpellModal` (a slide-in detail view, not a navigation).

**Spell attack bonus and save DC** — computed per source class (proficiency bonus + that class's casting ability modifier) via the shared `computeSpellcastingByClass` helper (`src/rules/spellcastingByClass.ts`), consumed by both `PlayerSpellsView` and the encounter runner's `RunnerPcPanel`. Innate/item grants resolve their stats through `grantAttackBonus`/`grantSaveDc` (`src/rules/spellGrantStats.ts`): `casting_ability` first, then per-class stats, then the surface's fallback. There used to be a first-precedence `fixed_attack_bonus` / `fixed_save_dc` pair for a grant with a printed DC (e.g. a magic item), but nothing ever wrote either column — both were 100% NULL in production, so the override branch could never fire — and they were dropped in `20260730000009` (#589). If a printed-DC grant is wanted later, it needs a write path as well as a read path.

**Spell roll actions** (#460) — castable spell rows expose interactive `Atk +X` / `DC X` controls (in both `PlayerMySpells` and the encounter runner's `RunnerPcSpells`):

- **Attack spells** (`attack_type` = `ranged_spell`/`melee_spell`): the `Atk` badge is a button that rolls `d20 + spell attack bonus` and posts to chat. In the runner it reuses the `roll-attack` → `performCheck` chain; `spellAttackBonus = saveDc − 8` in `RunnerPcPanel`.
- **Save spells** (`attack_type` = `save`): the `DC` badge announces a `DC X {ability} saving throw` (with half/negates effect from `save_effect`) so the table can roll against it — a flavor message in the player view, a chat announcement (respecting chat/silent mode) in the runner via the `roll-spell-save` event.
- Damage/healing dice are still rolled by the **Cast** button (the upcast picker scales them); these buttons are slot-free, standalone rolls.

**Multiclass support** — `useCharacterClasses` returns per-class level rows; `getMulticlassSpellSlots()` computes combined slot totals per PHB multiclass rules. Displayed slots come from `deriveEffectiveSpellSlots` (`src/rules/spellSlots.ts`), which reconciles stored server-owned pools against freshly derived maxima (usage preserved) so a campaign ruleset switch is reflected without losing spent slots.

### Dual-ruleset spellcasting engine (EPIC #550)

The campaign `ruleset` (`2014`/`2024`, campaign-wide, default 2014) drives every edition-sensitive spell rule. Support boundaries are documented in `docs/spellcasting-support-matrix.md`. Server-authoritative pieces (all SECURITY DEFINER RPCs authorize from `auth.uid()`; players cannot create illegal spell state via direct API):

- **Casting** — `cast_character_spell_v4` (folded into a single authoritative body in migration `20260720000044`; the former v1–v3 inner layers are dropped): one transaction spends the chosen slot/pool (Spellcasting, Pact, temporary, feature), records a `spell_cast_records` row (select-only RLS by design — clients must not forge cast records), enforces prepared/known/ritual eligibility (wizard spellbook rituals cast unprepared), turn-scoped rules via `private.active_turn_key()`, and metamagic eligibility/costs (Arcane Apotheosis free use at Sorcerer 18+). One row lock/auth check/ruleset/turn-key/grant lock/spell resolve per cast.
- **Rules data (#551)** — Metamagic identity/classification/cost lives in the `metamagic_options` table (per ruleset; `post_roll` marks Empowered/Seeking, `cost_scaling: spell_level` covers original Twinned) and per-class ritual eligibility in `class_ritual_policies` (`ritual_style`: none/prepared/known/spellbook/spellbook_or_prepared; unlisted classes default to `prepared` in 2024, `none` in 2014). Both are world-readable/admin-writable and consumed by the cast RPC server-side and by the client via `useMetamagicOptions()` (`src/composables/party/useMetamagic.ts`) and `useRitualStyles()` (`src/composables/rules/useRitualPolicies.ts`) — the old static `src/data/metamagic.ts` and the hardcoded `RITUAL_CASTERS_2014` set are gone; `canCastAsRitual` now takes a `ritualStyle`.
- **Slot pools** — server-owned in `party_members.spell_slots`; `spend_spell_slot` reconciles a client-derived template only to fill pools missing entirely (legacy characters), never to enlarge existing maxima.
- **Rests** — `take_spellcasting_rest` atomically restores only eligible pools (Pact on short rest; Sorcerous Restoration tracked separately) and reopens preparation windows. Rest/turn-state clearing is declarative (`20260720000045`): any `class_choices` key ending in `_turn` is removed on a long rest, and other resettable keys register in `class_choice_rest_resets` (`rest` + `remove`/`set_false`) — new class features never need another rest-function migration.
- **Preparation windows** (`spell_change_windows`) — opened at class creation/level-up (trigger) and each long rest via `open_spell_change_windows`; closed when a non-cantrip slot cast occurs (the post-rest preparation period ends). `set_character_spell_prepared` / `change_prepared_spell` gate 2024 preparation/replacement on an open window and `remaining_changes`.
- **Acquisition** — `validate_character_spell_source` checks class list/level/counts per pinned class definition (system or custom; legacy kind-NULL rows fall back to name-based custom class lookup). A spell passes the class-list gate when its `classes` hold the class **or** the character's subclass lists it in `expanded_spells` / `expanded_spell_variants[subclass_variant]` (a 2014 Warlock patron's pick-from list; see party-characters.md, "Subclass spells"). `browse_spells(p_extra_ids)` offers the same expanded ids under a class filter. `delete_character_spells` protects leveled 2024 class spells behind replacement windows but allows cantrip and spellbook-entry deletion; `p_source_class_id = null` matches only unassigned rows.
- **Level-up** — `required_level_up_spell_choices`/`apply_level_up` validate choice counts; the client mirrors the same logic per definition kind in `levelUpSpellChoiceCount` (`spellPreparationPolicy.ts`) — custom classes use their own progression even when named like an official class.
- **Content identity** — character classes/subclasses/spells pin an exact content version (`class_definition_id`/`kind`); ruleset switches remap safe counterparts and flag the rest for player review (acknowledge RPCs). World bundles (format v2) carry the source campaign ruleset; v1 bundles strip pins on import.

Mutation errors from these RPCs surface via toasts (`useCharacterSpells` mutations have `onError` handlers) — they are policy messages, not silent failures.

---

## Workshop (Crafting)

### DM View (`/crafting`)

The Workshop is where the DM creates crafting recipes and controls which players can see them.

**List view** — tabbed by crafting discipline. All recipes are shown in an "All" tab; individual discipline tabs filter the list. Mobile-responsive cards truncate the name and collapse discipline/proficiency/tools badges to icons only. The list is windowed through `VirtualGrid` (only the rows near the viewport are mounted) with `useScrollRestore` keyed `crafting-recipes`, so returning from `/crafting/:id` lands where you left off.

**Crafting disciplines** — defined in `src/lib/crafting/disciplines.ts`. Each discipline has:

- An id, label, icon
- The ability score used for the check (INT, WIS, DEX, etc.)
- The relevant tool(s) for proficiency checks
- A workspace bonus (standard modifier for having a proper workspace)
- A workspace label shown in the attempt dialog

Not every discipline maps to an artisan's tool. Herbalism, Poisoncraft and Forgery key off kits, which is deliberate: the point of a discipline is that *some* proficiency unlocks it, and a Charlatan's Forgery Kit is as real a qualification as a smith's hammer. Forgery currently reuses `IconCraftScribing` because `CRAFTING_GLYPHS` is generated from a 14-discipline art sheet and no forgery glyph exists yet — replace it by adding art and regenerating, never by hand-editing `craftingGlyphs.generated.ts`.

**Starter recipe data invariants** — `src/data/starterRecipes.test.ts` asserts three things, each because it shipped broken and nothing failed: no duplicate recipe names (the whole `painting` block was once duplicated, so every DM who imported got doubled cards); every output names an item that actually exists **in each edition**, as an SRD row from `WORKSHOP_LIBRARY_EQUIVALENTS` or a `gear.ts`/`provisions.ts`/`ammunition.ts` entry visible in that edition (`buildStarterRecipeChildRows` silently *drops* an output it cannot resolve, so the recipe imports fine and then crafts into nothing); and every `discipline` is a real id. Note the third list — ammunition was missing from the importer's lookup, which is why the two arrow/bolt recipes produced nothing.

**Reveal control** — `AudienceRevealControl` on each recipe card controls which player characters can see the recipe in their portal. This can be changed directly from the list without entering the editor, and `RecipeSheet` and `RecipeEditor` carry the same control (#741).

**Starter recipe import** — "Import Starter Recipes" button imports a built-in set of starter recipes (idempotent). The gear/provisions/ammunition items it mints as recipe outputs are deliberately left with `campaign_id: null` (#596 did not flip this one) — the existing-item lookup that keeps a second import idempotent is scoped by `user_id` alone, not by campaign, so if a second campaign's import stamped its own copy of "Torch" with that campaign's id, the crafting recipe in campaign two would resolve to an item invisible in campaign two's own Vault. Global is the correct scope for this basic universal gear, not an oversight.

**Workshop outputs the SRD defines craft the SRD item (#957)** — `src/data/workshopLibraryEquivalents.ts` maps each Workshop output the SRD already has (Shortbow, Dagger, Handaxe, Javelin, Spear, Light Hammer, Trident, Leather Armor, Shield, Net, five potions) to that edition's `library_items` row, and the starter import resolves those names through it *before* the vault: a vault copy by that name is almost always an old clone of the thin bundled copy (a Shortbow with no range), which is what crafting must stop producing. The bundled datasets keep their own copy only for an edition the SRD does not cover, stamped with that edition (`ruleset`), so no campaign lists an item twice: Shield is 2014-only (2014 Open5e has no plain Shield), Net and the two healing potions 2024-only. Names cannot do this matching (2014's armour is "Leather", 2024's "Leather Armor"), hence ids. `workshopLibraryEquivalents.test.ts` holds the table and the datasets in step; migration `20261003103927` moved existing references and deleted the superseded rows. Other names still resolve vault first, then a library row of the campaign's edition (or edition-neutral).

**Recipe editor** (`/crafting/:id`) — a focused form:

- **Name** + proficiency toggle (lock icon: whether proficiency is required to attempt) + tools toggle (wrench icon: whether tools must be in inventory, or if lacking them only imposes disadvantage)
- **Player visibility toggle** — sets which party members can see this recipe
- **Discipline** dropdown
- **Crafting DC** (integer 1–30)
- **Crafting time** + unit (minutes, hours, days)
- **Description** — rich text editor
- **Outputs** — searchable item picker; at least one output is required to save. Each output has a quantity. The first output is the "primary" result.
- **Ingredients** — searchable specific-item picker OR tag-based wildcards (e.g. `any "meat"` or `any ["glass", "container"]`). Each ingredient has a quantity. The first ingredient is the "PRIMARY" one (ruined on a critical fail). An ingredient is exactly one of an owned item (`item_id`), a library item (`library_item_id`) or a tag list; the `ingredient_item_or_tags` check holds that, and `supabase/tests/recipe_ingredient_references.test.sql` holds the check (it refused library items until `20261002112421`).
- **Conditional modifiers** — DM-defined bonus conditions (e.g. "Full forge available" → +4). Workshop bonus and poor-ingredient penalty are provided automatically by the dialog and not listed here.

**Read mode** (`RecipeSheet`) — clean layout showing DC, time, ingredient list, and output list.

**AI recipe generator (#910).** `CraftingView.vue` has a **Generate** action (`ui.recipeGeneratorOpen`) opening `RecipeGeneratorPanel.vue` (state in `src/ai/useRecipeGeneration.ts`, validation in `src/lib/crafting/recipeAi.ts`). Optional constraints: discipline and a specific output item the DM picks. `generate-entity-text` with `generator: "recipe"`, ledger reason `recipe_generation`.

*Validation:* an unknown discipline, rarity or item type falls back to a default; DC is clamped to 5-30, ingredients capped at five (tags per ingredient at four, quantity at 99) and modifiers at two, crafting time at 999.

*Output resolution, then a confirm step.* The recipe's output is a name, and `resolveRecipeOutput` decides what it points at: an item the campaign already has wins, then the shared library, otherwise a new item is drafted. Matching is a case-insensitive **exact** name, so "Healing Potion" never silently adopts "Greater Healing Potion". Nothing is written yet: the panel shows the recipe and a line from `describeOutputResolution` ("Uses X" or "Creates a new item: X") and only **Create** writes. It then creates the item first when the output is new (`useCreateItem`, with provenance), then the recipe, then the `crafting_outputs`, ingredients and modifiers rows. If the recipe row exists but a child write fails, the DM is told it was created with a partial save and which parts to check, rather than the recipe being rolled back silently. Both rows carry `ai_provenance`. After create it navigates to `/crafting/:id`.

---

### Player Crafting (`/play/crafting`)

Players see only recipes the DM has shared with them (via `player_visible_to`) via `usePlayerCraftingRecipes`.

**Discipline tabs** — only disciplines with at least one accessible recipe are shown. Tabs where the character lacks the required tool proficiency show a "NO PROF" badge and use dimmer styling.

**Windowing** — the grid renders through `VirtualGrid`, which mounts only the rows near the viewport (8 Oct 2026; it replaced paging 24 cards in on scroll, which still mounted every card the player had scrolled past). Why it matters here more than most: a recipe card is ~5ms of mount work, so a campaign with 184 shared recipes rendered as one unbroken ~980ms task in a production build on a fast desktop. On a low-end Chromebook that was several seconds during which the browser answers no input at all — not even a reload — and Chrome killed the renderer with an out-of-memory error, which is what the freeze was originally reported as. Do not render the full list "because it is only a few hundred": the cost is linear and there is no cap on recipes per campaign. The row estimate (`RECIPE_ROW_PX`) is the roughest in the app, since a card's height follows its ingredient count.

**Recipe cards** — each card shows:

- Name and discipline badge (when viewing "All")
- DC and crafting time
- Output item names (inline summary, e.g. "→ 2× Iron Ingot")
- Lock/status badge: "LOCKED" if proficiency required and not met; "NO TOOLS" if tools required and not in inventory; "DISADV" if tools not in inventory (disadvantage penalty applies)
- Description (rendered from Tiptap JSON)
- Ingredients list — each line shows a green checkmark or red X, required quantity, and owned count (checked against `myInventory` including party stash). A player sees DM-made ingredients by name because `get_craftable_output_items` names the ingredients of the same visible recipes it names outputs for, under the same authorization (RLS hides the items themselves, which used to read "Unknown item")
- "Attempt Craft" button — disabled when any hard requirement is unmet

**Discipline header** (when a specific discipline is active) — shows the discipline description, the ability score used (e.g. "Uses INT (+2) + Proficiency (+3)") or a note that no proficiency bonus applies.

**Ingredient matching** — specific-item ingredients matched by `item_id`; tag-based ingredients matched by checking ALL required tags against the vault item's tag array. Ruined items are excluded from counts. Party stash items are included.

**Tool-proficiency matching goes through `src/rules/toolProficiency.ts` — never compare the strings directly.** `party_members.tool_proficiencies` is free text fed from three places (the sheet's picker, Open5e background prose, hand-written homebrew), and the exact `includes()` this replaced meant a background granted proficiencies that toggled nothing: production held four spellings of the herbalism kit (`"herbalism kit"`, `"Herbalism kit"`, `"Herbalism Kit"`, `"Herbalist kit"`), lowercase `"Alchemist's supplies"`, the fragment `"or Disguise Kit."`, and `"No additional tool proficiencies"` stored as though it were a proficiency. `canonicalToolName` resolves those against `TOOL_PROFICIENCY_GROUPS`, returns `null` for prose that names no tool, and passes homebrew and armour/weapon entries through untouched. Because it canonicalises on *read* as well as write, existing dirty rows started matching without a backfill.

**CraftAttemptDialog** — modal that opens when "Attempt Craft" is clicked:

1. **Ingredient slots** — shows each ingredient with green/red status, quantity needed vs owned.
2. **Proficiency notice** — amber warning if proficiency is missing (no proficiency bonus added).
3. **Disadvantage notice** — amber warning if the required tool is not in inventory (roll made at disadvantage: roll twice, take lower).
4. **Modifier checklist** — optional checkboxes for workspace bonus (discipline-defined), poor quality ingredients penalty (−2), and any recipe-specific conditional modifiers the DM added.
5. **Roll** — clicking "Attempt Craft" rolls the check server-side (`useAttemptCraft`). Result is displayed: the d20 roll, any disadvantage second roll, total vs DC. On a phone the result scrolls into view, the modifier checklist locks once rolled, and a spent ingredient does not turn red after the roll.
6. **Outcome** — one of three results:
   - **Success** (total ≥ DC) — green result panel
   - **Fail** (total < DC) — neutral result panel; all ingredients are consumed
   - **Ruin** (critical fail / natural 1) — red result panel; the PRIMARY ingredient is ruined and returned to the inventory, and every other ingredient is consumed
7. On completion, the result is posted to the campaign chat as a message.

---

## Key Capabilities

- **Dual-image identification system** — magic items have both a mundane appearance (what unidentified players see) and an identified appearance. The DM can flip `is_identified` on a player's inventory item, changing what they see without changing the underlying vault item.
- **SRD + Open5e import pipelines** — spells sync selectively by sourcebook; items come from the shared `library_items` table (#303). All paths are upsert-safe and preserve user-customized data. The full per-entity re-import contract (what refreshes vs. what's DM-owned and never touched) is documented in [`docs/library-reimport.md`](../../docs/library-reimport.md).
- **Library seed pipeline (#560, #303)** — the shared `library_spells`/`library_monsters`/`library_items`/`library_species` tables are seeded by `scripts/seed-library-*.ts` (run via `npm run seed-library-<entity>` under `tsx`), reusing the exact same Open5e v2 mappers as the in-app import flows — one source of truth for the field mapping, only the transport differs. All seed both editions by default and upsert idempotently on `(source_document_key, source_record_key)`; the spell seed excludes rows already marked `mechanics_reviewed = true` from the upsert entirely (`planLibrarySpellImport` in `src/lib/library/open5eSpellImport.ts`), so admin-reviewed spell mechanics are never clobbered by a re-run. `library_spells` currently holds 319 `srd-2014` + 339 `srd-2024` rows; `library_items` 1717 rows (548 `srd-2014`, 808 `srd-2024`, 361 edition-neutral bundled); `library_species` the 9 core species per edition. The legacy `wotc-srd` identity set was retired by migration `20260722000002` (references remapped to the equivalent `srd-2014` rows; v1 class lists unioned into v2 rows where the v2 data had regressed). **The 2014 class lists are the SRD's own** (`src/data/srd2014ClassSpellLists.ts`, generated from the official SRD 5.1 PDF, migration `20261008165038`): Open5e tags a `srd-2014` spell with every class a subclass reaches it through, so the library let any Cleric take every domain's spells and any Druid every Land terrain's, and tagged no spell Paladin. The import takes those eight classes from the table. Subclass spells reach a character through the subclass instead. Two secondary datasets each disagreed with the PDF on a spell or more, which is why the PDF is the only source. The 2024 tags already match SRD 5.2 (its tables omit Phantasmal Force and Mind Spike from classes the spells' own entries list; the tags follow the entries).
- **Redistribution guard (#567)** — every seed script calls `assertRedistributableDocuments()` after resolving its document keys and before fetching any content, so an explicit `npm run seed-library-monsters <key>` is refused just as firmly as `--all` if that document's licence doesn't clear `REDISTRIBUTABLE_LICENSE_KEYS` (`ogl-10a`, `cc-by-40`, `cc0`, `orc`). A document listing **no** licence is refused too — unknown licensing is never a default-allow. All four mappers now populate `source_license`; because the embedded `document` ref on v2 records omits `licenses`, seed scripts build a `Map<string, Open5eDocumentRef>` from `fetchOpen5eDocumentRefs()` and thread it into the mapper. `scripts/seed-content-sources.ts` (`npm run seed-content-sources`, supports `--dry-run`) refreshes the `content_sources` attribution catalogue from `/v2/documents/`, writing machine-derived fields only and skipping `is_metadata_curated` rows wholesale. See the Reliquary Licences section in `publishing-tools.md`.
- **Weapon mastery (#557)** — 2024-only per-item mastery property (see Weapon section above) plus per-character tracking: `party_members.weapon_masteries` records which masteries a character has active, toggled from the equipped-weapon rows in the Character Sheet's Combat tab (`PlayerCombatTab` — see `party-characters.md`).
- **Tag-based slot matching** — the paper doll uses vault item tags and subtypes to determine which slots an item can fill, without requiring a dedicated "slot" field on the item.
- **Extradimensional container weight exclusion** — items inside a container tagged `extradimensional` (e.g. a Bag of Holding) contribute 0 weight.
- **Pack expansion** — vault items with `bundle_items` auto-expand into individual container rows when added to inventory.
- **Per-character spell management** — spell view adapts to caster type (spellbook/prepared/known/none), shows multiclass-accurate slot tables, and tracks prepared vs known separately from innate spells.
- **Player-gated recipe visibility** — each recipe has a `player_visible_to` array; the DM controls visibility per recipe per party member without separate publish flows.
- **Crafting proficiency and tools matrix** — the attempt dialog separately handles the three states: proficiency (adds bonus), tools present (normal roll), tools absent (disadvantage). A recipe can hard-lock to require proficiency or tools.
- **Campaign chat integration** — item drops, coin drops, item-sell offers, and crafting outcomes all post messages to the campaign chat feed. Clicking a dropped vault item's name (or the "Show Details" toggle) expands its stat block/description inline — available whether or not the item has already been grabbed (`ChatItemDropMessage.vue` → `ChatItemDropDetails.vue`, RLS-gated so unclaimed players still see a "claim it to reveal" placeholder).
- **Scriptorium export** — any item or spell can be sent to the Scriptorium as a formatted document.

---

## Data Fields

### Item (`items` table)

| Field                       | Type               | Notes                                                                                                  |
| --------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| `name`                      | string             |                                                                                                        |
| `item_type`                 | enum               | weapon, armor, shield, ring, wand, staff, scroll, potion, gear, ammunition, art_object, other          |
| `subtype`                   | string             | e.g. "longsword", "chain mail"                                                                         |
| `rarity`                    | enum               | mundane, common, uncommon, rare, very_rare, legendary                                                  |
| `weight`                    | string             | parsed by `parseWeightLb()`                                                                            |
| `cost`                      | string             | freeform, e.g. "50 gp"                                                                                 |
| `tags`                      | string[]           | drive slot matching, container detection, ingredient wildcards                                         |
| `image_url`                 | string             | identified portrait                                                                                    |
| `image_focal_point`         | object             | {x, y} for FocalImage                                                                                  |
| `mundane_image_url`         | string             | pre-identification portrait                                                                            |
| `mundane_image_focal_point` | object             |                                                                                                        |
| `requires_attunement`       | boolean            |                                                                                                        |
| `attunement_requirements`   | string             | "by a spellcaster", etc.                                                                               |
| `charges`                   | number             | max charges (staff/wand/rod) or quantity (ammunition)                                                  |
| `recharge`                  | string             | combined roll + trigger, e.g. "Regains 1d6+4 charges daily at dawn" — no separate roll/trigger columns |
| `is_arcane_focus`           | boolean            |                                                                                                        |
| `damage_rolls`              | DamageRoll[]       | JSONB array                                                                                            |
| `versatile_damage`          | string             | dice expression                                                                                        |
| `weapon_range`              | string             | "80/320 ft."                                                                                           |
| `properties`                | string[]           | finesse, light, thrown, etc.                                                                           |
| `mastery`                   | enum               | 2024 PHB weapon mastery property (weapons only) — Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex    |
| `armor_class`               | string             | "13 + DEX modifier (max 2)"                                                                            |
| `spell_ids`                 | string[]           | linked Vault spells                                                                                    |
| `bundle_items`              | {name, quantity}[] | pack expansion                                                                                         |
| `description`               | Tiptap JSON        | rich text, post-identification                                                                         |
| `mundane_description`       | Tiptap JSON        | rich text, pre-identification                                                                          |
| `content`                   | Tiptap JSON        | in-world text the item itself carries; NULL = not a document item. Distinct from `description`         |
| `content_player_writable`   | boolean            | when true, campaign members may append `item_entries`; the DM always can                               |
| `content_updated_at`        | timestamp          | bumped by trigger on `content` change only — not on other item edits                                   |
| `curse_description`         | Tiptap JSON        | non-null = cursed; no separate `is_cursed` boolean                                                     |
| `campaign_id`               | uuid               | null = general (all campaigns); set = scoped to that campaign                                          |
| `dm_notes`                  | Tiptap JSON        | DM-only, never shown to players                                                                        |
| `ai_provenance`             | jsonb              | AI generation/edit provenance for the Generator panel; null for hand-authored items                    |
| `source`                    | string             | slug                                                                                                   |
| `source_title`              | string             | display name                                                                                           |
| `source_url`                | string             | link to external source                                                                                |

### Spell (`spells` table)

| Field               | Type        | Notes                                                         |
| ------------------- | ----------- | ------------------------------------------------------------- |
| `name`              | string      |                                                               |
| `level`             | number      | 0 = cantrip                                                   |
| `school`            | string      | abjuration, conjuration, etc.                                 |
| `casting_time`      | string      |                                                               |
| `range`             | string      |                                                               |
| `duration`          | string      |                                                               |
| `concentration`     | boolean     |                                                               |
| `ritual`            | boolean     |                                                               |
| `components`        | string[]    | ["V","S","M"]                                                 |
| `material`          | string      | material component text                                       |
| `attack_type`       | string      | melee_spell_attack, ranged_spell_attack, save, utility        |
| `save_attribute`    | string      | STR, DEX, CON, INT, WIS, CHA                                  |
| `save_effect`       | string      | half, none, other                                             |
| `damage_rolls`      | DiceInput[] |                                                               |
| `area_of_effect`    | object      | shape + size                                                  |
| `classes`           | string[]    | class list                                                    |
| `description`       | Tiptap JSON |                                                               |
| `higher_level`      | Tiptap JSON |                                                               |
| `image_url`         | string      |                                                               |
| `image_focal_point` | object      |                                                               |
| `source`            | string      |                                                               |
| `source_title`      | string      |                                                               |
| `source_url`        | string      |                                                               |
| `open5e_import`     | boolean     | true for Open5e-sourced spells                                |
| `campaign_id`       | uuid        | null = general (all campaigns); set = scoped to that campaign |

### CraftingRecipe (`crafting_recipes` table)

| Field                  | Type               | Notes                               |
| ---------------------- | ------------------ | ----------------------------------- |
| `name`                 | string             |                                     |
| `discipline`           | CraftingDiscipline | id referencing CRAFTING_DISCIPLINES |
| `dc`                   | number             | 1–30                                |
| `crafting_time`        | number             |                                     |
| `crafting_time_unit`   | enum               | minutes, hours, days                |
| `description`          | Tiptap JSON        |                                     |
| `requires_proficiency` | boolean            | hard-lock on proficiency            |
| `requires_tools`       | boolean            | hard-lock on tools                  |
| `player_visible_to`    | string[]           | party member ids                    |

### CraftingIngredient (related table)

| Field       | Notes                          |
| ----------- | ------------------------------ |
| `recipe_id` | FK                             |
| `item_id`   | null for tag-based             |
| `tags`      | string[] for wildcard matching |
| `quantity`  |                                |

### CraftingOutput (related table)

| Field       | Notes         |
| ----------- | ------------- |
| `recipe_id` | FK            |
| `item_id`   | vault item FK |
| `quantity`  |               |

### CraftingModifier (related table)

| Field         | Notes           |
| ------------- | --------------- |
| `recipe_id`   | FK              |
| `description` | condition label |
| `bonus`       | integer bonus   |

### PartyInventoryItem (`party_inventory` table)

**A row references its catalogue entry through one of two columns, and nothing outside `src/lib/itemRef.ts` should read either directly.** `item_id` is a uuid FK to the owner's own `items` row; `library_item_id` is a text FK to shared `library_items`. A check constraint allows at most one, and both-null is legal — that is free-text loot with no catalogue entry at all.

The second column exists because `item_id` predates the shared library: `library_items.id` is text, so until #815 a player picking anything shared got `invalid input syntax for type uuid` and the entire catalogue was selectable but unaddable. The workaround that grew instead, cloning a picked library row into the caller's vault (`useEnsureOwnedItem`), was removed in #954 once every referrer could hold a library id. Most of the 618 name-twins #876 found on one account were older than the library itself; the importer's clones were the ones still being minted. Reference shared content; do not copy it. Use `inventoryItemRef(row)` to read and `itemRefColumns(pickedId)` to write, and remember that a row carrying a library reference must keep it through a stack split or an equip, or the link vanishes while the row still looks right.

| Field             | Notes                                                                             |
| ----------------- | --------------------------------------------------------------------------------- |
| `item_id`         | FK to the owner's vault item (uuid)                                               |
| `library_item_id` | FK to shared library content (text) — #815                                        |
| `name`            | display name                                                                      |
| `quantity`        |                                                                                   |
| `carried_by`      | party member id; null = party stash                                               |
| `location`        | equipped, backpack, belt, container, stored                                       |
| `slot`            | InventorySlot or null                                                             |
| `is_container`    | promotes item to a container section                                              |
| `container_id`    | FK to another party_inventory row                                                 |
| `is_equipped`     | boolean                                                                           |
| `is_attuned`      | boolean                                                                           |
| `is_identified`   | boolean                                                                           |
| `is_ruined`       | boolean                                                                           |
| `notes`           | freeform per-instance text; player-editable from the item detail panel since #809 |
| `sort_order`      | integer for drag-and-drop ordering                                                |
| `charges`         | current charges (tracks against vault item's max)                                 |
