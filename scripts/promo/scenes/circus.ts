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
 * The loop. A round of the cascade takes 4.8 s, three a loop; five apples on it put one in a hand every 0.96 s,
 * so the arms swing once per catch, fifteen times a loop, and each apple turns four times.
 */
const LOOP = 14.4;
const ROUND = LOOP / 3;
const CATCH = ROUND / 5;

/** The big top, painted 1024x1536, drawn 1400 wide so it covers the frame at every drift. */
const ROOM_DRAWN = 1400;

/**
 * Brilianto!, painted 1024x1024 with his arms ending at the elbows (a jointed puppet's: the forearms are their own
 * pieces): feet at (527, 971), elbow joints at (343, 364) and (713, 365). Drawn about 600 tall.
 */
const FEET_AT = { x: FRAME.width / 2, y: 1430 };
const B_DRAWN = 645;
const kB = B_DRAWN / 1024;
const onBrilianto = (x: number, y: number): Point => ({ x: FEET_AT.x + (x - 527) * kB, y: FEET_AT.y + (y - 971) * kB });
const LEFT_ELBOW = onBrilianto(343, 364);
const RIGHT_ELBOW = onBrilianto(713, 365);

/** The forearms, painted 1024x1024 with their joint balls at (920, 840) (left) and (144, 840) (right). */
const ARM_DRAWN = 160;

/** Brilianto!, his forearms and the apples share one depth, nearer than the room: they move together as the view breathes. */
const PERFORMER = 1.25;

/**
 * The apples' path in the frame, a cascade: caught at the outside of one hand, carried in low, thrown up and across
 * over his head to the outside of the other hand, carried in, thrown back. The two throws cross above his head, so
 * the curve is a figure of eight; a ring around him read as a wheel turning, not juggling (the maintainer, 15 Nov
 * 2026). Stored as offsets from `JUGGLE` (where every apple rests), as the engine wants.
 */
const JUGGLE = { x: 540, y: 760 };
const PATH: Point[] = [
  { x: 300, y: 960 },
  { x: 420, y: 1000 },
  { x: 610, y: 560 },
  { x: 785, y: 965 },
  { x: 660, y: 1000 },
  { x: 470, y: 560 },
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
  // Enough sway that the bench, Brilianto! and the far stands slide past each other: the depth is the point.
  camera: { drift: 0.03, push: 0.03 },
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
