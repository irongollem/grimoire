import { describe, it, expect } from "vitest";
import { planStarterScenes } from "@/lib/starterScenePlan";
import type { StarterScene } from "@/data/starterScenes";

const SETTINGS = {
  layer_volume: 1,
  is_generator: false,
  min_interval_s: 20,
  max_interval_s: 60,
  min_gain: 0.6,
  max_gain: 1,
  pan_spread: 0,
};

function scene(slug: string, ...slugs: string[]): StarterScene {
  return {
    slug,
    name: slug,
    theme: slug,
    description: "",
    layers: slugs.map((s) => ({ slug: s, settings: SETTINGS })),
  };
}

const EMPTY_BOARD = { existingLibraryIds: new Set<string>(), existingSceneSlugs: new Set<string>() };

function catalogue(...slugs: string[]): Map<string, string> {
  return new Map(slugs.map((s) => [s, `id-${s}`]));
}

describe("planStarterScenes", () => {
  it("plans every scene with its layers in order", () => {
    const plan = planStarterScenes({
      scenes: [scene("tavern", "fire", "lute")],
      catalogueBySlug: catalogue("fire", "lute"),
      ...EMPTY_BOARD,
    });

    expect(plan.scenes).toHaveLength(1);
    expect(plan.scenes[0].layers.map((l) => l.slug)).toEqual(["fire", "lute"]);
    expect(plan.scenes[0].layers[0].libraryId).toBe("id-fire");
  });

  it("creates a shared sound once, not once per scene", () => {
    // The campfire is in both the tavern and the night camp. Creating it twice
    // leaves a duplicate on the board that the DM has to notice and delete.
    const plan = planStarterScenes({
      scenes: [scene("tavern", "fire", "lute"), scene("camp", "fire", "crickets")],
      catalogueBySlug: catalogue("fire", "lute", "crickets"),
      ...EMPTY_BOARD,
    });

    expect(plan.libraryIdsToCreate).toEqual(["id-fire", "id-lute", "id-crickets"]);
    expect(plan.libraryIdsToCreate.filter((id) => id === "id-fire")).toHaveLength(1);
  });

  it("does not re-create a sound already on the board", () => {
    const plan = planStarterScenes({
      scenes: [scene("tavern", "fire", "lute")],
      catalogueBySlug: catalogue("fire", "lute"),
      existingLibraryIds: new Set(["id-fire"]),
      existingSceneSlugs: new Set(),
    });

    expect(plan.libraryIdsToCreate).toEqual(["id-lute"]);
    // The layer is still planned — it just reuses the row already there.
    expect(plan.scenes[0].layers).toHaveLength(2);
  });

  it("skips a scene already on the board rather than duplicating it", () => {
    const plan = planStarterScenes({
      scenes: [scene("tavern", "fire"), scene("camp", "crickets")],
      catalogueBySlug: catalogue("fire", "crickets"),
      existingLibraryIds: new Set(),
      existingSceneSlugs: new Set(["tavern"]),
    });

    expect(plan.scenes.map((p) => p.scene.slug)).toEqual(["camp"]);
    expect(plan.skipped).toContainEqual({ what: "tavern", reason: "already on this board" });
    // And its sound is not created either.
    expect(plan.libraryIdsToCreate).toEqual(["id-crickets"]);
  });

  it("drops a retired layer but keeps the scene", () => {
    const plan = planStarterScenes({
      scenes: [scene("tavern", "fire", "gone", "lute")],
      catalogueBySlug: catalogue("fire", "lute"),
      ...EMPTY_BOARD,
    });

    expect(plan.scenes).toHaveLength(1);
    expect(plan.scenes[0].layers.map((l) => l.slug)).toEqual(["fire", "lute"]);
    expect(plan.skipped).toContainEqual({ what: "gone", reason: "not in the catalogue" });
  });

  it("skips a scene whose sounds have all been retired", () => {
    // An empty playlist is worse than no playlist — it looks like a scene and
    // plays nothing.
    const plan = planStarterScenes({
      scenes: [scene("tavern", "gone", "also-gone")],
      catalogueBySlug: catalogue(),
      ...EMPTY_BOARD,
    });

    expect(plan.scenes).toHaveLength(0);
    expect(plan.skipped).toContainEqual({ what: "tavern", reason: "none of its sounds are available" });
  });

  it("is a no-op when everything is already there", () => {
    const plan = planStarterScenes({
      scenes: [scene("tavern", "fire")],
      catalogueBySlug: catalogue("fire"),
      existingLibraryIds: new Set(["id-fire"]),
      existingSceneSlugs: new Set(["tavern"]),
    });

    expect(plan.scenes).toHaveLength(0);
    expect(plan.libraryIdsToCreate).toHaveLength(0);
  });
});
