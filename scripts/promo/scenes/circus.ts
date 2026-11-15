/**
 * Brilianto!, the Sugarspun juggler of the Sugarwell carnival (Late in the Kind Country), in the big top, seen from
 * a seat a few rows up in the stands: five candy apples circling over his head, his forearms swinging up together
 * like a drawstring puppet's, to his own song, which opens "Step right up, step right up!". The first nook built
 * on Book Nook's path motion (#1198): the apples share one closed path, spread evenly along it, and spin as they
 * fly. Painted through the image API (scripts/promo/scenes/paint.ts) from ~/Desktop/art-955/scenes/briefs.json,
 * the circus-* files.
 */
import type { Layer, Point } from "../../../src/lib/bookNook/scene.ts";
import type { ReelScene } from "./reel.ts";

const FRAME = { width: 1080, height: 1920 };

/**
 * The loop: twelve catches of 1.2 s. The apples go round their path twice a loop (7.2 s a round, five apples, one
 * reaching a hand every 1.44 s would not divide the loop evenly, so the round is 6 s: 1.2 s between apples), the
 * arms swing once per catch and each apple turns four times.
 */
const LOOP = 14.4;
const CATCH = 1.2;
const ROUND = CATCH * 5;

/** The big top, painted 1024x1536, drawn 1400 wide so it covers the frame at every drift. */
const ROOM_DRAWN = 1400;

/** Brilianto!, painted 1024x1024: feet at (528, 952), elbow joints at (248, 264) and (789, 259). */
const FEET_AT = { x: FRAME.width / 2, y: 1430 };
const B_DRAWN = 664;
const kB = B_DRAWN / 1024;
const onBrilianto = (x: number, y: number): Point => ({ x: FEET_AT.x + (x - 528) * kB, y: FEET_AT.y + (y - 952) * kB });
const LEFT_ELBOW = onBrilianto(248, 264);
const RIGHT_ELBOW = onBrilianto(789, 259);

/** The forearms, painted 1024x1024 with their joint balls at (920, 840) (left) and (144, 840) (right). */
const ARM_DRAWN = 174;

/** Brilianto!, his forearms and the apples share one depth, nearer than the room: they move together as the view breathes. */
const PERFORMER = 1.25;

/**
 * The apples' path in the frame: up from his left palm, over his head, down to his right palm and back across low
 * in front of him, a shower. Stored as offsets from `JUGGLE` (where every apple rests), as the engine wants.
 */
const JUGGLE = { x: 540, y: 700 };
const PATH: Point[] = [
  { x: 254, y: 897 },
  { x: 300, y: 640 },
  { x: 420, y: 470 },
  { x: 540, y: 430 },
  { x: 660, y: 470 },
  { x: 780, y: 640 },
  { x: 821, y: 903 },
  { x: 540, y: 1040 },
].map((p) => ({ x: p.x - JUGGLE.x, y: p.y - JUGGLE.y }));

const apple = (i: number): Layer => ({
  kind: "layer",
  id: `apple-${i + 1}`,
  src: "circus-apple.png",
  depth: PERFORMER,
  anchor: { x: 0.52, y: 0.5 },
  at: JUGGLE,
  width: 84,
  motions: [
    { kind: "path", points: PATH, period: ROUND, phase: i / 5, group: "juggle" },
    { kind: "spin", period: LOOP / 4, phase: i / 5, reverse: i % 2 === 1 },
  ],
});

export const circus: ReelScene = {
  id: "circus",
  title: "Step right up!",
  size: FRAME,
  loop: LOOP,
  duration: LOOP,
  camera: { drift: 0.008, push: 0.012 },
  seed: 1198,
  caption: "Step right up!",
  captionAt: [0.6, 6],
  stack: [
    { kind: "layer", id: "plate", src: "circus-plate.png", depth: 1, anchor: { x: 0.5, y: 0.5 }, at: { x: FRAME.width / 2, y: FRAME.height / 2 }, width: ROOM_DRAWN },
    // Dust turning in the spotlight's beam over the ring.
    { kind: "motes", area: { x: 260, y: 300, w: 560, h: 1000 }, depth: 1.1, count: 40, size: [1.5, 3.2], opacity: 0.55, color: [255, 236, 200] },
    {
      kind: "layer",
      id: "brilianto",
      src: "circus-brilianto.png",
      depth: PERFORMER,
      anchor: { x: 528 / 1024, y: 952 / 1024 },
      at: FEET_AT,
      width: B_DRAWN,
      shadow: { rx: 120, ry: 18, opacity: 0.35 },
      // A small bounce on every catch, in time with the arms.
      motions: [{ kind: "bob", dy: 5, period: CATCH, phase: 0.25 }],
    },
    // The forearms swing about their elbows, mirrored (the right half a cycle on), so both go up together.
    {
      kind: "layer",
      id: "forearm-left",
      src: "circus-forearm-left.png",
      depth: PERFORMER,
      anchor: { x: 920 / 1024, y: 840 / 1024 },
      at: LEFT_ELBOW,
      width: ARM_DRAWN,
      motions: [{ kind: "sway", angle: 12, period: CATCH }],
    },
    {
      kind: "layer",
      id: "forearm-right",
      src: "circus-forearm-right.png",
      depth: PERFORMER,
      anchor: { x: 144 / 1024, y: 840 / 1024 },
      at: RIGHT_ELBOW,
      width: ARM_DRAWN,
      motions: [{ kind: "sway", angle: 12, period: CATCH, phase: 0.5 }],
    },
    ...[0, 1, 2, 3, 4].map(apple),
    // The back of the bench row in front, nearest of all, across the bottom of the frame. Painted 1536x1024 with its
    // top edge at y 470, drawn 1300 wide (0.846), so its top edge sits at y 1700.
    { kind: "layer", id: "bench", src: "circus-bench-front.png", depth: 1.8, anchor: { x: 0.5, y: 1 }, at: { x: FRAME.width / 2, y: 1700 + (1024 - 470) * (1300 / 1536) }, width: 1300 },
  ],
  grade: { tint: { color: [255, 210, 160], amount: 0.08 }, vignette: 0.3 },
  sound: {
    ambience: [
      // Brilianto!'s own song from the Kind Country campaign's Bright Stars playlist, from its first words.
      { src: "https://cdn.dungeongrimoire.com/sounds/fc8ae595-641f-4127-87ad-03588f3710d1/d0d1fb20-2f2d-4f2a-9a2f-4a3d0c6d0f30.mp3", gain: 0.8, clip: [0, LOOP], at: 0 },
    ],
  },
};
