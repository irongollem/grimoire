// sheetConfig.a4.ts — INDEPENDENT A4 coordinate config.
// box = [left%, top%, width%, height%] of the A4 page box.
// Auto-extracted from the calibrated A4 mockups. Edit freely; this file shares
// nothing with the other page size, so tweaks here never affect that one.
import type { SizeConfig } from "./sheetTypes";

export const A4: SizeConfig = {
  classic: {
    front: {
      plate: "front-classic.png",
      fields: [
        { section: "name", box: [9.5, 7.4, 82.5, 4] },
        { section: "abilities", box: [7.6, 16.4, 19.4, 38.2] },
        { section: "ac", box: [30.6, 16.8, 9.6, 5.6] },
        { section: "init", box: [42.3, 15.9, 12.4, 5.6] },
        { section: "speed", box: [56.3, 15.7, 12, 5.6] },
        { section: "hp", box: [30.9, 28, 18.1, 7] },
        { section: "hitdice", box: [53.2, 28.3, 18, 7] },
        { section: "death", box: [31, 37.5, 36, 2.7] },
        { section: "portrait", box: [71.3, 12.9, 20.8, 23.4] },
        { section: "attacks", box: [31, 44.4, 61.1, 12.3] },
        {
          section: "skills",
          box: [7.6, 60.2, 19.4, 23],
          opts: { fontSize: 10 },
        },
        { section: "equipment", box: [30.1, 61.3, 26, 21.5] },
        { section: "features", box: [59.3, 61.1, 33.3, 21.5] },
        { section: "passperc", box: [12.9, 86.2, 3.8, 2.6] },
        { section: "profbonus", box: [13, 92, 3.8, 2.6] },
        { section: "notes", box: [30.2, 87.2, 61.5, 7] },
      ],
    },
    back: {
      plate: "back-classic.png",
      fields: [
        { section: "appearance", box: [6, 9, 27.5, 20.5], opts: { lines: 7 } },
        { section: "backstory", box: [35.5, 9, 31, 20.5], opts: { lines: 8 } },
        { section: "crest", box: [71.5, 8, 20.5, 21] },
        { section: "allies", box: [6, 36.5, 27.5, 21] },
        { section: "treasure", box: [35.5, 36.5, 31, 21] },
        { section: "personality", box: [71.2, 38, 20.6, 42.5] },
        { section: "spellnotes", box: [6, 65.4, 29, 15.2], opts: { lines: 6 } },
        { section: "quests", box: [37, 65.4, 30.5, 15.2] },
        { section: "generalnotes", box: [6, 86, 86, 7.6], opts: { lines: 3 } },
      ],
    },
  },
  adventure: {
    front: {
      plate: "front-adventure.png",
      fields: [
        { section: "name", box: [24.6, 8.3, 59.4, 3.7] },
        { section: "abilities", box: [10, 18.799999999999997, 19.4, 38.2] },
        { section: "ac", box: [33, 19.2, 9.6, 5.6] },
        { section: "init", box: [43, 19.2, 12.4, 5.6] },
        { section: "speed", box: [55.6, 19.2, 12, 5.6] },
        { section: "hp", box: [34.4, 30.5, 15, 7] },
        { section: "hitdice", box: [51.9, 29.8, 14, 7] },
        { section: "death", box: [31, 42, 36, 2.7] },
        { section: "portrait", box: [70.5, 17.5, 20.4, 22.9] },
        { section: "attacks", box: [33.5, 50, 54, 9.7] },
        {
          section: "skills",
          box: [10.5, 61.3, 19.4, 23],
          opts: { fontSize: 10 },
        },
        { section: "equipment", box: [30, 63.4, 26, 21.5] },
        { section: "features", box: [57.8, 63.4, 34, 21.5] },
        { section: "passperc", box: [18.4, 85.7, 3.8, 2.6] },
        { section: "profbonus", box: [18.7, 91.2, 3.8, 2.6] },
        { section: "notes", box: [33.7, 87.2, 46.3, 6.9] },
      ],
    },
    back: {
      plate: "back-adventure.png",
      fields: [
        { section: "appearance", box: [10, 9, 32, 19], opts: { lines: 8 } },
        { section: "backstory", box: [49, 12, 47, 16], opts: { lines: 8 } },
        { section: "personality", box: [9, 37, 43, 14.4], opts: { cols: 2 } },
        { section: "allies", box: [60, 37.5, 35.5, 13.5] },
        { section: "quests", box: [9, 56.5, 26, 13.5] },
        { section: "treasure", box: [39, 56.5, 28, 13.5] },
        {
          section: "spellnotes",
          box: [69, 56.5, 28, 13.5],
          opts: { lines: 5 },
        },
        { section: "travel", box: [9, 78.5, 44, 14], opts: { lines: 6 } },
        {
          section: "generalnotes",
          box: [58, 80.4, 39, 11.6],
          opts: { lines: 5 },
        },
      ],
    },
  },
  gothic: {
    front: {
      plate: "front-gothic.png",
      fields: [
        // Gothic's plate is NOT on the shared front grid — every panel sits
        // lower and larger than classic's. Calibrated per-section by eye.
        { section: "name", box: [18, 7.4, 70, 4.2] },
        { section: "abilities", box: [7.7, 18, 19.2, 38.4] },
        { section: "ac", box: [29.1, 19.2, 9.8, 6.2] },
        { section: "init", box: [40.6, 17.5, 12.4, 7] },
        { section: "speed", box: [54.5, 17.5, 12, 7] },
        { section: "hp", box: [30.6, 29.8, 17.6, 6.2] },
        { section: "hitdice", box: [51.2, 29, 14, 6.2] },
        { section: "death", box: [28.5, 41.7, 36, 2.6] },
        { section: "portrait", box: [71.3, 15.5, 20, 24.3] },
        { section: "attacks", box: [31.5, 51, 60, 7.5] },
        {
          section: "skills",
          box: [7.6, 62.8, 19.4, 20.4],
          opts: { fontSize: 9 },
        },
        { section: "equipment", box: [30.2, 66.3, 25.6, 16.5] },
        { section: "features", box: [58.2, 66.3, 33, 16.5] },
        // no blank slot on this plate — the value sits on the skull's forehead
        { section: "passperc", box: [22.1, 83.7, 4.8, 2.6] },
        { section: "profbonus", box: [22.1, 89.0, 4.8, 2.6] },
        { section: "notes", box: [30.2, 87.6, 61.5, 5.8] },
      ],
    },
    back: {
      plate: "back-gothic.png",
      fields: [
        {
          section: "appearance",
          box: [14.5, 13.5, 15.5, 15.5],
          opts: { lines: 8 },
        },
        { section: "backstory", box: [41, 8, 50, 16], opts: { lines: 6 } },
        { section: "personality", box: [41, 28.6, 50, 13], opts: { cols: 2 } },
        { section: "secrets", box: [10, 45.6, 22, 11.5], opts: { lines: 6 } },
        { section: "allies", box: [33.5, 45.6, 37, 11.5] },
        { section: "treasure", box: [10, 64, 25, 13.5] },
        {
          section: "spellnotes",
          box: [38.5, 64, 28, 13.5],
          opts: { lines: 6 },
        },
        { section: "quests", box: [7, 81, 49, 12] },
        { section: "generalnotes", box: [59, 81, 33, 12], opts: { lines: 4 } },
      ],
    },
  },
  fairy: {
    front: {
      plate: "front-fairy.png",
      fields: [
        // Fairy's plate also deviates from the classic grid: its attacks
        // heading is painted mid-panel, section headings sit lower, and there
        // is no heart glyph (the temp caption shows instead).
        { section: "name", box: [14, 7.4, 47, 4.2] },
        { section: "abilities", box: [7.6, 16.4, 19.4, 38.2] },
        { section: "ac", box: [32, 18.6, 9.6, 6] },
        { section: "init", box: [41.6, 16.8, 12.4, 5.6] },
        { section: "speed", box: [55.6, 16.8, 12, 5.6] },
        { section: "hp", box: [30.6, 27.4, 17.6, 7] },
        { section: "hitdice", box: [49.4, 27.4, 18, 7] },
        { section: "death", box: [31, 41.3, 36, 2.7] },
        { section: "portrait", box: [71.4, 13.4, 20.2, 22.8] },
        { section: "attacks", box: [31, 48.5, 61, 6.6], opts: { tight: true } },
        {
          section: "skills",
          box: [7.6, 62.4, 19.4, 20.4],
          opts: { fontSize: 9 },
        },
        { section: "equipment", box: [30.4, 65.6, 25.2, 16.8] },
        { section: "features", box: [58.4, 65.6, 32.6, 16.8] },
        { section: "passperc", box: [19.6, 84.6, 4.2, 2.6] },
        { section: "profbonus", box: [19.6, 89.7, 4.2, 2.6] },
        { section: "notes", box: [30.2, 87.2, 61.5, 7] },
      ],
    },
    back: {
      plate: "back-fairy.png",
      fields: [
        {
          section: "appearance",
          box: [11.5, 17.5, 20.5, 16],
          opts: { lines: 7 },
        },
        { section: "backstory", box: [41, 13, 32, 25], opts: { lines: 11 } },
        { section: "pTraits", box: [78.8, 12.7, 17, 7.6], opts: { lines: 5 } },
        { section: "pIdeals", box: [78.8, 24.9, 17, 5.8], opts: { lines: 4 } },
        { section: "pBonds", box: [78.8, 36.7, 17, 6.2], opts: { lines: 4 } },
        { section: "pFlaws", box: [78.8, 49.2, 17, 8], opts: { lines: 5 } },
        { section: "allies", box: [7, 45.5, 29, 11.5] },
        { section: "treasure", box: [40, 45.5, 30, 11.5] },
        { section: "spellnotes", box: [7, 63, 90, 6.5], opts: { lines: 3 } },
        { section: "quests", box: [7, 77, 43, 18] },
        { section: "generalnotes", box: [53, 77, 44, 18], opts: { lines: 6 } },
      ],
    },
  },
  sumie: {
    front: {
      plate: "front-sumie.png",
      fields: [
        { section: "name", box: [24, 9, 42, 4] },
        { section: "abilities", box: [9.5, 17.6, 17.6, 36.5] },
        { section: "ac", box: [30, 21.2, 9.6, 5.4] },
        { section: "init", box: [40.8, 19.5, 12.2, 5.6] },
        { section: "speed", box: [54.8, 18.6, 12.2, 6] },
        { section: "hp", box: [30, 31, 17.8, 6.2] },
        { section: "hitdice", box: [49.4, 31, 17.6, 6.2] },
        { section: "death", box: [31, 43.4, 36, 2.7] },
        { section: "portrait", box: [66.3, 17.2, 25.4, 27] },
        { section: "attacks", box: [31, 53, 61, 6.2] },
        {
          section: "skills",
          box: [9.5, 63.6, 17.6, 16.4],
          opts: { fontSize: 8, tight: true },
        },
        { section: "equipment", box: [30, 67.6, 26, 16.8] },
        { section: "features", box: [58, 67.6, 34, 16.8] },
        { section: "passperc", box: [20, 82, 7.2, 3] },
        { section: "profbonus", box: [20, 87.4, 7.2, 3] },
        { section: "notes", box: [30, 89, 61, 5.6] },
      ],
    },
    back: {
      plate: "back-sumie.png",
      fields: [
        {
          section: "appearance",
          box: [9.8, 9.5, 27.5, 21],
          opts: { lines: 8 },
        },
        { section: "backstory", box: [44, 9, 25, 12], opts: { lines: 6 } },
        { section: "pTraits", box: [7, 42.8, 19.5, 7], opts: { lines: 3 } },
        { section: "pIdeals", box: [29.5, 42.8, 21, 7], opts: { lines: 3 } },
        { section: "pBonds", box: [54, 42.8, 21, 7], opts: { lines: 3 } },
        { section: "pFlaws", box: [78, 42.8, 18, 7], opts: { lines: 3 } },
        { section: "treasure", box: [8, 56, 40, 16.5] },
        { section: "spellnotes", box: [55, 56, 42, 16.5], opts: { lines: 7 } },
        { section: "quests", box: [8, 80, 41, 16] },
        { section: "generalnotes", box: [55, 80, 42, 16], opts: { lines: 7 } },
      ],
    },
  },
};
