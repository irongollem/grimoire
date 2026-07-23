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
        { section: "name", box: [9.5, 6.9, 50, 3.9] },
        { section: "abilities", box: [7.6, 13.3, 19.4, 40.5] },
        { section: "ac", box: [31.1, 14.4, 9.6, 7.4] },
        { section: "init", box: [43.1, 13.6, 12.4, 6.2] },
        { section: "speed", box: [57.1, 13.6, 11, 6.2] },
        { section: "hp", box: [31.4, 26.2, 17.2, 7] },
        { section: "hitdice", box: [51.9, 26.2, 14.8, 7] },
        { section: "death", box: [31, 37.8, 36, 2.2] },
        { section: "portrait", box: [71.3, 12.6, 20.4, 22.9] },
        { section: "attacks", box: [31.4, 45.9, 61, 12.5] },
        {
          section: "skills",
          box: [7.7, 59.8, 19.2, 23.7],
          opts: { fontSize: 10 },
        },
        { section: "equipment", box: [30.8, 63.1, 26, 18.9] },
        { section: "features", box: [59.6, 63.4, 34, 18.9] },
        { section: "passperc", box: [13.3, 86.1, 3.2, 2.4] },
        { section: "profbonus", box: [13.3, 92, 3.2, 2.4] },
        { section: "notes", box: [30.7, 86.8, 61.5, 8.3] },
      ],
    },
    back: {
      plate: "back-classic.png",
      fields: [
        { section: "appearance", box: [8, 8.9, 26, 22.5] },
        { section: "backstory", box: [36.9, 9, 32, 22.6] },
        { section: "crest", box: [71.5, 7.5, 20.5, 21.5] },
        { section: "allies", box: [8.3, 37.4, 25.9, 23.4] },
        { section: "treasure", box: [36.9, 37.7, 31.7, 23.3] },
        { section: "personality", box: [71.4, 40.3, 21, 39] },
        {
          section: "spellnotes",
          box: [8.1, 66.9, 27.6, 13.1],
        },
        { section: "quests", box: [38.3, 67, 30.5, 13] },
        {
          section: "generalnotes",
          box: [8.2, 85.1, 84, 9.6],
        },
      ],
    },
  },
  adventure: {
    front: {
      plate: "front-adventure.png",
      fields: [
        { section: "name", box: [27, 8.8, 56.4, 3.6] },
        { section: "abilities", box: [10, 19.3, 19.5, 39.3] },
        { section: "ac", box: [33.2, 20.4, 9.6, 5.6] },
        { section: "init", box: [45, 20.5, 10, 5.7] },
        { section: "speed", box: [57.3, 20.6, 8.7, 5.8] },
        { section: "hp", box: [34.6, 31.7, 15.5, 7] },
        { section: "hitdice", box: [52.4, 31.4, 13.3, 7.1] },
        { section: "death", box: [32.6, 44.3, 33, 2] },
        { section: "portrait", box: [70.7, 16.6, 20.7, 26.6] },
        { section: "attacks", box: [34, 53.2, 53.2, 9] },
        {
          section: "skills",
          box: [11.5, 64.5, 19, 20],
          opts: { fontSize: 9, tight: true },
        },
        { section: "equipment", box: [33.7, 68.2, 22.6, 15.2] },
        { section: "features", box: [59, 68.7, 27.3, 14.4] },
        { section: "passperc", box: [18.7, 85.7, 3.2, 2.9] },
        { section: "profbonus", box: [18.3, 91.6, 3.6, 2.9] },
        { section: "notes", box: [32.8, 88, 44.7, 7] },
      ],
    },
    back: {
      plate: "back-adventure.png",
      fields: [
        { section: "appearance", box: [10, 9, 36.2, 22.3] },
        { section: "backstory", box: [51, 11.7, 42, 21.3] },
        {
          section: "personality",
          box: [10.2, 37.1, 46.9, 15.2],
          opts: { cols: 2 },
        },
        { section: "allies", box: [60, 37, 33.4, 14.9] },
        { section: "quests", box: [9, 56.5, 24.8, 17] },
        { section: "treasure", box: [37.1, 57.2, 24.8, 15.4] },
        {
          section: "spellnotes",
          box: [65.9, 57.3, 27.1, 15.6],
        },
        {
          section: "travel",
          box: [19.2, 78.5, 33.7, 17.2],
        },
        {
          section: "generalnotes",
          box: [56.7, 79.2, 26.3, 16.2],
          opts: { lines: 4 },
        },
      ],
    },
  },
  gothic: {
    front: {
      plate: "front-gothic.png",
      fields: [
        { section: "name", box: [17.5, 8.2, 60, 4] },
        { section: "abilities", box: [7.7, 18.9, 18.4, 40.1] },
        { section: "ac", box: [29.4, 20.6, 9.6, 6.8] },
        { section: "init", box: [41.9, 19.2, 11.3, 5.9] },
        { section: "speed", box: [55.3, 19.1, 10.6, 6.2] },
        { section: "hp", box: [31.2, 33.6, 17, 6.8] },
        { section: "hitdice", box: [51.5, 32.2, 14.5, 8.7] },
        { section: "death", box: [30.5, 47.3, 34, 2.5] },
        { section: "portrait", box: [70.8, 11.8, 20.8, 30.8] },
        { section: "attacks", box: [29.7, 54.3, 62.9, 8.9] },
        {
          section: "skills",
          box: [7.4, 64.9, 18.9, 22.1],
          opts: { fontSize: 9 },
        },
        { section: "equipment", box: [29.3, 68.4, 27.5, 14.6] },
        { section: "features", box: [59.7, 68.5, 32.9, 14.3] },
        { section: "passperc", box: [21.9, 84.9, 4.6, 2.2] },
        { section: "profbonus", box: [21.7, 90.4, 4.6, 2.2] },
        { section: "notes", box: [30.3, 88, 61, 7] },
      ],
    },
    back: {
      plate: "back-gothic.png",
      fields: [
        {
          section: "appearance",
          box: [16.8, 13.3, 15.1, 17],
          opts: { lines: 9 },
        },
        { section: "backstory", box: [42, 8.4, 50, 15] },
        {
          section: "personality",
          box: [42.1, 29.2, 50.1, 14.3],
          opts: { cols: 2 },
        },
        {
          section: "secrets",
          box: [7.6, 46.8, 24.3, 15.7],
        },
        { section: "allies", box: [35.4, 47.8, 33.5, 14.6] },
        { section: "treasure", box: [10, 66.8, 25, 11] },
        {
          section: "spellnotes",
          box: [39.5, 67.1, 28, 12.7],
        },
        { section: "quests", box: [7, 84.5, 44, 9.8] },
        {
          section: "generalnotes",
          box: [54.2, 84.3, 36.1, 10.1],
        },
      ],
    },
  },
  fairy: {
    front: {
      plate: "front-fairy.png",
      fields: [
        { section: "name", box: [14, 7.4, 76.8, 4.3] },
        { section: "abilities", box: [8, 18.5, 18.9, 40.9] },
        { section: "ac", box: [31.6, 19.3, 10.2, 5.5] },
        { section: "init", box: [44.8, 18.2, 10.5, 4.8] },
        { section: "speed", box: [57.5, 18.2, 8.9, 4.7] },
        { section: "hp", box: [32.5, 30.9, 15.4, 7.2] },
        { section: "hitdice", box: [51.6, 30.7, 13.9, 7.8] },
        { section: "death", box: [32.2, 43.8, 33, 2] },
        { section: "portrait", box: [71.8, 14.6, 20.9, 22.8] },
        {
          section: "attacks",
          box: [31.6, 52.7, 62, 11.8],
          opts: { tight: true },
        },
        {
          section: "skills",
          box: [8, 66.3, 19, 16.6],
          opts: { fontSize: 9, tight: true },
        },
        { section: "equipment", box: [31.2, 70.3, 25.2, 14.2] },
        { section: "features", box: [59, 70.2, 34.6, 14.7] },
        { section: "passperc", box: [21.5, 83.2, 3.4, 2.4] },
        { section: "profbonus", box: [21.4, 88.6, 3.4, 2.4] },
        { section: "notes", box: [31.8, 89.4, 60.8, 5.2] },
      ],
    },
    back: {
      plate: "back-fairy.png",
      fields: [
        {
          section: "appearance",
          box: [13.1, 18, 19.7, 18.3],
          opts: { lines: 8 },
        },
        {
          section: "backstory",
          box: [41.6, 12.8, 32.6, 27.8],
        },
        { section: "pTraits", box: [79, 13.6, 18.6, 8.5] },
        { section: "pIdeals", box: [79, 27.2, 18.8, 7.6] },
        { section: "pBonds", box: [78.8, 39.3, 18.8, 9] },
        { section: "pFlaws", box: [78.8, 53.7, 18.9, 8.8] },
        { section: "allies", box: [8, 49.5, 31.1, 12.7] },
        { section: "treasure", box: [42.6, 49.3, 31.8, 13.4] },
        {
          section: "spellnotes",
          box: [7.7, 69.2, 90, 6.2],
        },
        { section: "quests", box: [7, 81.5, 43, 12.5] },
        {
          section: "generalnotes",
          box: [53.2, 81.1, 39.8, 13.3],
          opts: { lines: 6 },
        },
      ],
    },
  },
  sumie: {
    front: {
      plate: "front-sumie.png",
      fields: [
        { section: "name", box: [28.5, 9.2, 57.4, 3.7] },
        { section: "abilities", box: [9.8, 20.7, 17.1, 42] },
        { section: "ac", box: [31.3, 21.7, 9.6, 5.2] },
        { section: "init", box: [42.9, 21.2, 10.1, 4.5] },
        { section: "speed", box: [55.3, 20.7, 11, 5.2] },
        { section: "hp", box: [32.7, 35, 17, 6.4] },
        { section: "hitdice", box: [53, 32.8, 12.8, 9.8] },
        { section: "death", box: [31.7, 47.8, 33, 2.2] },
        { section: "portrait", box: [71.2, 18.9, 19.6, 28.4] },
        {
          section: "attacks",
          box: [31.4, 57.5, 63.4, 9.6],
          opts: { tight: true },
        },
        {
          section: "skills",
          box: [9.4, 68.6, 17.6, 15.2],
          opts: { fontSize: 8, tight: true },
        },
        { section: "equipment", box: [31.2, 73.4, 25.8, 12.7] },
        { section: "features", box: [61.9, 73.5, 32.9, 12.7] },
        { section: "passperc", box: [20.8, 85.7, 6, 3] },
        { section: "profbonus", box: [20.9, 91.3, 6, 3] },
        { section: "notes", box: [31, 92, 60, 4.4] },
      ],
    },
    back: {
      plate: "back-sumie.png",
      fields: [
        {
          section: "appearance",
          box: [12.7, 7, 29.4, 30.5],
        },
        {
          section: "backstory",
          box: [46.5, 6.8, 26.8, 23.5],
        },
        { section: "pTraits", box: [7.5, 42.8, 20.8, 9.6] },
        { section: "pIdeals", box: [32, 42.7, 20.6, 9.9] },
        { section: "pBonds", box: [56, 42.8, 20.4, 9.8] },
        {
          section: "pFlaws",
          box: [79.1, 42.7, 17.9, 10.3],
        },
        { section: "treasure", box: [9.3, 57.8, 42.7, 18.9] },
        { section: "spellnotes", box: [56, 58, 40, 15] },
        { section: "quests", box: [8.5, 83, 43.3, 14.8] },
        {
          section: "generalnotes",
          box: [55.5, 83, 33.9, 14.2],
          opts: { lines: 4 },
        },
      ],
    },
  },
};
