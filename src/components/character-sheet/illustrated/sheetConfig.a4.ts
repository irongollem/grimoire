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
        {
          section: "appearance",
          box: [7.1, 8.7, 26.5, 20.9],
        },
        {
          section: "backstory",
          box: [36.4, 8.6, 32.8, 21.3],
        },
        { section: "crest", box: [72.5, 8.7, 20.5, 21] },
        { section: "allies", box: [7, 36.4, 26.4, 22.3] },
        { section: "treasure", box: [36.1, 36.4, 33, 22.4] },
        { section: "personality", box: [72.3, 38.1, 20.6, 42.5] },
        {
          section: "spellnotes",
          box: [7.1, 65.5, 29, 15.2],
        },
        { section: "quests", box: [39.1, 65.6, 29.8, 15.1] },
        {
          section: "generalnotes",
          box: [7.6, 85.7, 86, 7.6],
        },
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
          box: [12.5, 61.6, 19.4, 23],
          opts: { fontSize: 10 },
        },
        { section: "equipment", box: [33.4, 64.8, 22.5, 18.1] },
        { section: "features", box: [59.1, 64.6, 28, 18.4] },
        { section: "passperc", box: [18.4, 85.7, 3.8, 2.6] },
        { section: "profbonus", box: [18.7, 91.2, 3.8, 2.6] },
        { section: "notes", box: [33.7, 87.2, 46.3, 6.9] },
      ],
    },
    back: {
      plate: "back-adventure.png",
      fields: [
        { section: "appearance", box: [10, 9, 35.2, 21] },
        {
          section: "backstory",
          box: [50.4, 11.5, 44.7, 18.9],
        },
        {
          section: "personality",
          box: [9.2, 35.9, 47.7, 14.4],
          opts: { cols: 2 },
        },
        { section: "allies", box: [60.7, 36.1, 34.7, 13.9] },
        { section: "quests", box: [9, 55.6, 24.3, 15.8] },
        { section: "treasure", box: [37, 55.5, 26, 16.1] },
        {
          section: "spellnotes",
          box: [67, 55.5, 28.2, 15.7],
        },
        {
          section: "travel",
          box: [18.9, 77.1, 34.4, 16.3],
        },
        {
          section: "generalnotes",
          box: [57.6, 77.9, 27.9, 15.3],
          opts: { lines: 5 },
        },
      ],
    },
  },
  gothic: {
    front: {
      plate: "front-gothic.png",
      fields: [
        { section: "name", box: [18, 7.4, 72.7, 4.6] },
        { section: "abilities", box: [6.8, 18.4, 19.2, 38.4] },
        { section: "ac", box: [29.1, 19.2, 9.8, 6.2] },
        { section: "init", box: [41.4, 17.5, 11.4, 6] },
        { section: "speed", box: [54.8, 17.5, 11.8, 5.9] },
        { section: "hp", box: [30.5, 30.7, 17.6, 6.2] },
        { section: "hitdice", box: [51.2, 30.5, 14, 6.2] },
        { section: "death", box: [28.5, 41.7, 36, 2.6] },
        { section: "portrait", box: [71.4, 18, 20, 21.7] },
        { section: "attacks", box: [29.5, 50.2, 62.7, 9.8] },
        {
          section: "skills",
          box: [7.6, 62.1, 19.4, 20.5],
          opts: { fontSize: 9 },
        },
        { section: "equipment", box: [29.2, 65.2, 26.6, 17.1] },
        { section: "features", box: [59, 65.2, 33.1, 17.1] },
        { section: "passperc", box: [21.9, 83.4, 4.8, 2.6] },
        { section: "profbonus", box: [21.7, 88.7, 4.8, 2.6] },
        { section: "notes", box: [29.9, 86.8, 61.3, 8.2] },
      ],
    },
    back: {
      plate: "back-gothic.png",
      fields: [
        {
          section: "appearance",
          box: [15.9, 13.2, 15.5, 15.5],
          opts: { lines: 8 },
        },
        { section: "backstory", box: [41.6, 8.2, 50, 16] },
        {
          section: "personality",
          box: [41.8, 28.4, 50.2, 14],
          opts: { cols: 2 },
        },
        { section: "secrets", box: [8.8, 45.4, 23, 14.7] },
        { section: "allies", box: [34.8, 46, 36, 14.3] },
        { section: "treasure", box: [10, 64, 25.7, 13] },
        {
          section: "spellnotes",
          box: [39.1, 64.1, 29.6, 13.2],
        },
        { section: "quests", box: [6.7, 81.1, 49, 12] },
        { section: "generalnotes", box: [59, 81, 33, 12] },
      ],
    },
  },
  fairy: {
    front: {
      plate: "front-fairy.png",
      fields: [
        { section: "name", box: [14, 7.4, 77.6, 4.9] },
        { section: "abilities", box: [7.6, 16.4, 19.4, 38.2] },
        { section: "ac", box: [32.2, 17.8, 9.6, 6] },
        { section: "init", box: [45.3, 17, 10.2, 4.9] },
        { section: "speed", box: [57.6, 17, 9.5, 4.8] },
        { section: "hp", box: [31.4, 28.7, 17.6, 7] },
        { section: "hitdice", box: [51.8, 28.6, 17.6, 6.9] },
        { section: "death", box: [31, 41, 36, 2.7] },
        { section: "portrait", box: [72.2, 14.8, 20.2, 20.2] },
        {
          section: "attacks",
          box: [31, 48.5, 63.7, 12.2],
          opts: { tight: true },
        },
        {
          section: "skills",
          box: [7.6, 62.4, 19.4, 20.4],
          opts: { fontSize: 9 },
        },
        { section: "equipment", box: [31.2, 65.6, 25.2, 16.8] },
        { section: "features", box: [59.3, 65.5, 34.6, 17.3] },
        { section: "passperc", box: [21.5, 83.9, 4.2, 2.6] },
        { section: "profbonus", box: [21.5, 89, 4.2, 2.6] },
        { section: "notes", box: [31.3, 86.4, 61.5, 7] },
      ],
    },
    back: {
      plate: "back-fairy.png",
      fields: [
        {
          section: "appearance",
          box: [12.3, 17.9, 20.5, 16],
          opts: { lines: 7 },
        },
        {
          section: "backstory",
          box: [41.4, 11.6, 32.8, 27.4],
        },
        {
          section: "pTraits",
          box: [79.3, 12.2, 18.9, 8.3],
        },
        {
          section: "pIdeals",
          box: [78.8, 24.9, 19.4, 7.3],
        },
        { section: "pBonds", box: [78.8, 36.7, 19.4, 7.9] },
        { section: "pFlaws", box: [78.8, 49.2, 19, 8] },
        { section: "allies", box: [7.4, 45.2, 31.5, 11.9] },
        { section: "treasure", box: [42.7, 45.2, 31.3, 11.9] },
        {
          section: "spellnotes",
          box: [7.2, 63.1, 90, 8.3],
        },
        { section: "quests", box: [7.2, 76.5, 43, 18] },
        {
          section: "generalnotes",
          box: [54, 76.9, 44, 18],
          opts: { lines: 6 },
        },
      ],
    },
  },
  sumie: {
    front: {
      plate: "front-sumie.png",
      fields: [
        { section: "name", box: [27.2, 8.5, 57.2, 4] },
        { section: "abilities", box: [9.4, 19.2, 17.6, 39.8] },
        { section: "ac", box: [30.3, 20.7, 9.6, 5.4] },
        { section: "init", box: [40.8, 19.5, 12.2, 5.6] },
        { section: "speed", box: [54.3, 19.4, 10.1, 6] },
        { section: "hp", box: [30.6, 35.2, 17.8, 6.2] },
        { section: "hitdice", box: [51.4, 31.5, 12.9, 8.4] },
        { section: "death", box: [29.9, 44.8, 34.1, 2.7] },
        { section: "portrait", box: [66.3, 17.2, 25.4, 27] },
        { section: "attacks", box: [30.2, 52.9, 62.8, 10.1] },
        {
          section: "skills",
          box: [9.1, 64.4, 17.6, 16.4],
          opts: { fontSize: 8, tight: true },
        },
        { section: "equipment", box: [30, 68, 26, 16.3] },
        { section: "features", box: [60, 68.1, 33.5, 16.4] },
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
          box: [12.5, 7.6, 27.8, 28.1],
        },
        {
          section: "backstory",
          box: [44.6, 6.1, 26.8, 20.9],
        },
        { section: "pTraits", box: [6.7, 41.2, 20.4, 9.6] },
        {
          section: "pIdeals",
          box: [30.6, 41.2, 20.8, 9.6],
        },
        { section: "pBonds", box: [54.8, 41.2, 21.3, 9.5] },
        { section: "pFlaws", box: [78.9, 41.2, 18.3, 9.6] },
        { section: "treasure", box: [8, 55.5, 42.7, 19.2] },
        {
          section: "spellnotes",
          box: [55, 56, 41.4, 18.4],
        },
        { section: "quests", box: [8, 80, 41, 16] },
        {
          section: "generalnotes",
          box: [55, 80, 34.7, 17.2],
          opts: { lines: 7 },
        },
      ],
    },
  },
};
