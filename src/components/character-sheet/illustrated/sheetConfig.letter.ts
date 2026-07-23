// sheetConfig.letter.ts — INDEPENDENT Letter coordinate config.
// ⚠️ SEEDED AS A COPY OF A4 — the box positions still need a calibration pass
// against the Letter plates (different aspect ratio). Nudge by eye using the
// mockup's "Boxes" outline view. Editing this file never affects A4.
import type { SizeConfig } from "./sheetTypes";

export const LETTER: SizeConfig = {
  classic: {
    front: {
      plate: "front-classic.png",
      fields: [
        // Letter plates are re-rendered at 816x1056 — panels sit higher and
        // wider than A4's. Calibrated per-section by eye, like A4.
        { section: "name", box: [9.5, 6.9, 50, 3.9] },
        { section: "abilities", box: [7.6, 13.3, 19.4, 40.5] },
        { section: "ac", box: [30.6, 14.2, 9.6, 7.4] },
        { section: "init", box: [41.6, 14.9, 12.4, 6.2] },
        { section: "speed", box: [55.6, 14.9, 12, 6.2] },
        { section: "hp", box: [31.4, 26.2, 17.2, 7] },
        { section: "hitdice", box: [49.4, 26.2, 18, 7] },
        { section: "death", box: [31, 37.8, 36, 2.2] },
        { section: "portrait", box: [71.3, 12.6, 20.4, 22.9] },
        { section: "attacks", box: [31, 45.9, 61, 12.5] },
        { section: "skills", box: [7.6, 60.4, 19.4, 23], opts: { fontSize: 10 } },
        { section: "equipment", box: [30, 63.4, 26, 18.9] },
        { section: "features", box: [57.8, 63.4, 34, 18.9] },
        { section: "passperc", box: [20.4, 85.4, 3.2, 2.4] },
        { section: "profbonus", box: [20.4, 90.6, 3.2, 2.4] },
        { section: "notes", box: [30.2, 86.8, 61.5, 8.3] },
      ],
    },
    back: {
      plate: "back-classic.png",
      fields: [
        { section: "appearance", box: [6, 9, 27.5, 21], opts: { lines: 8 } },
        { section: "backstory", box: [35.5, 9, 31, 21], opts: { lines: 8 } },
        { section: "crest", box: [71.5, 7.5, 20.5, 21.5] },
        { section: "allies", box: [6, 37.9, 27.5, 21] },
        { section: "treasure", box: [35.5, 37.9, 31, 21] },
        { section: "personality", box: [71, 40.5, 21, 39] },
        { section: "spellnotes", box: [6, 67.3, 29, 13], opts: { lines: 6 } },
        { section: "quests", box: [37, 67.3, 30.5, 13] },
        { section: "generalnotes", box: [6, 85.8, 86, 8], opts: { lines: 3 } },
      ],
    },
  },
  adventure: {
    front: {
      plate: "front-adventure.png",
      fields: [
        // Adventure letter plate — own geometry; painted stamps top-right and
        // journal art bottom-right constrain the text boxes.
        { section: "name", box: [27, 8.8, 45, 3.4] },
        { section: "abilities", box: [10, 19.3, 19.4, 37.6] },
        { section: "ac", box: [33.8, 21.2, 9.6, 5.6] },
        { section: "init", box: [44, 21, 11, 5.8] },
        { section: "speed", box: [56.6, 21, 11, 5.8] },
        { section: "hp", box: [33.5, 30.8, 15.5, 7] },
        { section: "hitdice", box: [53, 30.8, 14.5, 7] },
        { section: "death", box: [32.2, 45.7, 33, 2] },
        { section: "portrait", box: [70.7, 14.2, 20.6, 31] },
        { section: "attacks", box: [33, 53.2, 55, 8.2] },
        { section: "skills", box: [8, 64, 19, 20], opts: { fontSize: 9, tight: true } },
        { section: "equipment", box: [31, 68.7, 25, 15.5] },
        { section: "features", box: [59, 68.7, 32, 15.5] },
        { section: "passperc", box: [25.4, 85.6, 3.2, 2.9] },
        { section: "profbonus", box: [24.8, 91.3, 3.6, 2.9] },
        { section: "notes", box: [32.8, 88, 58, 7], opts: { lines: 3 } },
      ],
    },
    back: {
      plate: "back-adventure.png",
      fields: [
        { section: "appearance", box: [10, 9, 32, 19], opts: { lines: 8 } },
        // top clears the painted ADVENTURE stamp overlapping the panel's first lines
        { section: "backstory", box: [49, 12.4, 46, 15], opts: { lines: 7 } },
        { section: "personality", box: [9.8, 37.4, 42, 13.6], opts: { cols: 2 } },
        { section: "allies", box: [60, 37, 34.5, 13.8] },
        { section: "quests", box: [9, 56.5, 26, 13.5] },
        { section: "treasure", box: [39, 56.5, 28, 13.5] },
        { section: "spellnotes", box: [69, 56.5, 28, 13.5], opts: { lines: 5 } },
        { section: "travel", box: [9, 78.5, 44, 14], opts: { lines: 6 } },
        // below the WANDERER stamp; compass art caps the line count
        { section: "generalnotes", box: [58, 82.4, 27.5, 9], opts: { lines: 4 } },
      ],
    },
  },
  gothic: {
    front: {
      plate: "front-gothic.png",
      fields: [
        // Gothic letter plate — own geometry, calibrated by eye.
        { section: "name", box: [17.5, 8.2, 60, 4] },
        { section: "abilities", box: [7.7, 18.9, 19.2, 38.8] },
        { section: "ac", box: [30.5, 21, 9.6, 6.8] },
        { section: "init", box: [41.3, 19.9, 12.2, 6.2] },
        { section: "speed", box: [55.0, 19.9, 12.2, 6.2] },
        { section: "hp", box: [30.5, 32.2, 17, 6.8] },
        { section: "hitdice", box: [51.5, 32.2, 15.5, 6.8] },
        { section: "death", box: [30.5, 47.3, 34, 2.5] },
        { section: "portrait", box: [70.8, 11.8, 20.8, 30.8] },
        { section: "attacks", box: [31, 54.7, 60, 7.3] },
        { section: "skills", box: [7.8, 64.8, 19, 18.2], opts: { fontSize: 9 } },
        { section: "equipment", box: [30.3, 69.8, 25.4, 13] },
        { section: "features", box: [58.5, 69.8, 32.5, 13] },
        // value sits on the skull glyph (no blank slot on this plate)
        { section: "passperc", box: [22.0, 85.6, 4.6, 2.2] },
        { section: "profbonus", box: [22.0, 91.0, 4.6, 2.2] },
        { section: "notes", box: [30.3, 88, 61, 7] },
      ],
    },
    back: {
      plate: "back-gothic.png",
      fields: [
        { section: "appearance", box: [14.2, 12.3, 16, 17], opts: { lines: 9 } },
        { section: "backstory", box: [41, 8.5, 50, 15], opts: { lines: 6 } },
        { section: "personality", box: [41, 30.4, 50, 12.6], opts: { cols: 2 } },
        { section: "secrets", box: [10, 47.3, 22, 10.5], opts: { lines: 6 } },
        { section: "allies", box: [34.5, 47.9, 36, 10] },
        { section: "treasure", box: [10, 66.8, 25, 11] },
        { section: "spellnotes", box: [38.5, 66.8, 28, 11], opts: { lines: 6 } },
        { section: "quests", box: [7, 84.5, 49, 8.6] },
        { section: "generalnotes", box: [59, 84.5, 31, 8], opts: { lines: 4 } },
      ],
    },
  },
  fairy: {
    front: {
      plate: "front-fairy.png",
      fields: [
        // Fairy letter plate — attacks/equipment headings painted mid-panel,
        // no heart glyph (temp caption shows), rounder arch.
        { section: "name", box: [14, 7.4, 47, 4] },
        { section: "abilities", box: [8, 18.5, 19, 36.5] },
        { section: "ac", box: [31.6, 19.3, 9.6, 5.6] },
        { section: "init", box: [43.9, 19, 11, 5.2] },
        { section: "speed", box: [56.4, 19, 11, 5.2] },
        { section: "hp", box: [32.8, 28.2, 15.4, 7.2] },
        { section: "hitdice", box: [51, 28.2, 15.5, 7.2] },
        { section: "death", box: [32.2, 43.8, 33, 2] },
        { section: "portrait", box: [70.3, 11.8, 20.6, 25.4] },
        { section: "attacks", box: [31.6, 52.7, 60, 6.6], opts: { tight: true } },
        { section: "skills", box: [8, 66.3, 19, 16.6], opts: { fontSize: 9, tight: true } },
        { section: "equipment", box: [30.4, 70.2, 25.6, 13.2] },
        { section: "features", box: [59, 70.2, 33, 13.2] },
        { section: "passperc", box: [20.2, 83.6, 3.4, 2.4] },
        { section: "profbonus", box: [19.8, 89, 3.4, 2.4] },
        { section: "notes", box: [30.4, 89.5, 61, 5.8] },
      ],
    },
    back: {
      plate: "back-fairy.png",
      fields: [
        { section: "appearance", box: [11.8, 14.5, 19.6, 17], opts: { lines: 8 } },
        { section: "backstory", box: [41.5, 13, 31.5, 24], opts: { lines: 11 } },
        { section: "pTraits", box: [78.8, 14, 17, 6.5], opts: { lines: 4 } },
        { section: "pIdeals", box: [78.8, 27.9, 17, 6.5], opts: { lines: 4 } },
        { section: "pBonds", box: [78.8, 40.5, 17, 8], opts: { lines: 5 } },
        { section: "pFlaws", box: [78.8, 54.7, 17, 7], opts: { lines: 4 } },
        { section: "allies", box: [8, 49.5, 28, 10] },
        { section: "treasure", box: [42.5, 49.5, 27.5, 10] },
        { section: "spellnotes", box: [7, 69.2, 90, 6.2], opts: { lines: 3 } },
        { section: "quests", box: [7, 81.5, 43, 12.5] },
        { section: "generalnotes", box: [53, 81.5, 31.5, 11], opts: { lines: 6 } },
      ],
    },
  },
  sumie: {
    front: {
      plate: "front-sumie.png",
      fields: [
        // Sumi-e letter plate — banners painted mid-panel; values live inside
        // the ink enso circles where the art provides them.
        { section: "name", box: [27, 9.4, 40, 3.8] },
        { section: "abilities", box: [10.2, 19.3, 17.5, 34] },
        { section: "ac", box: [31, 20.7, 9.6, 5.2] },
        { section: "init", box: [42.9, 21.2, 11, 5.4] },
        { section: "speed", box: [54.8, 20.3, 11, 5.2] },
        { section: "hp", box: [31.6, 32.8, 17, 6.4] },
        { section: "hitdice", box: [53, 32.8, 13, 6.4] },
        { section: "death", box: [31.6, 43.6, 33, 2.2] },
        { section: "portrait", box: [66.5, 18, 25.2, 25] },
        { section: "attacks", box: [31.4, 57.5, 59, 5.4], opts: { tight: true } },
        { section: "skills", box: [9.8, 68.3, 17.6, 15.2], opts: { fontSize: 8, tight: true } },
        { section: "equipment", box: [30.6, 74, 25.4, 11.4] },
        { section: "features", box: [59.5, 74, 32, 11.4] },
        { section: "passperc", box: [20.6, 85.6, 6, 3] },
        { section: "profbonus", box: [20.6, 91, 6, 3] },
        { section: "notes", box: [31, 92, 60, 4.4] },
      ],
    },
    back: {
      plate: "back-sumie.png",
      fields: [
        { section: "appearance", box: [9.6, 9, 27, 21], opts: { lines: 8 } },
        { section: "backstory", box: [44, 9, 25, 12], opts: { lines: 6 } },
        { section: "pTraits", box: [7.5, 42.8, 19, 7], opts: { lines: 3 } },
        { section: "pIdeals", box: [29.5, 42.8, 21, 7], opts: { lines: 3 } },
        { section: "pBonds", box: [54, 42.8, 21, 7], opts: { lines: 3 } },
        { section: "pFlaws", box: [78, 42.8, 18, 7], opts: { lines: 3 } },
        { section: "treasure", box: [8.5, 58, 39, 13.4] },
        { section: "spellnotes", box: [56, 58, 40, 15], opts: { lines: 7 } },
        { section: "quests", box: [8.5, 83, 40, 12] },
        // wave art floods the panel's lower half — clamp before it
        { section: "generalnotes", box: [55.5, 83, 40, 11], opts: { lines: 4 } },
      ],
    },
  },
};
