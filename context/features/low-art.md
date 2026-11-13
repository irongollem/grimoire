# Low art

A viewer's switch that sets every catalogue card, row and sheet for text instead of a picture (#1179). It is for the DM who does not want our AI art and will not upload a thousand pictures either, and so has a library that renders the same placeholder everywhere. It is about placeholders, not bandwidth (the maintainer, 12 Nov 2026).

The design is the canvas *Low Art* (claude.ai artifact `GXaub9rsfwNyGzGc1SxeXn`, frames `01 Delta` to `07 Switch and loading`), approved 13 Nov 2026. Issue #1179 holds the decisions. Read both before changing anything here.

## The switch

- `useLowArt()` (`src/composables/useLowArt.ts`, a root composable) returns `lowArt` and `setLowArt`. It is kept per device in `localStorage` (`grimoire_low_art`), like the AI-label switch, and is off by default.
- `LOW_ART_OVERRIDE` (an injection key in the same module) forces it on or off for one subtree without touching the viewer's stored choice. `/dev/components` uses it so its Low art section shows the art-free forms. Do not flip the stored switch from a page: a tab closed while it was flipped leaves it flipped.
- It is set in the **Pictures** section (`src/components/account/PicturesSetting.vue`, formerly `AiLabelsSetting`). That section sits on the account page and on the player settings page, beside *Show AI labels*. *Hide AI art* (#1178) joins it there.
- **Low art opens on rows.** `useListLayout` returns `rows` for a list the viewer has never set while low art is on. A stored choice always wins.

## What counts

**Hidden (art of a record):**
- portraits of NPCs, heroes, party members and companions;
- the art of monsters, spells, items and recipes;
- a place's picture, a faction's or pantheon's emblem, a deity's portrait and symbol;
- the art of species, classes and backgrounds;
- the art of Dungeon Craft features, traps and puzzles.

These are hidden on DM pages and in the player portal alike.

**Untouched (frame 06), because each surface *is* its picture and has no placeholder to replace:**
- battle maps, the Table and Play screens, and tokens;
- Book Nook;
- handouts and Scriptorium books, with their pictures;
- the gallery and minis;
- printed artefacts (Card Forge, the exported character sheet);
- the combat runner's combatant portraits;
- the world web's nodes;
- the picture in an editor's upload block, so a DM still sees what they upload.

## The gate

`FocalImage`'s `record` prop marks a picture as belonging to a record. With low art on, such a picture paints nothing and requests nothing: no `<img>`, no placeholder, no `AiImageBadge` (whose provenance lookup is a request), and no focal analysis. The root element stays, so layout classes still apply.

**The gate is opt-in on purpose.** A surface that is its picture never sets `record`, so a missed opt-in leaves a picture showing rather than blanking a map. A raw `<img>` of a record's picture is gated on `useLowArt()` directly.

A record's FocalImage always carries `record`, even where a `v-if` on low art already removes it: the prop is what marks the picture as a record's, and #1178 reads the same gate. The `v-if` is added only when the frame around the picture must go too.

Wherever a picture sat in a fixed tile, low art must not leave an empty box. The site uses its existing initials or icon fallback, or drops the tile so the name leads.

#1178 (Hide AI art) adds its AI-provenance condition to the same computed in FocalImage. It does not get a second mechanism.

## The layouts

**Card (frame 02).** `EntityGridCard` with its plate off. The art-free state is `!plate || lowArt`, and every slot receives `artFree`. Art-free, the card:
- draws an eyebrow (the kind) with the quill and reveal eye at its right end;
- draws the title itself, in the reading face, with the status diamond;
- then the list's `#body` lines, which skip their own title when `artFree`;
- and a foot holding `#foot` (tags, source) on the left and the long-word label (relationship, setting) on the right.

Short, well-known values hang in a `BookmarkTab`: CR, spell level, rarity letters (C U R VR L A, M for mundane), and alignment (LG … CE). `#image-footer` is never drawn, and `#image-overlay` (a player's Learn) moves into the foot.

A feat or an archetype is a card whose plate is always off (`plate=false`), so there is one art-free card, not two. `EntityTextCard` is gone. Archetypes no longer borrow their class's picture.

**Rows (frame 03).** A list opts in by passing `ledger` (column labels and tracks) to `EntityCollection`. **That prop is the list's opt-in to low art as a whole.** With it:
- rows become one sheet with column heads and 40 px dotted lines (estimate 41), and `EntityListRow` fills `cells`, where a cell may be a tab;
- the grid uses auto-fill columns at 14.5rem with an estimate of 130 (`ART_FREE_CARD_PX`); a list whose cards carry more passes `artFreeRowEstimate` (the NPC list, 150).

Without `ledger`, a list (notes, sessions, minis, Book Nook, Scriptorium) behaves exactly as before. Below 64rem a ledger line folds into two lines.

**Sheet (frame 04).** The portrait column goes. What sat under it becomes a `SheetFactLine` under the header, and the text takes the width.
- A record with a picture of its own (never a placeholder) gets a dashed `PortraitOnRequest` button. It opens the lightbox and only then fetches the picture.
- The phone sheet (`EntitySheetMobile`) loses its hero and shows the name in the bar from the start.

**Phone (frame 05).**
- `EntityMobileCard`'s low-art row is three lines with no tile (73 px).
- Its grid card is 88 px: eyebrow, a two-line name, a stat line and the tab.
- `EntityMobileGrid` carries the estimates.

**Loading (frame 07).** `ListSkeleton` has four low-art variants:
- `entries` (the art-free card grid) and `ledger` on desktop;
- `rows-text` and `cards-text` on a phone.

A portrait-shaped shimmer on a low-art page is a promise the page breaks.

The estimates were measured in the running app on 13 Nov 2026, not taken from the canvas: the card 129 to 131 (130; NPCs 147 to 167, 150), the ledger line 41, the phone row 73 (the canvas guessed 62), the phone card 88. Measure again before changing them.

## Data

`browse_items` returns `requires_attunement` (`20261113004224`), because the Item Vault's art-free card and its ledger name attunement.
