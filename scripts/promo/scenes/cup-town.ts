/**
 * The checkered hilltop above Cup Town, the prologue's opening in Sothery (Late in the Kind Country, Act One):
 * the party wakes on grass mown in saucer-sized squares, finds a picnic left for them, and below the hill lies
 * a town inside a teacup. The camera starts close on the picnic and tilts up until the town rises from behind
 * the crest, holds while the bell strikes three times, then eases back. Briefed in
 * ~/Desktop/art-955/scenes/briefs.json (the cup-* files).
 */
import type { Point } from "../../../src/lib/bookNook/scene.ts";
import type { ReelScene } from "./reel.ts";

const FRAME = { width: 1080, height: 1920 };

/** The view (sky, Cup Town, the far slope), painted 1024x1536, drawn 1500 wide so it covers its share of the tilt. */
const VISTA_DRAWN = 1500;
const kv = VISTA_DRAWN / 1024;
/** Cup Town's middle in the painted view, and where it sits in the frame once the camera has tilted up to it. */
const TOWN = { x: 512, y: 785 };
const TOWN_AT = { x: FRAME.width / 2, y: 892.5 };
const onVista = (x: number, y: number): Point => ({ x: TOWN_AT.x + (x - TOWN.x) * kv, y: TOWN_AT.y + (y - TOWN.y) * kv });

/**
 * The hilltop, painted 1024x1536 with its grass below a domed crest at y 749 (818 at the edges). Its crest sits
 * high enough that the town (its bell tower at y 630 in the view) is still hidden behind it while the camera looks
 * down at the picnic, and it is drawn 1900 wide so its grass reaches the bottom of the frame then.
 */
const HILL_DRAWN = 1900;
const CREST = { x: 512, y: 749 };
const CREST_AT = { x: FRAME.width / 2, y: 1000 };

/** How far the view travels: half of it either side of the frame's middle, at depth 1. */
const TILT = 525;

/**
 * The loop is the title song's own: from the "Late" of one "Late in the Kind Country" (2:31.0, after "the walking
 * will keep") to the "Late" of the next (after "the leaving of the day"). Every word of the second refrain comes
 * 22.65 s after the same word in the first (word timings and a chroma match agree), so the loop's blend lays a
 * refrain over the same refrain. The seam sits on the word, not in the breath before it, because the breaths
 * differ: the band plays through the first and drops out before the second, and a seam there opened the loop on
 * that silence. 680 frames, 12 ms off the song.
 */
const LOOP = 680 / 30;
const SONG_FROM = 151.0;

export const cupTown: ReelScene = {
  id: "cup-town",
  title: "Will you join us?",
  size: FRAME,
  loop: LOOP,
  duration: LOOP,
  camera: {
    drift: 0.006,
    push: 0.01,
    // Close on the picnic, up to the town, a hold while the bell rings, and back down by the loop's end.
    path: [
      { at: 0, x: 0, y: TILT },
      { at: 3, x: 0, y: TILT },
      { at: 11, x: 0, y: -TILT },
      { at: 17.5, x: 0, y: -TILT },
    ],
  },
  seed: 1142,
  caption: "Will you join us?",
  // The line arrives with the town, after the tilt (3 s to 11 s) has brought it up, and stays until the
  // camera starts back down. The setting's own subtitle follows once the question has been read alone.
  // "and some to make you stay" is sung at 12.4 s, between the two lines.
  captionAt: [11.5, 17.5],
  tagline: { text: "Stay as long as you like", at: [14, 17.5] },
  stack: [
    // Far, so it moves least: a third of the tilt. At the start the town is still hidden behind the crest.
    { kind: "layer", id: "vista", src: "cup-vista.png", depth: 0.3, anchor: { x: TOWN.x / 1024, y: TOWN.y / 1536 }, at: TOWN_AT, width: VISTA_DRAWN },
    // Teapot chimneys: the painting has their steam; these keep it rising.
    ...[
      [270, 685],
      [356, 672],
      [447, 690],
      [576, 675],
      [640, 684],
    ].map(([x, y]) => ({
      kind: "steam" as const,
      at: onVista(x, y),
      depth: 0.3,
      count: 30,
      life: 4,
      rise: 42,
      spread: 10,
      size: [2.5, 9] as [number, number],
      opacity: 0.45,
      color: [250, 246, 240] as [number, number, number],
    })),
    // A bell bird circling slowly over the valley, nearer than the town and further than the hill. Low over the
    // far hills on the left, so that when the view has risen to the town it passes under the title, not through it.
    {
      kind: "layer",
      id: "bellbird",
      src: "cup-bellbird.png",
      depth: 0.45,
      anchor: { x: 0.5, y: 0.5 },
      at: { x: 300, y: 484 },
      width: 180,
      motions: [
        { kind: "drift", dx: 120, dy: 36, period: 24 },
        { kind: "bob", dy: 8, period: 3 },
      ],
    },
    // The hilltop the party wakes on.
    { kind: "layer", id: "hill", src: "cup-hill.png", depth: 1, anchor: { x: CREST.x / 1024, y: CREST.y / 1536 }, at: CREST_AT, width: HILL_DRAWN },
    // A tea lamb a few dozen paces off, just below the crest, nibbling.
    {
      kind: "layer",
      id: "tealamb",
      src: "cup-tealamb.png",
      depth: 1,
      anchor: { x: 506 / 1024, y: 846 / 1024 },
      at: { x: 800, y: 1050 },
      width: 150,
      shadow: { rx: 50, ry: 9, opacity: 0.3, dx: -6 },
      motions: [{ kind: "sway", angle: 2.5, period: 4 }],
    },
    // The picnic left for them, close at the viewer's feet.
    {
      kind: "layer",
      id: "picnic",
      src: "cup-picnic.png",
      depth: 1,
      anchor: { x: 0.5, y: 0.5 },
      at: { x: FRAME.width / 2, y: 1925 },
      width: 1040,
      shadow: { rx: 540, ry: 140, opacity: 0.22, dx: -14, dy: 14 },
    },
    // Seed fluff turning in the morning light over the hill.
    {
      kind: "motes",
      area: { x: 0, y: 700, w: FRAME.width, h: 800 },
      depth: 0.85,
      count: 30,
      size: [1.5, 3],
      opacity: 0.5,
      color: [255, 245, 220],
    },
  ],
  grade: { tint: { color: [255, 214, 170], amount: 0.1 }, vignette: 0.22 },
  sound: {
    ambience: [
      // Wind over the hilltop, CC0 from the soundboard library.
      { src: "https://cdn.dungeongrimoire.com/sounds/library/wind/park-wind.ogg", gain: 0.35 },
      // Act One ends when Cup Town's bell has rung the same single note three times: a CC0 low G bell from
      // Freesound, on the maintainer's soundboard, struck as the town comes into view.
      { src: "https://cdn.dungeongrimoire.com/sounds/fc8ae595-641f-4127-87ad-03588f3710d1/d425b427-43c1-4531-82d4-b739b50ba531.mp3", gain: 0.55, clip: [0, 8.76], at: 10.5 },
      // The setting's title song, the maintainer's own version (made through a service that forwards to Suno; they
      // chose it over every Lyria take of the same lyrics, 4 Nov 2026). It opens on the refrain, the maintainer's
      // pick, and runs on past the loop's end into the next refrain, which the blend lays over the first.
      { src: "https://cdn.dungeongrimoire.com/sounds/fc8ae595-641f-4127-87ad-03588f3710d1/dda1810c-8599-4c82-a25a-62674a518425.mp3", gain: 0.7, clip: [SONG_FROM, SONG_FROM + LOOP], at: 0 },
    ],
  },
};
