# Features — Items & Workshop

Shipped features in the **Items & Workshop** area, newest first. Part of the Grimoire feature log — see the [log index](../index.md).

- [x] Item Vault — full CRUD with 15 item types, 7 rarities, weapon damage dice, charges, attunement, image upload, card printing

- [x] Item Vault imports — real source from open5e `document__slug`; `weapon_range` + `versatile_damage` fields captured; re-import updates source/range/versatile without touching user images/tags; ammunition uses "Quantity" label instead of "Charges"

- [x] Vault: Cursed Items — `curse_description` + `curse_revealed` fields; DM always sees curse with hidden/revealed badge and inline reveal toggle on the detail view; players see curse only once DM reveals it

- [x] Vault: Services — added `service` item type; 36 SRD services (lifestyle expenses, food/drink, lodging, meals, hirelings, transport, spellcasting) imported via the existing SRD import button; DMs can edit or delete individual entries

- [x] Party inventory — shared table with DM + player item management

- [x] Character sheet inventory (My Items / Party Stash split, equip toggle, attack/damage rolls)

- [x] Art object loot type — inline name + value + optional image + description, droppable to chat like vault items; images stored in Supabase Storage; feels identical to item drops for players (irongollem/grimoire#16)

- [x] Loot drops in chat — items droppable as cards with Claim / To Stash actions (real-time sync)

- [x] Currency drops in chat — DM drops PP/GP/EP/SP/CP from quest rewards; players claim to purse (real-time sync)

- [x] Coin purse on party members — pp/gp/ep/sp/cp fields, incremented on currency claim

- [x] Paper doll inventory view in player portal — equipped slots, belt, backpack, containers, stored, party stash

- [x] Item detail panel in player inventory — click any item name to open a slide-in panel showing art, type, rarity, cost, weight, description; quantity +/− controls; charge tracking (spend / recharge) for magic items with `current_charges` in `party_inventory`

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

- [x] Extradimensional containers — vault items tagged `"extradimensional"` (e.g. Bag of Holding) have their contents excluded from carry weight; DM item-drop claim now correctly sets `is_container` from vault tags; container header gains an ⓘ button to open the item detail panel for the container itself

- [x] RLS: campaign members can read vault items in party inventory — without this players saw `vaultItem = null` causing every item to show as "Art Object" with no artwork

- [x] **Custom crafting-discipline icons** — bespoke solid-fill glyphs for all 14 Workshop disciplines (alchemy, smithing, leathercraft, woodcraft, jewelcrafting, herbalism, poisoncraft, tinkering, cooking, scribing, brewing, weaving, masonry, painting), replacing the overloaded Lucide stand-ins (smithing was a generic Hammer, poisoncraft a Skull, weaving Layers…). Same pipeline/style as the nav glyphs; `IconCraft*` exports from `icons.ts` wired into `crafting-disciplines.ts`. Source + tooling in `art-src/crafting/`, generated markup in `src/lib/craftingGlyphs.generated.ts`

- [x] **Crafting system** — allow players to craft items using gear proficiencies, crafting tools

- [x] **Crafting multi-output** — recipes can produce multiple output items (e.g. 4× leather strips + 1× tanning waste from raw hide)

- [x] **Crafting open to non-proficient players** — disciplines no longer fully locked; players without tool proficiency can still attempt (no proficiency bonus), with "NO PROF" badge on tab; standard workspace bonus and poor-ingredient penalty modifiers added to all attempt dialogs

- [x] **Recipe player visibility** — replaced dedicated GrantRecipeDialog with unified PlayerVisibilityToggle component; recipes now use `shared_with_players` + `player_visible_to` columns matching NPC/quest/location pattern

- [x] **Recipe visibility toggle on Workshop list** — added `PlayerVisibilityToggle` directly to each recipe row's action cluster (next to Edit + Delete) so the DM can flip a recipe's per-player visibility without entering the editor. Uses the existing `useUpdateRecipe` mutation; row click is `@click.stop`-guarded so clicking the toggle's popover doesn't navigate to the detail page.

- [x] **Workshop discipline consolidation** — leatherworking→leathercraft (+ Cobbler's Tools), woodcarving→woodcraft (+ Carpenter's + Shipwright's Tools), scribing now accepts Bookbinder's + Scribe's Supplies, jewelcrafting accepts Gemcutter's Tools; added Brewing (Brewer's Supplies, WIS) and Weaving (Weaver's + Tailor's Tools, DEX) disciplines; multi-tool proficiency/inventory checks use any-of logic

- [x] **Workshop filter improvements** — default tab changed to "All" (shows every recipe at once with discipline badge); tab selection persisted in Pinia ui store across navigation; player view only shows discipline tabs that have accessible recipes; attempt dialog uses per-recipe discipline instead of active tab

- [x] **Workshop tag-based ingredients** — recipe ingredients can now match any item with a given tag (e.g. "meat", "herb") instead of requiring a specific item; item_id is now nullable and a `tag` column added with a DB check constraint; RecipeEditor has a tag input alongside item search; CraftAttemptDialog and PlayerCraftingView match/consume by tag using item vault metadata

- [x] **Workshop combo tag ingredients** — tag-based ingredients now support AND combos: entering "glass, container" requires an item to have both tags (e.g. a glass bottle or vial); `tag text` column replaced by `tags text[]` across DB, types, and all matching logic; tag input accepts comma or `+` as separator; display shows `any "meat"` for singles and `any [glass + container]` for combos

- [x] **Workshop crafting time units** — crafting time now supports minutes, hours, or days (previously days-only); `crafting_time_days` renamed to `crafting_time` with a new `crafting_time_unit` column (check constraint: minutes/hours/days, default days); RecipeEditor shows a unit selector next to the number input; list views display the correct singular/plural label

- [x] **Workshop: Import Starter Recipes button** — one-click import button in Workshop header (same pattern as Vault's Import SRD Items); inserts missing output items into the vault automatically, then creates 35 starter recipes across all 12 disciplines; skips existing recipes by name so re-runs are idempotent

- [x] **Workshop starter crafting materials** — added 20+ crafting material and provision items to mundaneGear.ts (Raw Meat, Raw Fish, Dry Wood, Iron/Silver Ore, Iron/Silver Ingot, Healing Herb, Salt, Raw Hide, Grain, Flour, Honey, Plant Fiber, Poison Herb, Flint, Charcoal, Coarse Stone, Clay, Hardwood, Brimstone, plus food/drink outputs); tagged 7 existing SRD items for tag-based recipe matching; Glassblower's Tools added to tinkering discipline, Cartographer's Tools added to scribing

- [x] **Vault: Provision item type** — added `provision` as a dedicated item type (with `UtensilsCrossed` icon) for all ready-to-consume food and drink; moved 10 items from `gear`/`trade_good` to `provision` (Rations, Ale, Mead, Fruit Brandy, Elven Ferment, Grilled Meat, Roast Meat, Smoked Meat, Grilled Fish, Pot of Stew); expanded crafting materials with sweetening agents (Syrup, Sugar), seasonal fruits (Summer Fruits, Autumn Fruits), and brewing bases (Wine Must, Neutral Spirit)

- [x] **Weapon mastery properties** — added all 8 2024 PHB weapon mastery properties (cleave, graze, nick, push, sap, slow, topple, vex) to `WEAPON_PROPERTIES` in `item.types.ts`; also fixed Combat tab to only show weapons (`item_type === "weapon"`), fixed equipping a stacked item (qty > 1) to split into an equipped qty-1 entry leaving the remainder in inventory, and added item detail access from the slot assignment modal

- [x] **Clone item** (irongollem/grimoire#80) — "Clone" button in the vault item editor duplicates the current item (appending " - Clone" to the name, clearing source fields) and navigates directly to the copy in edit mode via `router.replace`

- [x] **Inventory slot filtering & clothes slot** — added `clothes` equipment slot to the paper doll mannequin; slot candidates are filtered by type/tag per slot (body→armor type, ring→ring type, clothes/neck/hands/feet/head/shoulders/waist→tag or subtype match); custom items without a vault link are excluded from filtered slots (fall back to all items if nothing matches); mannequin silhouette turns pink and clothes slot button turns red when no clothes are equipped; DB migration adds `'clothes'` to the `inventory_slot` enum

- [x] **Coin purse UX improvements** — replaced per-coin +/- with an editable number input (optimistic, fire-and-forget save); added "Drop Coins to Chat" inline form that lets players enter a mixed-currency drop (validated against owned amounts, red border on over-limit), sends a single combined currency_drop chat message, and deducts the amounts from the wallet

- [x] **Loot tables: drop as chest in chat** (irongollem/grimoire#121, follow-up) — DMs can post a loot table into the campaign chat as a clickable chest. The Drop dialog rolls the table once, expands quantities into individual atoms (qty 2 → two atoms with the same item but distinct atom_id), rolls a `claims_total` from a dice expression (default `1`), and uploads optional chest art. The chest message renders inline in chat with a Claim button per atom. First-click-wins via the `claim_loot_chest_atom()` Postgres RPC (`migrations/20260414000012_loot_chest_message.sql`) which takes a `FOR UPDATE` row lock on `campaign_messages`, so concurrent clicks serialise — the second clicker on the last atom gets a clean "already claimed" / "chest empty" exception rather than silently double-counting. Claimed atoms log `{ atom_id, claimed_by_user_id, claimed_by_name, claimed_at }` so the chat history reads like a loot log. The claimer's linked party member receives the item in their backpack via the existing `useAddInventoryItem` flow.

- [x] **Item stacking — stack drops in chat, auto-stack in inventory, split stack** (irongollem/grimoire#126) — DM drops a quantity ≥1 to chat as a single entry showing remaining count; players see "Grab 1" and "Grab All" (or "Grab" for qty=1) + "To Stash"; count decrements live via `grab_item_drop` Postgres RPC (FOR UPDATE row lock prevents over-claiming); when qty hits 0 the entry shows "All claimed"; grabbing auto-stacks into an existing inventory row when the same `item_id` + carrier + container already exists; inventory rows with qty > 1 show a Scissors button to split the stack — prompts for how many to split off, decrements the original row and inserts a new one

- [x] **Pack / Bundle item type** — new `"pack"` item type with `bundle_items` JSONB column; packs added to inventory auto-expand: the pack row is `is_container=true` and each sub-item is inserted with `container_id` pointing back to it; `PlayerInventoryView` manual add and character-creation wizard both expand packs; `ItemDetailPanel` shows a Contents list; `ItemDetail` editor lets DMs build custom packs; 7 SRD adventure packs + Holy Symbol + Druidic Focus added to `gear.ts`; migration `20260422000004_add_bundle_items_to_items.sql`
