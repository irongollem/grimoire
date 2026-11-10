/**
 * A prison cell at night, classic D&D: the third picture-book scene and the first seen through a Book Nook frame
 * (the stock stone wall with bars, #1142). The view pans left to right across the guardroom behind the bars: the
 * torch, the jailer's empty chair, a scruffy dog sitting with the keys in its mouth, then the stairs and a door left
 * ajar in the moonlight, and back. Briefed in ~/Desktop/art-955/scenes/briefs.json (the cell-* files).
 */
import type { Point } from "../../../src/lib/bookNook/scene.ts";
import type { ReelScene } from "./reel.ts";

const FRAME = { width: 1080, height: 1920 };
/** The plate as briefed and painted: a wide guardroom, so the camera can pan across it in a portrait Reel. */
export const CELL_PLATE = { width: 1536, height: 1024 };
const PLATE = CELL_PLATE;
/** Drawn a little taller than the frame, so the drift and push never show its top or bottom edge. */
const PLATE_DRAWN = 3000;
const k = PLATE_DRAWN / PLATE.width;

/** A point on the plate, in the plate image's own pixels, as a point in the frame (before the camera moves it). */
const on = (x: number, y: number): Point => ({
  x: FRAME.width / 2 + (x - PLATE.width / 2) * k,
  y: FRAME.height / 2 + (y - PLATE.height / 2) * k,
});
/** The camera path's x that centres the view on plate column `x`. */
const look = (x: number) => (x - PLATE.width / 2) * k;

// Measured on the painted plate and parts (8 Nov 2026), in their own pixels. The torch's head is at (150, 170),
// the wall meets the floor at y 695, the table's front legs stand at y 780, and the clear floor the dog sits on is
// right of the table.
const TORCH_HEAD = { x: 150, y: 178 };
const DOG_PAWS = { x: 950, y: 822 };
/** Plate pixels per dog pixel: the dog sits about 300 plate pixels tall, a little taller than the table. */
const DOG_SCALE = 300 / 1416;
/** Where the tail's root goes, in dog pixels: behind its left haunch (the picture's right), at the floor. */
const TAIL_ROOT_ON_DOG = { x: 740, y: 1340 };
const tailRoot = { x: DOG_PAWS.x + (TAIL_ROOT_ON_DOG.x - 523) * DOG_SCALE, y: DOG_PAWS.y + (TAIL_ROOT_ON_DOG.y - 1465) * DOG_SCALE };
/** The flame is about 85 plate pixels tall (its painted body is 1200 of its image's pixels): taller, it runs up behind the frame's lintel. */
const FLAME_SCALE = 85 / 1200;

/** How far the frame slides against the pan (see `frame.follow`): about 40 frame pixels at the room's ends. */
const FOLLOW = 0.035;
/**
 * Where the view rests: the torch, the dog, and the door. The bars frame's opening, cover-fitted to a Reel, is
 * about 606 frame pixels wide (155 plate pixels either side of the view's centre), and at the ends the frame has
 * slid about 21 plate pixels further out, so a rest closer than about 190 to either end of the plate shows black
 * past it.
 */
const AT_TORCH = look(195);
const AT_DOOR = look(PLATE.width - 195);
/**
 * The frame's middle bar runs down the screen's centre, so the dog rests with its face (40 of its pixels right of
 * its paws) in the gap right of it, about 94 frame pixels right of centre. The frame has slid `FOLLOW` of the way
 * with the view there, and the face must land in the gap where it has slid to.
 */
const AT_DOG = (look(DOG_PAWS.x + 40 * DOG_SCALE) - 94) / (1 + FOLLOW);

export const prisonCell: ReelScene = {
  id: "prison-cell",
  title: "The keys are right there",
  size: FRAME,
  loop: 25,
  duration: 25,
  camera: {
    drift: 0.004,
    push: 0.008,
    // A hold on the torch, across the room to the dog, a hold, on to the door, a hold, and back to the torch.
    path: [
      { at: 0, x: AT_TORCH, y: 0 },
      { at: 2, x: AT_TORCH, y: 0 },
      { at: 8, x: AT_DOG, y: 0 },
      { at: 12, x: AT_DOG, y: 0 },
      { at: 15.5, x: AT_DOOR, y: 0 },
      { at: 19.5, x: AT_DOOR, y: 0 },
    ],
  },
  seed: 1142,
  frame: { style: "stone-bars", fit: "cover", tall: "frame-stone-bars-tall.png", follow: FOLLOW },
  caption: "The keys are right there.",
  captionAt: [8.5, 19.5],
  // The middle (12.5 s) is already on its way to the door, with the dog behind the middle bar.
  coverAt: 10.5,
  tagline: { text: "So is the door.", at: [15.5, 19.5] },
  stack: [
    { kind: "layer", id: "plate", src: "cell-plate.png", depth: 1, anchor: { x: 0.5, y: 0.5 }, at: on(768, 512), width: PLATE_DRAWN },
    // Dust turning in the moonlight from the grate above the stairs.
    {
      kind: "motes",
      area: { ...on(1140, 150), w: 260 * k, h: 300 * k },
      depth: 1,
      count: 30,
      size: [1.4, 3.2],
      opacity: 0.45,
      color: [214, 226, 255],
    },
    {
      kind: "layer",
      id: "tail",
      src: "cell-tail.png",
      depth: 1,
      anchor: { x: 510 / 1024, y: 530 / 1024 },
      at: on(tailRoot.x, tailRoot.y),
      // About a third as long as the dog sits tall.
      width: 1024 * 0.8 * DOG_SCALE * k,
      motions: [{ kind: "sway", angle: 16, period: 0.5 }],
    },
    {
      kind: "layer",
      id: "dog",
      src: "cell-dog.png",
      depth: 1,
      // Between its front paws, on the floor.
      anchor: { x: 523 / 1024, y: 1465 / 1536 },
      at: on(DOG_PAWS.x, DOG_PAWS.y),
      width: 1024 * DOG_SCALE * k,
      shadow: { rx: 120, ry: 18, opacity: 0.5, dx: 14 },
      // Breathing: a slow lean about its paws, too small to read as anything but alive.
      motions: [{ kind: "sway", angle: 0.5, period: 3.125 }],
    },
    {
      kind: "layer",
      id: "flame",
      src: "cell-flame.png",
      depth: 1,
      anchor: { x: 483 / 1024, y: 1270 / 1536 },
      at: on(TORCH_HEAD.x, TORCH_HEAD.y),
      width: 1024 * FLAME_SCALE * k,
      // Painted, not added as light: screened over the bright wall round the torch it washed out to white.
      motions: [{ kind: "flicker", amount: 0.12, speed: 2.8 }],
    },
    { kind: "light", at: on(TORCH_HEAD.x + 10, TORCH_HEAD.y - 30), depth: 1, radius: 900, color: [255, 170, 90], intensity: 0.22, follows: "flame" },
  ],
  grade: { tint: { color: [210, 180, 150], amount: 0.06 }, vignette: 0.3 },
  sound: {
    ambience: [
      // CC0 dungeon room tone and a slow drip, from the soundboard library.
      { src: "https://cdn.dungeongrimoire.com/sounds/library/dungeon/dungeon-ambience-loop.ogg", gain: 0.5 },
      { src: "https://cdn.dungeongrimoire.com/sounds/library/dungeon/water-drip-loop.ogg", gain: 0.35 },
      // The torch, offstage most of the time: a murmur.
      { src: "https://cdn.dungeongrimoire.com/sounds/library/fire/fireplace-loop.ogg", gain: 0.04 },
      // The keys jingle as the view reaches the dog (CC0).
      { src: "https://cdn.dungeongrimoire.com/sounds/library/town/metal-wood-sfx-pack--keys-03.ogg", gain: 0.6, clip: [0, 0.48], at: 8.4 },
    ],
  },
};
