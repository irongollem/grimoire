/**
 * Floss's parlour in the Pulled Sugar Inn, Sugarwell, at dawn (#1139): the first picture-book scene. A
 * kettle steams on the round table, a candle burns beside it, the curtain at the window stirs, and dust turns
 * in the window's light. The layers are briefed in ~/Desktop/art-955/scenes/briefs.json.
 */
import type { Point, Scene } from "./scene.ts";

const FRAME = { width: 1080, height: 1920 };
/** The plate as briefed and painted. */
export const INN_PLATE = { width: 1024, height: 1536 };
const PLATE = INN_PLATE;
/** How wide the plate is drawn: wide enough to cover the frame while the camera drifts. */
const PLATE_DRAWN = 1320;
const k = PLATE_DRAWN / PLATE.width;

/** A point on the plate, in the plate image's own pixels, as a point in the frame. */
const on = (x: number, y: number): Point => ({
  x: FRAME.width / 2 + (x - PLATE.width / 2) * k,
  y: FRAME.height / 2 + (y - PLATE.height / 2) * k,
});

// Where things stand, in plate pixels, measured on the painted plate and parts (4 Nov 2026). The table's top is
// an ellipse about (572, 860), 535 px across; the window's right edge is at x 300.
const KETTLE_FEET = { x: 520, y: 872 };
const CANDLE_BASE = { x: 690, y: 866 };
/** Plate pixels per part pixel: the kettle's body about 190 px across, the candle's dish about 120. */
const KETTLE_SCALE = 0.273;
const CANDLE_SCALE = 0.1455;
/** Where the part images have their spout tip and wick, relative to the anchors below, in part pixels. */
const SPOUT = { x: KETTLE_FEET.x + (102 - 509) * KETTLE_SCALE, y: KETTLE_FEET.y + (358 - 952) * KETTLE_SCALE };
const WICK = { x: CANDLE_BASE.x + (494 - 562) * CANDLE_SCALE, y: CANDLE_BASE.y + (540 - 1249) * CANDLE_SCALE };
/** Gathered at the window's right side, on the window's wall, so it frames the light rather than covering it. */
const CURTAIN_ROD = { x: 270, y: 70 };
/**
 * The window's wall recedes to the right: its eye level is about y 620 (the window's glazing bars there are
 * level), and its sill rises 40 px over the window's 280 px toward the corner, so a thing on that wall is
 * about 11 per cent shorter for every 280 px further along it.
 */
const WINDOW_WALL_HORIZON = 620;
const shrinkOver = (px: number) => 1 - 0.11 * (px / 280);

export const innDawn: Scene = {
  id: "inn-dawn",
  title: "Dawn at the Pulled Sugar Inn",
  size: FRAME,
  loop: 11,
  duration: 22,
  camera: { drift: 0.012, push: 0.015 },
  seed: 1139,
  caption: "Dawn at the Pulled Sugar Inn",
  stack: [
    { kind: "layer", id: "plate", src: "inn-plate.png", depth: 1, anchor: { x: 0.5, y: 0.5 }, at: on(512, 768), width: PLATE_DRAWN },
    {
      kind: "motes",
      area: { ...on(120, 380), w: 460 * k, h: 620 * k },
      depth: 1,
      count: 36,
      size: [1.6, 3.6],
      opacity: 0.55,
      color: [255, 236, 204],
    },
    {
      kind: "layer",
      id: "curtain",
      src: "inn-curtain.png",
      depth: 1,
      anchor: { x: 0.5, y: 0.014 },
      at: on(CURTAIN_ROD.x, CURTAIN_ROD.y),
      width: 560 * k,
      opacity: 0.86,
      // The image is 560 px wide on the plate before the squash: 0.6 of that is how far its far edge reaches.
      plane: { horizon: on(0, WINDOW_WALL_HORIZON).y, far: shrinkOver(560 * 0.6), across: 0.6 },
      motions: [{ kind: "billow", amount: 16, period: 11, waves: 0.8 }],
    },
    {
      kind: "layer",
      id: "candle",
      src: "inn-candle.png",
      depth: 1,
      anchor: { x: 562 / 1024, y: 1249 / 1536 },
      at: on(CANDLE_BASE.x, CANDLE_BASE.y),
      width: 1024 * CANDLE_SCALE * k,
      shadow: { rx: 78, ry: 14, opacity: 0.45, dx: 12 },
    },
    {
      kind: "layer",
      id: "kettle",
      src: "inn-kettle.png",
      depth: 1,
      // The trivet's centre (x 509 in the kettle image, measured across its feet), so the shadow sits under it.
      anchor: { x: 509 / 1024, y: 952 / 1024 },
      at: on(KETTLE_FEET.x, KETTLE_FEET.y),
      width: 1024 * KETTLE_SCALE * k,
      shadow: { rx: 120, ry: 20, opacity: 0.5, dx: 6 },
    },
    {
      kind: "steam",
      at: on(SPOUT.x - 2, SPOUT.y - 6),
      depth: 1,
      // Many faint overlapping wisps read as one plume; a few strong ones read as bubbles.
      count: 46,
      life: 6,
      rise: 320,
      spread: 90,
      // Pale on a pale wall: a wisp has to be strong to read, and many of them overlap into one plume.
      size: [10, 54],
      opacity: 0.55,
      color: [252, 242, 230],
    },
    {
      kind: "layer",
      id: "flame",
      src: "inn-flame.png",
      depth: 1,
      // The flame image's root (its blue base) sits on the wick's top.
      anchor: { x: 507 / 1024, y: 760 / 1024 },
      at: on(WICK.x, WICK.y + 3),
      width: 64 * k,
      blend: "screen",
      // A flame is light, not paint: the candle's top and the wall show through it.
      opacity: 0.7,
      motions: [{ kind: "flicker", amount: 0.09, speed: 2.4 }],
    },
    { kind: "light", at: on(WICK.x, WICK.y - 18), depth: 1, radius: 430, color: [255, 186, 110], intensity: 0.26, follows: "flame" },
    // Nearest to us, so it moves most: this is what makes the room read as deep.
    {
      kind: "layer",
      id: "chair",
      src: "inn-chair.png",
      depth: 1.45,
      anchor: { x: 1, y: 1 },
      at: { x: FRAME.width + 40, y: FRAME.height + 30 },
      width: 980,
    },
  ],
  grade: { tint: { color: [255, 196, 150], amount: 0.16 }, vignette: 0.32 },
  sound: {
    ambience: [
      // The hob under the kettle, offstage: a murmur, not a campfire.
      { src: "https://cdn.dungeongrimoire.com/sounds/library/fire/fireplace-loop.ogg", gain: 0.03 },
      // Dawn bells from across the terraces: a CC0 low G bell from Freesound, on the Late in the Kind Country
      // soundboard, which strikes three times (0.2, 3.2, 6.2 s) as a bell in Sothery does, and has rung out by
      // 8.7 s, inside the loop.
      { src: "https://cdn.dungeongrimoire.com/sounds/fc8ae595-641f-4127-87ad-03588f3710d1/d425b427-43c1-4531-82d4-b739b50ba531.mp3", gain: 0.5, clip: [0, 8.76], at: 2 },
      // Lyria 3.5, made from a text prompt about this room (Google's filter refused the plate itself). The tune
      // opens on 3 s of silence and a quiet stretch and is fullest from about 44 s; this cut's end, what follows
      // it and its start sit within half a decibel of each other, so the Reel's loop has no dip (48 s, the
      // first choice, ended on a breath in the tune and dipped 6 dB as it came round).
      { src: "inn-dawn-music.mp3", gain: 0.7, clip: [44.25, 66.25], at: 0 },
    ],
  },
};
