# Where each glyph came from

Sheet names refer to files in the maintainer's local `art-src/` dump, which is
not in the repo. Add an entry every time a glyph is added or replaced.

## Nav (`nav`, `nav-assets`) — `art-src/nav-campaign/`

- `sheet 3 old.png`: the main 4×4 set; most glyphs come from here.
- `sheet 2.png`: 4×4; the **NPC** noble figure (cell 7).
- `note-lyre-library.png`: 3×1; **Soundboard** is the lyre (cell 1),
  **Reliquary** the library (cell 2).
- `campaign.png`: a single bold pennant (pole, bands, swallowtail flag) for the
  Campaign switcher's active-campaign icon, traced directly.
- `../interlude.png`: a single hourglass mid-pour for **Interlude**, which used
  to reuse the Calendar glyph; traced directly and added with `add`.
- `hearth-sheet.png`: five candidates for **Hearth**, the player dashboard
  (#977); the campfire (cell 0 of a 5×1 segment) is the one in use.
- `sessions sheet.png`: five candidates for **Sessions** (#985), supplied by the
  maintainer; the party around a table with a map and minis (cell 2 of a 5×1
  segment) is in use. The hourglass was rejected (Interlude has it), as were the
  calendar, map scroll and open book (Calendar, Atlas/quests, Journal).
- `hall of the fallen.png`: five candidates for the **Hall of the Fallen**
  (#982), supplied by the maintainer; the candle in a shrine (cell 3) is in use,
  as `fallen`. `segment` clips this sheet (the banner's rod caps fall across the
  gutters), so each cell was cropped on its real gutters:
  `magick "hall of the fallen.png" -crop 382x793+1194+0 +repage`. The tombstone
  was rejected (it says "dead", and the Hall honours the retired too), the banner
  collides with the Campaign pennant, and the tome with Reliquary and Journal.

## Crafting (`crafting`) — `art-src/crafting/`

`source-sheet.png`, 4×4. The 14 disciplines occupy cells 0–13 in the order of the
`CraftingDiscipline` union (`src/types/crafting.types.ts`): alchemy, smithing,
leathercraft, woodcraft, jewelcrafting, herbalism, poisoncraft, tinkering,
cooking, scribing, brewing, weaving, masonry, painting. Cells 14–15 are empty.

## Dice (`dice`) — `art-src/dice/`

`source-sheet.png`, 4×2: d2 (coin), d4, d6, d8, d10, d12, d20, d100 in cells 0–7.
Numerals are negative space and trace cleanly through potrace's even-odd fill.
The **d8** and **d100** in use come instead from `image.png`, an alternative set
whose dice sit in one bottom row of 8 (cleaner octahedron, circular percentile
die): `magick image.png -crop 1536x140+0+710 +repage _g.png`, then
`segment _g.png _work2 8 1`, cells 3 and 7.

## The AI table (`table`) — `art-src/table-voices/`

The three voice switches in the table's bar (#1021, 17 Nov 2026), from `voice-role-icons-sheet-2.png`: 3×5, a
column per switch (narrator, characters, the player's own character), five candidates each. `segment` saw one cell
on it, so each pick was cropped by hand from the sheet flattened onto white (about 420 wide and 249 tall per cell).

- `voiceNarrator`: column 1, row 1, the open book with sound waves. The quill and scroll reads as writing, the mask
  is the characters' own image, the candle and the bell say nothing of telling a story.
- `voiceCharacters`: column 2, row 1, a moustached man in a speech balloon: an ordinary someone else. The hooded
  figure, the devil and the knight each say one kind of person; the bearded elder (row 5) is close and lost on the
  balloon's tail being cut by the cell.
- `voicePlayer`: column 3, row 3, the hero's figure with sound waves, which pairs with the narrator's waves. Rows 1
  and 5 put the same figure in a balloon and frame, too like the characters' glyph at button size; the die (row 2)
  says rolling and the pawn (row 4) says moving a token.

The first sheet (`voice-role-icons-sheet.png`, same folder) was traced and replaced the same day: its characters
candidates were all two or three figures side by side, twice as wide as tall, and none survived at button size.

## Damage types (`svg`) — `art-src/damage-types/`

`source-sheet.png`, 4×4, row-major: acid, bludgeoning, cold, fire / force,
lightning, necrotic, piercing / poison, psychic, radiant, slashing / thunder, one
per `DamageType` in `src/types/damage.types.ts`. Cut on an even grid
(`magick source-sheet.png -crop 4x4@ +repage cell_%d.png`), traced without
`-threshold` and with `-t 12`, written with
`svg <traceDir> public/assets/damage-types <names…>`. In a zsh loop over a names
array use an explicit counter: zsh arrays are 1-indexed, so `${names[$i]}` with
`i=0` is empty and shifts every name.
