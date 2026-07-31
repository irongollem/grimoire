/**
 * Working out what adding starter scenes actually involves, before touching
 * the database.
 *
 * Three things make this worth doing as a pure step rather than inline in the
 * mutation. Scenes share layers — the campfire is in both the tavern and the
 * night camp — so a naive pass creates the same sound twice and leaves a
 * duplicate on the DM's board forever. Scenes may already have been added, and
 * adding them again should be a no-op rather than a second copy. And a
 * catalogue entry can be retired, which should cost that one layer, not the
 * whole scene.
 *
 * All three are decisions, so they are made here where they can be tested,
 * and the composable is left with nothing but I/O.
 */

import type { StarterScene, StarterSceneLayer } from "@/data/starterScenes";

export interface PlannedLayer {
  slug: string;
  /** `sound_library.id` for this layer's catalogue entry. */
  libraryId: string;
  settings: StarterSceneLayer["settings"];
}

export interface PlannedScene {
  scene: StarterScene;
  layers: PlannedLayer[];
}

export interface StarterScenePlan {
  /** Scenes to build, each with its surviving layers in order. */
  scenes: PlannedScene[];
  /**
   * Catalogue entries needing a `sounds` row, deduplicated across scenes.
   * Order is stable so the resulting board is not shuffled run to run.
   */
  libraryIdsToCreate: string[];
  /** Anything not being done, and why — surfaced rather than swallowed. */
  skipped: { what: string; reason: string }[];
}

export interface PlanInput {
  scenes: readonly StarterScene[];
  /** `sound_library.slug` → its row id. */
  catalogueBySlug: ReadonlyMap<string, string>;
  /** `sounds.library_id` values already on this campaign's board. */
  existingLibraryIds: ReadonlySet<string>;
  /** `library_scene_slug` values already on this campaign's board. */
  existingSceneSlugs: ReadonlySet<string>;
}

export function planStarterScenes({
  scenes,
  catalogueBySlug,
  existingLibraryIds,
  existingSceneSlugs,
}: PlanInput): StarterScenePlan {
  const planned: PlannedScene[] = [];
  const skipped: { what: string; reason: string }[] = [];
  // Insertion-ordered, so a layer shared by two scenes is created once and the
  // board comes out in the same order every time.
  const toCreate = new Set<string>();

  for (const scene of scenes) {
    if (existingSceneSlugs.has(scene.slug)) {
      skipped.push({ what: scene.name, reason: "already on this board" });
      continue;
    }

    const layers: PlannedLayer[] = [];
    for (const layer of scene.layers) {
      const libraryId = catalogueBySlug.get(layer.slug);
      if (libraryId === undefined) {
        // One retired sound costs its layer, not the scene. A tavern without
        // the second mug is still a tavern.
        skipped.push({ what: layer.slug, reason: "not in the catalogue" });
        continue;
      }
      layers.push({ slug: layer.slug, libraryId, settings: layer.settings });
    }

    if (layers.length === 0) {
      skipped.push({ what: scene.name, reason: "none of its sounds are available" });
      continue;
    }

    for (const layer of layers) {
      if (!existingLibraryIds.has(layer.libraryId)) toCreate.add(layer.libraryId);
    }
    planned.push({ scene, layers });
  }

  return { scenes: planned, libraryIdsToCreate: [...toCreate], skipped };
}
