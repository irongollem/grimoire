/**
 * Curated starter scenes, built from the shared catalogue (#572 phase 3).
 *
 * A library of eight hundred loose files is still prep work — somebody has to
 * decide that a tavern is a fire, a lute and a mug that clatters every forty
 * seconds. These recipes are that decision, made once, so a brand-new campaign
 * has working location audio before the DM has curated anything.
 *
 * Kept as source rather than rows because a scene is a set of judgements —
 * layer balance, how often a generator fires, how wide it pans — and those are
 * worth reviewing in a diff. Every `slug` refers to `sound_library.slug`;
 * materialising a scene resolves them, and a slug that no longer exists is
 * skipped rather than failing the whole scene (see `useStarterScenes`).
 *
 * Each scene carries a theme label matching the vocabulary encounters and
 * locations already use, so adding one immediately gives the trigger bus
 * something to resolve.
 */

import type { PlaylistTrackLayer } from "@/types/sound.types";

export interface StarterSceneLayer {
  /** `sound_library.slug` — the catalogue entry this layer plays. */
  slug: string;
  settings: PlaylistTrackLayer;
}

export interface StarterScene {
  /** Stable id, persisted to `soundboard_playlists.library_scene_slug`. */
  slug: string;
  name: string;
  /** Theme label for the trigger bus, e.g. a location tagged "tavern". */
  theme: string;
  /** One line, shown where the scene is offered. */
  description: string;
  layers: StarterSceneLayer[];
}

/** A continuously playing bed. */
function bed(slug: string, volume: number): StarterSceneLayer {
  return {
    slug,
    settings: {
      layer_volume: volume,
      is_generator: false,
      // Ignored while `is_generator` is false, but the columns are NOT NULL, so
      // they carry the defaults a DM would see if they flipped the layer over.
      min_interval_s: 20,
      max_interval_s: 60,
      min_gain: 0.6,
      max_gain: 1,
      pan_spread: 0,
    },
  };
}

/**
 * A one-shot that fires at random intervals.
 *
 * This is what stops a room sounding like a recording: the same mug never
 * clatters at the same moment twice, so the ear stops hearing a loop.
 */
function generator(
  slug: string,
  [minInterval, maxInterval]: [number, number],
  [minGain, maxGain]: [number, number],
  panSpread: number,
): StarterSceneLayer {
  return {
    slug,
    settings: {
      layer_volume: 1,
      is_generator: true,
      min_interval_s: minInterval,
      max_interval_s: maxInterval,
      min_gain: minGain,
      max_gain: maxGain,
      pan_spread: panSpread,
    },
  };
}

export const STARTER_SCENES: readonly StarterScene[] = [
  {
    slug: "tavern",
    name: "Tavern",
    theme: "tavern",
    description: "A fire, a lute, and someone setting a mug down too hard.",
    layers: [
      bed("tavern/tavern-music-loop", 0.55),
      bed("fire/fireplace-loop", 0.45),
      generator("tavern/mug-clink-1", [18, 50], [0.25, 0.5], 0.8),
      generator("tavern/mug-clink-3", [25, 70], [0.2, 0.45], 0.9),
    ],
  },
  {
    slug: "forest-day",
    name: "Forest, day",
    theme: "forest",
    description: "Birdsong over a light wind, with the odd call close by.",
    layers: [
      bed("forest/jc-nature-ambient-vol1--amb-nature-pack-vol-1-forest-enviroments-forest-day", 0.7),
      bed("wind/wind-loop", 0.25),
      generator("forest/forest-birds-pack--forest-birds-4", [20, 55], [0.3, 0.6], 0.9),
    ],
  },
  {
    slug: "storm",
    name: "Storm",
    theme: "storm",
    description: "Rain on the roof, wind behind it, thunder when you least want it.",
    layers: [
      bed("rain/rain-gutter-loop", 0.65),
      bed("wind/wind-loop", 0.35),
      generator("thunder/thunderclap", [25, 80], [0.5, 1], 0.7),
    ],
  },
  {
    slug: "dungeon",
    name: "Dungeon",
    theme: "dungeon",
    description: "Stone, a draught from somewhere, and water finding its way down.",
    layers: [
      bed("dungeon/dungeon-ambience-loop", 0.6),
      bed("dungeon/scary-wind", 0.25),
      generator("dungeon/water-drip-1", [9, 26], [0.3, 0.6], 0.85),
    ],
  },
  {
    slug: "town",
    name: "Town square",
    theme: "town",
    description: "Bells, birds, and a smith who has been at it since dawn.",
    layers: [
      bed("town/church-bells-birds", 0.5),
      generator("town/smith-hammering", [4, 12], [0.25, 0.5], 0.6),
      generator("town/metal-wood-sfx-pack--wood-misc-03", [15, 45], [0.2, 0.4], 0.9),
    ],
  },
  {
    slug: "coast",
    name: "Coast",
    theme: "coast",
    description: "Ocean against the shore with the wind coming off the water.",
    layers: [
      bed("waves/jc-nature-ambient-vol1--amb-nature-pack-vol-1-water-enviroments-ocean-waves", 0.7),
      bed("wind/park-wind", 0.3),
      generator("waves/waves-shore-2", [10, 28], [0.3, 0.6], 0.8),
    ],
  },
  {
    slug: "night-camp",
    name: "Night camp",
    theme: "night",
    description: "Cicadas, a campfire, and a frog that will not settle.",
    layers: [
      bed("night/cicadas-bed", 0.55),
      bed("fire/fireplace-loop", 0.5),
      generator("night/bird-cricket-frog-pack--amb-frog-1", [18, 55], [0.25, 0.5], 0.9),
    ],
  },
] as const;

/** Every catalogue slug any starter scene needs, deduplicated. */
export function starterSceneSlugs(scenes: readonly StarterScene[] = STARTER_SCENES): string[] {
  return [...new Set(scenes.flatMap((scene) => scene.layers.map((layer) => layer.slug)))];
}
