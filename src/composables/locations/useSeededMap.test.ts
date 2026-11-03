import { nextTick, ref } from "vue";
import { describe, expect, it } from "vitest";
import { useSeededMap } from "./useSeededMap";
import type { DungeonMap } from "@/types/dungeonMap.types";

const map = (id: string, rev = 1) => ({ id, rev, name: id }) as unknown as DungeonMap;

function setup(initial?: DungeonMap) {
  const source = ref<DungeonMap | null | undefined>(initial);
  const scope = ref("place-1");
  const created = ref<string | null>(null);
  const seed = useSeededMap({ source: () => source.value, scope: () => scope.value, skipId: () => created.value });
  return { source, scope, created, seed };
}

describe("useSeededMap", () => {
  it("keeps the canvas's map when the saved row refetches (a refetch must not overwrite strokes made since the save began)", async () => {
    const { source, seed } = setup(map("m1", 1));
    const first = seed.value;
    source.value = map("m1", 2);
    await nextTick();
    expect(seed.value).toBe(first);
  });

  it("never blanks the canvas while the next read is loading", async () => {
    const { source, seed } = setup(map("m1"));
    source.value = undefined;
    await nextTick();
    expect(seed.value?.id).toBe("m1");
  });

  it("does not load the row this editor created itself (its first save is not another map)", async () => {
    const { source, created, seed } = setup();
    created.value = "new-map";
    source.value = map("new-map");
    await nextTick();
    expect(seed.value).toBeNull();
  });

  it("starts from nothing when a different place is opened, then loads that place's map", async () => {
    const { source, scope, seed } = setup(map("m1"));
    scope.value = "place-2";
    source.value = map("m2");
    await nextTick();
    expect(seed.value?.id).toBe("m2");
  });

  it("drops the previous place's map when the next place has none", async () => {
    const { source, scope, seed } = setup(map("m1"));
    scope.value = "place-2";
    source.value = null;
    await nextTick();
    expect(seed.value).toBeNull();
  });
});
