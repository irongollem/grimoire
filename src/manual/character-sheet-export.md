---
title: Character Sheet Export
section: Characters
section_order: 11
order: 5
summary: Export a printable PDF character sheet — clean or fully illustrated, front and back.
keywords: character sheet, export, pdf, print, page size, theme, illustrated, clean
---

The Character Sheet export (**Publish → Character Sheet** in the sidebar for the DM, `/character-sheet`; players reach the same tool from their own character sheet) generates a printable PDF from a party member's live record — stats, inventory, spells, and all — for the table or for sharing with a player. Because it pulls straight from the character's current data, the export always reflects the latest HP, inventory, and stats; there's nothing to keep in sync separately.

## Key ideas

| Term | Meaning |
| --- | --- |
| Clean mode | A single-page, CSS-themed sheet — five palettes |
| Illustrated mode | A two-page (front + back) sheet laid over fully painted plate art — five palettes |
| Boxes | A calibration overlay, preview-only, that outlines every field on the illustrated plate |

## Exporting a sheet (DM)

1. Go to **Publish → Character Sheet**.
2. Pick a character from the combobox at the top — the export tool isn't tied to a single party member.
3. Use the toolbar to choose your **Export style** (**Clean** or **Illustrated**), **Page size** (**A4** or **Letter**), and a **Theme**:
   - Clean themes: Default, Horror, Fairy & Whimsey, Adventure, Sumi-e.
   - Illustrated themes: Classic, Adventure, Gothic, Fairy, Sumi-e.
4. The live preview below the toolbar updates as you change any of these. Illustrated mode adds a **Boxes** toggle — preview-only, it outlines every overlay field against the plate art and never appears in the exported file.
5. Click **Export PDF**. The button reads "Generating PDF…" while it works.

Your mode, theme, and illustrated-theme choices are remembered per character (in your browser), so reopening the same character's export screen picks up where you left off.

## Exporting your own sheet (player)

From your own character sheet, the same export panel is available with the same controls — you're not shown a character picker since it's always your own linked character.

## What your players see

Players export their own character's sheet the same way the DM does — nobody else sees the export screen or the resulting file unless you share it.

## Tips

- Illustrated mode is two pages (front and back); Clean mode is one page.
- Switching page size (A4 ↔ Letter) re-lays the whole sheet — illustrated plates are re-rendered per size, not just scaled, so double-check the preview after switching.

## Related

- [Character Codex — Overview](#character-codex-overview)
- [Party Tracker](#party-tracker)
- [Hall of Heroes](#hall-of-heroes)
